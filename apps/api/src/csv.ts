export const csvEscape = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  let text = String(value).replace(/\r?\n/g, " ");
  if (/^[\t ]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

export const rowsToCsv = (rows: ReadonlyArray<object>): string => {
  if (!rows.length) return "";
  const first = rows[0] as Record<string, unknown>;
  const headers = Object.keys(first);
  const lines = [headers.join(",")];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((header) => csvEscape(record[header])).join(","));
  }
  return lines.join("\n");
};
