// @ts-nocheck
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
  ariaLabel
}: DateOnlyInputProps) {
  return (
    <div style={{ position: "relative", minWidth: 170 }}>
      {name ? <input type="hidden" name={name} value={value} /> : null}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          pointerEvents: "none",
          display: "flex",
          alignItems: "center",
          paddingInline: 10,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          color: value ? "inherit" : "#9aa6c6"
        }}
      >
        {value || "yyyy-mm-dd"}
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
        style={{
          position: "relative",
          zIndex: 1,
          background: "transparent",
          color: "transparent",
          caretColor: "transparent",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
        }}
      />
    </div>
  );
}
