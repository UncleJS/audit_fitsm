// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

/**
 * Tiny cross-page registry so code outside a workspace (e.g. the logout page)
 * can wait for unsaved edits to be flushed before ending the session.
 */

type Flusher = () => Promise<unknown>;

const flushers = new Set<Flusher>();
const pending = new Set<Promise<unknown>>();

export const registerFlusher = (flusher: Flusher): (() => void) => {
  flushers.add(flusher);
  return () => {
    flushers.delete(flusher);
  };
};

/** Tracks a save that outlives its component (e.g. a flush started on unmount). */
export const trackPendingSave = (promise: Promise<unknown>): void => {
  const settled = promise.then(
    () => undefined,
    () => undefined,
  );
  pending.add(settled);
  void settled.then(() => pending.delete(settled));
};

/** Flushes every registered workspace and waits for tracked saves, bounded by `timeoutMs`. */
export const flushPendingSaves = async (timeoutMs = 5000): Promise<void> => {
  const work = Promise.allSettled([...[...flushers].map((flush) => flush()), ...pending]);
  await Promise.race([work, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
};
