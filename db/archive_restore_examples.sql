-- Archive (soft-delete) an assessment row
UPDATE audit_assessments
SET archived_UTC = UTC_TIMESTAMP(3), updated_UTC = UTC_TIMESTAMP(3)
WHERE id = ? AND archived_UTC IS NULL;

-- Restore an archived assessment row
UPDATE audit_assessments
SET archived_UTC = NULL, updated_UTC = UTC_TIMESTAMP(3)
WHERE id = ? AND archived_UTC IS NOT NULL;

-- Redact PII in a user profile (retain row for auditability)
UPDATE users
SET
  display_name = 'REDACTED',
  email = CONCAT('redacted+', id, '@example.invalid'),
  pii_redacted_UTC = UTC_TIMESTAMP(3),
  updated_UTC = UTC_TIMESTAMP(3)
WHERE id = ?;
