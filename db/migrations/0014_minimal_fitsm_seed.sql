INSERT INTO processes (code, abbreviation, name, kind, sort_order, default_cert_goal_level)
VALUES
  (
    'GR1',
    'GR1',
    'GR1: Top Management Commitment & Accountability (minimal seed)',
    'GR',
    10,
    3
  )
ON DUPLICATE KEY UPDATE
  abbreviation = VALUES(abbreviation),
  name = VALUES(name),
  kind = VALUES(kind),
  sort_order = VALUES(sort_order),
  default_cert_goal_level = VALUES(default_cert_goal_level),
  updated_at_UTC = UTC_TIMESTAMP(3);

INSERT INTO requirements (process_id, code, requirement_text, sort_order)
SELECT
  p.id,
  'GR1.1',
  'A member of top management of the service provider(s) involved in the delivery of services shall be assigned as the SMS owner to be accountable for the overall SMS.',
  10
FROM processes p
WHERE p.code = 'GR1' AND p.archived_at_UTC IS NULL
ON DUPLICATE KEY UPDATE
  requirement_text = VALUES(requirement_text),
  sort_order = VALUES(sort_order),
  updated_at_UTC = UTC_TIMESTAMP(3);

INSERT INTO requirement_level_guidance (requirement_id, capability_score_id, guidance_text)
SELECT
  r.id,
  cs.id,
  CASE cs.label
    WHEN '0' THEN 'No top-management accountability is defined.'
    WHEN '1' THEN 'Initial accountability exists but is not consistently documented.'
    WHEN '2' THEN 'Accountability is documented and partially practiced.'
    WHEN '3' THEN 'Accountability is defined, communicated, and consistently practiced.'
    WHEN '4' THEN 'Accountability is continuously monitored and improved.'
    ELSE 'Select an assessment score.'
  END AS guidance_text
FROM requirements r
JOIN capability_scores cs
  ON cs.label IN ('0', '1', '2', '3', '4')
WHERE r.code = 'GR1.1'
  AND r.archived_at_UTC IS NULL
  AND cs.archived_at_UTC IS NULL
ON DUPLICATE KEY UPDATE
  guidance_text = VALUES(guidance_text),
  updated_at_UTC = UTC_TIMESTAMP(3);
