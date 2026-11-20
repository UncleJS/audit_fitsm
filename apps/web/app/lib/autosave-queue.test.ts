// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { changedAssessmentItems, editsFromWorkspace, snapshotsOf } from "./audit-snapshots";
import { AutosaveQueue, type SaveOutcome } from "./autosave-queue";

const deferred = () => {
  let resolve!: (value: SaveOutcome) => void;
  const promise = new Promise<SaveOutcome>((r) => {
    resolve = r;
  });
  return { promise, resolve };
};

const setup = () => {
  const state = { value: "a", enabled: true };
  const sent: string[] = [];
  const pending: ReturnType<typeof deferred>[] = [];
  const queue = new AutosaveQueue<"text">(() => ({
    getSnapshot: () => state.value,
    isEnabled: () => state.enabled,
    disabledError: () => "not allowed",
    send: (snapshot) => {
      sent.push(snapshot);
      const next = deferred();
      pending.push(next);
      return next.promise;
    },
  }));
  queue.setBaseline("text", "a");
  return { state, sent, pending, queue };
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("AutosaveQueue", () => {
  it("skips clean sections", async () => {
    const { queue, sent } = setup();
    expect(await queue.save("text")).toEqual({ ok: true, skipped: true });
    expect(sent).toEqual([]);
  });

  it("serializes saves and sends the latest snapshot", async () => {
    const { queue, state, sent, pending } = setup();
    state.value = "b";
    const first = queue.save("text");
    await tick();
    state.value = "c";
    const second = queue.save("text");
    const third = queue.save("text");
    await tick();
    expect(sent).toEqual(["b"]);
    expect(queue.isBusy("text")).toBe(true);

    pending[0].resolve({ ok: true });
    expect(await first).toEqual({ ok: true });
    await tick();
    expect(sent).toEqual(["b", "c"]);
    pending[1].resolve({ ok: true });
    expect(await second).toEqual({ ok: true });
    expect(await third).toEqual({ ok: true, skipped: true });
    expect(sent).toEqual(["b", "c"]);
    expect(queue.isPending("text")).toBe(false);
  });

  it("keeps the section dirty when edits arrive during an in-flight save", async () => {
    const { queue, state, pending } = setup();
    state.value = "b";
    const save = queue.save("text");
    await tick();
    state.value = "bc";
    pending[0].resolve({ ok: true });
    await save;
    expect(queue.getSaved("text")).toBe("b");
    expect(queue.isDirty("text")).toBe(true);
  });

  it("keeps the baseline on failure", async () => {
    const { queue, state, pending } = setup();
    state.value = "b";
    const save = queue.save("text");
    await tick();
    pending[0].resolve({ ok: false, error: "boom" });
    expect(await save).toEqual({ ok: false, error: "boom" });
    expect(queue.getSaved("text")).toBe("a");
    expect(queue.isDirty("text")).toBe(true);
  });

  it("reports permission errors without sending", async () => {
    const { queue, state, sent } = setup();
    state.value = "b";
    state.enabled = false;
    expect(await queue.save("text")).toEqual({ ok: false, error: "not allowed" });
    expect(sent).toEqual([]);
  });

  it("ignores a stale success after the baseline was reset", async () => {
    const { queue, state, pending } = setup();
    state.value = "b";
    const save = queue.save("text");
    await tick();
    queue.setBaseline("text", "server");
    pending[0].resolve({ ok: true });
    await save;
    expect(queue.getSaved("text")).toBe("server");
  });
});

describe("audit snapshots", () => {
  const workspace = {
    groupedProcesses: [
      {
        processCode: "PR2",
        certGoalLevel: 3,
        scopeCode: "IN_SCOPE",
        requirements: [{ assessmentId: 7, requirementCode: "PR2.1", scoreLabel: "1", commentText: "c" }],
      },
    ],
    details: [{ field_key: "scope", response_text: "r", note_text: null }],
    conclusion: { conclusion_text: "done" },
  };

  it("builds edits and stable snapshots from workspace data", () => {
    const edits = editsFromWorkspace(workspace);
    expect(edits.scopeEdits.PR2.certGoalLevel).toBe("3");
    expect(edits.edits["7"].evidenceText).toBe("");
    const snapshots = snapshotsOf(edits);
    expect(JSON.parse(snapshots.conclusion)).toEqual({ conclusionText: "done" });
    expect(JSON.parse(snapshots.details)).toEqual([{ fieldKey: "scope", responseText: "r", noteText: "" }]);
  });

  it("diffs changed assessment items only", () => {
    const edits = editsFromWorkspace(workspace);
    const saved = snapshotsOf(edits).assessments;
    edits.edits["7"] = { ...edits.edits["7"], commentText: "changed" };
    edits.edits["8"] = { requirementCode: "PR2.2", scoreLabel: "2", commentText: "", evidenceText: "" };
    const current = snapshotsOf(edits).assessments;
    expect(changedAssessmentItems(current, saved).map((item) => item.requirementCode)).toEqual(["PR2.1", "PR2.2"]);
    expect(changedAssessmentItems(saved, saved)).toEqual([]);
  });
});
