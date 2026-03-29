CREATE TABLE IF NOT EXISTS assessment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  audit_assessment_id BIGINT UNSIGNED NOT NULL,
  event_type ENUM(
    'assessment_created',
    'score_changed',
    'comment_changed',
    'evidence_changed',
    'note_added',
    'scope_target_changed',
    'detail_response_changed',
    'conclusion_changed',
    'assessment_archived',
    'assessment_restored'
  ) NOT NULL,
  old_value_json JSON NULL,
  new_value_json JSON NULL,
  actor_user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_assessment_events_assessment_time (audit_assessment_id, created_at),
  KEY idx_assessment_events_actor_time (actor_user_id, created_at),
  CONSTRAINT fk_assessment_events_assessment FOREIGN KEY (audit_assessment_id) REFERENCES audit_assessments(id),
  CONSTRAINT fk_assessment_events_actor FOREIGN KEY (actor_user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
