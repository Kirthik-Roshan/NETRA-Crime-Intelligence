import Link from "next/link";
import {
  Radar, TrendingUp, TrendingDown, Minus, AlertTriangle, UserSearch, Sparkles, ShieldCheck,
} from "lucide-react";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { hotspotForecasts, repeatOffenderPredictions, escalationWarnings, crimeTypeForecasts } from "@/lib/predict";
import { PageHeader, Badge, Avatar } from "@/components/ui";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const TREND_META = {
  rising: { icon: TrendingUp, cls: "text-danger", label: "Rising" },
  stable: { icon: Minus, cls: "text-muted", label: "Stable" },
  cooling: { icon: TrendingDown, cls: "text-success", label: "Cooling" },
} as const;

export default function PredictionsPage() {
  const user = getSession()!;
  const tPage = getT();
  const hotspots = hotspotForecasts();
  const repeat = repeatOffenderPredictions(12);
  const escalations = escalationWarnings();
  const types = crimeTypeForecasts();
  audit({ user, action: "PREDICTION_GENERATED", entity: "predictions", ai_model: "rule-engine" });

  const risingDistricts = hotspots.filter((h) => h.trend === "rising");
  const risingTypes = types.filter((t) => t.trend === "rising");

  return (
    <div className="space-y-6">
      <PageHeader
        title={tPage("pred.title")}
        subtitle={tPage("pred.subtitle")}
      >
        <Badge tone="accent"><ShieldCheck className="h-3 w-3" /> Explainable · human-in-the-loop</Badge>
      </PageHeader>

      {/* Early warning strip */}
      <div className="grid gap-3 md:grid-cols-3">
        <WarnCard
          icon={Radar}
          tone={risingDistricts.length ? "danger" : "success"}
          title={`${risingDistricts.length} district${risingDistricts.length === 1 ? "" : "s"} trending up`}
          detail={risingDistricts.slice(0, 3).map((h) => h.district).join(", ") || "No districts above baseline"}
        />
        <WarnCard
          icon={TrendingUp}
          tone={risingTypes.length ? "warning" : "success"}
          title={`${risingTypes.length} crime type${risingTypes.length === 1 ? "" : "s"} spiking`}
          detail={risingTypes.slice(0, 3).map((t) => t.crime_type).join(", ") || "All within normal range"}
        />
        <WarnCard
          icon={UserSearch}
          tone="warning"
          title={`${repeat.filter((r) => r.probability >= 0.7).length} high-probability repeat offenders`}
          detail="Ranked by reoffense probability below"
        />
      </div>

      {/* Hotspot forecast */}
      <div className="card panel-pad">
        <div className="mb-3 flex items-center gap-2">
          <Radar className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold">Hotspot Forecast — next 30 days</h2>
          <Badge tone="accent"><Sparkles className="h-3 w-3" /> AI</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-muted">
              <tr>
                <th className="py-2 pr-4">District</th>
                <th className="py-2 pr-4">Trend</th>
                <th className="py-2 pr-4">Last 60d</th>
                <th className="py-2 pr-4">Baseline /mo</th>
                <th className="py-2 pr-4">Ratio</th>
                <th className="py-2 pr-4">Confidence</th>
                <th className="py-2">Why</th>
              </tr>
            </thead>
            <tbody>
              {hotspots.map((h) => {
                const T = TREND_META[h.trend];
                return (
                  <tr key={h.district} className="border-t border-border/50">
                    <td className="py-2 pr-4 font-medium">{h.district}</td>
                    <td className={`py-2 pr-4 ${T.cls}`}>
                      <span className="flex items-center gap-1"><T.icon className="h-4 w-4" /> {T.label}</span>
                    </td>
                    <td className="py-2 pr-4 font-mono">{h.recent}</td>
                    <td className="py-2 pr-4 font-mono text-muted">{h.baselineMonthly}</td>
                    <td className={`py-2 pr-4 font-mono ${h.ratio >= 1.25 ? "text-danger" : h.ratio <= 0.75 ? "text-success" : "text-muted"}`}>{h.ratio}×</td>
                    <td className="py-2 pr-4"><Confidence value={h.confidence} /></td>
                    <td className="max-w-xs py-2 text-xs text-muted">{h.reasoning}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Repeat offender probability */}
        <div className="card panel-pad">
          <div className="mb-3 flex items-center gap-2">
            <UserSearch className="h-4 w-4 text-accent" />
            <h2 className="font-display text-base font-semibold">Repeat-Offense Probability</h2>
          </div>
          <div className="space-y-3">
            {repeat.map((r) => (
              <Link key={r.id} href={`/criminals/${r.id}`} className="block rounded-lg border border-border/60 p-3 transition-colors hover:border-accent/40">
                <div className="flex items-center gap-3">
                  <Avatar name={r.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{r.name}</div>
                    <div className="text-xs text-muted">{r.home_district} · {r.fir_count} FIRs</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-display text-xl font-bold ${r.probability >= 0.7 ? "text-danger" : r.probability >= 0.5 ? "text-warning" : "text-info"}`}>
                      {Math.round(r.probability * 100)}%
                    </div>
                    <div className="stat-label">reoffense</div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.factors.map((f, i) => <span key={i} className="chip text-[10px]">{f}</span>)}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.evidence.map((e, i) => <span key={i} className="font-mono text-[10px] text-muted">{e}</span>)}
                </div>
              </Link>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          {/* Escalation warnings */}
          <div className="card panel-pad">
            <div className="mb-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <h2 className="font-display text-base font-semibold">Crime Escalation Warnings</h2>
            </div>
            <div className="space-y-3">
              {escalations.length === 0 && <p className="text-sm text-muted">No escalation patterns detected.</p>}
              {escalations.map((e) => (
                <Link key={e.id} href={`/criminals/${e.id}`} className="block rounded-lg border border-warning/25 bg-warning/5 p-3 transition-colors hover:border-warning/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{e.name}</span>
                    <span className="ml-auto"><Confidence value={e.confidence} /></span>
                  </div>
                  <p className="mt-1 text-xs text-muted">{e.detail}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {e.evidence.map((ev, i) => <span key={i} className="font-mono text-[10px] text-muted">{ev}</span>)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Crime-type forecast */}
          <div className="card panel-pad">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-accent" />
              <h2 className="font-display text-base font-semibold">Crime-Type Momentum</h2>
            </div>
            <div className="space-y-1.5">
              {types.slice(0, 10).map((t) => {
                const T = TREND_META[t.trend];
                return (
                  <div key={t.crime_type} className="flex items-center gap-3 text-sm">
                    <T.icon className={`h-4 w-4 shrink-0 ${T.cls}`} />
                    <span className="flex-1">{t.crime_type}</span>
                    <span className="font-mono text-xs text-muted">{t.recent} in 60d</span>
                    <span className={`w-14 text-right font-mono text-xs ${t.ratio >= 1.25 ? "text-danger" : t.ratio <= 0.75 ? "text-success" : "text-muted"}`}>{t.ratio}×</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted">
        Methodology: forecasts compare the last 60 days against an 8-month baseline; reoffense probability combines
        offense count, recency, geographic spread and risk score. Every figure links back to the official CaseMaster
        records listed as evidence. Predictions assist — they never decide. All generations are audit-logged.
      </p>
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-elevated">
        <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs text-muted">{pct}%</span>
    </span>
  );
}

function WarnCard({ icon: Icon, tone, title, detail }: { icon: typeof Radar; tone: "danger" | "warning" | "success"; title: string; detail: string }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger/5" : tone === "warning" ? "border-warning/30 bg-warning/5" : "border-success/30 bg-success/5";
  const iconCls = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconCls}`} />
        <span className="text-sm font-semibold">{title}</span>
        <span className="ml-auto flex items-center gap-1 text-[10px] text-accent"><Sparkles className="h-3 w-3" /> AI</span>
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}
