// @ts-nocheck

const apiBase = process.env.API_BASE_URL ?? "http://localhost:1261";
const adminEmail = process.env.TEST_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.TEST_ADMIN_PASSWORD ?? "ChangeMe123!";

const jsonHeaders = (token?: string) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

const authHeaders = (token: string) => ({ Authorization: `Bearer ${token}` });

const fail = (message: string): never => {
  throw new Error(message);
};

const expectOk = async (res: Response, label: string) => {
  if (!res.ok) {
    const body = await res.text();
    fail(`${label} failed: ${res.status} ${body}`);
  }
};

const main = async () => {
  const stamp = Date.now();
  const clientName = `IT Client ${stamp}`;
  const auditName = `IT Audit ${stamp}`;
  const auditorEmail = `it.auditor.${stamp}@example.com`;

  // admin login
  const loginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: adminEmail, password: adminPassword })
  });
  await expectOk(loginRes, "admin login");
  const loginBody = await loginRes.json();
  const adminToken = String(loginBody.accessToken ?? "");
  if (!adminToken) fail("admin login returned no token");

  // create client
  const createClientRes = await fetch(`${apiBase}/clients`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ name: clientName })
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
    body: JSON.stringify({ name: auditName, auditDate })
  });
  await expectOk(createAuditRes, "create audit");
  const createdAudit = await createAuditRes.json();
  const auditId = Number(createdAudit.id);

  // workspace
  const workspaceRes = await fetch(`${apiBase}/audits/${auditId}/workspace`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(workspaceRes, "workspace");
  const workspace = await workspaceRes.json();
  const firstGroup = workspace.groupedProcesses?.[0];
  const firstReq = firstGroup?.requirements?.[0];
  if (!firstGroup || !firstReq) fail("workspace has no assessment rows");

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
          scopeCode: "IN_SCOPE"
        }
      ]
    })
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
          evidenceText: "@integration-proof"
        }
      ]
    })
  });
  await expectOk(assessRes, "assessment update");

  // note + history
  const noteRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/notes`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ noteText: "integration-test note" })
  });
  await expectOk(noteRes, "add note");

  const historyRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/history`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(historyRes, "history read");

  // details + conclusion
  const detailsRes = await fetch(`${apiBase}/audits/${auditId}/details`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ items: [{ fieldKey: "auditee_name", responseText: "IT Auditee", noteText: "note" }] })
  });
  await expectOk(detailsRes, "details update");

  const conclusionRes = await fetch(`${apiBase}/audits/${auditId}/conclusion`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ conclusionText: "integration-test conclusion" })
  });
  await expectOk(conclusionRes, "conclusion update");

  const historyAfterAuditMetaRes = await fetch(`${apiBase}/assessments/${firstReq.assessmentId}/history`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(historyAfterAuditMetaRes, "history read after audit-meta changes");
  const historyAfterAuditMeta = await historyAfterAuditMetaRes.json();
  const misleadingEventTypes = new Set(
    (historyAfterAuditMeta.events ?? []).map((event: any) => String(event.event_type))
  );
  if (misleadingEventTypes.has("detail_response_changed") || misleadingEventTypes.has("conclusion_changed")) {
    fail("assessment history should not contain audit-level detail/conclusion events");
  }

  // status transitions
  for (const status of ["in_progress", "completed", "in_progress"]) {
    const stRes = await fetch(`${apiBase}/audits/${auditId}/status`, {
      method: "PUT",
      headers: jsonHeaders(adminToken),
      body: JSON.stringify({ status })
    });
    await expectOk(stRes, `status transition -> ${status}`);
  }

  const workspaceAfterChangesRes = await fetch(`${apiBase}/audits/${auditId}/workspace`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(workspaceAfterChangesRes, "workspace after audit changes");
  const workspaceAfterChanges = await workspaceAfterChangesRes.json();
  const auditEventTypes = new Set(
    (workspaceAfterChanges.auditEvents ?? []).map((event: any) => String(event.event_type))
  );
  for (const expectedType of ["detail_response_changed", "conclusion_changed", "status_changed"]) {
    if (!auditEventTypes.has(expectedType)) {
      fail(`workspace audit history missing event type: ${expectedType}`);
    }
  }

  // csv exports
  for (const report of ["all", "certification", "gaps"]) {
    const csvRes = await fetch(`${apiBase}/audits/${auditId}/exports/csv?report=${report}`, {
      headers: authHeaders(adminToken)
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
    headers: authHeaders(adminToken)
  });
  await expectOk(trendsCsvRes, "trends csv");

  // pdf export + list + download
  const pdfRes = await fetch(`${apiBase}/audits/${auditId}/exports/pdf`, {
    method: "POST",
    headers: jsonHeaders(adminToken)
  });
  await expectOk(pdfRes, "pdf generate");
  const pdfMeta = await pdfRes.json();

  const exportsRes = await fetch(`${apiBase}/audits/${auditId}/exports`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(exportsRes, "exports list");

  const downloadRes = await fetch(`${apiBase}/audits/${auditId}/exports/${pdfMeta.id}/download`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(downloadRes, "pdf download");

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
      roles: ["auditor"]
    })
  });
  await expectOk(createOrgUserRes, "create org user");
  const createdUser = await createOrgUserRes.json();

  const secondClientRes = await fetch(`${apiBase}/clients`, {
    method: "POST",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ name: `${clientName} Secondary` })
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
      roles: ["viewer"]
    })
  });
  if (crossClientUserRes.status !== 409) {
    fail(`expected 409 for non-system-admin cross-client user, got ${crossClientUserRes.status}`);
  }

  const updateRolesRes = await fetch(`${apiBase}/orgs/${orgId}/users/${createdUser.id}/roles`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ roles: ["auditor", "viewer"] })
  });
  await expectOk(updateRolesRes, "update org user roles");

  const orgUsersRes = await fetch(`${apiBase}/orgs/${orgId}/users`, {
    headers: authHeaders(adminToken)
  });
  await expectOk(orgUsersRes, "org users list");

  // set audit to completed and verify auditor cannot write
  const completeRes = await fetch(`${apiBase}/audits/${auditId}/status`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ status: "completed" })
  });
  await expectOk(completeRes, "complete audit for lock test");

  const auditorLoginRes = await fetch(`${apiBase}/auth/login`, {
    method: "POST",
    headers: jsonHeaders(),
    body: JSON.stringify({ email: auditorEmail, password: "ChangeMe123!" })
  });
  await expectOk(auditorLoginRes, "auditor login");
  const auditorToken = String((await auditorLoginRes.json()).accessToken ?? "");

  const auditorWriteRes = await fetch(`${apiBase}/audits/${auditId}/assessments`, {
    method: "PUT",
    headers: jsonHeaders(auditorToken),
    body: JSON.stringify({
      items: [
        {
          requirementCode: firstReq.requirementCode,
          scoreLabel: "3",
          commentText: "should fail due to lock",
          evidenceText: "should fail"
        }
      ]
    })
  });
  if (auditorWriteRes.status !== 403) {
    const body = await auditorWriteRes.text();
    fail(`expected 403 for locked audit write, got ${auditorWriteRes.status} ${body}`);
  }

  const revokeAuditorRolesRes = await fetch(`${apiBase}/orgs/${orgId}/users/${createdUser.id}/roles`, {
    method: "PUT",
    headers: jsonHeaders(adminToken),
    body: JSON.stringify({ roles: [] })
  });
  await expectOk(revokeAuditorRolesRes, "revoke org user roles");

  const revokedTokenClientsRes = await fetch(`${apiBase}/clients`, {
    headers: authHeaders(auditorToken)
  });
  if (revokedTokenClientsRes.status !== 401) {
    const body = await revokedTokenClientsRes.text();
    fail(`expected 401 for revoked token, got ${revokedTokenClientsRes.status} ${body}`);
  }

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
          "rbac admin",
          "client-scoped users",
          "completed audit lock",
          "jwt revocation",
          "audit-level history integrity"
        ]
      },
      null,
      2
    )
  );
};

await main();
