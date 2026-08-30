import Link from "next/link";
import {
  Radar, TrendingUp, TrendingDown, Minus, AlertTriangle, UserSearch, ShieldCheck, ScanSearch,
} from "lucide-react";
import { hotspotForecasts, repeatOffenderPredictions, escalationWarnings, crimeTypeForecasts } from "@/lib/predict";
import { PageHeader, PanelHeader, Badge, Avatar, EmptyState } from "@/components/ui";
import { getT } from "@/lib/i18n-server";


const TREND_META = {
  rising: { icon: TrendingUp, cls: "text-danger", tag: "border-danger/30 bg-danger/10 text-danger", bar: "var(--danger)", label: "Rising" },
  stable: { icon: Minus, cls: "text-muted", tag: "border-border bg-elevated/60 text-muted", bar: "var(--muted)", label: "Stable" },
  cooling: { icon: TrendingDown, cls: "text-success", tag: "border-success/30 bg-success/10 text-success", bar: "var(--success)", label: "Cooling" },
} as const;

const ratioCls = (r: number) => (r >= 1.25 ? "text-danger" : r <= 0.75 ? "text-success" : "text-muted");
const probText = (p: number) => (p >= 0.7 ? "text-danger" : p >= 0.5 ? "text-warning" : "text-info");
const probBar = (p: number) => (p >= 0.7 ? "var(--danger)" : p >= 0.5 ? "var(--warning)" : "var(--info)");

