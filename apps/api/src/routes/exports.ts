import type { AppBase } from "../app-base";
import type { RowDataPacket } from "../support";
import {
  buildAuditPdfReport,
  canAccessAudit,
  config,
  contentDispositionAttachment,
  createHash,
  db,
  dirname,
  fileTs,
  forbidden,
  hasOrgRole,
  insertIdOf,
  join,
  mkdir,
  queryValue,
  randomUUID,
  readFileFs,
  resolveExportPath,
  rowsToCsv,
  safeFileSegment,
  unauthorized,
  writeFile,
} from "../support";

export const registerExportRoutes = (app: AppBase): AppBase =>
  app
    .get("/audits/:auditId/exports", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "auditor");
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
         id,
         report_kind,
         file_name,
         file_size_bytes,
         sha256_hex,
         is_current,
         generated_at,
         generated_by
       FROM audit_pdf_exports
       WHERE audit_id = ? AND archived_at IS NULL
       ORDER BY generated_at DESC, id DESC`,
        [auditId],
      );

      return rows;
    })
    .get("/audits/:auditId/exports/csv", async ({ auth, params, query, set }) => {
      const auditId = Number(params.auditId);
      const report = queryValue(query, "report", "all");

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

      let sql = "";
      if (report === "all") {
        sql = `SELECT * FROM v_all_results WHERE audit_id = ? ORDER BY process_code, requirement_code`;
      } else if (report === "certification") {
        sql = `SELECT * FROM v_certification_results WHERE audit_id = ? ORDER BY process_code`;
      } else if (report === "gaps") {
        sql = `SELECT * FROM v_gap_analysis WHERE audit_id = ? ORDER BY process_code, requirement_code`;
      } else {
        set.status = 400;
        return { error: "Invalid report. Use all|certification|gaps" };
      }

      const [rows] = await db.query<RowDataPacket[]>(sql, [auditId]);
      const csv = rowsToCsv(rows);
      const filename = `audit-${auditId}-${report}-${fileTs()}.csv`;

      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    })
    .get("/orgs/:orgId/exports/csv", async ({ auth, params, query, set }) => {
      const orgId = Number(params.orgId);
      const report = queryValue(query, "report", "trends");

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }
      if (!hasOrgRole(auth, orgId, "viewer")) {
        set.status = 403;
        return forbidden;
      }

      if (report !== "trends") {
        set.status = 400;
        return { error: "Invalid report. Use trends" };
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT *
       FROM v_trends
       WHERE org_id = ?
       ORDER BY audit_date DESC, process_code`,
        [orgId],
      );

      const csv = rowsToCsv(rows);
      const filename = `org-${orgId}-trends-${fileTs()}.csv`;
      return new Response(csv, {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="${filename}"`,
        },
      });
    })
    .post("/audits/:auditId/exports/pdf", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "auditor");
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

      const audit = auditRows[0];

      const [leadAuditorRows] = await db.query<RowDataPacket[]>(
        `SELECT adr.response_text
       FROM audit_detail_responses adr
       JOIN audit_detail_fields adf ON adf.id = adr.field_id
       WHERE adf.field_key = 'lead_auditor_name'
         AND adf.archived_at IS NULL
         AND adr.audit_id = ?
         AND adr.archived_at IS NULL
       LIMIT 1`,
        [auditId],
      );

      const [scopeCounts] = await db.query<RowDataPacket[]>(
        `SELECT so.code, COUNT(*) AS cnt
       FROM audit_scope_targets ast
       JOIN scope_options so ON so.id = ast.scope_option_id AND so.archived_at IS NULL
       WHERE ast.audit_id = ? AND ast.archived_at IS NULL
       GROUP BY so.code`,
        [auditId],
      );

      let inScope = 0;
      let outOfScope = 0;
      for (const row of scopeCounts) {
        if (String(row.code) === "IN_SCOPE") inScope = Number(row.cnt);
        if (String(row.code) === "OUT_OF_SCOPE") outOfScope = Number(row.cnt);
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT
         p.code AS process_code,
         p.name AS process_name,
         p.abbreviation AS process_abbreviation,
         ast.cert_goal_level,
         ast.custom_goal_level,
         COALESCE(so.label, 'In scope') AS scope_label,
         r.code AS requirement_code,
         r.requirement_text,
         COALESCE(cs.label, 'Select …') AS score_label,
         aa.comment_text,
         aa.evidence_text
       FROM requirements r
       JOIN processes p ON p.id = r.process_id AND p.archived_at IS NULL
       LEFT JOIN audit_scope_targets ast
         ON ast.process_id = p.id
         AND ast.audit_id = ?
         AND ast.archived_at IS NULL
       LEFT JOIN scope_options so
         ON so.id = ast.scope_option_id
         AND so.archived_at IS NULL
       LEFT JOIN audit_assessments aa
         ON aa.audit_id = ?
         AND aa.requirement_id = r.id
         AND aa.archived_at IS NULL
       LEFT JOIN capability_scores cs
         ON cs.id = aa.capability_score_id
         AND cs.archived_at IS NULL
       WHERE r.archived_at IS NULL
       ORDER BY p.sort_order ASC, r.sort_order ASC`,
        [auditId, auditId],
      );

      const grouped = new Map<string, any>();
      for (const row of rows) {
        const processCode = String(row.process_code);
        if (!grouped.has(processCode)) {
          grouped.set(processCode, {
            processCode,
            processName: row.process_name,
            processAbbreviation: row.process_abbreviation,
            scopeLabel: row.scope_label,
            certGoalLevel: row.cert_goal_level,
            customGoalLevel: row.custom_goal_level,
            requirements: [],
          });
        }

        grouped.get(processCode).requirements.push({
          requirementCode: row.requirement_code,
          requirementText: row.requirement_text,
          scoreLabel: row.score_label,
          commentText: row.comment_text,
          evidenceText: row.evidence_text,
        });
      }

      const generatedAt = new Date();
      const generatedAtIso = generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

      const pdfBytes = await buildAuditPdfReport({
        audit: {
          id: Number(audit.id),
          name: String(audit.name),
          status: String(audit.status),
          auditDate: String(audit.audit_date),
          clientName: String(audit.client_name),
          generatedAtIso,
          leadAuditorName: String(leadAuditorRows[0]?.response_text ?? ""),
          scopeSummary: `In scope processes: ${inScope}; Out of scope processes: ${outOfScope}`,
        },
        groupedProcesses: Array.from(grouped.values()),
      });

      const ts = generatedAt
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14);
      const fileName = `${safeFileSegment(String(audit.name) || "audit")}-${ts}.pdf`;
      const relativePath = join(String(audit.org_id), `audit-${auditId}`, `${randomUUID()}-${fileName}`);
      const absPath = join(config.exportsDir, relativePath);

      await mkdir(dirname(absPath), { recursive: true });
      await writeFile(absPath, pdfBytes);

      const sha256Hex = createHash("sha256").update(pdfBytes).digest("hex");
      const fileSizeBytes = pdfBytes.byteLength;

      await db.execute(
        `UPDATE audit_pdf_exports
       SET is_current = 0, updated_at = UTC_TIMESTAMP(3)
       WHERE audit_id = ?
         AND report_kind = 'FULL_ASSESSMENT_REPORT'
         AND archived_at IS NULL
         AND is_current = 1`,
        [auditId],
      );

      const [insertResult] = await db.execute(
        `INSERT INTO audit_pdf_exports
         (audit_id, org_id, report_kind, file_name, file_path, file_size_bytes, sha256_hex, is_current, generated_by)
       VALUES (?, ?, 'FULL_ASSESSMENT_REPORT', ?, ?, ?, ?, 1, ?)`,
        [auditId, Number(audit.org_id), fileName, relativePath, fileSizeBytes, sha256Hex, auth.sub],
      );

      set.status = 201;
      return {
        id: insertIdOf(insertResult),
        fileName,
        fileSizeBytes,
        generatedAt: generatedAtIso,
        reportKind: "FULL_ASSESSMENT_REPORT",
      };
    })
    .get("/audits/:auditId/exports/:exportId/download", async ({ auth, params, set }) => {
      const auditId = Number(params.auditId);
      const exportId = Number(params.exportId);

      if (!auth) {
        set.status = 401;
        return unauthorized;
      }

      const access = await canAccessAudit(auth, auditId, "auditor");
      if (!access.orgId) {
        set.status = 404;
        return { error: "Audit not found" };
      }
      if (!access.allowed) {
        set.status = 403;
        return forbidden;
      }

      const [rows] = await db.query<RowDataPacket[]>(
        `SELECT file_name, file_path
       FROM audit_pdf_exports
       WHERE id = ? AND audit_id = ? AND archived_at IS NULL
       LIMIT 1`,
        [exportId, auditId],
      );

      if (!rows.length) {
        set.status = 404;
        return { error: "Export not found" };
      }

      const fileName = String(rows[0].file_name);
      const filePath = String(rows[0].file_path);

      try {
        const absolutePath = resolveExportPath(config.exportsDir, filePath);
        const fileBuffer = await readFileFs(absolutePath);
        return new Response(fileBuffer, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": contentDispositionAttachment(fileName),
          },
        });
      } catch {
        set.status = 404;
        return { error: "Export file not found on disk" };
      }
    }) as unknown as AppBase;
