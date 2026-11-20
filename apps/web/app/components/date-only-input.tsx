// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isValidDateOnly } from "../lib/date-format";

type DateOnlyInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
};

/**
 * Date entry that always shows yyyy-MM-dd, whatever the browser locale.
 * The visible field is a text input; the calendar button opens the native date picker.
 * `onChange` only receives complete, valid dates (or "" when cleared).
 */
export default function DateOnlyInput({
  id,
  name,
  value,
  onChange,
  disabled,
  required,
  ariaLabel,
}: DateOnlyInputProps) {
  const [draft, setDraft] = useState(value);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const commit = (next: string) => {
    setDraft(next);
    if (next === "" || isValidDateOnly(next)) {
      onChange(next);
    }
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus();
    }
  };

  const invalid = draft !== "" && !isValidDateOnly(draft);

  return (
    <div className="relative flex min-w-40 items-center gap-2">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        pattern="\d{4}-\d{2}-\d{2}"
        placeholder="yyyy-MM-dd"
        maxLength={10}
        value={draft}
        onChange={(event) => commit(event.target.value.trim())}
        onBlur={() => {
          if (invalid) setDraft(value);
        }}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        title="Date as yyyy-MM-dd"
        className="font-mono"
      />
      <button
        type="button"
        onClick={openPicker}
        disabled={disabled}
        aria-label={ariaLabel ? `Choose ${ariaLabel.toLowerCase()} from calendar` : "Choose date from calendar"}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-border-strong bg-surface-2/80 text-fg-secondary transition hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-60"
      >
        <CalendarDays aria-hidden="true" className="size-4" />
      </button>
      <input
        ref={pickerRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={isValidDateOnly(value) ? value : ""}
        onChange={(event) => commit(event.target.value)}
        disabled={disabled}
        className="pointer-events-none absolute right-0 bottom-0 h-px w-px border-0 p-0 opacity-0"
      />
    </div>
  );
}
