CREATE TABLE IF NOT EXISTS audit_conclusions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_id BIGINT UNSIGNED NOT NULL,
  conclusion_text LONGTEXT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  active_audit_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN audit_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_conclusions_active_audit (active_audit_id),
  CONSTRAINT fk_audit_conclusions_audit FOREIGN KEY (audit_id) REFERENCES audits(id),
  CONSTRAINT fk_audit_conclusions_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
