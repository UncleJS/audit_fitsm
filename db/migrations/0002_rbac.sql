CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(64) NOT NULL,
  description VARCHAR(255) NOT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  active_code VARCHAR(64) AS (CASE WHEN archived_at_UTC IS NULL THEN code ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_roles_active_code (active_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  code VARCHAR(128) NOT NULL,
  description VARCHAR(255) NOT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  active_code VARCHAR(128) AS (CASE WHEN archived_at_UTC IS NULL THEN code ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_permissions_active_code (active_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS role_permissions (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_id BIGINT UNSIGNED NOT NULL,
  permission_id BIGINT UNSIGNED NOT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  active_role_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN role_id ELSE NULL END) STORED,
  active_permission_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN permission_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_role_permissions_active (active_role_id, active_permission_id),
  KEY idx_role_permissions_role_id (role_id),
  KEY idx_role_permissions_permission_id (permission_id),
  CONSTRAINT fk_role_permissions_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_role_permissions_permission FOREIGN KEY (permission_id) REFERENCES permissions(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS org_user_roles (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  org_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  archived_at_UTC DATETIME(3) NULL,
  created_at_UTC DATETIME(3) NOT NULL DEFAULT UTC_TIMESTAMP(3),
  created_by BIGINT UNSIGNED NULL,
  active_org_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN org_id ELSE NULL END) STORED,
  active_user_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN user_id ELSE NULL END) STORED,
  active_role_id BIGINT UNSIGNED AS (CASE WHEN archived_at_UTC IS NULL THEN role_id ELSE NULL END) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uq_org_user_roles_active (active_org_id, active_user_id, active_role_id),
  KEY idx_org_user_roles_org_id (org_id),
  KEY idx_org_user_roles_user_id (user_id),
  KEY idx_org_user_roles_role_id (role_id),
  CONSTRAINT fk_org_user_roles_org FOREIGN KEY (org_id) REFERENCES organizations(id),
  CONSTRAINT fk_org_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_org_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(id),
  CONSTRAINT fk_org_user_roles_created_by FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO roles (code, description)
VALUES
  ('system_admin', 'Global platform administrator'),
  ('org_admin', 'Organization administrator'),
  ('lead_auditor', 'Lead auditor with sign-off rights'),
  ('auditor', 'Auditor with assessment write access'),
  ('viewer', 'Read-only access')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO permissions (code, description)
VALUES
  ('audit.read', 'Read audits and results'),
  ('audit.write', 'Create and update audits'),
  ('assessment.write', 'Create and update assessments'),
  ('assessment.note.write', 'Create assessment notes/evidence'),
  ('rbac.write', 'Assign org roles'),
  ('report.read', 'Read trends and results'),
  ('system.admin', 'Manage global platform settings')
ON DUPLICATE KEY UPDATE description = VALUES(description);

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p
WHERE
  (r.code = 'system_admin') OR
  (r.code = 'org_admin' AND p.code IN ('audit.read','audit.write','assessment.write','assessment.note.write','rbac.write','report.read')) OR
  (r.code = 'lead_auditor' AND p.code IN ('audit.read','audit.write','assessment.write','assessment.note.write','report.read')) OR
  (r.code = 'auditor' AND p.code IN ('audit.read','assessment.write','assessment.note.write','report.read')) OR
  (r.code = 'viewer' AND p.code IN ('audit.read','report.read'))
ON DUPLICATE KEY UPDATE created_at_UTC = role_permissions.created_at_UTC;
