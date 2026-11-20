// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { WORKSPACE_SECTIONS, type WorkspaceSection } from "../../../lib/audit-snapshots";
import { AutosaveQueue, type SaveOptions, type SaveOutcome } from "../../../lib/autosave-queue";
import { registerFlusher, trackPendingSave } from "../../../lib/pending-saves";

export type { SaveOutcome } from "../../../lib/autosave-queue";

/** Keep keepalive bodies below the browser's 64 KiB in-flight budget. */
export const KEEPALIVE_BODY_LIMIT = 60 * 1024;

// Browsers cap the bytes of ALL in-flight keepalive requests together, so a flush of several sections must
// share one budget. Bodies that do not fit are sent as normal requests instead of being rejected.
let keepaliveBytesInFlight = 0;

/**
 * Reserves keepalive budget for a body. Returns a release function when the body fits (measured in UTF-8
 * bytes, not UTF-16 characters), or null when it should go out as a normal request.
 */
export const reserveKeepaliveBudget = (body: string): (() => void) | null => {
  const bytes = new TextEncoder().encode(body).length;
  if (keepaliveBytesInFlight + bytes >= KEEPALIVE_BODY_LIMIT) return null;
  keepaliveBytesInFlight += bytes;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    keepaliveBytesInFlight -= bytes;
  };
};
const FLUSH_TIMEOUT_MS = 10_000;

export type SectionConfig = {
  snapshot: string;
  enabled: boolean;
  label: string;
  disabledError: string;
};

export type AutosaveStatus = {
  status: "idle" | "saving" | "saved" | "error";
  section: string;
  detail: string;
};

type AutosaveOptions = {
  /** True once server data has been loaded and baselines are set. */
  ready: boolean;
  delayMs: number;
  sections: Record<WorkspaceSection, SectionConfig>;
  send: (section: WorkspaceSection, snapshot: string, saved: string, options: SaveOptions) => Promise<SaveOutcome>;
  onSaved?: (section: WorkspaceSection) => void;
};

export const useUnsavedChangesWarning = (active: boolean): void => {
  useEffect(() => {
    if (!active) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [active]);
};

const withTimeout = <T>(work: Promise<T>, fallback: T, ms: number): Promise<T> =>
  Promise.race([work, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))]);

function useDebouncedSectionSave(
  section: WorkspaceSection,
  config: SectionConfig,
  deps: {
    queue: AutosaveQueue<WorkspaceSection>;
    ready: boolean;
    delayMs: number;
    version: number;
    saveSection: (section: WorkspaceSection) => Promise<SaveOutcome>;
    lastFailed: Partial<Record<WorkspaceSection, string>>;
  },
): void {
  const { snapshot, enabled } = config;
  const { queue, ready, delayMs, version, saveSection, lastFailed } = deps;
  useEffect(() => {
    if (!ready || !enabled || !queue.hasBaseline(section)) return;
    if (snapshot === queue.getSaved(section)) return;
    // Do not hammer the API with an unchanged payload that just failed; the next edit retries.
    if (lastFailed[section] === snapshot) return;
    const timeout = window.setTimeout(() => void saveSection(section), delayMs);
    return () => window.clearTimeout(timeout);
  }, [ready, enabled, snapshot, delayMs, version]);
}

/**
 * Autosave engine for the audit workspace.
 *
 * Every save (debounced, blur, manual, save-all, flush) goes through one serialized queue per
 * section. Pending edits are flushed on unmount, on pagehide / tab hidden (keepalive), and before
 * in-app link navigation.
 */
