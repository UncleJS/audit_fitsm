// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

import { describe, expect, it } from "bun:test";
import { aggregateTrendsByAudit, latestTrends, sparkline, type TrendRow, trendSparkline } from "./trends";

const row = (overrides: Partial<TrendRow>): TrendRow => ({
  org_id: 1,
  audit_id: 1,
  audit_date_UTC: "2026-01-01",
  process_id: 1,
  process_code: "PR1",
  process_abbreviation: "SPM",
  process_name: "Service portfolio",
  average_capability_score: null,
  scored_requirements: 0,
  total_requirements: 0,
  ...overrides,
});

describe("aggregateTrendsByAudit", () => {
  const rows = [
    row({
      audit_id: 2,
      audit_date_UTC: "2026-03-01",
      average_capability_score: 2,
      scored_requirements: 3,
      total_requirements: 4,
    }),
    row({
      audit_id: 2,
      audit_date_UTC: "2026-03-01",
      average_capability_score: 4,
      scored_requirements: 1,
      total_requirements: 2,
    }),
    row({ audit_id: 2, audit_date_UTC: "2026-03-01", average_capability_score: null, total_requirements: 5 }),
    row({ audit_id: 1, audit_date_UTC: "2026-01-15", average_capability_score: null, total_requirements: 3 }),
  ];

  it("averages per-process scores and sums requirement counts per audit", () => {
    const result = aggregateTrendsByAudit(rows, [{ id: 2, name: "Spring audit", status: "completed" }]);
    expect(result).toEqual([
      {
        auditId: 1,
        auditDate: "2026-01-15",
        name: "Audit #1",
        status: "unknown",
        averageCapability: null,
        scoredReqSum: 0,
        totalReqSum: 3,
      },
      {
        auditId: 2,
        auditDate: "2026-03-01",
        name: "Spring audit",
        status: "completed",
        averageCapability: 3,
        scoredReqSum: 4,
        totalReqSum: 11,
      },
    ]);
  });

  it("returns an empty list without rows", () => {
    expect(aggregateTrendsByAudit([], [])).toEqual([]);
  });

  it("orders latest trends newest first and skips unscored audits in the sparkline", () => {
    const trends = aggregateTrendsByAudit(rows, []);
    expect(latestTrends(trends, 1).map((item) => item.auditId)).toEqual([2]);
    expect(trendSparkline(trends)).toBe("▅");
  });
});

describe("sparkline", () => {
  it("returns a dash for no values", () => {
    expect(sparkline([])).toBe("—");
  });

  it("maps the range onto ticks", () => {
    expect(sparkline([0, 1])).toBe("▁█");
  });
});
