// @ts-nocheck

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
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
    iso = `${iso}Z`;
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return raw;
  }

  return [
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`,
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`
  ].join(" ");
};
