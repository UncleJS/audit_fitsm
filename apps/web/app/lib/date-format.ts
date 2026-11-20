// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

const pad2 = (value: number): string => String(value).padStart(2, "0");

export const formatDateOnly = (value?: string | null): string => {
  if (!value) return "";
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : raw;
};

export const formatLocalTimestamp = (value?: string | null): string => {
  if (!value) return "—";
  const raw = String(value).trim();

  let iso = raw.includes("T") ? raw : raw.replace(" ", "T");
  const compactOffset = iso.match(/^(.*T.*)([+-])(\d{2})(\d{2})$/);
  if (compactOffset) {
    // ±HHMM → ±HH:MM so every engine parses it as ISO 8601.
    iso = `${compactOffset[1]}${compactOffset[2]}${compactOffset[3]}:${compactOffset[4]}`;
  }
  if (!/(?:[zZ]|[+-]\d{2}:\d{2})$/.test(iso)) {
    iso = `${iso}Z`;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`,
  ].join(" ");
};

/** The viewer's local calendar date as yyyy-MM-dd (not the UTC date). */
export const localDateString = (date: Date = new Date()): string =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/** True when `value` is a real calendar date written as yyyy-MM-dd. */
export const isValidDateOnly = (value: string): boolean => {
  const matched = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!matched) return false;
  const [year, month, day] = [Number(matched[1]), Number(matched[2]), Number(matched[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
