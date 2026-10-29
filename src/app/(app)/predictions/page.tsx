"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useState } from "react";
import Link from "@/components/AppLink";
import {
  Radar, TrendingUp, TrendingDown, Minus, AlertTriangle, UserSearch, ShieldCheck, ScanSearch, Sparkles, CalendarDays,
} from "lucide-react";
import { fetchCloudPredictions, type CloudPredictionData } from "@/lib/cloud-predict";
import { PageHeader, PanelHeader, Badge, Avatar, EmptyState } from "@/components/ui";
import { useT } from "@/lib/i18n-client";


const TREND_META = {
  rising: { icon: TrendingUp, cls: "text-danger", tag: "border-danger/30 bg-danger/10 text-danger", bar: "var(--danger)", label: "Rising" },
  stable: { icon: Minus, cls: "text-muted", tag: "border-border bg-elevated/60 text-muted", bar: "var(--muted)", label: "Stable" },
  cooling: { icon: TrendingDown, cls: "text-success", tag: "border-success/30 bg-success/10 text-success", bar: "var(--success)", label: "Cooling" },
} as const;

const ratioCls = (r: number) => (r >= 1.25 ? "text-danger" : r <= 0.75 ? "text-success" : "text-muted");
const probText = (p: number) => (p >= 0.7 ? "text-danger" : p >= 0.5 ? "text-warning" : "text-info");
const probBar = (p: number) => (p >= 0.7 ? "var(--danger)" : p >= 0.5 ? "var(--warning)" : "var(--info)");

