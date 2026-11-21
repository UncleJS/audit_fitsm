-- Rename every date/time column to the *_UTC suffix (values are stored in UTC).
-- RENAME COLUMN IF EXISTS keeps this migration safe to re-run. Each stored generated column that
-- reads archived_at is restated in the same ALTER: MariaDB 12.3 can otherwise fail with
-- "Unknown column 'archived_at' in 'GENERATED ALWAYS AS'" when a table is renamed after one of
-- its foreign-key neighbours in the same session. Views are recreated afterwards.

-- run-migrations.ts creates schema_migrations with executed_UTC on new databases.
ALTER TABLE schema_migrations
  RENAME COLUMN IF EXISTS executed_at TO executed_UTC;

ALTER TABLE organizations
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_name VARCHAR(191) AS (CASE WHEN archived_UTC IS NULL THEN name ELSE NULL END) STORED;

ALTER TABLE users
  RENAME COLUMN IF EXISTS last_login_at TO last_login_UTC,
  RENAME COLUMN IF EXISTS pii_redacted_at TO pii_redacted_UTC,
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_email VARCHAR(191) AS (CASE WHEN archived_UTC IS NULL THEN email ELSE NULL END) STORED,
  MODIFY COLUMN active_external_subject VARCHAR(191) AS (CASE WHEN archived_UTC IS NULL THEN external_subject ELSE NULL END) STORED;

ALTER TABLE audits
  RENAME COLUMN IF EXISTS audit_date TO audit_date_UTC,
  RENAME COLUMN IF EXISTS completed_at TO completed_UTC,
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_org_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN org_id ELSE NULL END) STORED,
  MODIFY COLUMN active_name VARCHAR(255) AS (CASE WHEN archived_UTC IS NULL THEN name ELSE NULL END) STORED;

ALTER TABLE capability_scores
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_label VARCHAR(32) AS (CASE WHEN archived_UTC IS NULL THEN label ELSE NULL END) STORED,
  MODIFY COLUMN active_numeric_value TINYINT(3) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN numeric_value ELSE NULL END) STORED;

ALTER TABLE target_levels
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC;

ALTER TABLE processes
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_code VARCHAR(16) AS (CASE WHEN archived_UTC IS NULL THEN code ELSE NULL END) STORED,
  MODIFY COLUMN active_abbreviation VARCHAR(16) AS (CASE WHEN archived_UTC IS NULL THEN abbreviation ELSE NULL END) STORED;

ALTER TABLE requirements
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_code VARCHAR(32) AS (CASE WHEN archived_UTC IS NULL THEN code ELSE NULL END) STORED,
  MODIFY COLUMN active_process_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN process_id ELSE NULL END) STORED,
  MODIFY COLUMN active_sort_order SMALLINT(5) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN sort_order ELSE NULL END) STORED;

ALTER TABLE audit_assessments
  RENAME COLUMN IF EXISTS pii_redacted_at TO pii_redacted_UTC,
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_audit_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN audit_id ELSE NULL END) STORED,
  MODIFY COLUMN active_requirement_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN requirement_id ELSE NULL END) STORED;

ALTER TABLE assessment_events
  RENAME COLUMN IF EXISTS created_at TO created_UTC;

ALTER TABLE assessment_evidence
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC;

ALTER TABLE assessment_notes
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC;

ALTER TABLE audit_conclusions
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_audit_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN audit_id ELSE NULL END) STORED;

ALTER TABLE audit_detail_fields
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_field_key VARCHAR(64) AS (CASE WHEN archived_UTC IS NULL THEN field_key ELSE NULL END) STORED;

ALTER TABLE audit_detail_responses
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_audit_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN audit_id ELSE NULL END) STORED,
  MODIFY COLUMN active_field_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN field_id ELSE NULL END) STORED;

ALTER TABLE audit_events
  RENAME COLUMN IF EXISTS created_at TO created_UTC;

ALTER TABLE audit_pdf_exports
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS generated_at TO generated_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_audit_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN audit_id ELSE NULL END) STORED,
  MODIFY COLUMN active_report_kind VARCHAR(64) AS (CASE WHEN archived_UTC IS NULL THEN report_kind ELSE NULL END) STORED,
  MODIFY COLUMN active_is_current TINYINT(1) AS (CASE WHEN archived_UTC IS NULL AND is_current = 1 THEN 1 ELSE NULL END) STORED;

ALTER TABLE scope_options
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_code VARCHAR(32) AS (CASE WHEN archived_UTC IS NULL THEN code ELSE NULL END) STORED;

ALTER TABLE audit_scope_targets
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_audit_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN audit_id ELSE NULL END) STORED,
  MODIFY COLUMN active_process_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN process_id ELSE NULL END) STORED;

ALTER TABLE roles
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_code VARCHAR(64) AS (CASE WHEN archived_UTC IS NULL THEN code ELSE NULL END) STORED;

ALTER TABLE org_user_roles
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_org_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN org_id ELSE NULL END) STORED,
  MODIFY COLUMN active_user_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN user_id ELSE NULL END) STORED,
  MODIFY COLUMN active_role_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN role_id ELSE NULL END) STORED;

ALTER TABLE permissions
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_code VARCHAR(128) AS (CASE WHEN archived_UTC IS NULL THEN code ELSE NULL END) STORED;

ALTER TABLE requirement_level_guidance
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  RENAME COLUMN IF EXISTS updated_at TO updated_UTC,
  MODIFY COLUMN active_requirement_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN requirement_id ELSE NULL END) STORED,
  MODIFY COLUMN active_capability_score_id TINYINT(3) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN capability_score_id ELSE NULL END) STORED;

