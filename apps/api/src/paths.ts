import { isAbsolute, relative, resolve, sep } from "node:path";

export const safeFileSegment = (value: string): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

export class ExportPathError extends Error {
  constructor(message = "Export path is not allowed") {
    super(message);
    this.name = "ExportPathError";
  }
}

export const resolveExportPath = (exportsDir: string, filePath: string): string => {
  if (!filePath || filePath.includes("\0")) {
    throw new ExportPathError();
  }

  const normalized = filePath.replace(/\\/g, "/");
  if (normalized.split("/").some((segment) => segment === "..")) {
    throw new ExportPathError();
  }
  if (isAbsolute(normalized)) {
    throw new ExportPathError();
  }

  const root = resolve(exportsDir);
  const absolute = resolve(root, normalized);
  const rel = relative(root, absolute);
  if (!rel || rel === "" || rel.startsWith("..") || rel.split(sep).includes("..") || isAbsolute(rel)) {
    throw new ExportPathError();
  }
  return absolute;
};

export const contentDispositionAttachment = (fileName: string): string => {
  const cleaned = fileName
    .replace(/[\r\n"]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .slice(0, 180);
  const safe = cleaned.trim() || "export.pdf";
  return `attachment; filename="${safe}"`;
};
