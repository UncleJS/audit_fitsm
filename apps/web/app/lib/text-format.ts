const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};

export const decodeHtmlEntities = (value: unknown): string => {
  const input = String(value ?? "");
  if (!input.includes("&")) return input;

  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, raw) => {
    const token = String(raw || "").toLowerCase();

    if (token.startsWith("#x")) {
      const code = Number.parseInt(token.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }
    if (token.startsWith("#")) {
      const code = Number.parseInt(token.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : full;
    }

    return ENTITY_MAP[token] ?? full;
  });
};
