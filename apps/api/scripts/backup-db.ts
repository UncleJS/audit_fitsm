// @ts-nocheck
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";

const required = (name: string, fallback?: string): string => {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
};

const nowStamp = (): string =>
  new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z").replace("T", "T");

const main = async () => {
  const dbHost = required("DB_HOST", "127.0.0.1");
  const dbPort = required("DB_PORT", "1262");
  const dbUser = required("DB_USER", "audit_app");
  const dbPassword = required("DB_PASSWORD", "change_me");
  const dbName = required("DB_NAME", "audit_fitsm");
  const backupsDir = process.env.BACKUPS_DIR ?? "/workspace/data/backups";

  const stamp = nowStamp();
  const sqlFileName = `audit-fitsm-db-${stamp}.sql`;
  const zipFileName = `audit-fitsm-db-${stamp}.zip`;
  const zipPath = join(backupsDir, zipFileName);

  await mkdir(backupsDir, { recursive: true });

  const dump = Bun.spawnSync(
    [
      "mariadb-dump",
      "--single-transaction",
      "--routines",
      "--triggers",
      "--events",
      "--default-character-set=utf8mb4",
      "-h",
      dbHost,
      "-P",
      dbPort,
      "-u",
      dbUser,
      `-p${dbPassword}`,
      dbName
    ],
    {
      stdout: "pipe",
      stderr: "pipe"
    }
  );

  if (dump.exitCode !== 0) {
    const err = new TextDecoder().decode(dump.stderr);
    throw new Error(`mariadb-dump failed: ${err}`);
  }

  const sqlText = new TextDecoder().decode(dump.stdout);
  const zip = new JSZip();
  zip.file(sqlFileName, sqlText);
  zip.file(
    "backup-meta.json",
    JSON.stringify(
      {
        generatedAtUtc: new Date().toISOString(),
        dbHost,
        dbPort,
        dbName,
        tool: "audit-fitsm backup-db.ts"
      },
      null,
      2
    )
  );

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 }
  });

  await writeFile(zipPath, zipBytes);

  console.log(
    JSON.stringify(
      {
        ok: true,
        zipFile: zipPath,
        zipSizeBytes: zipBytes.byteLength,
        sqlFileInsideZip: sqlFileName
      },
      null,
      2
    )
  );
};

await main();
