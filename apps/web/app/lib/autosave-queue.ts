// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

/**
 * Per-section serialized save queue.
 *
 * - Every save of a section (debounced, manual, flush) runs after the previous one finished,
 *   so requests can never overlap or land out of order.
 * - The snapshot to send is read when the save actually starts, so queued saves always send
 *   the latest edits.
 * - On success only the snapshot that was sent becomes the saved baseline. Edits typed while
 *   the request was in flight keep the section dirty, and the caller re-saves them.
 */

export type SaveOptions = {
  /** Use fetch keepalive so the request survives page unload. */
  keepalive?: boolean;
};

export type SaveOutcome = { ok: true; skipped?: boolean } | { ok: false; error: string };

export type SectionAdapter = {
  /** Latest normalized snapshot of the section's edits. */
  getSnapshot: () => string;
  /** Whether the current user may save this section. */
  isEnabled: () => boolean;
  disabledError: () => string;
  /** Sends `snapshot`; `saved` is the last accepted baseline (for diffing). */
  send: (snapshot: string, saved: string, options: SaveOptions) => Promise<SaveOutcome>;
};

export class AutosaveQueue<K extends string> {
  private readonly saved = new Map<K, string>();
  private readonly chains = new Map<K, Promise<unknown>>();
  private readonly inFlight = new Map<K, number>();
  private readonly generation = new Map<K, number>();
  private readonly listeners = new Set<() => void>();

  constructor(private readonly adapterFor: (section: K) => SectionAdapter | null) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }

  /** Replaces the saved baseline (e.g. after loading server data). In-flight results for older baselines are ignored. */
  setBaseline(section: K, snapshot: string): void {
    this.saved.set(section, snapshot);
    this.generation.set(section, (this.generation.get(section) ?? 0) + 1);
    this.emit();
  }

  hasBaseline(section: K): boolean {
    return this.saved.has(section);
  }

  getSaved(section: K): string {
    return this.saved.get(section) ?? "";
  }

  isDirty(section: K): boolean {
    const adapter = this.adapterFor(section);
    if (!adapter || !this.saved.has(section)) return false;
    return adapter.getSnapshot() !== this.getSaved(section);
  }

  isBusy(section: K): boolean {
    return (this.inFlight.get(section) ?? 0) > 0;
  }

  /** True when the section has unsaved edits or a save in flight. */
  isPending(section: K): boolean {
    return this.isDirty(section) || this.isBusy(section);
  }

  save(section: K, options: SaveOptions = {}): Promise<SaveOutcome> {
    const previous = this.chains.get(section) ?? Promise.resolve();
    const task = previous.then(() => this.run(section, options));
    this.chains.set(
      section,
      task.then(
        () => undefined,
        () => undefined,
      ),
    );
    return task;
  }

  /** Saves every listed section that has unsaved edits and waits for all queued saves. */
  async flush(sections: K[], options: SaveOptions = {}): Promise<SaveOutcome[]> {
    return Promise.all(sections.map((section) => this.save(section, options)));
  }

  private async run(section: K, options: SaveOptions): Promise<SaveOutcome> {
    const adapter = this.adapterFor(section);
    if (!adapter || !this.saved.has(section)) return { ok: true, skipped: true };

    const snapshot = adapter.getSnapshot();
    const baseline = this.getSaved(section);
    if (snapshot === baseline) return { ok: true, skipped: true };
    if (!adapter.isEnabled()) return { ok: false, error: adapter.disabledError() };

    const generation = this.generation.get(section) ?? 0;
    this.inFlight.set(section, (this.inFlight.get(section) ?? 0) + 1);
    this.emit();
    try {
      const outcome = await adapter.send(snapshot, baseline, options);
      if (outcome.ok && (this.generation.get(section) ?? 0) === generation) {
        this.saved.set(section, snapshot);
      }
      return outcome;
    } catch (error) {
      return { ok: false, error: error instanceof Error && error.message ? error.message : "Save failed." };
    } finally {
      this.inFlight.set(section, (this.inFlight.get(section) ?? 1) - 1);
      this.emit();
    }
  }
}
