ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version INT UNSIGNED NOT NULL DEFAULT 1 AFTER last_login_at_UTC;

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  entity_type ENUM('audit','detail','conclusion','status','assessment') NOT NULL DEFAULT 'audit',
  entity_key VARCHAR(128) NULL,
  old_value_json LONGTEXT NULL,
  new_value_json LONGTEXT NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_audit_events_audit_created (audit_id, created_at_UTC),
  KEY idx_audit_events_actor (actor_user_id),
  CONSTRAINT fk_audit_events_audit FOREIGN KEY (audit_id) REFERENCES audits(id),
  CONSTRAINT fk_audit_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
