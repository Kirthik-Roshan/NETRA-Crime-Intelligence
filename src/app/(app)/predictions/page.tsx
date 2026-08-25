import Link from "next/link";
import {
  Radar, TrendingUp, TrendingDown, Minus, AlertTriangle, UserSearch, Sparkles, ShieldCheck,
} from "lucide-react";
import { hotspotForecasts, repeatOffenderPredictions, escalationWarnings, crimeTypeForecasts } from "@/lib/predict";
import { PageHeader, Badge, Avatar, EmptyState } from "@/components/ui";
import { getT } from "@/lib/i18n-server";


const TREND_META = {
  rising: { icon: TrendingUp, cls: "text-danger", label: "Rising" },
  stable: { icon: Minus, cls: "text-muted", label: "Stable" },
  cooling: { icon: TrendingDown, cls: "text-success", label: "Cooling" },
} as const;

export default function PredictionsPage() {
  const tPage = getT();
  const hotspots = hotspotForecasts();
  const repeat = repeatOffenderPredictions(12);
  const escalations = escalationWarnings();
  const types = crimeTypeForecasts();

  const risingDistricts = hotspots.filter((h) => h.trend === "rising");
  const risingTypes = types.filter((t) => t.trend === "rising");

  return (
    <div className="animate-fade-in space-y-6">
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
        <CardHead
          icon={Radar}
          title="Hotspot Forecast"
          sub="Next 30 days · last 60 days measured against an 8-month district baseline"
          action={<Badge tone="accent"><Sparkles className="h-3 w-3" /> AI</Badge>}
        />
        {hotspots.length === 0 ? (
          <EmptyState icon={Radar} title="No forecast yet" hint="District forecasts appear once enough FIRs exist to establish a baseline." />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border/70 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-4">District</th>
                  <th className="py-2 pr-4">Trend</th>
                  <th className="py-2 pr-4 text-right">Last 60d</th>
                  <th className="py-2 pr-4 text-right">Baseline /mo</th>
                  <th className="py-2 pr-4 text-right">Ratio</th>
                  <th className="py-2 pr-4">Confidence</th>
                  <th className="py-2">Why</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h) => {
                  const T = TREND_META[h.trend];
                  return (
                    <tr key={h.district} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                      <td className="whitespace-nowrap py-2.5 pr-4 font-medium">{h.district}</td>
                      <td className={`whitespace-nowrap py-2.5 pr-4 ${T.cls}`}>
                        <span className="flex items-center gap-1.5 text-xs font-medium"><T.icon className="h-3.5 w-3.5 shrink-0" /> {T.label}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums">{h.recent}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-muted">{h.baselineMonthly}</td>
                      <td className={`py-2.5 pr-4 text-right font-mono font-semibold tabular-nums ${h.ratio >= 1.25 ? "text-danger" : h.ratio <= 0.75 ? "text-success" : "text-muted"}`}>{h.ratio}×</td>
                      <td className="py-2.5 pr-4"><Confidence value={h.confidence} /></td>
                      <td className="max-w-xs py-2.5 text-xs leading-relaxed text-muted">{h.reasoning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Repeat offender probability */}
        <div className="card panel-pad">
          <CardHead
            icon={UserSearch}
            title="Repeat-Offense Probability"
            sub="Offense count, recency, geographic spread and risk score"
            action={<Badge tone="muted">{repeat.length}</Badge>}
          />
          {repeat.length === 0 ? (
            <EmptyState icon={UserSearch} title="No repeat offenders" hint="Profiles with two or more linked FIRs are scored here." />
          ) : (
            <div className="space-y-2.5">
              {repeat.map((r) => (
                <Link
                  key={r.id}
                  href={`/criminals/${r.id}`}
                  className="group block rounded-lg border border-border/60 bg-elevated/20 p-3 transition-colors hover:border-accent/40 hover:bg-elevated/50"
                >
                  <div className="flex items-center gap-3">
                    <Avatar name={r.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium transition-colors group-hover:text-accent">{r.name}</div>
                      <div className="truncate text-xs text-muted">{r.home_district} · {r.fir_count} FIRs</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`font-display text-xl font-bold tabular-nums ${r.probability >= 0.7 ? "text-danger" : r.probability >= 0.5 ? "text-warning" : "text-info"}`}>
                        {Math.round(r.probability * 100)}%
                      </div>
                      <div className="stat-label">reoffense</div>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {r.factors.map((f, i) => <span key={i} className="chip text-[10px]">{f}</span>)}
                  </div>
                  {r.evidence.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
                      <span className="stat-label">Evidence</span>
                      {r.evidence.map((e, i) => <span key={i} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted">{e}</span>)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          {/* Escalation warnings */}
          <div className="card panel-pad">
            <CardHead
              icon={AlertTriangle}
              iconCls="text-warning"
              title="Crime Escalation Warnings"
              sub="Offenders whose recent offences are more severe than earlier ones"
            />
            {escalations.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No escalation detected" hint="Severity trajectories are stable across all linked offenders." />
            ) : (
              <div className="space-y-2.5">
                {escalations.map((e) => (
                  <Link
                    key={e.id}
                    href={`/criminals/${e.id}`}
                    className="group block rounded-lg border border-warning/25 bg-warning/5 p-3 transition-colors hover:border-warning/50 hover:bg-warning/10"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{e.name}</span>
                      <span className="ml-auto shrink-0"><Confidence value={e.confidence} /></span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{e.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {e.evidence.map((ev, i) => <span key={i} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted">{ev}</span>)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Crime-type forecast */}
          <div className="card panel-pad">
            <CardHead
              icon={TrendingUp}
              title="Crime-Type Momentum"
              sub="Recent 60-day volume against the same 8-month baseline"
            />
            {types.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No categories yet" hint="Momentum ranks appear once offences are recorded." />
            ) : (
              <div className="divide-y divide-border/40">
                {types.slice(0, 10).map((t) => {
                  const T = TREND_META[t.trend];
                  return (
                    <div key={t.crime_type} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-elevated/40">
                      <T.icon className={`h-4 w-4 shrink-0 ${T.cls}`} />
                      <span className="min-w-0 flex-1 truncate">{t.crime_type}</span>
                      <span className="shrink-0 font-mono text-xs tabular-nums text-muted">{t.recent} in 60d</span>
                      <span className={`w-14 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${t.ratio >= 1.25 ? "text-danger" : t.ratio <= 0.75 ? "text-success" : "text-muted"}`}>{t.ratio}×</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 bg-surface/30 p-4">
        <div className="stat-label flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Methodology &amp; governance</div>
        <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted">
          Forecasts compare the last 60 days against an 8-month baseline; reoffense probability combines
          offense count, recency, geographic spread and risk score. Every figure links back to the official CaseMaster
          records listed as evidence. Predictions assist — they never decide. All generations are audit-logged.
        </p>
      </div>
    </div>
  );
}

/** Card header — icon, title, one-line method note, optional right-hand action. */
function CardHead({
  icon: Icon, title, sub, action, iconCls = "text-accent",
}: { icon: typeof Radar; title: string; sub?: string; action?: React.ReactNode; iconCls?: string }) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 font-display text-base font-semibold">
          <Icon className={`h-4 w-4 shrink-0 ${iconCls}`} /> {title}
        </h2>
        {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function Confidence({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-1.5" title={`Model confidence ${pct}%`}>
      <span className="h-1.5 w-12 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
        <span className="block h-full rounded-full bg-accent transition-[width] duration-500 ease-out" style={{ width: `${pct}%` }} />
      </span>
      <span className="font-mono text-xs tabular-nums text-muted">{pct}%</span>
    </span>
  );
}

function WarnCard({ icon: Icon, tone, title, detail }: { icon: typeof Radar; tone: "danger" | "warning" | "success"; title: string; detail: string }) {
  const cls = tone === "danger" ? "border-danger/30 bg-danger/5 hover:border-danger/50" : tone === "warning" ? "border-warning/30 bg-warning/5 hover:border-warning/50" : "border-success/30 bg-success/5 hover:border-success/50";
  const iconCls = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success";
  return (
    <div className={`rounded-xl border p-4 transition-colors ${cls}`}>
      <div className="flex items-start gap-2.5">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/50 bg-elevated/50">
          <Icon className={`h-3.5 w-3.5 ${iconCls}`} />
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold leading-snug">{title}</span>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium text-accent">
          <Sparkles className="h-3 w-3" /> AI
        </span>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}
