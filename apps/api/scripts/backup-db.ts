// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
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
  new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")
    .replace("T", "T");

export type DbConnectionEnv = {
  dbHost: string;
  dbPort: string;
  dbUser: string;
  dbPassword: string;
  dbName: string;
};

export const readDbConnectionEnv = (): DbConnectionEnv => ({
  dbHost: required("DB_HOST", "127.0.0.1"),
  dbPort: required("DB_PORT", "3306"),
  dbUser: required("DB_USER", "audit_app"),
  dbPassword: required("DB_PASSWORD"),
  dbName: required("DB_NAME", "audit_fitsm"),
});

/**
 * Environment for the mariadb client tools. The password goes in MYSQL_PWD, never in argv, because argv is
 * visible to every local user via /proc and `ps`.
 */
export const mariadbClientEnv = (dbPassword: string): Record<string, string | undefined> => ({
  ...process.env,
  MYSQL_PWD: dbPassword,
});

export type BackupResult = {
  zipFile: string;
  zipSizeBytes: number;
  sqlFileInsideZip: string;
};

export const createBackup = async (options: { label?: string } = {}): Promise<BackupResult> => {
  const { dbHost, dbPort, dbUser, dbPassword, dbName } = readDbConnectionEnv();
  const backupsDir = process.env.BACKUPS_DIR ?? "/workspace/data/backups";

  const stamp = nowStamp();
  const prefix = options.label ? `audit-fitsm-db-${options.label}` : "audit-fitsm-db";
  const sqlFileName = `${prefix}-${stamp}.sql`;
  const zipFileName = `${prefix}-${stamp}.zip`;
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
      dbName,
    ],
    {
      env: mariadbClientEnv(dbPassword),
      stdout: "pipe",
      stderr: "pipe",
    },
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
        tool: "audit-fitsm backup-db.ts",
      },
      null,
      2,
    ),
  );

  const zipBytes = await zip.generateAsync({
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  await writeFile(zipPath, zipBytes);

  return { zipFile: zipPath, zipSizeBytes: zipBytes.byteLength, sqlFileInsideZip: sqlFileName };
};

if (import.meta.main) {
  const result = await createBackup();
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}