ALTER TABLE role_permissions
  RENAME COLUMN IF EXISTS archived_at TO archived_UTC,
  RENAME COLUMN IF EXISTS created_at TO created_UTC,
  MODIFY COLUMN active_role_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN role_id ELSE NULL END) STORED,
  MODIFY COLUMN active_permission_id BIGINT(20) UNSIGNED AS (CASE WHEN archived_UTC IS NULL THEN permission_id ELSE NULL END) STORED;

DROP VIEW IF EXISTS v_all_results, v_certification_results, v_gap_analysis, v_trends;

CREATE OR REPLACE VIEW v_all_results AS
SELECT
  a.id AS audit_id,
  a.org_id,
  a.audit_date_UTC,
  p.id AS process_id,
  p.code AS process_code,
  p.abbreviation AS process_abbreviation,
  p.name AS process_name,
  r.id AS requirement_id,
  r.code AS requirement_code,
  r.requirement_text,
  COALESCE(so.code, 'IN_SCOPE') AS scope_code,
  ast.cert_goal_level,
  ast.custom_goal_level,
  cs.id AS capability_score_id,
  cs.label AS capability_score_label,
  cs.numeric_value AS capability_score_numeric,
  aa.comment_text,
  aa.evidence_text,
  CASE
    WHEN COALESCE(so.code, 'IN_SCOPE') = 'OUT_OF_SCOPE' THEN 'Out of scope'
    WHEN ast.cert_goal_level IS NULL THEN 'No target set'
    WHEN cs.numeric_value IS NULL THEN 'No result given'
    WHEN cs.numeric_value >= ast.cert_goal_level THEN 'Target met'
    ELSE 'Target not met'
  END AS cert_target_status,
  CASE
    WHEN COALESCE(so.code, 'IN_SCOPE') = 'OUT_OF_SCOPE' THEN 'Out of scope'
    WHEN ast.custom_goal_level IS NULL THEN 'No target set'
    WHEN cs.numeric_value IS NULL THEN 'No result given'
    WHEN cs.numeric_value >= ast.custom_goal_level THEN 'Target met'
    ELSE 'Target not met'
  END AS custom_target_status
FROM audit_assessments aa
JOIN audits a ON a.id = aa.audit_id AND a.archived_UTC IS NULL
JOIN requirements r ON r.id = aa.requirement_id AND r.archived_UTC IS NULL
JOIN processes p ON p.id = r.process_id AND p.archived_UTC IS NULL
LEFT JOIN audit_scope_targets ast
  ON ast.audit_id = a.id
  AND ast.process_id = p.id
  AND ast.archived_UTC IS NULL
LEFT JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_UTC IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_UTC IS NULL
WHERE aa.archived_UTC IS NULL;

CREATE OR REPLACE VIEW v_certification_results AS
SELECT
  a.id AS audit_id,
  a.org_id,
  p.id AS process_id,
  p.code AS process_code,
  p.abbreviation AS process_abbreviation,
  p.name AS process_name,
  ast.cert_goal_level AS capability_goal,
  COUNT(r.id) AS requirement_count,
  SUM(CASE WHEN cs.numeric_value >= ast.cert_goal_level THEN 1 ELSE 0 END) AS requirements_at_target,
  CASE
    WHEN SUM(CASE WHEN cs.numeric_value >= ast.cert_goal_level THEN 1 ELSE 0 END) >= COUNT(r.id)
      THEN 'Certification goals met'
    ELSE 'Certification goals not met'
  END AS result
FROM audits a
JOIN audit_scope_targets ast
  ON ast.audit_id = a.id
  AND ast.archived_UTC IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_UTC IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_UTC IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_UTC IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_UTC IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_UTC IS NULL
WHERE a.archived_UTC IS NULL
GROUP BY
  a.id,
  a.org_id,
  p.id,
  p.code,
  p.abbreviation,
  p.name,
  ast.cert_goal_level;

CREATE OR REPLACE VIEW v_gap_analysis AS
SELECT
  a.id AS audit_id,
  a.org_id,
  p.id AS process_id,
  p.code AS process_code,
  p.abbreviation AS process_abbreviation,
  p.name AS process_name,
  r.id AS requirement_id,
  r.code AS requirement_code,
  r.requirement_text,
  ast.cert_goal_level AS certification_goal,
  cs.numeric_value AS assessment_score,
  aa.comment_text,
  aa.evidence_text
FROM audits a
JOIN audit_scope_targets ast
  ON ast.audit_id = a.id
  AND ast.archived_UTC IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_UTC IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_UTC IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_UTC IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_UTC IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_UTC IS NULL
WHERE
  a.archived_UTC IS NULL
  AND ast.cert_goal_level IS NOT NULL
  AND (cs.numeric_value IS NULL OR cs.numeric_value < ast.cert_goal_level);

CREATE OR REPLACE VIEW v_trends AS
SELECT
  a.org_id,
  a.id AS audit_id,
  a.audit_date_UTC,
  p.id AS process_id,
  p.code AS process_code,
  p.abbreviation AS process_abbreviation,
  p.name AS process_name,
  AVG(cs.numeric_value) AS average_capability_score,
  SUM(CASE WHEN cs.numeric_value IS NOT NULL THEN 1 ELSE 0 END) AS scored_requirements,
  COUNT(r.id) AS total_requirements
FROM audits a
JOIN audit_scope_targets ast
  ON ast.audit_id = a.id
  AND ast.archived_UTC IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_UTC IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_UTC IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_UTC IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_UTC IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_UTC IS NULL
WHERE a.archived_UTC IS NULL
GROUP BY
  a.org_id,
  a.id,
  a.audit_date_UTC,
  p.id,
  p.code,
  p.abbreviation,
  p.name;