export default function PredictionsPage() {
  const tPage = getT();
  const hotspots = hotspotForecasts();
  const repeat = repeatOffenderPredictions(12);
  const escalations = escalationWarnings();
  const types = crimeTypeForecasts();

  const risingDistricts = hotspots.filter((h) => h.trend === "rising");
  const risingTypes = types.filter((t) => t.trend === "rising");
  const highRepeat = repeat.filter((r) => r.probability >= 0.7);
  const maxTypeRatio = Math.max(1, ...types.map((t) => t.ratio));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={tPage("pred.title")}
        subtitle={tPage("pred.subtitle")}
      >
        <Badge tone="muted"><ScanSearch className="h-3 w-3" /> 30-day outlook</Badge>
        <Badge tone="accent"><ShieldCheck className="h-3 w-3" /> Explainable · human-in-the-loop</Badge>
      </PageHeader>

      {/* Early-warning strip */}
      <section aria-label="Early-warning signals" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <WarnCard
          icon={Radar}
          tone={risingDistricts.length ? "danger" : "success"}
          count={risingDistricts.length}
          total={hotspots.length}
          label="Districts trending up"
          detail={risingDistricts.slice(0, 3).map((h) => h.district).join(", ") || "No districts above baseline"}
        />
        <WarnCard
          icon={TrendingUp}
          tone={risingTypes.length ? "warning" : "success"}
          count={risingTypes.length}
          total={types.length}
          label="Crime types spiking"
          detail={risingTypes.slice(0, 3).map((t) => t.crime_type).join(", ") || "All within normal range"}
        />
        <WarnCard
          icon={UserSearch}
          tone={highRepeat.length ? "warning" : "success"}
          count={highRepeat.length}
          total={repeat.length}
          label="High-probability repeat offenders"
          detail={highRepeat.length ? "≥70% reoffense likelihood — ranked below" : "None above the 70% threshold"}
        />
      </section>

      {/* Hotspot forecast */}
      <section className="card panel-pad">
        <PanelHeader
          icon={Radar}
          title="Hotspot Forecast"
          count={hotspots.length}
          sub="30-day outlook · 60-day window vs 8-month district baseline"
          action={
            risingDistricts.length
              ? <Badge tone="danger">{risingDistricts.length} rising</Badge>
              : <Badge tone="success">all stable</Badge>
          }
        />
        {hotspots.length === 0 ? (
          <EmptyState icon={Radar} title="No forecast yet" hint="District forecasts appear once enough FIRs exist to establish a baseline." />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-4 font-semibold">District</th>
                  <th className="py-2 pr-4 font-semibold">Trend</th>
                  <th className="py-2 pr-4 text-right font-semibold">Last 60d</th>
                  <th className="py-2 pr-4 text-right font-semibold">Baseline /mo</th>
                  <th className="py-2 pr-4 text-right font-semibold">Ratio</th>
                  <th className="py-2 pr-4 font-semibold">Confidence</th>
                  <th className="py-2 font-semibold">Rationale</th>
                </tr>
              </thead>
              <tbody>
                {hotspots.map((h) => {
                  const T = TREND_META[h.trend];
                  return (
                    <tr key={h.district} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <span className="flex items-center gap-2">
                          <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${h.trend === "rising" ? "bg-danger" : h.trend === "cooling" ? "bg-success" : "bg-muted"}`} />
                          <span className="font-medium">{h.district}</span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <TrendTag trend={h.trend} />
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-semibold tabular-nums">{h.recent}</td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-muted">{h.baselineMonthly}</td>
                      <td className={`py-2.5 pr-4 text-right font-mono font-semibold tabular-nums ${ratioCls(h.ratio)}`}>{h.ratio}×</td>
                      <td className="py-2.5 pr-4"><Confidence value={h.confidence} /></td>
                      <td className="max-w-xs py-2.5 text-xs leading-relaxed text-muted">{h.reasoning}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Repeat offender probability */}
        <section className="card panel-pad">
          <PanelHeader
            icon={UserSearch}
            title="Repeat-Offense Probability"
            count={repeat.length}
            sub="Offense count, recency, geographic spread & risk score"
            action={highRepeat.length ? <Badge tone="danger">{highRepeat.length} high</Badge> : undefined}
          />
          {repeat.length === 0 ? (
            <EmptyState icon={UserSearch} title="No repeat offenders" hint="Profiles with two or more linked FIRs are scored here." />
          ) : (
            <ol className="space-y-2.5">
              {repeat.map((r, i) => {
                const pct = Math.round(r.probability * 100);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/criminals/${r.id}`}
                      className="group block rounded-lg border border-border/60 bg-elevated/20 p-3 transition-colors hover:border-accent/40 hover:bg-elevated/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border/70 bg-surface/60 font-mono text-[10px] tabular-nums text-muted">{i + 1}</span>
                        <Avatar name={r.name} size={34} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium transition-colors group-hover:text-accent">{r.name}</div>
                          <div className="truncate text-xs text-muted">
                            {r.home_district} · {r.fir_count} FIRs
                            {r.days_since_last != null && <> · last {r.days_since_last}d ago</>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`font-display text-xl font-bold tabular-nums ${probText(r.probability)}`}>{pct}%</div>
                          <div className="stat-label">reoffense</div>
                        </div>
                      </div>
                      <div
                        className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/50"
                        role="meter"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label={`Reoffense probability ${pct}%`}
                      >
                        <span className="block h-full rounded-full" style={{ width: `${pct}%`, background: `rgb(${probBar(r.probability)})` }} />
                      </div>
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {r.factors.map((f, j) => <span key={j} className="chip text-[10px]">{f}</span>)}
                      </div>
                      {r.evidence.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
                          <span className="stat-label">Evidence</span>
                          {r.evidence.map((e, j) => <span key={j} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted">{e}</span>)}
                        </div>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <div className="space-y-5">
          {/* Escalation warnings */}
          <section className="card panel-pad">
            <PanelHeader
              icon={AlertTriangle}
              tone="warning"
              title="Crime Escalation Warnings"
              count={escalations.length}
              sub="Offenders whose recent offenses are more severe than earlier ones"
            />
            {escalations.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No escalation detected" hint="Severity trajectories are stable across all linked offenders." />
            ) : (
              <div className="space-y-2.5">
                {escalations.map((e) => (
                  <Link
                    key={e.id}
                    href={`/criminals/${e.id}`}
                    className="group block rounded-lg border-l-2 border-warning/60 bg-warning/[0.06] py-2.5 pl-3 pr-3 transition-colors hover:bg-warning/10"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="truncate text-sm font-semibold transition-colors group-hover:text-warning">{e.name}</span>
                      <span className="ml-auto shrink-0"><Confidence value={e.confidence} /></span>
                    </div>
                    <p className="mt-1 pl-5 text-xs leading-relaxed text-muted">{e.detail}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                      {e.evidence.map((ev, i) => <span key={i} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted">{ev}</span>)}
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* Crime-type forecast */}
          <section className="card panel-pad">
            <PanelHeader
              icon={TrendingUp}
              title="Crime-Type Momentum"
              count={types.length}
              sub="60-day volume vs the same 8-month baseline"
              action={risingTypes.length ? <Badge tone="warning">{risingTypes.length} rising</Badge> : undefined}
            />
            {types.length === 0 ? (
              <EmptyState icon={TrendingUp} title="No categories yet" hint="Momentum ranks appear once offenses are recorded." />
            ) : (
              <ol className="divide-y divide-border/40">
                {types.slice(0, 10).map((t, i) => {
                  const T = TREND_META[t.trend];
                  const w = Math.max(6, Math.round((t.ratio / maxTypeRatio) * 100));
                  return (
                    <li key={t.crime_type} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-elevated/40">
                      <span className="w-4 shrink-0 text-right font-mono text-[11px] tabular-nums text-subtle">{i + 1}</span>
                      <T.icon className={`h-3.5 w-3.5 shrink-0 ${T.cls}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate">{t.crime_type}</div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-elevated/80">
                          <span className="block h-full rounded-full" style={{ width: `${w}%`, background: `rgb(${T.bar})` }} />
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{t.recent}<span className="text-subtle">/60d</span></span>
                      <span className={`w-12 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${ratioCls(t.ratio)}`}>{t.ratio}×</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      </div>

      {/* Methodology & governance */}
      <section className="rounded-lg border border-border/60 bg-surface/30 panel-pad">
        <div className="flex items-start gap-2.5">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
            <ShieldCheck className="h-3.5 w-3.5 text-accent" />
          </span>
          <div className="min-w-0">
            <div className="stat-label">Methodology &amp; governance</div>
            <p className="mt-1.5 max-w-4xl text-xs leading-relaxed text-muted">
              Forecasts compare the last 60 days against an 8-month baseline; reoffense probability combines
              offense count, recency, geographic spread and risk score. Every figure links back to the official CaseMaster
              records listed as evidence. Predictions assist — they never decide. All generations are audit-logged.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** Squared trend tag for tables — icon + label, tone-colored, never full-round. */
function TrendTag({ trend }: { trend: keyof typeof TREND_META }) {
  const T = TREND_META[trend];
  return (
    <span className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium ${T.tag}`}>
      <T.icon className="h-3 w-3 shrink-0" /> {T.label}
    </span>
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

/** Restrained early-warning tile — a flat panel with a status edge and a lead figure. No glow. */
function WarnCard({
  icon: Icon, tone, count, total, label, detail,
}: {
  icon: typeof Radar;
  tone: "danger" | "warning" | "success";
  count: number;
  total?: number;
  label: string;
  detail: string;
}) {
  const border = tone === "danger" ? "border-danger/30" : tone === "warning" ? "border-warning/30" : "border-success/30";
  const bg = tone === "danger" ? "bg-danger/[0.05]" : tone === "warning" ? "bg-warning/[0.05]" : "bg-success/[0.05]";
  const edge = tone === "danger" ? "bg-danger" : tone === "warning" ? "bg-warning" : "bg-success";
  const text = tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-success";
  return (
    <div className={`relative overflow-hidden rounded-lg border ${border} ${bg} panel-pad`}>
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${edge}`} />
      <div className="flex items-start justify-between gap-3">
        <span className="stat-label">{label}</span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
          <Icon className={`h-3.5 w-3.5 ${text}`} />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-[1.7rem] font-bold leading-none tabular-nums ${text}`}>{count}</span>
        {total != null && <span className="font-mono text-sm tabular-nums text-subtle">/ {total}</span>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted">{detail}</p>
    </div>
  );
}
