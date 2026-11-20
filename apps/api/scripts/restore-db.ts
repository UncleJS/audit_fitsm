// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import JSZip from "jszip";
import { createBackup, mariadbClientEnv, readDbConnectionEnv } from "./backup-db";

const usage = "Usage: bun scripts/restore-db.ts <zip-file-path> --yes [--force] [--skip-pre-backup]";

/**
 * Works out which database a dump was taken from: backup-meta.json (written by backup-db.ts) first, then the
 * "-- Host: ...    Database: <name>" header that mariadb-dump writes. Any USE statement must match as well.
 */
export const dumpTargetDatabases = (sqlText: string, metaDbName: string | null): Set<string> => {
  const names = new Set<string>();
  if (metaDbName) names.add(metaDbName);

  const header = sqlText.slice(0, 4096).match(/^--\s*Host:.*?Database:\s*(\S+)/m);
  if (header?.[1]) names.add(header[1]);

  for (const match of sqlText.matchAll(/^\s*USE\s+`?([^`;\s]+)`?\s*;/gim)) {
    if (match[1]) names.add(match[1]);
  }
  for (const match of sqlText.matchAll(
    /^\s*CREATE\s+DATABASE\s+(?:\/\*.*?\*\/\s*)?(?:IF\s+NOT\s+EXISTS\s+)?`?([^`;\s]+)`?/gim,
  )) {
    if (match[1]) names.add(match[1]);
  }
  return names;
};

const main = async () => {
  const args = process.argv.slice(2);
  const inputZip = args.find((arg) => !arg.startsWith("--"));
  if (!inputZip || args.includes("-h") || args.includes("--help")) {
    console.log(usage);
    if (!inputZip) process.exit(1);
    return;
  }

  if (!args.includes("--yes")) {
    throw new Error("Restore is destructive. Re-run with --yes to confirm.");
  }
  const force = args.includes("--force");
  const skipPreBackup = args.includes("--skip-pre-backup");

  const { dbHost, dbPort, dbUser, dbPassword, dbName } = readDbConnectionEnv();

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

  let metaDbName: string | null = null;
  const metaText = await zip.file("backup-meta.json")?.async("string");
  if (metaText) {
    try {
      const meta = JSON.parse(metaText) as { dbName?: unknown };
      metaDbName = typeof meta.dbName === "string" && meta.dbName ? meta.dbName : null;
    } catch {
      metaDbName = null;
    }
  }

  const targets = dumpTargetDatabases(sqlText, metaDbName);
  const mismatched = [...targets].filter((name) => name !== dbName);
  if (!force && (targets.size === 0 || mismatched.length > 0)) {
    throw new Error(
      targets.size === 0
        ? `Cannot tell which database this dump belongs to; refusing to restore into '${dbName}'. Use --force to override.`
        : `Dump targets database(s) ${[...targets].join(", ")}, but the configured database is '${dbName}'. Use --force to override.`,
    );
  }

  // Safety net: snapshot the current database first so a wrong restore can be undone.
  const preRestoreBackup = skipPreBackup ? null : await createBackup({ label: "pre-restore" });
  if (preRestoreBackup) {
    console.log(`pre-restore backup written to ${preRestoreBackup.zipFile}`);
  }

  const restore = Bun.spawnSync(["mariadb", "-h", dbHost, "-P", dbPort, "-u", dbUser, dbName], {
    env: mariadbClientEnv(dbPassword),
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
        preRestoreBackup: preRestoreBackup?.zipFile ?? null,
      },
      null,
      2,
    ),
  );
};

if (import.meta.main) {
  await main();
}
