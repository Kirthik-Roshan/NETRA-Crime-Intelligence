"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart3, FolderKanban, AlertTriangle, Users, Fingerprint, Clock,
  Flame, MapPin, Radar, Activity, Database, ArrowRight, ScanText,
  Network, Phone, Car, Landmark,
} from "lucide-react";
import { PageHeader, StatCard, Badge, Avatar, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { MapPanel } from "@/components/maps/MapPanel";
import { fetchDashboard, type DashboardData } from "@/lib/cloudscale";
import { fetchCriminals } from "@/lib/cloudscale";
import { fetchCases } from "@/lib/cloudscale";
import { listOcr } from "@/lib/ai-client";
import { ReadAloud } from "@/components/ReadAloud";
import { Translated } from "@/components/Translated";
import type { CrimRow } from "@/components/criminals/CriminalsList";
import type { CaseRow } from "@/components/cases/CasesList";

const EMPTY: DashboardData = {
  stats: { activeCases: 0, critical: 0, totalFirs: 0, atLarge: 0, arrests30: 0, solveRate: 0 },
  trend: [], byType: [], hotspots: [], geo: [],
  heat: [], velocity: { open: 0, active: 0, closed: 0, escalated: 0, avgClosureDays: 0 },
  confidence: { dataQuality: 0, caseLinkage: 0, patternSignal: 0, extractionReadiness: 0, overall: 0 },
};
const PRI = { critical: 0, high: 1, medium: 2, low: 3 } as Record<string, number>;

export default function AnalyticsPage() {
  const [d, setD] = useState<DashboardData | null>(null);
  const [criminals, setCriminals] = useState<CrimRow[]>([]);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [ocr, setOcr] = useState(0);
  const [sel, setSel] = useState<number | null>(null);

  useEffect(() => {
    fetchDashboard().then(setD).catch(() => setD(EMPTY));
    fetchCriminals().then(setCriminals).catch(() => setCriminals([]));
    fetchCases().then(setCases).catch(() => setCases([]));
    listOcr().then((r) => setOcr(r.length)).catch(() => setOcr(0));
  }, []);

  const { stats, byType, hotspots, geo, heat, velocity } = d ?? EMPTY;
  const ranked = useMemo(() => [...criminals].sort((a, b) => (b.risk_score - a.risk_score) || (b.fir_count - a.fir_count)), [criminals]);
  const repeat = criminals.filter((c) => c.fir_count > 1).length;
  const active = useMemo(() => ranked.find((c) => c.id === sel) ?? ranked[0] ?? null, [ranked, sel]);
  const queue = useMemo(() => [...cases].sort((a, b) => (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9)).slice(0, 6), [cases]);

  // Cross-case connections — derived proxies (no link tables in Cloud Scale yet).
  const links = useMemo(() => {
    const districts = new Set(cases.map((c) => c.district).filter(Boolean));
    const types = new Set(cases.map((c) => c.crime_type).filter(Boolean));
    const groups = new Map<string, number>();
    for (const c of cases) if (c.district && c.crime_type) groups.set(`${c.district}|${c.crime_type}`, (groups.get(`${c.district}|${c.crime_type}`) ?? 0) + 1);
    const linkedCases = cases.filter((c) => c.district && c.crime_type && (groups.get(`${c.district}|${c.crime_type}`) ?? 0) > 1).length;
    return {
      linkedCases,
      entities: [
        { icon: MapPin, label: "Locations", value: districts.size, cls: "text-info", note: "distinct districts" },
        { icon: Fingerprint, label: "Modus Operandi", value: types.size, cls: "text-warning", note: "distinct crime types" },
        { icon: Users, label: "Associates", value: criminals.length, cls: "text-accent", note: "profiles on record" },
        { icon: Phone, label: "Phone Numbers", value: 0, cls: "text-muted", note: "needs Data Store link tables" },
        { icon: Car, label: "Vehicles", value: 0, cls: "text-muted", note: "needs Data Store link tables" },
        { icon: Landmark, label: "Bank Accounts", value: 0, cls: "text-muted", note: "needs Data Store link tables" },
      ],
    };
  }, [cases, criminals]);

  const heat30 = heat.find((h) => h.key === "30d");
  const summary = [
    byType[0] && `${byType[0].crime_type} leads with ${byType[0].count} FIRs on record.`,
    hotspots[0] && `${hotspots[0].district} is the top hotspot (${hotspots[0].cases} FIRs).`,
    heat30 && `Incidents ${heat30.delta >= 0 ? "up" : "down"} ${Math.abs(heat30.delta)}% over the last 30 days.`,
    repeat > 0 && `${repeat} repeat offenders across the state.`,
  ].filter(Boolean) as string[];

  const threats = hotspots.slice(0, 4).map((h, i) => ({
    title: `Elevated activity in ${h.district}`,
    detail: `${h.cases} FIRs registered · ${byType[i]?.crime_type ?? "mixed offences"}`,
    tone: (i === 0 ? "danger" : i < 2 ? "warning" : "info") as "danger" | "warning" | "info",
  }));

  const perf = [
    { label: "FIRs Filed", value: stats.totalFirs, max: Math.max(1, stats.totalFirs), color: "bg-info" },
    { label: "FIRs Closed", value: velocity.closed, max: Math.max(1, stats.totalFirs), color: "bg-success" },
    { label: "Escalated", value: velocity.escalated, max: Math.max(1, stats.totalFirs), color: "bg-warning" },
    { label: "Solve Rate", value: stats.solveRate, max: 100, color: "bg-accent", pct: true },
  ];

  return (
    <div className="space-y-5">
      <PageHeader title="Crime Intelligence Overview" subtitle="Real-time intelligence and investigation insights · from Cloud Scale">
        <Link href="/database?table=firs" className="btn-ghost h-9 text-xs"><Database className="h-4 w-4" /> Open in database</Link>
      </PageHeader>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {d === null ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card panel-pad">
              <div className="skeleton h-3 w-20" />
              <div className="skeleton mt-3 h-7 w-16" />
            </div>
          ))
        ) : (
          <>
            <StatCard label="Total Cases" value={cases.length || stats.totalFirs} icon={BarChart3} tone="accent" />
            <StatCard label="Open Investigations" value={stats.activeCases} icon={FolderKanban} />
            <StatCard label="Critical Alerts" value={stats.critical} icon={AlertTriangle} tone="danger" />
            <StatCard label="Repeat Offenders" value={repeat} icon={Users} tone="warning" />
            <StatCard label="Cases Solved" value={`${stats.solveRate}%`} icon={Fingerprint} tone="success" />
            <StatCard label="Avg Investigation" value={velocity.avgClosureDays ? `${velocity.avgClosureDays}d` : "—"} icon={Clock} />
          </>
        )}
      </div>

      {/* AI summary + hotspots + threats */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad">
          <PanelHeader
            icon={Radar}
            title="Intelligence summary"
            sub="Derived from live Cloud Scale records"
            action={summary.length > 0 ? <ReadAloud label="Listen" text={summary.join(". ")} /> : undefined}
          />
          {summary.length === 0 ? (
            <p className="text-sm text-muted">No Cloud Scale records yet.</p>
          ) : (
            <ul className="space-y-2">
              {summary.map((s, i) => (
                <li key={i} className="flex gap-2 text-sm leading-relaxed text-subtle">
                  <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <Translated text={s} />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={Flame} tone="warning" title="Crime hotspots" sub="Top districts by volume" />
          <MapPanel points={geo} height={200} />
          <div className="mt-3 space-y-1">
            {hotspots.slice(0, 5).map((h, i) => (
              <div key={h.district} className="flex items-center justify-between text-xs">
                <span className="text-subtle">
                  <span className="mr-2 font-mono tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span>
                  {h.district}
                </span>
                <Badge tone={i === 0 ? "danger" : i < 2 ? "warning" : "info"}>{h.cases}</Badge>
              </div>
            ))}
            {hotspots.length === 0 && <p className="text-xs text-muted">No geolocated FIRs yet.</p>}
          </div>
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={AlertTriangle} tone="danger" title="Active threats & alerts" />
          <div className="space-y-2">
            {threats.length === 0 && <p className="text-sm text-muted">No alerts derived yet.</p>}
            {threats.map((tr, i) => (
              <div key={i} className="rounded-md border border-border bg-elevated/40 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold">{tr.title}</span>
                  <Badge tone={tr.tone}>{tr.tone === "danger" ? "HIGH" : tr.tone === "warning" ? "MED" : "LOW"}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted">{tr.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Repeat offenders (selectable) + performance */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <PanelHeader icon={Users} title="Repeat offender analysis" sub={`${criminals.length} profiles indexed`} />
          {active ? (
            <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
              <div className="rounded-md border border-border bg-elevated/40 p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={active.name} size={44} />
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{active.name}</div>
                    <div className="font-mono text-[11px] text-accent">KSP-{String(active.id).padStart(4, "0")}</div>
                  </div>
                </div>
                <div className="mt-3 text-xs text-muted">
                  Age {active.age || "—"} · {active.home_district || "—"}
                </div>
                <div className="mt-3">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="text-subtle">Risk score</span><span className="font-mono tabular-nums text-danger">{active.risk_score}%</span></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border"><div className="h-full rounded-full bg-danger transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, active.risk_score)}%` }} /></div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded border border-border bg-surface/60 p-2"><div className="stat-label">FIRs</div><div className="mt-1 font-mono text-lg font-semibold tabular-nums">{active.fir_count}</div></div>
                  <div className="rounded border border-border bg-surface/60 p-2"><div className="stat-label">Arrests</div><div className="mt-1 font-mono text-lg font-semibold tabular-nums">{active.arrest_count}</div></div>
                </div>
                <div className="mt-2 text-xs capitalize text-muted">{active.crime_category || active.status}</div>
                <Link href={`/criminals/${active.id}`} className="btn-ghost mt-3 h-8 w-full justify-center text-xs">View profile <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
              <div>
                <div className="stat-label mb-2">Select an offender</div>
                <div className="max-h-72 space-y-0.5 overflow-y-auto pr-1">
                  {ranked.map((c) => (
                    <button key={c.id} onClick={() => setSel(c.id)} className={`flex w-full items-center gap-2.5 rounded-md p-1.5 text-left transition-colors ${active.id === c.id ? "bg-elevated ring-1 ring-inset ring-accent/40" : "hover:bg-elevated/60"}`}>
                      <Avatar name={c.name} size={26} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium">{c.name}</div>
                        <div className="text-[10.5px] capitalize text-muted">{c.crime_category || c.home_district} · {c.fir_count} FIRs</div>
                      </div>
                      <span className="font-mono text-xs font-semibold tabular-nums text-danger">{c.risk_score}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : <EmptyState icon={Users} title="No offenders on record" hint="Analysis appears once profiles sync from Cloud Scale." />}
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={Activity} title="Investigation performance" />
          <div className="space-y-3">
            {perf.map((p) => (
              <div key={p.label}>
                <div className="mb-1 flex items-center justify-between text-xs"><span className="text-subtle">{p.label}</span><span className="font-mono tabular-nums text-muted">{p.value}{p.pct ? "%" : ""}</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border"><div className={`h-full rounded-full transition-[width] duration-500 ease-out ${p.color}`} style={{ width: `${Math.min(100, (p.value / p.max) * 100)}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Cross-case connections */}
      <div className="card panel-pad">
        <PanelHeader icon={Network} title="Cross-case connections" action={<Tag>derived</Tag>} />
        {cases.length === 0 && criminals.length === 0 ? (
          <EmptyState icon={Network} title="No connections derived yet" hint="Links surface once cases share a district and crime type." />
        ) : (
          <div className="grid items-stretch gap-4 lg:grid-cols-[180px_1fr]">
            <div className="flex flex-col items-center justify-center rounded-md border border-accent/30 bg-accent/5 p-4 text-center">
              <div className="font-display text-3xl font-bold tabular-nums text-accent">{links.linkedCases}</div>
              <div className="mt-1 text-xs font-semibold text-subtle">Linked cases</div>
              <div className="mt-0.5 text-[10px] text-muted">shared district + crime type</div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {links.entities.map((e) => (
                <div key={e.label} className="rounded-md border border-border bg-elevated/40 p-2.5">
                  <div className="flex items-center justify-between">
                    <e.icon className={`h-4 w-4 ${e.cls}`} />
                    <span className="font-display text-lg font-bold tabular-nums">{e.value}</span>
                  </div>
                  <div className="mt-1 text-xs font-medium text-subtle">{e.label}</div>
                  <div className="text-[10.5px] text-muted">{e.note}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Queue + evidence */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="card panel-pad lg:col-span-2">
          <PanelHeader icon={FolderKanban} title="Priority investigation queue" sub="Top by priority" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                  <th className="pb-2 pr-3">Priority</th>
                  <th className="pb-2 pr-3">Case</th>
                  <th className="pb-2 pr-3">Type</th>
                  <th className="pb-2 pr-3">District</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((c) => (
                  <tr key={c.id} className="border-t border-border/50 transition-colors hover:bg-elevated/50">
                    <td className="py-2 pr-3"><Badge tone={c.priority === "critical" ? "danger" : c.priority === "high" ? "warning" : "info"}>{c.priority}</Badge></td>
                    <td className="py-2 pr-3 font-mono text-xs">{c.case_number || `#${c.id}`}</td>
                    <td className="py-2 pr-3 text-subtle">{c.crime_type || "—"}</td>
                    <td className="py-2 pr-3 text-muted">{c.district || "—"}</td>
                    <td className="py-2 text-xs capitalize text-muted">{c.status?.replace(/_/g, " ")}</td>
                  </tr>
                ))}
                {queue.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-sm text-muted">No cases in Cloud Scale yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card panel-pad">
          <PanelHeader icon={ScanText} title="Evidence & processing" />
          <div className="grid grid-cols-2 gap-2">
            <Stat icon={ScanText} label="OCR documents" value={ocr} />
            <Stat icon={MapPin} label="Geolocated FIRs" value={geo.length} />
            <Stat icon={FolderKanban} label="Total cases" value={cases.length} />
            <Stat icon={Users} label="Profiles" value={criminals.length} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-elevated/40 p-2.5">
      <Icon className="h-4 w-4 text-accent" />
      <div className="mt-1.5 font-display text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[10.5px] text-muted">{label}</div>
    </div>
  );
}
