CREATE TABLE IF NOT EXISTS requirement_level_guidance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  requirement_id BIGINT UNSIGNED NOT NULL,
  capability_score_id TINYINT UNSIGNED NOT NULL,
  guidance_text TEXT NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_requirement_id BIGINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN requirement_id ELSE NULL END) STORED,
  active_capability_score_id TINYINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN capability_score_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_req_guidance_active (active_requirement_id, active_capability_score_id),
  KEY idx_req_guidance_requirement (requirement_id),
  KEY idx_req_guidance_capability_score (capability_score_id),
  CONSTRAINT fk_req_guidance_requirement FOREIGN KEY (requirement_id) REFERENCES requirements(id),
  CONSTRAINT fk_req_guidance_capability_score FOREIGN KEY (capability_score_id) REFERENCES capability_scores(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
