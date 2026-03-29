CREATE OR REPLACE VIEW v_all_results AS
SELECT
  a.id AS audit_id,
  a.org_id,
  a.audit_date,
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
JOIN audits a ON a.id = aa.audit_id AND a.archived_at IS NULL
JOIN requirements r ON r.id = aa.requirement_id AND r.archived_at IS NULL
JOIN processes p ON p.id = r.process_id AND p.archived_at IS NULL
LEFT JOIN audit_scope_targets ast
  ON ast.audit_id = a.id
  AND ast.process_id = p.id
  AND ast.archived_at IS NULL
LEFT JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_at IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_at IS NULL
WHERE aa.archived_at IS NULL;

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
  AND ast.archived_at IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_at IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_at IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_at IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_at IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_at IS NULL
WHERE a.archived_at IS NULL
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
  AND ast.archived_at IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_at IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_at IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_at IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_at IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_at IS NULL
WHERE
  a.archived_at IS NULL
  AND ast.cert_goal_level IS NOT NULL
  AND (cs.numeric_value IS NULL OR cs.numeric_value < ast.cert_goal_level);

CREATE OR REPLACE VIEW v_trends AS
SELECT
  a.org_id,
  a.id AS audit_id,
  a.audit_date,
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
  AND ast.archived_at IS NULL
JOIN scope_options so
  ON so.id = ast.scope_option_id
  AND so.archived_at IS NULL
  AND so.code = 'IN_SCOPE'
JOIN processes p
  ON p.id = ast.process_id
  AND p.archived_at IS NULL
JOIN requirements r
  ON r.process_id = p.id
  AND r.archived_at IS NULL
LEFT JOIN audit_assessments aa
  ON aa.audit_id = a.id
  AND aa.requirement_id = r.id
  AND aa.archived_at IS NULL
LEFT JOIN capability_scores cs
  ON cs.id = aa.capability_score_id
  AND cs.archived_at IS NULL
WHERE a.archived_at IS NULL
GROUP BY
  a.org_id,
  a.id,
  a.audit_date,
  p.id,
  p.code,
  p.abbreviation,
  p.name;
