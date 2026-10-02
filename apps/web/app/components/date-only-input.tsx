"use client";

type DateOnlyInputProps = {
  id?: string;
  name?: string;
  value: string;
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  required?: boolean;
  ariaLabel?: string;
};

export default function DateOnlyInput({
  id,
  name,
  value,
  onChange,
  disabled,
  required,
  ariaLabel,
}: DateOnlyInputProps) {
  return (
    <div className="relative min-w-40">
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex items-center rounded-xl px-3 font-mono text-sm text-slate-100"
      >
        <span className={value ? "text-slate-100" : "text-slate-500"}>{value || "yyyy-mm-dd"}</span>
      </div>
      <input
        id={id}
        type="date"
        lang="en-CA"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        aria-label={ariaLabel}
        className="relative z-10 bg-transparent font-mono text-transparent caret-transparent"
      />
    </div>
  );
}
