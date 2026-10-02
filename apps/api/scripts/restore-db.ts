import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const main = async () => {
  const inputZip = process.argv[2];
  if (!inputZip) {
    throw new Error("Usage: bun scripts/restore-db.ts <zip-file-path> [--yes]");
  }

  const confirm = process.argv.includes("--yes");
  if (!confirm) {
    throw new Error("Restore is destructive. Re-run with --yes to confirm.");
  }

  const dbHost = required("DB_HOST", "127.0.0.1");
  const dbPort = required("DB_PORT", "1262");
  const dbUser = required("DB_USER", "audit_app");
  const dbPassword = required("DB_PASSWORD", "change_me");
  const dbName = required("DB_NAME", "audit_fitsm");

  const zipBuffer = await readFile(resolve(inputZip));
  const zip = await JSZip.loadAsync(zipBuffer);
  const sqlEntry = Object.keys(zip.files).find((name) => name.toLowerCase().endsWith(".sql"));

  if (!sqlEntry) {
    throw new Error("No .sql entry found in zip file");
  }

  const sqlText = await zip.file(sqlEntry)?.async("string");
  if (!sqlText) {
    throw new Error("Could not read SQL content from zip");
  }

  const restore = Bun.spawnSync(["mariadb", "-h", dbHost, "-P", dbPort, "-u", dbUser, `-p${dbPassword}`, dbName], {
    stdin: new TextEncoder().encode(sqlText),
    stdout: "pipe",
    stderr: "pipe",
  });

  if (restore.exitCode !== 0) {
    const err = new TextDecoder().decode(restore.stderr);
    throw new Error(`mariadb restore failed: ${err}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        restoredFromZip: resolve(inputZip),
        sqlEntry,
      },
      null,
      2,
    ),
  );
};

await main();
