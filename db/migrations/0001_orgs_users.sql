CREATE TABLE IF NOT EXISTS organizations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(191) NOT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_name VARCHAR(191) AS (CASE WHEN archived_at_UTC IS NULL THEN name ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_organizations_active_name (active_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NULL,
  display_name VARCHAR(191) NOT NULL,
  auth_provider ENUM('local','oidc') NOT NULL DEFAULT 'local',
  external_subject VARCHAR(191) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_login_at_UTC DATETIME(3) NULL,
  pii_redacted_at_UTC DATETIME(3) NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  updated_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3) ON UPDATE UTC_TIMESTAMP(3),
  active_email VARCHAR(191) AS (CASE WHEN archived_at_UTC IS NULL THEN email ELSE NULL END) STORED,
  active_external_subject VARCHAR(191) AS (CASE WHEN archived_at_UTC IS NULL THEN external_subject ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_active_email (active_email),
  UNIQUE KEY uq_users_active_external_subject (auth_provider, active_external_subject),
  CONSTRAINT chk_users_local_password CHECK (
    (auth_provider = 'local' AND password_hash IS NOT NULL) OR
    (auth_provider = 'oidc')
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
