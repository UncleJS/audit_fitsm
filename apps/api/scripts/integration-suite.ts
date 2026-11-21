// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS
const apiBase = process.env.API_BASE_URL ?? "http://localhost:1261";
const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? "ChangeMe123!";

const SESSION_COOKIE = "audit_fitsm_session";

// Every mutating request needs the CSRF header; the session travels only as the HttpOnly cookie, which this
// script forwards by hand (a minimal cookie jar holding one session per actor).
const jsonHeaders = (session?: string) => ({
  "Content-Type": "application/json",
  "x-audit-fitsm": "1",
  ...(session ? { cookie: session } : {}),
});

const authHeaders = (session: string) => ({ cookie: session });

const fail = (message: string): never => {
  throw new Error(message);
};

/** Returns the `name=value` pair of the session cookie from a response, or "" when none (or a cleared one) was set. */
const sessionFrom = (res: Response): string => {
  const pair = (res.headers.get("set-cookie") ?? "").split(";")[0]?.trim() ?? "";
  return pair.startsWith(`${SESSION_COOKIE}=`) && pair.length > SESSION_COOKIE.length + 1 ? pair : "";
};

const login = async (email: string, password: string, label: string): Promise<string> => {
  const res = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) fail(`${label} failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as Record<string, unknown>;
  if ("accessToken" in body || "token" in body) fail(`${label} leaked a token in the response body`);
  const session = sessionFrom(res);
  if (!session) fail(`${label} did not set a session cookie`);
  return session;
};

const expectStatus = async (res: Response, expected: number, label: string) => {
  if (res.status !== expected) {
    fail(`${label}: expected ${expected}, got ${res.status} ${await res.text()}`);
  }
};

const expectOk = async (res: Response, label: string) => {
  if (!res.ok) {
    const body = await res.text();
    fail(`${label} failed: ${res.status} ${body}`);
  }
};

type AuditEvent = { event_type?: string };

const main = async () => {
  const stamp = Date.now();
  const clientName = `IT Client ${stamp}`;
  const auditName = `IT Audit ${stamp}`;
  const auditorEmail = `it.auditor.${stamp}@example.com`;

  const badPasswordRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: adminEmail, password: "not-the-password" }),
  });
  if (badPasswordRes.status !== 401) {
    fail(`expected 401 for bad password, got ${badPasswordRes.status}`);
  }

  const missingAuthRes = await fetch(`${apiBase}/clients`);
  if (missingAuthRes.status !== 401) {
    fail(`expected 401 for missing session, got ${missingAuthRes.status}`);
  }

  // admin login
  const csrfRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  await expectStatus(csrfRes, 403, "login without CSRF header");

  const malformedLoginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: "{not json",
  });
  await expectStatus(malformedLoginRes, 400, "login with malformed JSON");

  let adminToken = await login(adminEmail, adminPassword, "admin login");

  const meRes = await fetch(`${apiBase}/me`, { headers: authHeaders(adminToken) });
  await expectOk(meRes, "me");
  const me = (await meRes.json()) as { sub?: number; sessionExpiresAt?: string | null };
  const adminUserId = Number(me.sub);
  if (!adminUserId) fail("/me returned no sub");
  if (!me.sessionExpiresAt || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(me.sessionExpiresAt)) {
    fail(`/me sessionExpiresAt is not ISO UTC: ${me.sessionExpiresAt}`);
  }

  const refreshRes = await fetch(`${apiBase}/auth/refresh`, { method: "POST", headers: jsonHeaders(adminToken) });
  await expectOk(refreshRes, "session refresh");
  const refreshBody = (await refreshRes.json()) as { ok?: boolean; expiresInSec?: number };
  if (!refreshBody.ok || !(Number(refreshBody.expiresInSec) > 0)) fail("refresh returned no expiresInSec");
  adminToken = sessionFrom(refreshRes) || fail("refresh did not set a new session cookie");

  const anonRefreshRes = await fetch(`${apiBase}/auth/refresh`, { method: "POST", headers: jsonHeaders() });
  await expectStatus(anonRefreshRes, 401, "refresh without session");

  // create client
  const createClientRes = await fetch(`${apiBase}/clients`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ name: clientName }),
  });
  await expectOk(createClientRes, "create client");
  const client = await createClientRes.json();
  const orgId = Number(client.id);

  // list clients
  const clientsRes = await fetch(`${apiBase}/clients`, { headers: authHeaders(adminToken) });
  await expectOk(clientsRes, "list clients");

  const docsRes = await fetch(`${apiBase}/docs`, { headers: authHeaders(adminToken) });
  await expectOk(docsRes, "swagger docs");
  const docsCsp = String(docsRes.headers.get("content-security-policy") ?? "");
  if (!docsCsp.includes("https://unpkg.com")) {
    fail(`swagger docs CSP missing unpkg allowance: ${docsCsp}`);
  }

  // create audit
  const auditDate = new Date().toISOString().slice(0, 10);
  const createAuditRes = await fetch(`${apiBase}/orgs/${orgId}/audits`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ name: auditName, auditDate }),
  });
  await expectOk(createAuditRes, "create audit");
  const createdAudit = await createAuditRes.json();
  const auditId = Number(createdAudit.id);

  // workspace
  const workspaceRes = await fetch(`${apiBase}/audits/${auditId}/workspace`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(workspaceRes, "workspace");
  const workspace = await workspaceRes.json();
  const firstGroup = workspace.groupedProcesses?.[0];
  const firstReq = firstGroup?.requirements?.[0];
  if (!firstGroup || !firstReq) fail("workspace has no assessment rows");
  if (!String(firstReq.scoreGuidance?.["3"] ?? "").trim()) {
    fail(`workspace requirement ${firstReq.requirementCode} has no score guidance for level 3`);
  }

  // scope target update
  const scopeRes = await fetch(`${apiBase}/audits/${auditId}/scope-targets`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      items: [
        {
          processCode: firstGroup.processCode,
          certGoalLevel: 2,
          customGoalLevel: 3,
          scopeCode: "IN_SCOPE",
        },
      ],
    }),
  });
  await expectOk(scopeRes, "scope-target update");

  // assessment update
  const assessRes = await fetch(`${apiBase}/audits/${auditId}/assessments`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      items: [
        {
          requirementCode: firstReq.requirementCode,
          scoreLabel: "2",
          commentText: "=SUM(1,1)",
          evidenceText: "@integration-proof",
        },
      ],
    }),
  });
  await expectOk(assessRes, "assessment update");

  const malformedAssessRes = await fetch(`${apiBase}/audits/${auditId}/assessments`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ items: "not-a-list" }),
  });
  await expectStatus(malformedAssessRes, 400, "malformed assessments payload");

  const oversizedNoteRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/notes`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ noteText: "x".repeat(20_001) }),
  });
  await expectStatus(oversizedNoteRes, 400, "oversized note");

  const concurrentBody = JSON.stringify({
    items: [
      {
        requirementCode: firstReq.requirementCode,
        scoreLabel: "2",
        commentText: "=SUM(1,1)",
        evidenceText: "@integration-proof",
      },
    ],
  });
  const concurrent = await Promise.all(
    [0, 1].map(() =>
      fetch(`${apiBase}/audits/${auditId}/assessments`, {
        method: "PUT",
        headers: jsonHeaders(adminToken),
        body: concurrentBody,
      }),
    ),
  );
  for (const [index, res] of concurrent.entries()) {
    await expectOk(res, `concurrent assessment upsert #${index + 1}`);
  }

  // note + history
  const noteRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/notes`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ noteText: "integration-test note" }),
  });
  await expectOk(noteRes, "add note");

  const historyRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/history`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(historyRes, "history read");

  // details + conclusion
  const detailsRes = await fetch(`${apiBase}/audits/${auditId}/details`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ items: [{ fieldKey: "auditee_name", responseText: "IT Auditee", noteText: "note" }] }),
  });
  await expectOk(detailsRes, "details update");

  const conclusionRes = await fetch(`${apiBase}/audits/${auditId}/conclusion`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    // Non-Latin-1 text, emoji and an unbreakable long word exercise the PDF sanitizer and line wrapping.
    body: JSON.stringify({
      conclusionText: `integration-test conclusion — naïve café, 日本語, emoji ✅ ${"x".repeat(400)}\n${"line ".repeat(2000)}`,
    }),
  });
  await expectOk(conclusionRes, "conclusion update");

  const historyAfterAuditMetaRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/history`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(historyAfterAuditMetaRes, "history read after audit-meta changes");
  const historyAfterAuditMeta = await historyAfterAuditMetaRes.json();
  const misleadingEventTypes = new Set(
    (historyAfterAuditMeta.events ?? []).map((event: AuditEvent) => String(event.event_type)),
  );
  if (misleadingEventTypes.has("detail_response_changed") || misleadingEventTypes.has("conclusion_changed")) {
    fail("assessment history should not contain audit-level detail/conclusion events");
  }

  // status transitions
  for (const status of ["in_progress", "completed", "in_progress"]) {
    const stRes = await fetch(`${apiBase}/audits/${auditId}/status`, {
      method: "PUT",
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status }),
    });
    await expectOk(stRes, `status transition -> ${status}`);
  }

  const workspaceAfterChangesRes = await fetch(`${apiBase}/audits/${auditId}/workspace`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(workspaceAfterChangesRes, "workspace after audit changes");
  const workspaceAfterChanges = await workspaceAfterChangesRes.json();
  const auditEventTypes = new Set(
    (workspaceAfterChanges.auditEvents ?? []).map((event: AuditEvent) => String(event.event_type)),
  );
  for (const expectedType of ["detail_response_changed", "conclusion_changed", "status_changed"]) {
    if (!auditEventTypes.has(expectedType)) {
      fail(`workspace audit history missing event type: ${expectedType}`);
    }
  }

  // csv exports
  for (const report of ["all", "certification", "gaps"]) {
    const csvRes = await fetch(`${apiBase}/audits/${auditId}/exports/csv?report=${report}`, {
      headers: authHeaders(adminToken),
    });
    await expectOk(csvRes, `audit csv ${report}`);

    if (report === "all") {
      const csvText = await csvRes.text();
      if (!csvText.includes("'=SUM(1,1)") || !csvText.includes("'@integration-proof")) {
        fail("audit csv did not neutralize spreadsheet formula cells");
      }
    }
  }

  const trendsCsvRes = await fetch(`${apiBase}/orgs/${orgId}/exports/csv?report=trends`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(trendsCsvRes, "trends csv");

  // pdf export + list + download
  const pdfRes = await fetch(`${apiBase}/audits/${auditId}/exports/pdf`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
  });
  await expectOk(pdfRes, "pdf generate");
  const pdfMeta = await pdfRes.json();

  const exportsRes = await fetch(`${apiBase}/audits/${auditId}/exports`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(exportsRes, "exports list");

  const downloadRes = await fetch(`${apiBase}/audits/${auditId}/exports/${pdfMeta.id}/download`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(downloadRes, "pdf download");
  const pdfBytes = new Uint8Array(await downloadRes.arrayBuffer());
  if (new TextDecoder().decode(pdfBytes.slice(0, 5)) !== "%PDF-") {
    fail("pdf download is not a PDF document");
  }

  // RBAC org admin APIs + lock behavior for auditor
  const rolesRes = await fetch(`${apiBase}/roles`, { headers: authHeaders(adminToken) });
  await expectOk(rolesRes, "roles list");

  const createOrgUserRes = await fetch(`${apiBase}/orgs/${orgId}/users`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      email: auditorEmail,
      password: "ChangeMe123!",
      displayName: "Integration Auditor",
      roles: ["auditor"],
    }),
  });
  await expectOk(createOrgUserRes, "create org user");
  const createdUser = await createOrgUserRes.json();

  const secondClientRes = await fetch(`${apiBase}/clients`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ name: `${clientName} Secondary` }),
  });
  await expectOk(secondClientRes, "create second client for user-scope test");
  const secondClient = await secondClientRes.json();
  const secondOrgId = Number(secondClient.id);

  const crossClientUserRes = await fetch(`${apiBase}/orgs/${secondOrgId}/users`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      email: auditorEmail,
      password: "ChangeMe123!",
      displayName: "Integration Auditor",
      roles: ["viewer"],
    }),
  });
  if (crossClientUserRes.status !== 409) {
    fail(`expected 409 for non-system-admin cross-client user, got ${crossClientUserRes.status}`);
  }

  const updateRolesRes = await fetch(`${apiBase}/orgs/${orgId}/users/${createdUser.id}/roles`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ roles: ["auditor", "viewer"] }),
  });
  await expectOk(updateRolesRes, "update org user roles");

  const orgUsersRes = await fetch(`${apiBase}/orgs/${orgId}/users`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(orgUsersRes, "org users list");

  // set audit to completed and verify auditor cannot write
  // Two racing transitions from the same status: exactly one may win, the other gets 409.
  const completeRace = await Promise.all(
    [0, 1].map(() =>
      fetch(`${apiBase}/audits/${auditId}/status`, {
        method: "PUT",
        headers: jsonHeaders(adminToken),
        body: JSON.stringify({ status: "completed" }),
      }),
    ),
  );
  const raceStatuses = completeRace.map((res) => res.status).sort();
  if (raceStatuses[0] !== 200 || raceStatuses[1] !== 409) {
    fail(`expected one 200 and one 409 for racing status updates, got ${raceStatuses.join(",")}`);
  }

  const auditorToken = await login(auditorEmail, "ChangeMe123!", "auditor login");

  const auditorWriteRes = await fetch(`${apiBase}/audits/${auditId}/assessments`, {
    method: "PUT",
    headers: jsonHeaders(auditorToken),
    body: JSON.stringify({
      items: [
        {
          requirementCode: firstReq.requirementCode,
          scoreLabel: "3",
          commentText: "should fail due to lock",
          evidenceText: "should fail",
        },
      ],
    }),
  });
  if (auditorWriteRes.status !== 403) {
    const body = await auditorWriteRes.text();
    fail(`expected 403 for locked audit write, got ${auditorWriteRes.status} ${body}`);
  }

  const revokeAuditorRolesRes = await fetch(`${apiBase}/orgs/${orgId}/users/${createdUser.id}/roles`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ roles: [] }),
  });
  await expectOk(revokeAuditorRolesRes, "revoke org user roles");

  const revokedTokenClientsRes = await fetch(`${apiBase}/clients`, {
    headers: authHeaders(auditorToken),
  });
  if (revokedTokenClientsRes.status !== 401) {
    const body = await revokedTokenClientsRes.text();
    fail(`expected 401 for revoked token, got ${revokedTokenClientsRes.status} ${body}`);
  }

  for (const report of ["all", "certification", "gaps"]) {
    const resultsRes = await fetch(`${apiBase}/audits/${auditId}/results/${report}`, {
      headers: authHeaders(adminToken),
    });
    await expectOk(resultsRes, `results ${report}`);
  }

  const trendsRes = await fetch(`${apiBase}/orgs/${orgId}/trends`, {
    headers: authHeaders(adminToken),
  });
  await expectOk(trendsRes, "org trends");

  const archiveRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/archive`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
  });
  await expectOk(archiveRes, "archive assessment");

  const restoreRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/restore`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
  });
  await expectOk(restoreRes, "restore assessment");

  const auditorAfterRevoke = await login(auditorEmail, "ChangeMe123!", "auditor login after revocation");

  const crossOrgRes = await fetch(`${apiBase}/orgs/${secondOrgId}/audits`, {
    headers: authHeaders(auditorAfterRevoke),
  });
  if (crossOrgRes.status !== 403) {
    fail(`expected 403 for cross-org audit list, got ${crossOrgRes.status}`);
  }

  // An org_admin must not be able to take over or strip a system_admin account.
  const orgAdminEmail = `it.orgadmin.${stamp}@example.com`;
  const createOrgAdminRes = await fetch(`${apiBase}/orgs/${orgId}/users`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({
      email: orgAdminEmail,
      password: "ChangeMe123!",
      displayName: "Integration Org Admin",
      roles: ["org_admin"],
    }),
  });
  await expectOk(createOrgAdminRes, "create org admin");
  const orgAdminToken = await login(orgAdminEmail, "ChangeMe123!", "org admin login");

  const hijackRes = await fetch(`${apiBase}/orgs/${orgId}/users`, {
    method: "POST",
    headers: jsonHeaders(orgAdminToken),
    body: JSON.stringify({
      email: adminEmail,
      password: "Hijacked-Password-1",
      displayName: "Hijacked",
      roles: ["viewer"],
    }),
  });
  await expectStatus(hijackRes, 409, "org admin re-creating the system admin");
  adminToken = await login(adminEmail, adminPassword, "admin login after hijack attempt");

  const stripAdminRes = await fetch(`${apiBase}/orgs/${orgId}/users/${adminUserId}/roles`, {
    method: "PUT",
    headers: jsonHeaders(orgAdminToken),
    body: JSON.stringify({ roles: [] }),
  });
  await expectStatus(stripAdminRes, 403, "org admin stripping system admin roles");

  // Logout revokes the session server-side: the old cookie must stop working even if a copy was kept.
  const logoutRes = await fetch(`${apiBase}/auth/logout`, { method: "POST", headers: jsonHeaders(orgAdminToken) });
  await expectOk(logoutRes, "org admin logout");
  const afterLogoutRes = await fetch(`${apiBase}/me`, { headers: authHeaders(orgAdminToken) });
  await expectStatus(afterLogoutRes, 401, "reusing a logged-out session");

  console.log(
    JSON.stringify(
      {
        ok: true,
        orgId,
        auditId,
        createdAuditorUserId: createdUser.id,
        checks: [
          "auth",
          "client",
          "audit lifecycle",
          "workspace",
          "scope",
          "assessments",
          "notes/history",
          "details/conclusion",
          "status transitions",
          "swagger docs csp",
          "csv neutralization",
          "csv exports",
          "pdf exports",
          "pdf unicode text",
          "rbac admin",
          "client-scoped users",
          "completed audit lock",
          "jwt revocation",
          "audit-level history integrity",
          "bad password",
          "missing session",
          "results",
          "trends",
          "archive/restore",
          "cross-org denial",
          "csrf header",
          "malformed payloads",
          "session refresh",
          "concurrent upserts",
          "status race",
          "system admin protection",
          "logout revocation",
        ],
      },
      null,
      2,
    ),
  );
};

await main();

export {};
