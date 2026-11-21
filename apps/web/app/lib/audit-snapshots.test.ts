// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { scoredCountOf, UNSCORED_LABEL } from "./audit-snapshots";

describe("scoredCountOf", () => {
  it("counts saved scores and ignores unscored or blank labels", () => {
    const requirements = [
      { assessmentId: 1, scoreLabel: "2" },
      { assessmentId: 2, scoreLabel: UNSCORED_LABEL },
      { assessmentId: 3, scoreLabel: "" },
      { assessmentId: 4, scoreLabel: null },
    ];
    expect(scoredCountOf(requirements, {})).toEqual({ scored: 1, total: 4 });
  });

  it("prefers unsaved edits over saved values", () => {
    const requirements = [
      { assessmentId: 1, scoreLabel: "2" },
      { assessmentId: 2, scoreLabel: UNSCORED_LABEL },
    ];
    const edits = { "1": { scoreLabel: UNSCORED_LABEL }, "2": { scoreLabel: "3" } };
    expect(scoredCountOf(requirements, edits)).toEqual({ scored: 1, total: 2 });
    expect(scoredCountOf(requirements, { "2": { scoreLabel: "1" } })).toEqual({ scored: 2, total: 2 });
  });

  it("handles a process without requirements", () => {
    expect(scoredCountOf(undefined, {})).toEqual({ scored: 0, total: 0 });
    expect(scoredCountOf([], {})).toEqual({ scored: 0, total: 0 });
  });
});
