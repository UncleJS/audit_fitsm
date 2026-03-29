CREATE TABLE IF NOT EXISTS assessment_notes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_assessment_id BIGINT UNSIGNED NOT NULL,
  note_text TEXT NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_assessment_notes_assessment (audit_assessment_id),
  KEY idx_assessment_notes_created_at (created_at),
  CONSTRAINT fk_assessment_notes_assessment FOREIGN KEY (audit_assessment_id) REFERENCES audit_assessments(id),
  CONSTRAINT fk_assessment_notes_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS assessment_evidence (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_assessment_id BIGINT UNSIGNED NOT NULL,
  evidence_reference VARCHAR(500) NOT NULL,
  details TEXT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  KEY idx_assessment_evidence_assessment (audit_assessment_id),
  CONSTRAINT fk_assessment_evidence_assessment FOREIGN KEY (audit_assessment_id) REFERENCES audit_assessments(id),
  CONSTRAINT fk_assessment_evidence_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