export default function PredictionsPage() {
  const ui = useUiText();
  const tPage = useT();
  const [data, setData] = useState<CloudPredictionData>({
    hotspots: [], repeat: [], escalations: [], types: [], model: "explainable-baseline",
    seasonality: { months: [], weekdays: [], peakMonth: "Not available", peakWeekday: "Not available", sampleSize: 0, eventCalendarAvailable: false },
  });
  useEffect(() => { fetchCloudPredictions().then(setData).catch(() => undefined); }, []);
  const { hotspots, repeat, escalations, types } = data;

  const risingDistricts = hotspots.filter((h) => h.trend === "rising");
  const risingTypes = types.filter((t) => t.trend === "rising");
  const highRepeat = repeat.filter((r) => r.probability >= 0.7);
  const maxTypeRatio = Math.max(1, ...types.map((t) => t.ratio));
  const maxMonthCount = Math.max(1, ...data.seasonality.months.map((month) => month.count));
  const maxWeekdayCount = Math.max(1, ...data.seasonality.weekdays.map((day) => day.count));

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title={tPage("pred.title")}
        subtitle={tPage("pred.subtitle")}
      >
        <Badge tone="muted"><ScanSearch className="h-3 w-3" /><UiText text={" 30-day outlook"} /></Badge>
        <Badge tone="accent"><ShieldCheck className="h-3 w-3" /><UiText text={" Explainable · human-in-the-loop"} /></Badge>
      </PageHeader>

      <section className="flex items-start gap-3 rounded-lg border border-info/35 bg-info/10 px-4 py-3 text-sm text-subtle" aria-label={ui("Prediction model disclosure")}>
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-info" />
        <div>
          <div className="font-semibold text-fg"><UiText text={"Explainable statistical baseline, not trained AutoML"} /></div>
          <p className="mt-0.5 text-xs leading-relaxed text-muted"><UiText text={"Catalyst Zia AutoML is unavailable for this India data-centre project. These decision-support signals are computed from schema-aligned Cloud Scale records and always require officer verification."} /></p>
        </div>
      </section>

      {/* Early-warning strip */}
      <section aria-label={ui("Early-warning signals")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <WarnCard
          icon={Radar}
          tone={risingDistricts.length ? "danger" : "success"}
          count={risingDistricts.length}
          total={hotspots.length}
          label={ui("Districts trending up")}
          detail={risingDistricts.slice(0, 3).map((h) => h.district).join(", ") || "No districts above baseline"}
        />
        <WarnCard
          icon={TrendingUp}
          tone={risingTypes.length ? "warning" : "success"}
          count={risingTypes.length}
          total={types.length}
          label={ui("Crime types spiking")}
          detail={risingTypes.slice(0, 3).map((t) => t.crime_type).join(", ") || "All within normal range"}
        />
        <WarnCard
          icon={UserSearch}
          tone={highRepeat.length ? "warning" : "success"}
          count={highRepeat.length}
          total={repeat.length}
          label={ui("High-probability repeat offenders")}
          detail={highRepeat.length ? "≥70% reoffense likelihood — ranked below" : "None above the 70% threshold"}
        />
      </section>

      {/* Hotspot forecast */}
      <section className="card panel-pad">
        <PanelHeader
          icon={Radar}
          title={ui("Hotspot Forecast")}
          count={hotspots.length}
          sub={ui("Next 30 days · last 60 days measured against an 8-month district baseline")}
          action={<Badge tone="accent"><Sparkles className="h-3 w-3" /> <UiText text={data.model === "zia-automl" ? "Zia AutoML" : "Explainable baseline"} /></Badge>}
        />
        {hotspots.length === 0 ? (
          <EmptyState icon={Radar} title={ui("No forecast yet")} hint={ui("District forecasts appear once enough FIRs exist to establish a baseline.")} />
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="py-2 pr-4 font-semibold"><UiText text={"District"} /></th>
                  <th className="py-2 pr-4 font-semibold"><UiText text={"Trend"} /></th>
                  <th className="py-2 pr-4 text-right font-semibold"><UiText text={"Last 60d"} /></th>
                  <th className="py-2 pr-4 text-right font-semibold"><UiText text={"Baseline /mo"} /></th>
                  <th className="py-2 pr-4 text-right font-semibold"><UiText text={"Ratio"} /></th>
                  <th className="py-2 pr-4 font-semibold"><UiText text={"Confidence"} /></th>
                  <th className="py-2 font-semibold"><UiText text={"Rationale"} /></th>
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
                          <span className="font-medium"><UiText text={h.district} /></span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-2.5 pr-4">
                        <TrendTag trend={h.trend} />
                      </td>
                      <td className="py-2.5 pr-4 text-right font-mono font-semibold tabular-nums"><UiText text={h.recent} /></td>
                      <td className="py-2.5 pr-4 text-right font-mono tabular-nums text-muted"><UiText text={h.baselineMonthly} /></td>
                      <td className={`py-2.5 pr-4 text-right font-mono font-semibold tabular-nums ${ratioCls(h.ratio)}`}><UiText text={h.ratio} />×</td>
                      <td className="py-2.5 pr-4"><Confidence value={h.confidence} /></td>
                      <td className="max-w-xs py-2.5 text-xs leading-relaxed text-muted"><UiText text={h.reasoning} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card panel-pad">
        <PanelHeader
          icon={CalendarDays}
          title={ui("Seasonal and Weekly Pattern")}
          count={data.seasonality.sampleSize}
          sub={ui("Observed occurrence dates from official CaseMaster records")}
          action={<Badge tone="muted"><UiText text={"Event calendar not supplied"} /></Badge>}
        />
        {data.seasonality.sampleSize === 0 ? (
          <EmptyState icon={CalendarDays} title={ui("No temporal pattern yet")} hint={ui("Occurrence dates are required for seasonal analysis.")} />
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="stat-label"><UiText text={"Month concentration"} /></span>
                <span className="text-xs text-muted"><UiText text={"Peak: "} /><strong className="text-fg"><UiText text={data.seasonality.peakMonth} /></strong></span>
              </div>
              <div className="grid h-36 grid-cols-12 items-end gap-1.5 border-b border-border px-1 pb-1" aria-label={ui("Monthly FIR distribution")}>
                {data.seasonality.months.map((month) => (
                  <div key={month.label} className="flex h-full min-w-0 flex-col justify-end" title={`${month.label}: ${month.count} FIRs, index ${month.index}`}>
                    <span className="mb-1 text-center font-mono text-[9px] tabular-nums text-muted"><UiText text={month.count} /></span>
                    <span className="min-h-1 w-full bg-accent/80" style={{ height: `${Math.max(4, month.count / maxMonthCount * 92)}px` }} />
                    <span className="mt-1 truncate text-center text-[9px] text-muted"><UiText text={month.label} /></span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="stat-label"><UiText text={"Day of week"} /></span>
                <span className="text-xs text-muted"><UiText text={"Peak: "} /><strong className="text-fg"><UiText text={data.seasonality.peakWeekday} /></strong></span>
              </div>
              <div className="space-y-2">
                {data.seasonality.weekdays.map((day) => (
                  <div key={day.label} className="grid grid-cols-[30px_1fr_76px] items-center gap-2 text-xs">
                    <span className="text-muted"><UiText text={day.label} /></span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-elevated">
                      <span className="block h-full rounded-full bg-info" style={{ width: `${day.count / maxWeekdayCount * 100}%` }} />
                    </span>
                    <span className="text-right font-mono tabular-nums text-subtle"><UiText text={day.count} /> · <UiText text={day.share} />%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        <p className="mt-4 border-t border-border pt-2 text-[10.5px] leading-relaxed text-muted"><UiText text={"This panel describes historical concentration only. NETRA does not attribute spikes to festivals, protests, elections, or other events because no approved event calendar is present in the supplied schema."} /></p>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Repeat offender probability */}
        <section className="card panel-pad">
          <PanelHeader
            icon={UserSearch}
            title={ui("Repeat-Offense Probability")}
            count={repeat.length}
            sub={ui("Offense count, recency, geographic spread & risk score")}
            action={highRepeat.length ? <Badge tone="danger"><UiText text={highRepeat.length} /><UiText text={" high"} /></Badge> : undefined}
          />
          {repeat.length === 0 ? (
            <EmptyState icon={UserSearch} title={ui("No repeat offenders")} hint={ui("Profiles with two or more linked FIRs are scored here.")} />
          ) : (
            <ol className="space-y-2.5">
              {repeat.map((r, i) => {
                const pct = Math.round(r.probability * 100);
                return (
                  <li key={r.id}>
                    <Link
                      href={`/criminals/record?id=${r.id}`}
                      className="group block rounded-lg border border-border/60 bg-elevated/20 p-3 transition-colors hover:border-accent/40 hover:bg-elevated/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border/70 bg-surface/60 font-mono text-[10px] tabular-nums text-muted">{i + 1}</span>
                        <Avatar name={r.name} size={34} profileId={r.id} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium transition-colors group-hover:text-accent"><UiText text={r.name} /></div>
                          <div className="truncate text-xs text-muted">
                            <UiText text={r.home_district} /> · <UiText text={r.fir_count} /><UiText text={" FIRs"} />{r.days_since_last != null && <><UiText text={" · last "} /><UiText text={r.days_since_last} /><UiText text={"d ago"} /></>}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className={`font-display text-xl font-bold tabular-nums ${probText(r.probability)}`}><UiText text={pct} />%</div>
                          <div className="stat-label"><UiText text={"reoffense"} /></div>
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
                        {r.factors.map((f, j) => <span key={j} className="chip text-[10px]"><UiText text={f} /></span>)}
                      </div>
                      {r.evidence.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/40 pt-2">
                          <span className="stat-label"><UiText text={"Evidence"} /></span>
                          {r.evidence.map((e, j) => <span key={j} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted"><UiText text={e} /></span>)}
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
              title={ui("Crime Escalation Warnings")}
              count={escalations.length}
              sub={ui("Offenders whose recent offenses are more severe than earlier ones")}
            />
            {escalations.length === 0 ? (
              <EmptyState icon={ShieldCheck} title={ui("No escalation detected")} hint={ui("Severity trajectories are stable across all linked offenders.")} />
            ) : (
              <div className="space-y-2.5">
                {escalations.map((e) => (
                  <Link
                    key={e.id}
                    href={`/criminals/record?id=${e.id}`}
                    className="group block rounded-lg border-l-2 border-warning/60 bg-warning/[0.06] py-2.5 pl-3 pr-3 transition-colors hover:bg-warning/10"
                  >
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-3.5 w-3.5 shrink-0 text-warning" />
                      <span className="truncate text-sm font-semibold transition-colors group-hover:text-warning"><UiText text={e.name} /></span>
                      <span className="ml-auto shrink-0"><Confidence value={e.confidence} /></span>
                    </div>
                    <p className="mt-1 pl-5 text-xs leading-relaxed text-muted"><UiText text={e.detail} /></p>
                    <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
                      {e.evidence.map((ev, i) => <span key={i} className="rounded border border-border/60 bg-surface/50 px-1.5 py-0.5 font-mono text-[10px] text-muted"><UiText text={ev} /></span>)}
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
              title={ui("Crime-Type Momentum")}
              count={types.length}
              sub={ui("60-day volume vs the same 8-month baseline")}
              action={risingTypes.length ? <Badge tone="warning"><UiText text={risingTypes.length} /><UiText text={" rising"} /></Badge> : undefined}
            />
            {types.length === 0 ? (
              <EmptyState icon={TrendingUp} title={ui("No categories yet")} hint={ui("Momentum ranks appear once offenses are recorded.")} />
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
                        <div className="truncate"><UiText text={t.crime_type} /></div>
                        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-elevated/80">
                          <span className="block h-full rounded-full" style={{ width: `${w}%`, background: `rgb(${T.bar})` }} />
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted"><UiText text={t.recent} /><span className="text-subtle">/60d</span></span>
                      <span className={`w-12 shrink-0 text-right font-mono text-xs font-semibold tabular-nums ${ratioCls(t.ratio)}`}><UiText text={t.ratio} />×</span>
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
            <div className="stat-label"><UiText text={"Methodology & governance"} /></div>
            <p className="mt-1.5 max-w-4xl text-xs leading-relaxed text-muted"><UiText text={"Forecasts compare the last 60 days against an 8-month baseline; reoffense probability combines offense count, recency, geographic spread and risk score. Every figure links back to the official CaseMaster records listed as evidence. This is a transparent statistical baseline, not a trained AutoML model. Predictions assist — they never decide. All generations are audit-logged."} /></p>
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
      <T.icon className="h-3 w-3 shrink-0" /> <UiText text={T.label} />
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
      <span className="font-mono text-xs tabular-nums text-muted"><UiText text={pct} />%</span>
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
        <span className="stat-label"><UiText text={label} /></span>
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
          <Icon className={`h-3.5 w-3.5 ${text}`} />
        </span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`font-display text-[1.7rem] font-bold leading-none tabular-nums ${text}`}><UiText text={count} /></span>
        {total != null && <span className="font-mono text-sm tabular-nums text-subtle">/ <UiText text={total} /></span>}
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted"><UiText text={detail} /></p>
    </div>
  );
}
