// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 UncleJS

export type TrendRow = {
  org_id: number;
  audit_id: number;
  audit_date_UTC: string;
  process_id: number;
  process_code: string;
  process_abbreviation: string;
  process_name: string;
  average_capability_score: number | null;
  scored_requirements: number;
  total_requirements: number;
};

export type TrendAuditMeta = { id: number; name: string; status: string };

export type AuditTrend = {
  auditId: number;
  auditDate: string;
  name: string;
  status: string;
  averageCapability: number | null;
  scoredReqSum: number;
  totalReqSum: number;
};

/** Collapses per-process trend rows into one entry per audit, ordered by audit date ascending. */
export const aggregateTrendsByAudit = (rows: TrendRow[], audits: TrendAuditMeta[]): AuditTrend[] => {
  const byAudit = new Map<
    number,
    { auditId: number; auditDate: string; avgSum: number; avgCount: number; scoredReqSum: number; totalReqSum: number }
  >();

  for (const row of rows) {
    const auditId = Number(row.audit_id);
    let current = byAudit.get(auditId);
    if (!current) {
      current = {
        auditId,
        auditDate: String(row.audit_date_UTC),
        avgSum: 0,
        avgCount: 0,
        scoredReqSum: 0,
        totalReqSum: 0,
      };
      byAudit.set(auditId, current);
    }

    const avg = row.average_capability_score;
    if (avg !== null && avg !== undefined && Number.isFinite(Number(avg))) {
      current.avgSum += Number(avg);
      current.avgCount += 1;
    }
    current.scoredReqSum += Number(row.scored_requirements ?? 0);
    current.totalReqSum += Number(row.total_requirements ?? 0);
  }

  const auditMeta = new Map(audits.map((audit) => [Number(audit.id), audit]));
  return [...byAudit.values()]
    .map((item) => {
      const meta = auditMeta.get(item.auditId);
      return {
        auditId: item.auditId,
        auditDate: item.auditDate,
        name: meta?.name ?? `Audit #${item.auditId}`,
        status: meta?.status ?? "unknown",
        averageCapability: item.avgCount > 0 ? item.avgSum / item.avgCount : null,
        scoredReqSum: item.scoredReqSum,
        totalReqSum: item.totalReqSum,
      };
    })
    .sort((a, b) => a.auditDate.localeCompare(b.auditDate));
};

const SPARK_TICKS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

export const sparkline = (values: number[]): string => {
  if (!values.length) return "—";
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return values.map(() => "▅").join("");
  return values
    .map((value) => {
      const normalized = (value - min) / (max - min);
      const index = Math.max(0, Math.min(SPARK_TICKS.length - 1, Math.round(normalized * (SPARK_TICKS.length - 1))));
      return SPARK_TICKS[index];
    })
    .join("");
};

/** Sparkline over the last `limit` audits that have a capability average. */
export const trendSparkline = (trends: AuditTrend[], limit = 10): string =>
  sparkline(
    trends
      .filter((item) => item.averageCapability !== null)
      .slice(-limit)
      .map((item) => Number(item.averageCapability)),
  );

/** The `limit` most recent audits, newest first. */
export const latestTrends = (trends: AuditTrend[], limit = 6): AuditTrend[] =>
  [...trends].sort((a, b) => b.auditDate.localeCompare(a.auditDate)).slice(0, limit);
