// @ts-nocheck
"use client";

import { Fragment } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { decodeHtmlEntities } from "../../lib/text-format";
import { formatLocalTimestamp } from "../../lib/date-format";

export default function ProcessPanel({
  group,
  workspace,
  processUi,
  scopeState,
  assessmentState,
  permissions,
  actions
}) {
  const processCode = String(group.processCode);
  const isOpen = processUi.openProcessByCode[processCode] !== false;
  const density = processUi.panelDensityByProcess[processCode] ?? "comfortable";
  const isCompact = density === "compact";
  const reqTextareaRows = isCompact ? 3 : 4;
  const scoredCount = (group.requirements ?? []).filter((req) => {
    const label = String(assessmentState.edits[String(req.assessmentId)]?.scoreLabel ?? req.scoreLabel ?? "").trim();
    return label && label !== "Select …";
  }).length;
  const scopeEdit = scopeState.scopeEdits[processCode] ?? {
    processCode,
    certGoalLevel: group.certGoalLevel != null ? String(group.certGoalLevel) : "2",
    customGoalLevel: group.customGoalLevel != null ? String(group.customGoalLevel) : "",
    scopeCode: group.scopeCode ?? "IN_SCOPE"
  };

  return (
    <Card id={`process-${processCode.toLowerCase()}`} data-process-panel data-process-code={processCode} className="scroll-mt-24">
      <CardContent className="space-y-4 p-0">
        <div className="flex flex-col gap-4 border-b border-slate-800/80 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{processCode}</Badge>
              <Badge variant="info">{scoredCount}/{(group.requirements ?? []).length} scored</Badge>
              <Badge variant="default">{decodeHtmlEntities(group.processAbbreviation)}</Badge>
            </div>
            <div>
              <h2 className="text-xl font-semibold text-foreground">{decodeHtmlEntities(group.processName)}</h2>
              <p className="mt-2 text-sm text-foreground">Keep scope, targets, and requirement evidence grouped for this process only.</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" active={density === "comfortable"} onClick={() => actions.updatePanelDensity(processCode, "comfortable")}>Comfortable</Button>
            <Button size="sm" variant="secondary" active={density === "compact"} onClick={() => actions.updatePanelDensity(processCode, "compact")}>Compact</Button>
            <Button size="sm" variant="ghost" onClick={() => processUi.setOpenProcessByCode((prev) => ({ ...prev, [processCode]: !isOpen }))}>{isOpen ? "Collapse" : "Expand"}</Button>
          </div>
        </div>

        <div className="px-5">
          <div className="grid gap-3 lg:grid-cols-3">
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>Scope</span>
              <select value={scopeEdit.scopeCode} disabled={!permissions.canManageScopeTargets} onChange={(event) => scopeState.setScopeEdits((prev) => ({ ...prev, [processCode]: { ...scopeEdit, scopeCode: event.target.value } }))} onBlur={() => actions.requestScopeAutosave?.()}>
                {(workspace.dropdowns?.scopeOptions ?? []).map((scope) => (
                  <option key={scope.code} value={scope.code}>{decodeHtmlEntities(scope.label)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>Cert goal</span>
              <select value={scopeEdit.certGoalLevel} disabled={!permissions.canManageScopeTargets} onChange={(event) => scopeState.setScopeEdits((prev) => ({ ...prev, [processCode]: { ...scopeEdit, certGoalLevel: event.target.value } }))} onBlur={() => actions.requestScopeAutosave?.()}>
                {(workspace.dropdowns?.targetLevels ?? []).map((level) => (
                  <option key={`cert-${processCode}-${level.level}`} value={String(level.level)}>{level.level} - {decodeHtmlEntities(level.label)}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium text-foreground">
              <span>Custom goal</span>
              <select value={scopeEdit.customGoalLevel} disabled={!permissions.canManageScopeTargets} onChange={(event) => scopeState.setScopeEdits((prev) => ({ ...prev, [processCode]: { ...scopeEdit, customGoalLevel: event.target.value } }))} onBlur={() => actions.requestScopeAutosave?.()}>
                <option value="">(none)</option>
                {(workspace.dropdowns?.targetLevels ?? []).map((level) => (
                  <option key={`custom-${processCode}-${level.level}`} value={String(level.level)}>{level.level} - {decodeHtmlEntities(level.label)}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {isOpen ? (
          <div className="space-y-2 px-5 pb-5">
            <p className="text-xs uppercase tracking-[0.16em] text-foreground lg:hidden">Swipe horizontally for full requirement columns</p>
            <div className="overflow-x-auto">
              <table className="data-table min-w-[1100px] table-fixed">
                <thead>
                  <tr>
                    <th className="w-[38%]">Requirement</th>
                    <th className="w-[12%]">Score</th>
                    <th className="w-[18%]">Comment</th>
                    <th className="w-[18%]">Evidence</th>
                    <th className="w-[14%]">Notes & history</th>
                  </tr>
                </thead>
                <tbody>
                  {(group.requirements ?? []).map((req) => {
                    const assessmentKey = String(req.assessmentId);
                    const edit = assessmentState.edits[assessmentKey] ?? {
                      requirementCode: req.requirementCode,
                      scoreLabel: "Select …",
                      commentText: "",
                      evidenceText: ""
                    };
                    const isHistoryOpen = !!assessmentState.openHistoryByAssessment[assessmentKey];
                    const history = assessmentState.historyByAssessment[assessmentKey];
                    const historyLoading = !!assessmentState.loadingHistoryByAssessment[assessmentKey];
                    const noteDraft = assessmentState.noteDraftByAssessment[assessmentKey] ?? "";

                    return (
                      <Fragment key={req.assessmentId}>
                        <tr>
                          <td className={isCompact ? "px-3 py-2" : undefined}>
                            <div className="font-semibold text-foreground">{req.requirementCode}</div>
                            <div className={`mt-2 text-sm text-foreground ${isCompact ? "leading-5" : "leading-6"}`}>{decodeHtmlEntities(req.requirementText)}</div>
                          </td>
                          <td className={isCompact ? "px-3 py-2" : undefined}>
                            <select value={edit.scoreLabel} disabled={!permissions.canEdit} onChange={(event) => assessmentState.setEdits((prev) => ({ ...prev, [assessmentKey]: { ...edit, scoreLabel: event.target.value } }))} onBlur={() => actions.requestAssessmentAutosave?.()}>
                              {(workspace.dropdowns?.scoreOptions ?? []).map((score) => (
                                <option key={score.label} value={score.label}>{decodeHtmlEntities(score.label)}</option>
                              ))}
                            </select>
                          </td>
                          <td className={isCompact ? "px-3 py-2" : undefined}>
                            <textarea rows={reqTextareaRows} value={edit.commentText} disabled={!permissions.canEdit} onChange={(event) => assessmentState.setEdits((prev) => ({ ...prev, [assessmentKey]: { ...edit, commentText: event.target.value } }))} onBlur={() => actions.requestAssessmentAutosave?.()} />
                          </td>
                          <td className={isCompact ? "px-3 py-2" : undefined}>
                            <textarea rows={reqTextareaRows} value={edit.evidenceText} disabled={!permissions.canEdit} onChange={(event) => assessmentState.setEdits((prev) => ({ ...prev, [assessmentKey]: { ...edit, evidenceText: event.target.value } }))} onBlur={() => actions.requestAssessmentAutosave?.()} />
                          </td>
                          <td className={isCompact ? "px-3 py-2" : undefined}>
                            <Button size="sm" variant="secondary" className="w-full" onClick={() => actions.toggleAssessmentHistory(req.assessmentId)}>{isHistoryOpen ? "Hide" : "Open"}</Button>
                          </td>
                        </tr>
                        {isHistoryOpen ? (
                          <tr>
                            <td colSpan={5} className="bg-slate-950/85 px-4 py-4">
                              <div className="grid gap-4 lg:grid-cols-2">
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                                  <h4 className="text-sm font-semibold text-foreground">Notes</h4>
                                  <textarea rows={reqTextareaRows} className="mt-3" value={noteDraft} disabled={!permissions.canEdit} onChange={(event) => assessmentState.setNoteDraftByAssessment((prev) => ({ ...prev, [assessmentKey]: event.target.value }))} placeholder="Add note for this requirement" />
                                  <div className="mt-3">
                                    <Button size="sm" onClick={() => actions.addAssessmentNote(req.assessmentId)} disabled={!permissions.canEdit}>Add note</Button>
                                  </div>
                                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-foreground">
                                    {(history?.notes ?? []).map((note) => (
                                      <li key={`n-${note.id}`}>{decodeHtmlEntities(note.note_text)} <span className="text-foreground">({formatLocalTimestamp(note.created_at_UTC)})</span></li>
                                    ))}
                                  </ul>
                                </div>
                                <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
                                  <h4 className="text-sm font-semibold text-foreground">Change history</h4>
                                  {historyLoading ? <p className="mt-3 text-sm text-foreground">Loading history…</p> : null}
                                  <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-foreground">
                                    {(history?.events ?? []).map((evt) => (
                                      <li key={`e-${evt.id}`}><strong>{decodeHtmlEntities(evt.event_type)}</strong> <span className="text-foreground">({formatLocalTimestamp(evt.created_at_UTC)})</span></li>
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
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
