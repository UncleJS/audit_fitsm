// @ts-nocheck
"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { formatDateOnly, formatLocalTimestamp } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:1261";
const demoToken = process.env.NEXT_PUBLIC_DEMO_TOKEN ?? "";

const authHeaders = (token: string, json = false) => ({
  ...(json ? { "Content-Type": "application/json" } : {}),
  ...(token ? { Authorization: `Bearer ${token}` } : {})
});

export default function AuditWorkspacePage() {
  const params = useParams();
  const auditId = Number(params.auditId);
  const [mounted, setMounted] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [workspace, setWorkspace] = useState<any>(null);
  const [scopeEdits, setScopeEdits] = useState<Record<string, any>>({});
  const [statusEdit, setStatusEdit] = useState("draft");
  const [edits, setEdits] = useState<Record<string, any>>({});
  const [detailEdits, setDetailEdits] = useState<Record<string, any>>({});
  const [conclusionEdit, setConclusionEdit] = useState("");
  const [historyByAssessment, setHistoryByAssessment] = useState<Record<string, any>>({});
  const [noteDraftByAssessment, setNoteDraftByAssessment] = useState<Record<string, string>>({});
  const [openHistoryByAssessment, setOpenHistoryByAssessment] = useState<Record<string, boolean>>({});
  const [loadingHistoryByAssessment, setLoadingHistoryByAssessment] = useState<Record<string, boolean>>({});
  const [pdfExports, setPdfExports] = useState<any[]>([]);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [downloadingExportId, setDownloadingExportId] = useState<number | null>(null);
  const [downloadingCsvKind, setDownloadingCsvKind] = useState<string | null>(null);
  const [workspaceDensity, setWorkspaceDensity] = useState<"comfortable" | "compact">("comfortable");
  const [message, setMessage] = useState("");

  const tokenMissing = useMemo(() => !authToken, [authToken]);
  const canEdit = workspace?.permissions?.canEdit ?? false;
  const canLeadEdit = workspace?.permissions?.canLeadEdit ?? false;
  const canExport = workspace?.permissions?.canExport ?? false;
  const canManageStatus = workspace?.permissions?.canManageStatus ?? false;
  const canManageScopeTargets = workspace?.permissions?.canManageScopeTargets ?? false;
  const isLockedForNonLead = workspace?.permissions?.isLockedForNonLead ?? false;
  const allowedStatusTransitions = workspace?.permissions?.allowedStatusTransitions ?? [];
  const auditStatus = String(workspace?.audit?.status ?? "");

  const loadWorkspace = async () => {
    const res = await fetch(`${apiUrl}/audits/${auditId}/workspace`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });

    if (!res.ok) {
      if (res.status === 401 && typeof window !== "undefined") {
        window.sessionStorage.removeItem("audit_fitsm_token");
        setAuthToken("");
        window.location.href = "/login";
        return;
      }
      setWorkspace(null);
      setMessage("Unable to load audit workspace.");
      return;
    }

    const data = await res.json();
    setWorkspace(data);
    setStatusEdit(data.audit?.status ?? "draft");

    const nextScopeEdits: Record<string, any> = {};
    for (const group of data.groupedProcesses ?? []) {
      nextScopeEdits[String(group.processCode)] = {
        processCode: group.processCode,
        certGoalLevel: group.certGoalLevel != null ? String(group.certGoalLevel) : "2",
        customGoalLevel: group.customGoalLevel != null ? String(group.customGoalLevel) : "",
        scopeCode: group.scopeCode ?? "IN_SCOPE"
      };
    }
    setScopeEdits(nextScopeEdits);

    const nextEdits: Record<string, any> = {};
    for (const group of data.groupedProcesses ?? []) {
      for (const req of group.requirements ?? []) {
        nextEdits[String(req.assessmentId)] = {
          requirementCode: req.requirementCode,
          scoreLabel: req.scoreLabel ?? "Select …",
          commentText: req.commentText ?? "",
          evidenceText: req.evidenceText ?? ""
        };
      }
    }
    setEdits(nextEdits);

    const nextDetails: Record<string, any> = {};
    for (const detail of data.details ?? []) {
      nextDetails[String(detail.field_key)] = {
        fieldKey: detail.field_key,
        responseText: detail.response_text ?? "",
        noteText: detail.note_text ?? ""
      };
    }
    setDetailEdits(nextDetails);
    setConclusionEdit(data.conclusion?.conclusion_text ?? "");

    const exportsRes = await fetch(`${apiUrl}/audits/${auditId}/exports`, {
      headers: authHeaders(authToken),
      cache: "no-store"
    });
    if (exportsRes.ok) {
      setPdfExports(await exportsRes.json());
    } else {
      setPdfExports([]);
    }
  };

  useEffect(() => {
    if (typeof window === "undefined") return;
    const storedToken = window.sessionStorage.getItem("audit_fitsm_token") || "";
    const storedDensity = window.sessionStorage.getItem("audit_fitsm_workspace_density");
    setAuthToken(storedToken || demoToken);
    if (storedDensity === "compact" || storedDensity === "comfortable") {
      setWorkspaceDensity(storedDensity);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    if (!authToken && typeof window !== "undefined") {
      window.location.href = "/login";
    }
  }, [mounted, authToken]);

  useEffect(() => {
    if (auditId && authToken) {
      loadWorkspace();
    }
  }, [auditId, authToken]);

  const updateWorkspaceDensity = (density: "comfortable" | "compact") => {
    setWorkspaceDensity(density);
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("audit_fitsm_workspace_density", density);
    }
  };

  const isWorkspaceCompact = workspaceDensity === "compact";
  const reqTableSpacing = isWorkspaceCompact ? "0 4px" : "0 8px";
  const reqCellPadding = isWorkspaceCompact ? 6 : 10;
  const reqTextareaRows = isWorkspaceCompact ? 3 : 4;
  const reqHeaderPadding = isWorkspaceCompact ? "0 8px 4px" : "0 10px 6px";

  if (!mounted) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Audit Workspace</h1>
          <p>Loading audit…</p>
        </section>
      </main>
    );
  }

  if (tokenMissing) {
    return (
      <main className="container grid" suppressHydrationWarning>
        <section className="card">
          <h1>Audit Workspace</h1>
          <p>Redirecting to login…</p>
        </section>
      </main>
    );
  }

  const formatBytes = (value?: number) => {
    const bytes = Number(value ?? 0);
    if (!bytes) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const generatePdfExport = async () => {
    setMessage("");

    if (!canExport) {
      setMessage("You do not have permission to export this audit.");
      return;
    }

    setIsGeneratingPdf(true);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/pdf`, {
        method: "POST",
        headers: authHeaders(authToken, true)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "PDF export generation failed.");
        return;
      }

      setMessage("PDF export generated and stored.");
      await loadWorkspace();
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const downloadPdfExport = async (exportId: number, fileName: string) => {
    setMessage("");

    if (!canExport) {
      setMessage("You do not have permission to download exports.");
      return;
    }

    setDownloadingExportId(exportId);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/${exportId}/download`, {
        headers: authHeaders(authToken)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "PDF download failed.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName || `audit-${auditId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingExportId(null);
    }
  };

  const downloadAuditCsv = async (report: "all" | "certification" | "gaps") => {
    setMessage("");

    if (!authToken) {
      setMessage("Please login first.");
      return;
    }

    setDownloadingCsvKind(report);
    try {
      const res = await fetch(`${apiUrl}/audits/${auditId}/exports/csv?report=${report}`, {
        headers: authHeaders(authToken)
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setMessage(body.error ?? "CSV download failed.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-${auditId}-${report}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloadingCsvKind(null);
    }
  };

  const saveStatus = async () => {
    setMessage("");

    if (!canManageStatus) {
      setMessage("You do not have permission to change audit status.");
      return;
    }

    const res = await fetch(`${apiUrl}/audits/${auditId}/status`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ status: statusEdit })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.error ?? "Status update failed.");
      return;
    }

    setMessage("Audit status updated.");
    await loadWorkspace();
  };

  const saveScopeTargets = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canManageScopeTargets) {
      if (!silent) {
        setMessage("You do not have permission to change scope/targets.");
      }
      return false;
    }

    const items = Object.values(scopeEdits).map((item: any) => ({
      processCode: item.processCode,
      certGoalLevel: Number(item.certGoalLevel || 2),
      customGoalLevel: item.customGoalLevel ? Number(item.customGoalLevel) : null,
      scopeCode: item.scopeCode === "OUT_OF_SCOPE" ? "OUT_OF_SCOPE" : "IN_SCOPE"
    }));

    const res = await fetch(`${apiUrl}/audits/${auditId}/scope-targets`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (!silent) {
        setMessage(body.error ?? "Scope/targets save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Scope and targets saved.");
    }

    if (reloadAfter) {
      await loadWorkspace();
    }

    return true;
  };

  const saveAssessments = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canEdit) {
      if (!silent) {
        setMessage(
          isLockedForNonLead
            ? "Audit is completed and locked for non-lead roles."
            : "You do not have permission to update assessments."
        );
      }
      return false;
    }

    const items = Object.values(edits);

    const res = await fetch(`${apiUrl}/audits/${auditId}/assessments`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (!silent) {
        setMessage(body.error ?? "Assessment save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Assessment updates saved.");
    }
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const loadAssessmentHistory = async (assessmentId: number) => {
    const key = String(assessmentId);
    setLoadingHistoryByAssessment((prev) => ({ ...prev, [key]: true }));

    try {
      const res = await fetch(`${apiUrl}/assessments/${assessmentId}/history`, {
        headers: authHeaders(authToken),
        cache: "no-store"
      });

      if (!res.ok) {
        return;
      }

      const payload = await res.json();
      setHistoryByAssessment((prev) => ({ ...prev, [key]: payload }));
    } finally {
      setLoadingHistoryByAssessment((prev) => ({ ...prev, [key]: false }));
    }
  };

  const toggleAssessmentHistory = async (assessmentId: number) => {
    const key = String(assessmentId);
    const nextOpen = !openHistoryByAssessment[key];
    setOpenHistoryByAssessment((prev) => ({ ...prev, [key]: nextOpen }));

    if (nextOpen && !historyByAssessment[key]) {
      await loadAssessmentHistory(assessmentId);
    }
  };

  const addAssessmentNote = async (assessmentId: number) => {
    const key = String(assessmentId);
    const noteText = (noteDraftByAssessment[key] ?? "").trim();

    if (!noteText) {
      setMessage("Note text is required.");
      return;
    }

    if (!canEdit) {
      setMessage(
        isLockedForNonLead
          ? "Audit is completed and locked for non-lead roles."
          : "You do not have permission to add notes."
      );
      return;
    }

    const res = await fetch(`${apiUrl}/assessments/${assessmentId}/notes`, {
      method: "POST",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ noteText })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setMessage(body.error ?? "Unable to add note.");
      return;
    }

    setNoteDraftByAssessment((prev) => ({ ...prev, [key]: "" }));
    setMessage("Assessment note added.");
    await loadAssessmentHistory(assessmentId);
  };

  const saveAuditDetails = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canEdit) {
      if (!silent) {
        setMessage(
          isLockedForNonLead
            ? "Audit is completed and locked for non-lead roles."
            : "You do not have permission to update audit details."
        );
      }
      return false;
    }

    const items = Object.values(detailEdits);

    const res = await fetch(`${apiUrl}/audits/${auditId}/details`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ items })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (!silent) {
        setMessage(body.error ?? "Audit details save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Audit details saved.");
    }
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const saveConclusion = async (reloadAfter = true, silent = false): Promise<boolean> => {
    if (!silent) {
      setMessage("");
    }

    if (!canLeadEdit) {
      if (!silent) {
        setMessage("You do not have permission to update the conclusion.");
      }
      return false;
    }

    const res = await fetch(`${apiUrl}/audits/${auditId}/conclusion`, {
      method: "PUT",
      headers: authHeaders(authToken, true),
      body: JSON.stringify({ conclusionText: conclusionEdit })
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      if (!silent) {
        setMessage(body.error ?? "Conclusion save failed.");
      }
      return false;
    }

    if (!silent) {
      setMessage("Conclusion saved.");
    }
    if (reloadAfter) {
      await loadWorkspace();
    }
    return true;
  };

  const saveAll = async () => {
    setMessage("");

    if (!canLeadEdit) {
      setMessage("Save All requires lead auditor or org admin permissions.");
      return;
    }

    const scopeOk = await saveScopeTargets(false, true);
    if (!scopeOk) {
      setMessage("Save all failed while saving scope/targets.");
      return;
    }

    const assessmentsOk = await saveAssessments(false, true);
    if (!assessmentsOk) {
      setMessage("Save all failed while saving assessments.");
      return;
    }

    const detailsOk = await saveAuditDetails(false, true);
    if (!detailsOk) {
      setMessage("Save all failed while saving audit details.");
      return;
    }

    const conclusionOk = await saveConclusion(false, true);
    if (!conclusionOk) {
      setMessage("Save all failed while saving conclusion.");
      return;
    }

    setMessage("All updates saved for this audit.");
    await loadWorkspace();
  };

  if (!workspace) {
    return (
      <main className="container grid">
        <section className="card">
          <nav aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
            <a href="/clients">Clients</a> <span aria-hidden="true">/</span> <span>Audit {auditId || "…"}</span>
          </nav>
          <h1>Audit Workspace</h1>
          <p>{message || "Loading..."}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="container grid">
      <section className="card">
        <nav aria-label="Breadcrumb" style={{ marginBottom: 8 }}>
          <a href="/clients">Clients</a> <span aria-hidden="true">/</span> <span>{decodeHtmlEntities(workspace.audit.name)}</span>
        </nav>
        <h1>{decodeHtmlEntities(workspace.audit.name)}</h1>
        <p>
          Client: <strong>{decodeHtmlEntities(workspace.audit.client_name)}</strong> | Audit date: {formatDateOnly(workspace.audit.audit_date)} |
          Status: {auditStatus}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label>
            Audit status{" "}
            <select
              value={statusEdit}
              onChange={(event) => setStatusEdit(event.target.value)}
              disabled={!canManageStatus}
            >
              <option value={auditStatus}>{auditStatus}</option>
              {allowedStatusTransitions.map((status: string) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <button onClick={saveStatus} disabled={!canManageStatus || statusEdit === auditStatus}>
            Save Status
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => saveScopeTargets()} disabled={!canManageScopeTargets}>
            Save Scope/Targets
          </button>
          <button onClick={() => saveAssessments()} disabled={!canEdit}>
            Save Assessment Updates
          </button>
          <button onClick={saveAll} disabled={!canLeadEdit}>
            Save All
          </button>
          <button onClick={generatePdfExport} disabled={!canExport || isGeneratingPdf}>
            {isGeneratingPdf ? "Generating PDF..." : "Generate PDF Export"}
          </button>
          <button
            onClick={() => downloadAuditCsv("all")}
            disabled={!canExport || downloadingCsvKind !== null}
          >
            {downloadingCsvKind === "all" ? "Downloading..." : "CSV: All Results"}
          </button>
          <button
            onClick={() => downloadAuditCsv("certification")}
            disabled={!canExport || downloadingCsvKind !== null}
          >
            {downloadingCsvKind === "certification" ? "Downloading..." : "CSV: Certification"}
          </button>
          <button
            onClick={() => downloadAuditCsv("gaps")}
            disabled={!canExport || downloadingCsvKind !== null}
          >
            {downloadingCsvKind === "gaps" ? "Downloading..." : "CSV: Gaps"}
          </button>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
          <span style={{ color: "#c8d4ff" }}>Workspace density:</span>
          <button
            type="button"
            onClick={() => updateWorkspaceDensity("comfortable")}
            style={{
              border: workspaceDensity === "comfortable" ? "1px solid #8ab4ff" : "1px solid #2a355f",
              background: workspaceDensity === "comfortable" ? "#1b2854" : "#111936",
              color: "#e6ecff"
            }}
          >
            Comfortable
          </button>
          <button
            type="button"
            onClick={() => updateWorkspaceDensity("compact")}
            style={{
              border: workspaceDensity === "compact" ? "1px solid #8ab4ff" : "1px solid #2a355f",
              background: workspaceDensity === "compact" ? "#1b2854" : "#111936",
              color: "#e6ecff"
            }}
          >
            Compact
          </button>
        </div>
        <p style={{ color: auditStatus === "draft" ? "#86efac" : "#ffcc80" }}>
          Scope and cert goals are {auditStatus === "draft" ? "editable" : "locked"} while status is <strong>{auditStatus || "unknown"}</strong>.
        </p>
        {isLockedForNonLead ? (
          <p style={{ color: "#ffcc80" }}>
            This audit is completed; editing is locked for non-lead roles.
          </p>
        ) : null}
        {message ? <p>{message}</p> : null}
      </section>

      <section className="card">
        <h2>Stored PDF Exports</h2>
        {pdfExports.length === 0 ? (
          <p>No stored PDF exports yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th align="left">Generated</th>
                <th align="left">File</th>
                <th align="left">Size</th>
                <th align="left">Current</th>
                <th align="left">Download</th>
              </tr>
            </thead>
            <tbody>
              {pdfExports.map((item: any) => (
                <tr key={item.id}>
                  <td>{formatLocalTimestamp(item.generated_at)}</td>
                  <td>{item.file_name}</td>
                  <td>{formatBytes(item.file_size_bytes)}</td>
                  <td>{item.is_current ? "Yes" : "No"}</td>
                  <td>
                    <button
                      disabled={!canExport || downloadingExportId === Number(item.id)}
                      onClick={() => downloadPdfExport(Number(item.id), String(item.file_name))}
                    >
                      {downloadingExportId === Number(item.id) ? "Downloading..." : "Download"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(workspace.groupedProcesses ?? []).map((group: any) => (
        <section className="card" key={group.processCode}>
          {(() => {
            const scopeEdit = scopeEdits[String(group.processCode)] ?? {
              processCode: group.processCode,
              certGoalLevel: group.certGoalLevel != null ? String(group.certGoalLevel) : "2",
              customGoalLevel: group.customGoalLevel != null ? String(group.customGoalLevel) : "",
              scopeCode: group.scopeCode ?? "IN_SCOPE"
            };

            return (
              <>
                <h2>
                   {group.processCode} - {decodeHtmlEntities(group.processName)} ({decodeHtmlEntities(group.processAbbreviation)})
                 </h2>
                <div
                  style={{
                    display: "flex",
                    gap: isWorkspaceCompact ? 8 : 12,
                    flexWrap: "wrap",
                    marginBottom: isWorkspaceCompact ? 8 : 12
                  }}
                >
                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #2a355f",
                      borderRadius: 8,
                      padding: isWorkspaceCompact ? "3px 6px" : "5px 8px"
                    }}
                  >
                    Scope{" "}
                    <select
                      value={scopeEdit.scopeCode}
                      disabled={!canManageScopeTargets}
                      onChange={(event) =>
                        setScopeEdits((prev) => ({
                          ...prev,
                          [String(group.processCode)]: {
                            ...scopeEdit,
                            scopeCode: event.target.value
                          }
                        }))
                      }
                    >
                      {(workspace.dropdowns?.scopeOptions ?? []).map((scope: any) => (
                        <option key={scope.code} value={scope.code}>
                          {decodeHtmlEntities(scope.label)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #2a355f",
                      borderRadius: 8,
                      padding: isWorkspaceCompact ? "3px 6px" : "5px 8px"
                    }}
                  >
                    Cert goal{" "}
                    <select
                      value={scopeEdit.certGoalLevel}
                      disabled={!canManageScopeTargets}
                      onChange={(event) =>
                        setScopeEdits((prev) => ({
                          ...prev,
                          [String(group.processCode)]: {
                            ...scopeEdit,
                            certGoalLevel: event.target.value
                          }
                        }))
                      }
                    >
                      {(workspace.dropdowns?.targetLevels ?? []).map((level: any) => (
                        <option key={`cert-${group.processCode}-${level.level}`} value={String(level.level)}>
                           {level.level} - {decodeHtmlEntities(level.label)}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 6,
                      border: "1px solid #2a355f",
                      borderRadius: 8,
                      padding: isWorkspaceCompact ? "3px 6px" : "5px 8px"
                    }}
                  >
                    Custom goal{" "}
                    <select
                      value={scopeEdit.customGoalLevel}
                      disabled={!canManageScopeTargets}
                      onChange={(event) =>
                        setScopeEdits((prev) => ({
                          ...prev,
                          [String(group.processCode)]: {
                            ...scopeEdit,
                            customGoalLevel: event.target.value
                          }
                        }))
                      }
                    >
                      <option value="">(none)</option>
                      {(workspace.dropdowns?.targetLevels ?? []).map((level: any) => (
                        <option key={`custom-${group.processCode}-${level.level}`} value={String(level.level)}>
                           {level.level} - {decodeHtmlEntities(level.label)}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </>
            );
          })()}
          <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: reqTableSpacing, tableLayout: "fixed" }}>
            <thead>
              <tr>
                <th align="left" style={{ width: "56%", padding: reqHeaderPadding }}>Requirement</th>
                <th align="left" style={{ width: "8%", padding: reqHeaderPadding }}>Score</th>
                <th align="left" style={{ width: "14%", padding: reqHeaderPadding }}>Comment</th>
                <th align="left" style={{ width: "14%", padding: reqHeaderPadding }}>Evidence</th>
                <th align="left" style={{ width: "8%", padding: reqHeaderPadding }}>Notes / History</th>
              </tr>
            </thead>
            <tbody>
              {(group.requirements ?? []).map((req: any, reqIndex: number) => {
                const assessmentKey = String(req.assessmentId);
                const edit = edits[String(req.assessmentId)] ?? {
                  requirementCode: req.requirementCode,
                  scoreLabel: "Select …",
                  commentText: "",
                  evidenceText: ""
                };
                const rowBg = reqIndex % 2 === 0 ? "#0f1834" : "#121e40";

                const isOpen = !!openHistoryByAssessment[assessmentKey];
                const history = historyByAssessment[assessmentKey];
                const historyLoading = !!loadingHistoryByAssessment[assessmentKey];
                const noteDraft = noteDraftByAssessment[assessmentKey] ?? "";

                return (
                  <Fragment key={req.assessmentId}>
                    <tr style={{ background: rowBg, boxShadow: "inset 0 0 0 1px #2a355f" }}>
                      <td style={{ padding: reqCellPadding, verticalAlign: "top" }}>
                        <div>
                          <strong>{req.requirementCode}</strong>
                        </div>
                        <div style={{ marginTop: isWorkspaceCompact ? 2 : 4, lineHeight: isWorkspaceCompact ? 1.35 : 1.45 }}>
                          {decodeHtmlEntities(req.requirementText)}
                        </div>
                      </td>
                      <td style={{ padding: reqCellPadding, verticalAlign: "top" }}>
                        <select
                          style={{ width: "100%", minWidth: 92 }}
                          value={edit.scoreLabel}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setEdits((prev) => ({
                              ...prev,
                              [assessmentKey]: {
                                ...edit,
                                scoreLabel: event.target.value
                              }
                            }))
                          }
                        >
                          {(workspace.dropdowns?.scoreOptions ?? []).map((score: any) => (
                            <option key={score.label} value={score.label}>
                              {decodeHtmlEntities(score.label)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={{ padding: reqCellPadding, verticalAlign: "top" }}>
                        <textarea
                          rows={reqTextareaRows}
                          style={{ width: "100%" }}
                          value={edit.commentText}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setEdits((prev) => ({
                              ...prev,
                              [assessmentKey]: {
                                ...edit,
                                commentText: event.target.value
                              }
                            }))
                          }
                        />
                      </td>
                      <td style={{ padding: reqCellPadding, verticalAlign: "top" }}>
                        <textarea
                          rows={reqTextareaRows}
                          style={{ width: "100%" }}
                          value={edit.evidenceText}
                          disabled={!canEdit}
                          onChange={(event) =>
                            setEdits((prev) => ({
                              ...prev,
                              [assessmentKey]: {
                                ...edit,
                                evidenceText: event.target.value
                              }
                            }))
                          }
                        />
                      </td>
                      <td style={{ padding: reqCellPadding, verticalAlign: "top" }}>
                        <button style={{ width: "100%" }} onClick={() => toggleAssessmentHistory(req.assessmentId)}>
                          {isOpen ? "Hide" : "Open"}
                        </button>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr>
                        <td colSpan={5} style={{ padding: 0 }}>
                          <div
                            className="grid"
                            style={{
                              gridTemplateColumns: `repeat(auto-fit, minmax(${isWorkspaceCompact ? 240 : 280}px, 1fr))`,
                              background: "#0d1630",
                              border: "1px solid #2a355f",
                              borderRadius: 8,
                              padding: isWorkspaceCompact ? 8 : 12
                            }}
                          >
                            <div>
                              <h4>Notes</h4>
                              <textarea
                                rows={reqTextareaRows}
                                style={{ width: "100%" }}
                                value={noteDraft}
                                disabled={!canEdit}
                                onChange={(event) =>
                                  setNoteDraftByAssessment((prev) => ({
                                    ...prev,
                                    [assessmentKey]: event.target.value
                                  }))
                                }
                                placeholder="Add note for this requirement"
                              />
                              <div style={{ marginTop: 8 }}>
                                <button onClick={() => addAssessmentNote(req.assessmentId)} disabled={!canEdit}>
                                  Add Note
                                </button>
                              </div>
                              <ul style={{ paddingLeft: 18 }}>
                                {(history?.notes ?? []).map((note: any) => (
                                  <li key={`n-${note.id}`}>
                                    {decodeHtmlEntities(note.note_text)} <em>({formatLocalTimestamp(note.created_at)})</em>
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h4>Change History</h4>
                              {historyLoading ? <p>Loading history…</p> : null}
                              <ul style={{ paddingLeft: 18 }}>
                                {(history?.events ?? []).map((evt: any) => (
                                  <li key={`e-${evt.id}`}>
                                    <strong>{decodeHtmlEntities(evt.event_type)}</strong> <em>({formatLocalTimestamp(evt.created_at)})</em>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}

      <section className="card">
        <h2>Audit Details</h2>
        <button onClick={() => saveAuditDetails()} disabled={!canEdit}>
          Save Audit Details
        </button>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th align="left">Field</th>
              <th align="left">Response</th>
              <th align="left">Notes</th>
            </tr>
          </thead>
          <tbody>
            {(workspace.details ?? []).map((detail: any) => {
              const edit = detailEdits[String(detail.field_key)] ?? {
                fieldKey: detail.field_key,
                responseText: "",
                noteText: ""
              };

              return (
                <tr key={detail.field_key}>
                  <td>
                    <div>
                       <strong>{decodeHtmlEntities(detail.label)}</strong>
                     </div>
                     {detail.guidance_text ? (
                       <div style={{ opacity: 0.8, fontSize: "0.9rem" }}>{decodeHtmlEntities(detail.guidance_text)}</div>
                     ) : null}
                  </td>
                  <td>
                    <textarea
                      rows={3}
                      style={{ width: "100%" }}
                      value={edit.responseText}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDetailEdits((prev) => ({
                          ...prev,
                          [String(detail.field_key)]: {
                            ...edit,
                            responseText: event.target.value
                          }
                        }))
                      }
                    />
                  </td>
                  <td>
                    <textarea
                      rows={3}
                      style={{ width: "100%" }}
                      value={edit.noteText}
                      disabled={!canEdit}
                      onChange={(event) =>
                        setDetailEdits((prev) => ({
                          ...prev,
                          [String(detail.field_key)]: {
                            ...edit,
                            noteText: event.target.value
                          }
                        }))
                      }
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h2>Conclusion</h2>
        <textarea
          rows={6}
          style={{ width: "100%" }}
          value={conclusionEdit}
          disabled={!canLeadEdit}
          onChange={(event) => setConclusionEdit(event.target.value)}
          placeholder="Enter audit conclusion"
        />
        <div style={{ marginTop: 8 }}>
          <button onClick={() => saveConclusion()} disabled={!canLeadEdit}>
            Save Conclusion
          </button>
        </div>
        <p>
          <a href="/clients">Back to clients and audits</a>
        </p>
      </section>
    </main>
  );
}
