// @ts-nocheck
import { BarChart3 } from "lucide-react";
import PageSection from "../layout/page-section";
import { Badge, statusVariant } from "../ui/badge";
import { Card, CardContent } from "../ui/card";
import { formatDateOnly } from "../../lib/date-format";
import { decodeHtmlEntities } from "../../lib/text-format";

export default function TrendViewSection({ trendSparkline, trendLatest }) {
  return (
    <PageSection title="3. Trend view" eyebrow="Review" description="Use the recent trend line and audit summaries to spot improving or regressing capability across the selected client.">
      <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card className="bg-slate-950/45">
          <CardContent className="space-y-4 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">Capability sparkline</p>
              <BarChart3 className="size-4 text-sky-300" />
            </div>
            <p className="font-mono text-4xl tracking-[0.3em] text-sky-200">{trendSparkline}</p>
            <p className="text-sm text-foreground">Latest 10 scored audits for the selected client.</p>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {trendLatest.length === 0 ? (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="p-6 text-sm text-foreground">No trend data yet for this client.</CardContent>
            </Card>
          ) : (
            trendLatest.map((item) => (
              <Card key={`trend-${item.auditId}`} className="bg-slate-950/45">
                <CardContent className="space-y-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{decodeHtmlEntities(item.name)}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.16em] text-foreground">{formatDateOnly(item.auditDate)}</p>
                    </div>
                    <Badge variant={statusVariant(item.status)}>{item.status.replace("_", " ")}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-foreground">Avg capability</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{item.averageCapability === null ? "n/a" : Number(item.averageCapability).toFixed(2)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                      <p className="text-xs uppercase tracking-[0.16em] text-foreground">Scored reqs</p>
                      <p className="mt-2 text-xl font-semibold text-foreground">{item.scoredReqSum}/{item.totalReqSum}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </PageSection>
  );
}
