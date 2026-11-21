// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

/**
 * Normalized, order-independent JSON snapshots of the editable audit workspace sections.
 * A section is dirty when its current snapshot differs from the last snapshot the server accepted.
 */

/** Score label of a requirement that has not been scored yet. */
export const UNSCORED_LABEL = "Select …";

export type WorkspaceSection = "scope" | "assessments" | "details" | "conclusion";
export const WORKSPACE_SECTIONS: WorkspaceSection[] = ["scope", "assessments", "details", "conclusion"];

export type ScopeEdit = { processCode: string; certGoalLevel: string; customGoalLevel: string; scopeCode: string };
export type AssessmentEdit = { requirementCode: string; scoreLabel: string; commentText: string; evidenceText: string };
export type DetailEdit = { fieldKey: string; responseText: string; noteText: string };

export type WorkspaceEdits = {
  scopeEdits: Record<string, ScopeEdit>;
  edits: Record<string, AssessmentEdit>;
  detailEdits: Record<string, DetailEdit>;
  conclusionEdit: string;
};

export const normalizeScopeItems = (source: Record<string, any>): ScopeEdit[] =>
  Object.values(source)
    .map((item: any) => ({
      processCode: String(item.processCode ?? ""),
      certGoalLevel: String(item.certGoalLevel ?? "2"),
      customGoalLevel: String(item.customGoalLevel ?? ""),
      scopeCode: String(item.scopeCode ?? "IN_SCOPE"),
    }))
    .sort((left, right) => left.processCode.localeCompare(right.processCode));

export const normalizeAssessmentItems = (source: Record<string, any>): AssessmentEdit[] =>
  Object.values(source)
    .map((item: any) => ({
      requirementCode: String(item.requirementCode ?? ""),
      scoreLabel: String(item.scoreLabel ?? UNSCORED_LABEL),
      commentText: String(item.commentText ?? ""),
      evidenceText: String(item.evidenceText ?? ""),
    }))
    .sort((left, right) => left.requirementCode.localeCompare(right.requirementCode));

export const normalizeDetailItems = (source: Record<string, any>): DetailEdit[] =>
  Object.values(source)
    .map((item: any) => ({
      fieldKey: String(item.fieldKey ?? ""),
      responseText: String(item.responseText ?? ""),
      noteText: String(item.noteText ?? ""),
    }))
    .sort((left, right) => left.fieldKey.localeCompare(right.fieldKey));

export const scopeSnapshotOf = (scopeEdits: Record<string, any>): string =>
  JSON.stringify(normalizeScopeItems(scopeEdits));
export const assessmentsSnapshotOf = (edits: Record<string, any>): string =>
  JSON.stringify(normalizeAssessmentItems(edits));
export const detailsSnapshotOf = (detailEdits: Record<string, any>): string =>
  JSON.stringify(normalizeDetailItems(detailEdits));
export const conclusionSnapshotOf = (conclusion: string | null | undefined): string =>
  JSON.stringify({ conclusionText: String(conclusion ?? "") });

export const snapshotsOf = (edits: WorkspaceEdits): Record<WorkspaceSection, string> => ({
  scope: scopeSnapshotOf(edits.scopeEdits),
  assessments: assessmentsSnapshotOf(edits.edits),
  details: detailsSnapshotOf(edits.detailEdits),
  conclusion: conclusionSnapshotOf(edits.conclusionEdit),
});

/** Builds the editable state from a GET /audits/:id/workspace response. */
export const editsFromWorkspace = (data: any): WorkspaceEdits => {
  const scopeEdits: Record<string, ScopeEdit> = {};
  const edits: Record<string, AssessmentEdit> = {};
  for (const group of data?.groupedProcesses ?? []) {
    scopeEdits[String(group.processCode)] = {
      processCode: String(group.processCode),
      certGoalLevel: group.certGoalLevel != null ? String(group.certGoalLevel) : "2",
      customGoalLevel: group.customGoalLevel != null ? String(group.customGoalLevel) : "",
      scopeCode: group.scopeCode ?? "IN_SCOPE",
    };
    for (const req of group.requirements ?? []) {
      edits[String(req.assessmentId)] = {
        requirementCode: req.requirementCode,
        scoreLabel: req.scoreLabel ?? UNSCORED_LABEL,
        commentText: req.commentText ?? "",
        evidenceText: req.evidenceText ?? "",
      };
    }
  }

  const detailEdits: Record<string, DetailEdit> = {};
  for (const detail of data?.details ?? []) {
    detailEdits[String(detail.field_key)] = {
      fieldKey: detail.field_key,
      responseText: detail.response_text ?? "",
      noteText: detail.note_text ?? "",
    };
  }

  return { scopeEdits, edits, detailEdits, conclusionEdit: data?.conclusion?.conclusion_text ?? "" };
};

const parseList = <T>(snapshot: string): T[] => {
  try {
    const parsed = JSON.parse(snapshot || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** PUT /audits/:id/scope-targets body items for a scope snapshot. */
export const scopePayloadFromSnapshot = (snapshot: string) =>
  parseList<ScopeEdit>(snapshot).map((item) => ({
    processCode: item.processCode,
    certGoalLevel: Number(item.certGoalLevel || 2),
    customGoalLevel: item.customGoalLevel ? Number(item.customGoalLevel) : null,
    scopeCode: item.scopeCode === "OUT_OF_SCOPE" ? "OUT_OF_SCOPE" : "IN_SCOPE",
  }));

/** Assessment items in `current` that differ from the last saved snapshot. */
export const changedAssessmentItems = (current: string, saved: string): AssessmentEdit[] => {
  const previous = new Map(
    parseList<AssessmentEdit>(saved).map((item) => [item.requirementCode, JSON.stringify(item)]),
  );
  return parseList<AssessmentEdit>(current).filter(
    (item) => previous.get(item.requirementCode) !== JSON.stringify(item),
  );
};

export const detailsPayloadFromSnapshot = (snapshot: string): DetailEdit[] => parseList<DetailEdit>(snapshot);

export const conclusionPayloadFromSnapshot = (snapshot: string): { conclusionText: string } => {
  try {
    return { conclusionText: String(JSON.parse(snapshot)?.conclusionText ?? "") };
  } catch {
    return { conclusionText: "" };
  }
};

export type ScoredCount = { scored: number; total: number };

/** Counts requirements with a real score, preferring unsaved edits over the saved value. */
export const scoredCountOf = (
  requirements: Array<{ assessmentId: unknown; scoreLabel?: string | null }> | null | undefined,
  edits: Record<string, { scoreLabel?: string } | undefined>,
): ScoredCount => {
  const list = requirements ?? [];
  const scored = list.filter((req) => {
    const label = String(edits[String(req.assessmentId)]?.scoreLabel ?? req.scoreLabel ?? "").trim();
    return label !== "" && label !== UNSCORED_LABEL;
  }).length;
  return { scored, total: list.length };
};
