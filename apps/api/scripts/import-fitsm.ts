// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
import { existsSync } from "node:fs";
import mysql from "mysql2/promise";
import { config } from "../src/config";
import {
  buildCatalog,
  capabilityScoreLabel,
  extractProcessCode,
  GUIDANCE_SCORE_LABELS,
  parseWorkbook,
  REQUIREMENT_CODE_PATTERN,
  scopeCode,
  toTargetLevel,
} from "./fitsm-catalog";

// Accepts the workbook as .xlsx or .ods; without an argument the repo-root .xlsx is used, falling back to the .ods.
const defaultWorkbookPath = (): string => {
  const xlsx = "../../FitSM-6_Assessment_and_Audit_Tool_V3.0.3.xlsx";
  const ods = "../../FitSM-6_Assessment_and_Audit_Tool_V3.0.3.ods";
  return existsSync(xlsx) ? xlsx : ods;
};

const workbookPath = process.argv[2] || defaultWorkbookPath();
const orgId = Number(process.argv[3] ?? 1);
const actorUserId = Number(process.argv[4] ?? 1);
const auditName = process.argv[5] ?? "Imported FitSM Assessment";
const auditDate = process.argv[6] ?? new Date().toISOString().slice(0, 10);

const main = async () => {
  const sheets = await parseWorkbook(workbookPath);
  const assessmentRows = sheets["3. Assessment"] ?? [];
  const scopeRows = sheets["2. Scope & Goals"] ?? [];
  const detailRows = sheets["8. Audit Details"] ?? [];
  const conclusionsRows = sheets["7. Conclusions"] ?? [];

  const catalog = buildCatalog(sheets);
  const processMap = new Map(catalog.processes.map((item) => [item.code, item]));
  const guidanceByRequirement = new Map<string, Record<string, string>>();
  for (const item of catalog.guidance) {
    const entry = guidanceByRequirement.get(item.requirementCode) ?? {};
    entry[item.scoreLabel] = item.guidanceText;
    guidanceByRequirement.set(item.requirementCode, entry);
  }
  const requirements = catalog.requirements.map((item) => ({
    ...item,
    guidance: guidanceByRequirement.get(item.code) ?? {},
  }));

  const connection = await mysql.createConnection({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    timezone: "Z",
  });
  await connection.query("SET time_zone = '+00:00'");

  await connection.beginTransaction();

  try {
    const [orgRows] = await connection.query(
      "SELECT id FROM organizations WHERE id = ? AND archived_UTC IS NULL LIMIT 1",
      [orgId],
    );
    if (!Array.isArray(orgRows) || orgRows.length === 0) {
      throw new Error(`Organization ${orgId} does not exist`);
    }

    const [userRows] = await connection.query("SELECT id FROM users WHERE id = ? AND archived_UTC IS NULL LIMIT 1", [
      actorUserId,
    ]);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      throw new Error(`User ${actorUserId} does not exist`);
    }

    for (const processItem of processMap.values()) {
      await connection.execute(
        `INSERT INTO processes (code, abbreviation, name, kind, sort_order, default_cert_goal_level)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           abbreviation = VALUES(abbreviation),
           name = VALUES(name),
           kind = VALUES(kind),
           sort_order = VALUES(sort_order),
           default_cert_goal_level = VALUES(default_cert_goal_level),
           updated_UTC = UTC_TIMESTAMP(3)`,
        [
          processItem.code,
          processItem.abbreviation,
          processItem.name,
          processItem.kind,
          processItem.sortOrder,
          processItem.defaultCertGoal,
        ],
      );
    }

    const [processRows] = await connection.query("SELECT id, code FROM processes WHERE archived_UTC IS NULL");
    const processIdByCode = new Map<string, number>();
    for (const row of processRows as any[]) {
      processIdByCode.set(String(row.code), Number(row.id));
    }

    for (const requirement of requirements) {
      const processId = processIdByCode.get(requirement.processCode);
      if (!processId) continue;

      await connection.execute(
        `INSERT INTO requirements (process_id, code, requirement_text, sort_order)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           requirement_text = VALUES(requirement_text),
           sort_order = VALUES(sort_order),
           updated_UTC = UTC_TIMESTAMP(3)`,
        [processId, requirement.code, requirement.requirementText, requirement.sortOrder],
      );
    }

    const [requirementRows] = await connection.query("SELECT id, code FROM requirements WHERE archived_UTC IS NULL");
    const requirementIdByCode = new Map<string, number>();
    for (const row of requirementRows as any[]) {
      requirementIdByCode.set(String(row.code), Number(row.id));
    }

    const [scoreRows] = await connection.query("SELECT id, label FROM capability_scores WHERE archived_UTC IS NULL");
    const scoreIdByLabel = new Map<string, number>();
    for (const row of scoreRows as any[]) {
      scoreIdByLabel.set(String(row.label), Number(row.id));
    }

    for (const requirement of requirements) {
      const requirementId = requirementIdByCode.get(requirement.code);
      if (!requirementId) continue;

      for (const level of GUIDANCE_SCORE_LABELS) {
        const text = requirement.guidance[level];
        if (!text) continue;

        const scoreId = scoreIdByLabel.get(level);
        if (!scoreId) continue;

        await connection.execute(
          `INSERT INTO requirement_level_guidance (requirement_id, capability_score_id, guidance_text)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE
             guidance_text = VALUES(guidance_text),
             updated_UTC = UTC_TIMESTAMP(3)`,
          [requirementId, scoreId, text],
        );
      }
    }

    const [auditInsert] = await connection.execute(
      `INSERT INTO audits (org_id, name, status, audit_date_UTC, created_by)
       VALUES (?, ?, 'draft', ?, ?)`,
      [orgId, auditName, auditDate, actorUserId],
    );
    const auditId = Number((auditInsert as any).insertId);

    const [scopeRowsLookup] = await connection.query("SELECT id, code FROM scope_options WHERE archived_UTC IS NULL");
    const scopeIdByCode = new Map<string, number>();
    for (const row of scopeRowsLookup as any[]) {
      scopeIdByCode.set(String(row.code), Number(row.id));
    }

    for (const row of scopeRows) {
      const processCode = extractProcessCode(row[1] ?? "");
      if (!processMap.has(processCode)) continue;

      const processId = processIdByCode.get(processCode);
      if (!processId) continue;

      const certGoal = toTargetLevel(row[3] ?? processMap.get(processCode)?.defaultCertGoal ?? 2, 2);
      const rawCustomGoal = Number(row[4] ?? NaN);
      const customGoal = Number.isFinite(rawCustomGoal) ? toTargetLevel(rawCustomGoal, 2) : null;
      const scopeOptionCode = scopeCode(row[5] ?? "In scope");
      const scopeOptionId = scopeIdByCode.get(scopeOptionCode);

      if (!scopeOptionId) continue;

      await connection.execute(
        `INSERT INTO audit_scope_targets
           (audit_id, process_id, cert_goal_level, custom_goal_level, scope_option_id, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           cert_goal_level = VALUES(cert_goal_level),
           custom_goal_level = VALUES(custom_goal_level),
           scope_option_id = VALUES(scope_option_id),
           updated_by = VALUES(updated_by),
           updated_UTC = UTC_TIMESTAMP(3)`,
        [auditId, processId, toTargetLevel(certGoal, 2), customGoal, scopeOptionId, actorUserId],
      );
    }

    for (const row of assessmentRows) {
      const requirementCode = row[4] ?? "";
      if (!REQUIREMENT_CODE_PATTERN.test(requirementCode)) continue;

      const requirementId = requirementIdByCode.get(requirementCode);
      if (!requirementId) continue;

      const scoreId = scoreIdByLabel.get(capabilityScoreLabel(row[11] ?? "Select …")) ?? null;
      const commentText = row[12] ?? null;
      const evidenceText = row[13] ?? null;

      await connection.execute(
        `INSERT INTO audit_assessments
           (audit_id, requirement_id, capability_score_id, comment_text, evidence_text, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           capability_score_id = VALUES(capability_score_id),
           comment_text = VALUES(comment_text),
           evidence_text = VALUES(evidence_text),
           updated_by = VALUES(updated_by),
           updated_UTC = UTC_TIMESTAMP(3)`,
        [auditId, requirementId, scoreId, commentText, evidenceText, actorUserId],
      );
    }

    const [fieldRows] = await connection.query(
      "SELECT id, field_key FROM audit_detail_fields WHERE archived_UTC IS NULL",
    );
    const fieldIdByKey = new Map<string, number>();
    for (const row of fieldRows as any[]) {
      fieldIdByKey.set(String(row.field_key), Number(row.id));
    }

    const detailLabelToKey: Record<string, string> = {
      "Auditee name": "auditee_name",
      "Auditee address": "auditee_address",
      "Auditee representative name": "auditee_rep_name",
      "Auditee representative contact details": "auditee_rep_contact",
      "Lead auditor name": "lead_auditor_name",
      "Lead auditor contact details": "lead_auditor_contact",
      "Additional audit team members names and contacts": "additional_team_contacts",
      "Audit scope": "audit_scope",
      "Audit locations": "audit_locations",
      "Audit times": "audit_times",
      "Audit evidence language": "audit_evidence_language",
    };

    for (const row of detailRows) {
      const label = row[1] ?? "";
      const response = row[2] ?? "";
      const fieldKey = detailLabelToKey[label];
      if (!fieldKey) continue;

      const fieldId = fieldIdByKey.get(fieldKey);
      if (!fieldId) continue;

      await connection.execute(
        `INSERT INTO audit_detail_responses (audit_id, field_id, response_text, updated_by)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           response_text = VALUES(response_text),
           updated_by = VALUES(updated_by),
           updated_UTC = UTC_TIMESTAMP(3)`,
        [auditId, fieldId, response || null, actorUserId],
      );
    }

    const conclusionText =
      conclusionsRows
        .flat()
        .map((value) => value.trim())
        .find((value) => value && !value.startsWith("<") && !value.includes("FitSM-6")) ?? null;

    await connection.execute(
      `INSERT INTO audit_conclusions (audit_id, conclusion_text, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         conclusion_text = VALUES(conclusion_text),
         updated_by = VALUES(updated_by),
         updated_UTC = UTC_TIMESTAMP(3)`,
      [auditId, conclusionText, actorUserId],
    );

    await connection.commit();

    console.log(
      JSON.stringify(
        {
          auditId,
          importedProcesses: processMap.size,
          importedRequirements: requirements.length,
          importedScopeTargets: scopeRows.length,
        },
        null,
        2,
      ),
    );
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    await connection.end();
  }
};

await main();