export function useAuditAutosave(options: AutosaveOptions) {
  const router = useRouter();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [status, setStatus] = useState<AutosaveStatus>({ status: "idle", section: "", detail: "" });
  const [version, setVersion] = useState(0);
  const lastFailedSnapshotRef = useRef<Partial<Record<WorkspaceSection, string>>>({});

  const queueRef = useRef<AutosaveQueue<WorkspaceSection> | null>(null);
  if (!queueRef.current) {
    queueRef.current = new AutosaveQueue<WorkspaceSection>((section) => ({
      getSnapshot: () => optionsRef.current.sections[section].snapshot,
      isEnabled: () => optionsRef.current.sections[section].enabled,
      disabledError: () => optionsRef.current.sections[section].disabledError,
      send: async (snapshot, saved, sendOptions) => {
        const label = optionsRef.current.sections[section].label;
        setStatus({ status: "saving", section: label, detail: `Saving ${label.toLowerCase()}…` });
        const outcome = await optionsRef.current.send(section, snapshot, saved, sendOptions);
        if (outcome.ok) {
          delete lastFailedSnapshotRef.current[section];
          setStatus({ status: "saved", section: label, detail: `${label} saved.` });
          optionsRef.current.onSaved?.(section);
        } else {
          lastFailedSnapshotRef.current[section] = snapshot;
          setStatus({ status: "error", section: label, detail: outcome.error || `Autosave failed for ${label}.` });
        }
        return outcome;
      },
    }));
  }
  const queue = queueRef.current;

  useEffect(() => queue.subscribe(() => setVersion((current) => current + 1)), [queue]);

  const saveSection = useCallback(
    (section: WorkspaceSection, saveOptions: SaveOptions = {}) => queue.save(section, saveOptions),
    [queue],
  );

  const enabledSections = useCallback(
    () => WORKSPACE_SECTIONS.filter((section) => optionsRef.current.sections[section].enabled),
    [],
  );

  const hasPendingChanges = useCallback(
    () => optionsRef.current.ready && enabledSections().some((section) => queue.isPending(section)),
    [queue, enabledSections],
  );

  /** Saves every enabled section with unsaved edits; resolves with one outcome per section. */
  const flushAll = useCallback(
    (saveOptions: SaveOptions = {}): Promise<SaveOutcome[]> =>
      withTimeout(
        queue.flush(enabledSections(), saveOptions),
        [{ ok: false, error: "Saving is taking longer than expected." }],
        FLUSH_TIMEOUT_MS,
      ),
    [queue, enabledSections],
  );

  /** Saves a section right away (e.g. on blur), after React has committed the latest keystroke. */
  const requestSave = useCallback(
    (section: WorkspaceSection) => {
      window.setTimeout(() => void saveSection(section), 0);
    },
    [saveSection],
  );

  const setBaseline = useCallback(
    (section: WorkspaceSection, snapshot: string) => {
      delete lastFailedSnapshotRef.current[section];
      queue.setBaseline(section, snapshot);
    },
    [queue],
  );

  const isSectionPending = useCallback((section: WorkspaceSection) => queue.isPending(section), [queue]);

  // Debounced autosave, one timer per section. `version` re-arms the timer after each save so
  // edits typed while a request was in flight are saved too.
  const { ready, delayMs, sections } = options;
  const debounce = { queue, ready, delayMs, version, saveSection, lastFailed: lastFailedSnapshotRef.current };
  useDebouncedSectionSave("scope", sections.scope, debounce);
  useDebouncedSectionSave("assessments", sections.assessments, debounce);
  useDebouncedSectionSave("details", sections.details, debounce);
  useDebouncedSectionSave("conclusion", sections.conclusion, debounce);

  // Flush on tab hide / page unload / unmount, and let other pages (logout) await a flush.
  useEffect(() => {
    const flushInBackground = () => {
      if (hasPendingChanges()) trackPendingSave(flushAll({ keepalive: true }));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushInBackground();
    };
    window.addEventListener("pagehide", flushInBackground);
    document.addEventListener("visibilitychange", onVisibilityChange);
    const unregister = registerFlusher(() => flushAll());
    return () => {
      window.removeEventListener("pagehide", flushInBackground);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      unregister();
      flushInBackground();
    };
  }, [flushAll, hasPendingChanges]);

  // In-app navigation guard: same-origin link clicks wait for pending saves before navigating.
  // Registered on window in the capture phase so it runs before Next.js <Link> handlers.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!hasPendingChanges()) return;

      event.preventDefault();
      event.stopPropagation();
      void (async () => {
        const failed = (await flushAll()).find((outcome) => !outcome.ok);
        if (
          failed &&
          !failed.ok &&
          !window.confirm(`Some changes could not be saved (${failed.error}). Leave this page anyway?`)
        ) {
          return;
        }
        router.push(`${url.pathname}${url.search}${url.hash}`);
      })();
    };
    window.addEventListener("click", onClick, true);
    return () => window.removeEventListener("click", onClick, true);
  }, [router, flushAll, hasPendingChanges]);

  const hasUnsavedChanges =
    ready &&
    WORKSPACE_SECTIONS.some(
      (section) =>
        sections[section].enabled &&
        queue.hasBaseline(section) &&
        (sections[section].snapshot !== queue.getSaved(section) || queue.isBusy(section)),
    );

  useUnsavedChangesWarning(hasUnsavedChanges);

  return {
    status,
    hasUnsavedChanges,
    saveSection,
    requestSave,
    flushAll,
    setBaseline,
    isSectionPending,
  };
}
