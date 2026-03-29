CREATE TABLE IF NOT EXISTS audit_detail_fields (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  field_key VARCHAR(64) NOT NULL,
  section VARCHAR(64) NOT NULL,
  label VARCHAR(255) NOT NULL,
  guidance_text TEXT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_field_key VARCHAR(64) AS (CASE WHEN archived_at IS NULL THEN field_key ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_detail_fields_active_key (active_field_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_detail_responses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_id BIGINT UNSIGNED NOT NULL,
  field_id BIGINT UNSIGNED NOT NULL,
  response_text TEXT NULL,
  note_text TEXT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  updated_by BIGINT UNSIGNED NULL,
  active_audit_id BIGINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN audit_id ELSE NULL END) STORED,
  active_field_id BIGINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN field_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_audit_detail_responses_active (active_audit_id, active_field_id),
  KEY idx_audit_detail_responses_audit (audit_id),
  CONSTRAINT fk_audit_detail_responses_audit FOREIGN KEY (audit_id) REFERENCES audits(id),
  CONSTRAINT fk_audit_detail_responses_field FOREIGN KEY (field_id) REFERENCES audit_detail_fields(id),
  CONSTRAINT fk_audit_detail_responses_updated_by FOREIGN KEY (updated_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO audit_detail_fields (field_key, section, label, guidance_text, sort_order)
VALUES
  ('auditee_name', 'Auditee', 'Auditee name', 'What is the organisation or unit being audited?', 10),
  ('auditee_address', 'Auditee', 'Auditee address', NULL, 20),
  ('auditee_rep_name', 'Auditee', 'Auditee representative name', 'Who is the lead representative of the auditee, who may be contacted by the certification body regarding the results or any issues with the audit?', 30),
  ('auditee_rep_contact', 'Auditee', 'Auditee representative contact details', 'What are the email, phone, address or other relevant contact details for the auditee representative?', 40),
  ('lead_auditor_name', 'Audit team', 'Lead auditor name', 'Who is conducting the audit? This must be a FitSM auditor certified by a FitSM-recognised certification body.', 50),
  ('lead_auditor_contact', 'Audit team', 'Lead auditor contact details', 'What are the email, phone, address or other relevant contact details for the lead auditor?', 60),
  ('additional_team_contacts', 'Audit team', 'Additional audit team members names and contacts', 'If other individuals participated as part of the audit team, their names and contacts must be entered.', 70),
  ('audit_scope', 'Audit event', 'Audit scope', 'Such as which locations or business units were being audited.', 80),
  ('audit_locations', 'Audit event', 'Audit locations', 'Was the audit in person, remote, or hybrid? Where were any physical sessions?', 90),
  ('audit_times', 'Audit event', 'Audit times', 'What days and roughly what times was the audit conducted?', 100),
  ('audit_evidence_language', 'Audit event', 'Audit evidence language', 'In what languages were SMS documents written and interviews conducted?', 110)
ON DUPLICATE KEY UPDATE
  section = VALUES(section),
  label = VALUES(label),
  guidance_text = VALUES(guidance_text),
  sort_order = VALUES(sort_order);
