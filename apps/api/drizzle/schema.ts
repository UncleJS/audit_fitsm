// @ts-nocheck
//
// NOTE: db/migrations/*.sql is the single source of truth for the database
// schema. This file is a partial Drizzle reference (a subset of tables) used for
// typed query building only — it is NOT used to generate or apply migrations and
// intentionally does not mirror every table. Keep timestamp columns suffixed with
// _UTC to match the SQL schema.
import {
  bigint,
  date,
  datetime,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  uniqueIndex,
  varchar
} from "drizzle-orm/mysql-core";

export const organizations = mysqlTable(
  "organizations",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    name: varchar("name", { length: 191 }).notNull(),
    archivedAt: datetime("archived_at_UTC", { mode: "string", fsp: 3 }),
    createdAt: datetime("created_at_UTC", { mode: "string", fsp: 3 }).notNull(),
    updatedAt: datetime("updated_at_UTC", { mode: "string", fsp: 3 }).notNull()
  },
  (table) => ({
    orgNameIdx: uniqueIndex("uq_organizations_name").on(table.name)
  })
);

export const users = mysqlTable(
  "users",
  {
    id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
    email: varchar("email", { length: 191 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }),
    displayName: varchar("display_name", { length: 191 }).notNull(),
    authProvider: mysqlEnum("auth_provider", ["local", "oidc"]).notNull(),
    externalSubject: varchar("external_subject", { length: 191 }),
    archivedAt: datetime("archived_at_UTC", { mode: "string", fsp: 3 })
  },
  (table) => ({
    userEmailIdx: uniqueIndex("uq_users_email").on(table.email)
  })
);

export const processes = mysqlTable("processes", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  code: varchar("code", { length: 16 }).notNull(),
  abbreviation: varchar("abbreviation", { length: 16 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["GR", "PR"]).notNull(),
  defaultCertGoalLevel: tinyint("default_cert_goal_level", { unsigned: true }).notNull(),
  archivedAt: datetime("archived_at_UTC", { mode: "string", fsp: 3 })
});

export const requirements = mysqlTable("requirements", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  processId: bigint("process_id", { mode: "number", unsigned: true }).notNull(),
  code: varchar("code", { length: 32 }).notNull(),
  requirementText: text("requirement_text").notNull(),
  archivedAt: datetime("archived_at_UTC", { mode: "string", fsp: 3 })
});

export const audits = mysqlTable("audits", {
  id: bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey(),
  orgId: bigint("org_id", { mode: "number", unsigned: true }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["draft", "in_progress", "completed", "archived"]).notNull(),
  auditDate: date("audit_date", { mode: "string" }).notNull(),
  archivedAt: datetime("archived_at_UTC", { mode: "string", fsp: 3 })
});
