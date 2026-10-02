import type { AppBase } from "../app-base";
import type { RowDataPacket } from "../support";
import {
  affectedRowsOf,
  allowedStatusTransitions,
  canAccessAudit,
  createAuditSchema,
  db,
  forbidden,
  hasOrgRole,
  hasTable,
  insertIdOf,
  recordAuditEvent,
  unauthorized,
  updateStatusSchema,
} from "../support";

export const registerAuditRoutes = (app: AppBase): AppBase =>
  app
    .get("/orgs/:orgId/audits", async ({ auth, params, set }) => {
      const orgId = Number(params.orgId);
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!hasOrgRole(auth, orgId, "viewer")) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT id, org_id, name, status, audit_date, created_at, updated_at
       FROM audits
       WHERE org_id = ? AND archived_at IS NULL
       ORDER BY audit_date DESC, id DESC`,
        [orgId],
      );

      return rows;
    })
    .post("/orgs/:orgId/audits", async ({ auth, params, body, set }) => {
      const orgId = Number(params.orgId);
      const parsed = createAuditSchema.safeParse(body);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!hasOrgRole(auth, orgId, "lead_auditor")) {
        set.status = 403;
        return forbidden;
      }
      if (!parsed.success) {
        set.status = 400;
        return { error: "Invalid audit payload", details: parsed.error.flatten() };
      }
      const payload = parsed.data;

      const [result] = await db.execute(
        `INSERT INTO audits (org_id, name, audit_date, status, created_by)
       VALUES (?, ?, ?, 'draft', ?)`,
        [orgId, payload.name, payload.auditDate, auth.sub],
      );

      const auditId = insertIdOf(result);

      const [scopeRows] = await db.query<RowDataPacket[]>(
        "SELECT id FROM scope_options WHERE code = 'IN_SCOPE' AND archived_at IS NULL LIMIT 1",
      );
      const inScopeId = scopeRows.length ? Number(scopeRows[0].id) : null;

      if (inScopeId) {
        await db.execute(
          `INSERT INTO audit_scope_targets (audit_id, process_id, cert_goal_level, custom_goal_level, scope_option_id, updated_by)
          SELECT ?, p.id, ?, NULL, ?, ?
          FROM processes p
          WHERE p.archived_at IS NULL`,
          [auditId, payload.certGoalLevel, inScopeId, auth.sub],
        );
      }

      const [selectScoreRows] = await db.query<RowDataPacket[]>(
        "SELECT id FROM capability_scores WHERE label = 'Select …' AND archived_at IS NULL LIMIT 1",
      );
      const selectScoreId = selectScoreRows.length ? Number(selectScoreRows[0].id) : null;

      await db.execute(
        `INSERT INTO audit_assessments (audit_id, requirement_id, capability_score_id, updated_by)
       SELECT ?, r.id, ?, ?
       FROM requirements r
       WHERE r.archived_at IS NULL`,
        [auditId, selectScoreId, auth.sub],
      );

      set.status = 201;
      return { id: auditId };
    })
    .put("/audits/:auditId/status", async ({ auth, params, body, set }) => {
      const auditId = Number(params.auditId);
      const parsed = updateStatusSchema.safeParse(body);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      if (!parsed.success) {
        set.status = 400;
        return { error: "Invalid status payload", details: parsed.error.flatten() };
      }
      const payload = parsed.data;

      const access = await canAccessAudit(auth, auditId, "lead_auditor");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const transitions = allowedStatusTransitions(String(access.status));
      if (!transitions.includes(payload.status)) {
        set.status = 409;
        return {
          error: `Invalid status transition from '${access.status}' to '${payload.status}'`,
          allowedTransitions: transitions,
        };
      }

      const completedAt = payload.status === "completed" ? "UTC_TIMESTAMP(3)" : "NULL";

      await db.execute(
        `UPDATE audits
       SET status = ?, completed_at = ${completedAt}, updated_by = ?, updated_at = UTC_TIMESTAMP(3)
       WHERE id = ? AND archived_at IS NULL`,
        [payload.status, auth.sub, auditId],
      );

      await recordAuditEvent(
        auditId,
        "status_changed",
        auth.sub,
        { status: access.status },
        { status: payload.status },
        "status",
      );

      return { id: auditId, status: payload.status };
    })
    .put("/audits/:auditId/scope-targets", async ({ auth, params, body, set }) => {
      const auditId = Number(params.auditId);
      const payload = body as {
        items?: Array<{
          processCode: string;
          certGoalLevel: number;
          customGoalLevel?: number | null;
          scopeCode: "IN_SCOPE" | "OUT_OF_SCOPE";
        }>;
      };

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "lead_auditor", {
        requireUnlockedForWrite: true,
      });
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return access.reason ? { error: access.reason } : forbidden;
      }
      if (String(access.status) !== "draft") {
        set.status = 409;
        return { error: "Scope and cert goals are editable only while audit is draft" };
      }
      if (!payload.items?.length) {
        set.status = 400;
        return { error: "items are required" };
      }

      const [processRows] = await db.query<RowDataPacket[]>("SELECT id, code FROM processes WHERE archived_at IS NULL");
      const processIdByCode = new Map<string, number>();
      for (const row of processRows) processIdByCode.set(String(row.code), Number(row.id));

      const [scopeRows] = await db.query<RowDataPacket[]>(
        "SELECT id, code FROM scope_options WHERE archived_at IS NULL",
      );
      const scopeIdByCode = new Map<string, number>();
      for (const row of scopeRows) scopeIdByCode.set(String(row.code), Number(row.id));

      for (const item of payload.items) {
        const processId = processIdByCode.get(item.processCode);
        const scopeOptionId = scopeIdByCode.get(item.scopeCode);
        if (!processId || !scopeOptionId) continue;

        await db.execute(
          `INSERT INTO audit_scope_targets
           (audit_id, process_id, cert_goal_level, custom_goal_level, scope_option_id, updated_by)
         VALUES (?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           cert_goal_level = VALUES(cert_goal_level),
           custom_goal_level = VALUES(custom_goal_level),
           scope_option_id = VALUES(scope_option_id),
           updated_by = VALUES(updated_by),
           updated_at = UTC_TIMESTAMP(3)`,
          [auditId, processId, Number(item.certGoalLevel), item.customGoalLevel ?? null, scopeOptionId, auth.sub],
        );
      }

      return { updated: payload.items.length };
    })
    .put("/audits/:auditId/assessments", async ({ auth, params, body, set }) => {
      const auditId = Number(params.auditId);
      const payload = body as {
        items?: Array<{
          requirementCode: string;
          scoreLabel: string;
          commentText?: string | null;
          evidenceText?: string | null;
        }>;
      };

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "auditor", {
        requireUnlockedForWrite: true,
      });
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return access.reason ? { error: access.reason } : forbidden;
      }
      if (!payload.items?.length) {
        set.status = 400;
        return { error: "items are required" };
      }

      const [reqRows] = await db.query<RowDataPacket[]>("SELECT id, code FROM requirements WHERE archived_at IS NULL");
      const requirementIdByCode = new Map<string, number>();
      for (const row of reqRows) requirementIdByCode.set(String(row.code), Number(row.id));

      const [scoreRows] = await db.query<RowDataPacket[]>(
        "SELECT id, label FROM capability_scores WHERE archived_at IS NULL",
      );
      const scoreIdByLabel = new Map<string, number>();
      for (const row of scoreRows) scoreIdByLabel.set(String(row.label), Number(row.id));

      let written = 0;

      for (const item of payload.items) {
        const requirementId = requirementIdByCode.get(item.requirementCode);
        const scoreId = scoreIdByLabel.get(item.scoreLabel) ?? scoreIdByLabel.get("Select …") ?? null;
        if (!requirementId) continue;

        const [existingRows] = await db.query<RowDataPacket[]>(
          `SELECT id, capability_score_id, comment_text, evidence_text
         FROM audit_assessments
         WHERE audit_id = ? AND requirement_id = ? AND archived_at IS NULL
         LIMIT 1`,
          [auditId, requirementId],
        );

        if (!existingRows.length) {
          const [insertResult] = await db.execute(
            `INSERT INTO audit_assessments
             (audit_id, requirement_id, capability_score_id, comment_text, evidence_text, updated_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
            [auditId, requirementId, scoreId, item.commentText ?? null, item.evidenceText ?? null, auth.sub],
          );

          const assessmentId = insertIdOf(insertResult);
          await db.execute(
            `INSERT INTO assessment_events
             (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
           VALUES (?, 'assessment_created', NULL, ?, ?)`,
            [
              assessmentId,
              JSON.stringify({
                capabilityScoreId: scoreId,
                commentText: item.commentText ?? null,
                evidenceText: item.evidenceText ?? null,
              }),
              auth.sub,
            ],
          );
        } else {
          const existing = existingRows[0];
          await db.execute(
            `UPDATE audit_assessments
           SET capability_score_id = ?, comment_text = ?, evidence_text = ?, updated_by = ?, updated_at = UTC_TIMESTAMP(3)
           WHERE id = ?`,
            [scoreId, item.commentText ?? null, item.evidenceText ?? null, auth.sub, existing.id],
          );

          if (Number(existing.capability_score_id ?? -1) !== Number(scoreId ?? -1)) {
            await db.execute(
              `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'score_changed', ?, ?, ?)`,
              [
                existing.id,
                JSON.stringify({ capabilityScoreId: existing.capability_score_id ?? null }),
                JSON.stringify({ capabilityScoreId: scoreId }),
                auth.sub,
              ],
            );
          }

          if (String(existing.comment_text ?? "") !== String(item.commentText ?? "")) {
            await db.execute(
              `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'comment_changed', ?, ?, ?)`,
              [
                existing.id,
                JSON.stringify({ commentText: existing.comment_text ?? null }),
                JSON.stringify({ commentText: item.commentText ?? null }),
                auth.sub,
              ],
            );
          }

          if (String(existing.evidence_text ?? "") !== String(item.evidenceText ?? "")) {
            await db.execute(
              `INSERT INTO assessment_events
               (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
             VALUES (?, 'evidence_changed', ?, ?, ?)`,
              [
                existing.id,
                JSON.stringify({ evidenceText: existing.evidence_text ?? null }),
                JSON.stringify({ evidenceText: item.evidenceText ?? null }),
                auth.sub,
              ],
            );
          }
        }

        written += 1;
      }

      return { updated: written };
    })
    .post("/assessments/:assessmentId/notes", async ({ auth, params, body, set }) => {
      const assessmentId = Number(params.assessmentId);
      const payload = body as { noteText?: string };

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!payload.noteText?.trim()) {
        set.status = 400;
        return { error: "noteText is required" };
      }

      const [assessmentRows] = await db.query<RowDataPacket[]>(
        `SELECT aa.id, a.id AS audit_id, a.org_id, a.status AS audit_status
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at IS NULL
       WHERE aa.id = ? AND aa.archived_at IS NULL
       LIMIT 1`,
        [assessmentId],
      );

      if (!assessmentRows.length) {
        set.status = 404;
        return { error: "Assessment not found" };
      }

      const orgId = Number(assessmentRows[0].org_id);
      if (!hasOrgRole(auth, orgId, "auditor")) {
        set.status = 403;
        return forbidden;
      }

      if (String(assessmentRows[0].audit_status) === "completed" && !hasOrgRole(auth, orgId, "lead_auditor")) {
        set.status = 403;
        return { error: "Audit is completed and locked for non-lead roles" };
      }

      const [insertResult] = await db.execute(
        `INSERT INTO assessment_notes (audit_assessment_id, note_text, created_by)
       VALUES (?, ?, ?)`,
        [assessmentId, payload.noteText.trim(), auth.sub],
      );

      await db.execute(
        `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'note_added', NULL, ?, ?)`,
        [assessmentId, JSON.stringify({ noteText: payload.noteText.trim() }), auth.sub],
      );

      set.status = 201;
      return { id: insertIdOf(insertResult) };
    })
    .put("/audits/:auditId/details", async ({ auth, params, body, set }) => {
      const auditId = Number(params.auditId);
      const payload = body as {
        items?: Array<{
          fieldKey: string;
          responseText?: string | null;
          noteText?: string | null;
        }>;
      };

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "auditor", {
        requireUnlockedForWrite: true,
      });
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return access.reason ? { error: access.reason } : forbidden;
      }
      if (!payload.items?.length) {
        set.status = 400;
        return { error: "items are required" };
      }

      const [fields] = await db.query<RowDataPacket[]>(
        "SELECT id, field_key FROM audit_detail_fields WHERE archived_at IS NULL",
      );
      const fieldIdByKey = new Map<string, number>();
      for (const row of fields) fieldIdByKey.set(String(row.field_key), Number(row.id));

      for (const item of payload.items) {
        const fieldId = fieldIdByKey.get(item.fieldKey);
        if (!fieldId) continue;

        const [existingRows] = await db.query<RowDataPacket[]>(
          `SELECT id, response_text, note_text
         FROM audit_detail_responses
         WHERE audit_id = ? AND field_id = ? AND archived_at IS NULL
         LIMIT 1`,
          [auditId, fieldId],
        );

        const previousValue = existingRows.length
          ? {
              responseText: existingRows[0].response_text ?? null,
              noteText: existingRows[0].note_text ?? null,
            }
          : null;
        const nextValue = {
          responseText: item.responseText ?? null,
          noteText: item.noteText ?? null,
        };

        await db.execute(
          `INSERT INTO audit_detail_responses (audit_id, field_id, response_text, note_text, updated_by)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           response_text = VALUES(response_text),
           note_text = VALUES(note_text),
           updated_by = VALUES(updated_by),
           updated_at = UTC_TIMESTAMP(3)`,
          [auditId, fieldId, item.responseText ?? null, item.noteText ?? null, auth.sub],
        );

        if (JSON.stringify(previousValue) !== JSON.stringify(nextValue)) {
          await recordAuditEvent(
            auditId,
            "detail_response_changed",
            auth.sub,
            previousValue,
            nextValue,
            "detail",
            item.fieldKey,
          );
        }
      }

      return { updated: payload.items.length };
    })
    .put("/audits/:auditId/conclusion", async ({ auth, params, body, set }) => {
      const auditId = Number(params.auditId);
      const payload = body as { conclusionText?: string | null };

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "lead_auditor", {
        requireUnlockedForWrite: true,
      });
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return access.reason ? { error: access.reason } : forbidden;
      }

      const [existingRows] = await db.query<RowDataPacket[]>(
        `SELECT id, conclusion_text
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at IS NULL
       LIMIT 1`,
        [auditId],
      );

      await db.execute(
        `INSERT INTO audit_conclusions (audit_id, conclusion_text, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         conclusion_text = VALUES(conclusion_text),
         updated_by = VALUES(updated_by),
         updated_at = UTC_TIMESTAMP(3)`,
        [auditId, payload.conclusionText ?? null, auth.sub],
      );

      const previousConclusion = existingRows.length ? (existingRows[0].conclusion_text ?? null) : null;
      const nextConclusion = payload.conclusionText ?? null;
      if (String(previousConclusion ?? "") !== String(nextConclusion ?? "")) {
        await recordAuditEvent(
          auditId,
          "conclusion_changed",
          auth.sub,
          { conclusionText: previousConclusion },
          { conclusionText: nextConclusion },
          "conclusion",
        );
      }

      return { updated: 1 };
    })
    .get("/audits/:auditId/details", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
         adf.field_key,
         adf.section,
         adf.label,
         adf.guidance_text,
         adr.response_text,
         adr.note_text,
         adr.updated_at
       FROM audit_detail_fields adf
       LEFT JOIN audit_detail_responses adr
         ON adr.field_id = adf.id
         AND adr.audit_id = ?
         AND adr.archived_at IS NULL
       WHERE adf.archived_at IS NULL
       ORDER BY adf.sort_order`,
        [auditId],
      );

      return rows;
    })
    .get("/audits/:auditId/conclusion", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT conclusion_text, updated_at, updated_by
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at IS NULL
       LIMIT 1`,
        [auditId],
      );

      return rows.length ? rows[0] : { conclusion_text: null };
    })
    .get("/audits/:auditId/workspace", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [auditRows] = await db.query<RowDataPacket[]>(
        `SELECT a.id, a.org_id, a.name, a.status, a.audit_date, o.name AS client_name
       FROM audits a
       JOIN organizations o ON o.id = a.org_id AND o.archived_at IS NULL
       WHERE a.id = ? AND a.archived_at IS NULL
       LIMIT 1`,
        [auditId],
      );

      if (!auditRows.length) {
        set.status = 404;
        return { error: "Audit not found" };
      }

      const orgId = Number(auditRows[0].org_id);
      const auditStatus = String(auditRows[0].status);
      const canLeadEdit = hasOrgRole(auth, orgId, "lead_auditor");
      const canAuditorEdit = hasOrgRole(auth, orgId, "auditor");
      const isLockedForNonLead = auditStatus === "completed" && !canLeadEdit;
      const canEdit = canLeadEdit || (canAuditorEdit && !isLockedForNonLead);
      const statusTransitions = canLeadEdit ? allowedStatusTransitions(auditStatus) : [];

      const [scopeRows] = await db.query<RowDataPacket[]>(
        `SELECT
         p.id AS process_id,
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         ast.cert_goal_level,
         ast.custom_goal_level,
         so.code AS scope_code,
         so.label AS scope_label
       FROM processes p
       LEFT JOIN audit_scope_targets ast
         ON ast.process_id = p.id
         AND ast.audit_id = ?
         AND ast.archived_at IS NULL
       LEFT JOIN scope_options so
         ON so.id = ast.scope_option_id
         AND so.archived_at IS NULL
       WHERE p.archived_at IS NULL
       ORDER BY p.sort_order ASC`,
        [auditId],
      );

      const scopeByProcess = new Map<string, RowDataPacket>();
      for (const row of scopeRows) {
        scopeByProcess.set(String(row.process_code), row);
      }

      const [assessmentRows] = await db.query<RowDataPacket[]>(
        `SELECT
         aa.id AS assessment_id,
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         r.id AS requirement_id,
         r.code AS requirement_code,
         r.requirement_text,
         cs.label AS score_label,
         cs.numeric_value AS score_numeric,
         aa.comment_text,
         aa.evidence_text,
         aa.updated_at
       FROM audit_assessments aa
       JOIN requirements r ON r.id = aa.requirement_id AND r.archived_at IS NULL
       JOIN processes p ON p.id = r.process_id AND p.archived_at IS NULL
       LEFT JOIN capability_scores cs ON cs.id = aa.capability_score_id AND cs.archived_at IS NULL
       WHERE aa.audit_id = ? AND aa.archived_at IS NULL
       ORDER BY p.sort_order ASC, r.sort_order ASC`,
        [auditId],
      );

      const groups = new Map<string, any>();

      for (const row of assessmentRows) {
        const processCode = String(row.process_code);
        if (!groups.has(processCode)) {
          const scope = scopeByProcess.get(processCode);
          groups.set(processCode, {
            processCode,
            processName: row.process_name,
            processAbbreviation: row.process_abbreviation,
            certGoalLevel: scope?.cert_goal_level ?? null,
            customGoalLevel: scope?.custom_goal_level ?? null,
            scopeCode: scope?.scope_code ?? "IN_SCOPE",
            scopeLabel: scope?.scope_label ?? "In scope",
            requirements: [],
          });
        }

        groups.get(processCode).requirements.push({
          assessmentId: Number(row.assessment_id),
          requirementId: Number(row.requirement_id),
          requirementCode: row.requirement_code,
          requirementText: row.requirement_text,
          scoreLabel: row.score_label ?? "Select …",
          scoreNumeric: row.score_numeric,
          commentText: row.comment_text,
          evidenceText: row.evidence_text,
          updatedAt: row.updated_at,
        });
      }

      const [details] = await db.query<RowDataPacket[]>(
        `SELECT
         adf.field_key,
         adf.section,
         adf.label,
         adf.guidance_text,
         adr.response_text,
         adr.note_text,
         adr.updated_at
       FROM audit_detail_fields adf
       LEFT JOIN audit_detail_responses adr
         ON adr.field_id = adf.id
         AND adr.audit_id = ?
         AND adr.archived_at IS NULL
       WHERE adf.archived_at IS NULL
       ORDER BY adf.sort_order ASC`,
        [auditId],
      );

      const [conclusionRows] = await db.query<RowDataPacket[]>(
        `SELECT conclusion_text, updated_at
       FROM audit_conclusions
       WHERE audit_id = ? AND archived_at IS NULL
       LIMIT 1`,
        [auditId],
      );

      const [scoreOptions] = await db.query<RowDataPacket[]>(
        `SELECT label, numeric_value, sort_order
       FROM capability_scores
       WHERE archived_at IS NULL
       ORDER BY sort_order ASC`,
      );

      const [targetLevels] = await db.query<RowDataPacket[]>(
        `SELECT level, label
       FROM target_levels
       WHERE archived_at IS NULL
       ORDER BY level ASC`,
      );

      const [scopeOptions] = await db.query<RowDataPacket[]>(
        `SELECT code, label
       FROM scope_options
       WHERE archived_at IS NULL
       ORDER BY id ASC`,
      );

      const auditEvents = (await hasTable("audit_events"))
        ? (
            await db.query<RowDataPacket[]>(
              `SELECT
               ae.id,
               ae.event_type,
               ae.entity_type,
               ae.entity_key,
               ae.old_value_json,
               ae.new_value_json,
               ae.actor_user_id,
               u.display_name AS actor_name,
               ae.created_at
             FROM audit_events ae
             LEFT JOIN users u ON u.id = ae.actor_user_id
             WHERE ae.audit_id = ?
             ORDER BY ae.created_at DESC, ae.id DESC
             LIMIT 100`,
              [auditId],
            )
          )[0]
        : [];

      return {
        audit: auditRows[0],
        permissions: {
          canEdit,
          canLeadEdit,
          canExport: canAuditorEdit,
          canManageStatus: canLeadEdit,
          canManageScopeTargets: canLeadEdit && auditStatus === "draft",
          isLockedForNonLead,
          allowedStatusTransitions: statusTransitions,
        },
        groupedProcesses: Array.from(groups.values()),
        details,
        conclusion: conclusionRows.length ? conclusionRows[0] : { conclusion_text: null },
        auditEvents,
        dropdowns: {
          scoreOptions,
          targetLevels,
          scopeOptions,
        },
      };
    })
    .get("/assessments/:assessmentId/history", async ({ auth, params, set }) => {
      const assessmentId = Number(params.assessmentId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const [assessmentRows] = await db.query<RowDataPacket[]>(
        `SELECT aa.id, a.org_id
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at IS NULL
       WHERE aa.id = ? AND aa.archived_at IS NULL
       LIMIT 1`,
        [assessmentId],
      );

      if (!assessmentRows.length) {
        set.status = 404;
        return { error: "Assessment not found" };
      }

      if (!hasOrgRole(auth, Number(assessmentRows[0].org_id), "viewer")) {
        set.status = 403;
        return forbidden;
      }

      const [events] = await db.query<RowDataPacket[]>(
        `SELECT id, event_type, old_value_json, new_value_json, actor_user_id, created_at
       FROM assessment_events
       WHERE audit_assessment_id = ?
       ORDER BY created_at ASC, id ASC`,
        [assessmentId],
      );

      const [notes] = await db.query<RowDataPacket[]>(
        `SELECT id, note_text, created_by, created_at
       FROM assessment_notes
       WHERE audit_assessment_id = ? AND archived_at IS NULL
       ORDER BY created_at ASC, id ASC`,
        [assessmentId],
      );

      return { events, notes };
    })
    .post("/assessments/:assessmentId/archive", async ({ auth, params, set }) => {
      const assessmentId = Number(params.assessmentId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT aa.id, aa.audit_id, a.org_id, aa.archived_at
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at IS NULL
       WHERE aa.id = ?
       LIMIT 1`,
        [assessmentId],
      );

      if (!rows.length) {
        set.status = 404;
        return { error: "Assessment not found" };
      }

      if (!hasOrgRole(auth, Number(rows[0].org_id), "lead_auditor")) {
        set.status = 403;
        return forbidden;
      }

      if (rows[0].archived_at) {
        set.status = 409;
        return { error: "Assessment is already archived" };
      }

      const [archiveResult] = await db.execute(
        `UPDATE audit_assessments
       SET archived_at = UTC_TIMESTAMP(3), updated_at = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ? AND archived_at IS NULL`,
        [auth.sub, assessmentId],
      );

      if (affectedRowsOf(archiveResult) === 0) {
        set.status = 409;
        return { error: "Assessment could not be archived" };
      }

      await db.execute(
        `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'assessment_archived', NULL, NULL, ?)`,
        [assessmentId, auth.sub],
      );

      await recordAuditEvent(
        Number(rows[0].audit_id),
        "assessment_archived",
        auth.sub,
        { assessmentId, archived: false },
        { assessmentId, archived: true },
        "assessment",
        String(assessmentId),
      );

      return { archived: true };
    })
    .post("/assessments/:assessmentId/restore", async ({ auth, params, set }) => {
      const assessmentId = Number(params.assessmentId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT aa.id, aa.audit_id, a.org_id, aa.archived_at
       FROM audit_assessments aa
       JOIN audits a ON a.id = aa.audit_id AND a.archived_at IS NULL
       WHERE aa.id = ?
       LIMIT 1`,
        [assessmentId],
      );

      if (!rows.length) {
        set.status = 404;
        return { error: "Assessment not found" };
      }

      if (!hasOrgRole(auth, Number(rows[0].org_id), "lead_auditor")) {
        set.status = 403;
        return forbidden;
      }

      if (!rows[0].archived_at) {
        set.status = 409;
        return { error: "Assessment is already active" };
      }

      const [restoreResult] = await db.execute(
        `UPDATE audit_assessments
       SET archived_at = NULL, updated_at = UTC_TIMESTAMP(3), updated_by = ?
       WHERE id = ? AND archived_at IS NOT NULL`,
        [auth.sub, assessmentId],
      );

      if (affectedRowsOf(restoreResult) === 0) {
        set.status = 409;
        return { error: "Assessment could not be restored" };
      }

      await db.execute(
        `INSERT INTO assessment_events
         (audit_assessment_id, event_type, old_value_json, new_value_json, actor_user_id)
       VALUES (?, 'assessment_restored', NULL, NULL, ?)`,
        [assessmentId, auth.sub],
      );

      await recordAuditEvent(
        Number(rows[0].audit_id),
        "assessment_restored",
        auth.sub,
        { assessmentId, archived: true },
        { assessmentId, archived: false },
        "assessment",
        String(assessmentId),
      );

      return { restored: true };
    })
    .get("/audits/:auditId/results/all", async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const auditId = Number(params.auditId);
      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT *
       FROM v_all_results
       WHERE audit_id = ?
       ORDER BY process_code, requirement_code`,
        [auditId],
      );

      return rows;
    })
    .get("/audits/:auditId/results/certification", async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const auditId = Number(params.auditId);
      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT *
       FROM v_certification_results
       WHERE audit_id = ?
       ORDER BY process_code`,
        [auditId],
      );

      return rows;
    })
    .get("/audits/:auditId/results/gaps", async ({ auth, params, set }) => {
      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const auditId = Number(params.auditId);
      const access = await canAccessAudit(auth, auditId, "viewer");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT *
       FROM v_gap_analysis
       WHERE audit_id = ?
       ORDER BY process_code, requirement_code`,
        [auditId],
      );

      return rows;
    })
    .get("/orgs/:orgId/trends", async ({ auth, params, set }) => {
      const orgId = Number(params.orgId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!hasOrgRole(auth, orgId, "viewer")) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT *
       FROM v_trends
       WHERE org_id = ?
       ORDER BY audit_date DESC, process_code`,
        [orgId],
      );

      return rows;
    }) as unknown as AppBase;
