CREATE TABLE IF NOT EXISTS capability_scores (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  label VARCHAR(32) NOT NULL,
  numeric_value TINYINT UNSIGNED NULL,
  sort_order TINYINT UNSIGNED NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  active_label VARCHAR(32) AS (CASE WHEN archived_at IS NULL THEN label ELSE NULL END) STORED,
  active_numeric_value TINYINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN numeric_value ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_capability_scores_active_label (active_label),
  UNIQUE KEY uq_capability_scores_active_numeric (active_numeric_value)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS target_levels (
  level TINYINT UNSIGNED NOT NULL,
  label VARCHAR(64) NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  PRIMARY KEY (level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scope_options (
  id TINYINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(32) NOT NULL,
  label VARCHAR(64) NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  active_code VARCHAR(32) AS (CASE WHEN archived_at IS NULL THEN code ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_scope_options_active_code (active_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS processes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(16) NOT NULL,
  abbreviation VARCHAR(16) NOT NULL,
  name VARCHAR(255) NOT NULL,
  kind ENUM('GR', 'PR') NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL,
  default_cert_goal_level TINYINT UNSIGNED NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_code VARCHAR(16) AS (CASE WHEN archived_at IS NULL THEN code ELSE NULL END) STORED,
  active_abbreviation VARCHAR(16) AS (CASE WHEN archived_at IS NULL THEN abbreviation ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_processes_active_code (active_code),
  UNIQUE KEY uq_processes_active_abbreviation (active_abbreviation),
  KEY idx_processes_kind_sort (kind, sort_order),
  CONSTRAINT fk_processes_default_target_level FOREIGN KEY (default_cert_goal_level) REFERENCES target_levels(level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS requirements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  process_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(32) NOT NULL,
  requirement_text TEXT NOT NULL,
  sort_order SMALLINT UNSIGNED NOT NULL,
  archived_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_code VARCHAR(32) AS (CASE WHEN archived_at IS NULL THEN code ELSE NULL END) STORED,
  active_process_id BIGINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN process_id ELSE NULL END) STORED,
  active_sort_order SMALLINT UNSIGNED AS (CASE WHEN archived_at IS NULL THEN sort_order ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_requirements_active_code (active_code),
  UNIQUE KEY uq_requirements_active_process_sort (active_process_id, active_sort_order),
  KEY idx_requirements_process (process_id),
  CONSTRAINT fk_requirements_process FOREIGN KEY (process_id) REFERENCES processes(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO capability_scores (label, numeric_value, sort_order)
VALUES
  ('Select …', NULL, 0),
  ('0', 0, 1),
  ('1', 1, 2),
  ('2', 2, 3),
  ('3', 3, 4),
  ('4', 4, 5)
ON DUPLICATE KEY UPDATE sort_order = VALUES(sort_order);

INSERT INTO target_levels (level, label)
VALUES
  (1, 'Ad-hoc / Initial'),
  (2, 'Repeatable / Partial'),
  (3, 'Defined / Complete'),
  (4, 'Managed / Aligned')
ON DUPLICATE KEY UPDATE label = VALUES(label);

INSERT INTO scope_options (code, label)
VALUES
  ('IN_SCOPE', 'In scope'),
  ('OUT_OF_SCOPE', 'Out of scope')
ON DUPLICATE KEY UPDATE label = VALUES(label);
