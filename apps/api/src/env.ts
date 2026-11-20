// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

/**
 * Parses a positive numeric environment value. Throws on NaN, Infinity, zero or negatives so a typo in the
 * environment fails loudly at boot instead of silently disabling a limit.
 */
export const parsePositiveNumber = (name: string, raw: string | undefined, fallback: number): number => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number, got: ${JSON.stringify(raw)}`);
  }
  return value;
};
