"use client";
import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Map as MapIcon, Layers, MapPin, ExternalLink, X, ListOrdered, Loader2, Database } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge, EmptyState } from "@/components/ui";
import { MapPanel } from "./MapPanel";
import type { FirPoint, DistrictAgg } from "./CrimeMap";

const KarnatakaGeoMap = dynamic(() => import("./KarnatakaGeoMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid place-items-center rounded-xl border border-border/70 bg-surface/60"
      style={{ height: 620 }}
      aria-busy="true"
      aria-label="Loading Karnataka district map"
    >
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden />
        Loading Karnataka map…
      </div>
    </div>
  ),
});

type Style = "map" | "layers";

export function MapsWorkspace({
  points,
  districts,
  crimeTypes,
  hotspots,
}: {
  points: FirPoint[];
  districts: DistrictAgg[];
  crimeTypes: string[];
  hotspots: { district: string; cases: number }[];
}) {
  const [style, setStyle] = useState<Style>("map");
  const [selected, setSelected] = useState<string | null>(hotspots[0]?.district ?? null);
  const [incident, setIncident] = useState<FirPoint | null>(null);

  const counts = useMemo(() => Object.fromEntries(hotspots.map((h) => [h.district, h.cases])), [hotspots]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const inDistrict = points.filter((p) => p.district === selected);
    const byType = new Map<string, number>();
    for (const p of inDistrict) byType.set(p.crime_type, (byType.get(p.crime_type) || 0) + 1);
    const top = [...byType.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    const rank = hotspots.findIndex((h) => h.district === selected) + 1;
    return { district: selected, cases: counts[selected] ?? inDistrict.length, top, rank };
  }, [selected, points, hotspots, counts]);

  const STYLES: { id: Style; label: string; icon: typeof MapIcon }[] = [
    { id: "map", label: "Crime Map", icon: MapIcon },
    { id: "layers", label: "Interactive Layers", icon: Layers },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Map style" className="inline-flex shrink-0 rounded-lg border border-border/70 bg-surface/50 p-1 text-xs">
          {STYLES.map((s) => {
            const on = style === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setStyle(s.id)}
                aria-pressed={on}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium tracking-[-0.01em] transition duration-150 ${
                  on ? "bg-accent text-accent-fg shadow-[0_1px_0_0_rgb(255_255_255/0.16)_inset]" : "text-muted hover:bg-elevated/70 hover:text-fg"
                }`}
              >
                <s.icon className="h-3.5 w-3.5" aria-hidden /> {s.label}
              </button>
            );
          })}
        </div>
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          {style === "map" && "Accurate Karnataka districts on a dark base map · choropleth by FIR volume · click a district for detail"}
          {style === "layers" && "Full base map with heatmap & incident layers"}
        </p>
      </div>

      {/* Crime Map = accurate district map + merged detail panel */}
      {style === "map" && (
        <div className="grid animate-fade-in gap-4 lg:grid-cols-[1fr_320px]">
          <KarnatakaGeoMap counts={counts} selected={selected} onSelect={setSelected} height={620} />
          <div className="card panel-pad flex flex-col">
            <PanelHead
              icon={MapPin}
              title={detail?.district ?? "Select a district"}
              sub={detail ? "District profile" : "Click the map or a ranking row"}
              right={
                detail && detail.rank > 0 ? (
                  <Badge tone={detail.rank === 1 ? "danger" : detail.rank <= 3 ? "warning" : "muted"}>Rank #{detail.rank}</Badge>
                ) : undefined
              }
            />
            {detail ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Tile label="FIRs" value={detail.cases} />
                  <Tile label="State rank" value={detail.rank > 0 ? `#${detail.rank}` : "—"} />
                </div>
                <div className="mb-2 mt-4 stat-label">Top offences</div>
                <div className="space-y-2">
                  {detail.top.length === 0 && <p className="text-xs text-muted">No FIRs recorded for this district.</p>}
                  {detail.top.map(([type, n]) => {
                    const max = detail.top[0][1];
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between gap-3 text-xs">
                          <span className="min-w-0 truncate text-subtle">{type}</span>
                          <span className="shrink-0 font-mono tabular-nums text-muted">{n}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                            style={{ width: `${(n / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link href={`/database?table=firs`} className="btn-ghost mt-4 w-full justify-center text-xs">
                  <Database className="h-3.5 w-3.5" aria-hidden /> View in database <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </>
            ) : (
              <EmptyState icon={MapPin} title="No district selected" hint="Choose a district on the map to open its FIR profile." />
            )}
            {/* Ranking merged in */}
            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="stat-label">District ranking</span>
                <span className="font-mono text-[10px] tabular-nums text-muted">{hotspots.length}</span>
              </div>
              <div className="max-h-56 space-y-0.5 overflow-y-auto pr-1">
                {hotspots.map((h, i) => (
                  <RankRow key={h.district} rank={i + 1} district={h.district} cases={h.cases} on={selected === h.district} onClick={() => setSelected(h.district)} />
                ))}
                {hotspots.length === 0 && <p className="px-2 py-3 text-xs text-muted">No district data in Cloud Scale yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {style === "layers" && (
        <div className="grid animate-fade-in gap-4 lg:grid-cols-[1fr_300px]">
          <MapPanel points={points} districts={districts} crimeTypes={crimeTypes} height={620} enableControls onIncidentClick={setIncident} />
          {incident ? (
            <IncidentPanel p={incident} onClose={() => setIncident(null)} />
          ) : (
            <div className="card panel-pad">
              <PanelHead icon={ListOrdered} title="District Ranking" sub="Click a marker on the Incidents layer for detail" />
              <div className="space-y-2">
                {hotspots.map((h, i) => {
                  const max = hotspots[0]?.cases || 1;
                  const on = selected === h.district;
                  return (
                    <button key={h.district} onClick={() => setSelected(h.district)} aria-pressed={on} className="group block w-full text-left">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className={`min-w-0 truncate transition-colors ${on ? "text-accent" : "text-subtle group-hover:text-fg"}`}>
                          <span className="font-mono tabular-nums text-muted">{i + 1}.</span> {h.district}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-muted">{h.cases}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ease-out ${on ? "bg-accent" : "bg-warning"}`}
                          style={{ width: `${(h.cases / max) * 100}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
                {hotspots.length === 0 && (
                  <EmptyState icon={ListOrdered} title="No district data" hint="Rankings appear once FIRs sync from Cloud Scale." />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Shared panel header — icon chip, title, caption and an optional right slot. */
function PanelHead({ icon: Icon, title, sub, right }: { icon: LucideIcon; title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border border-border/60 bg-elevated/60">
        <Icon className="h-3.5 w-3.5 text-accent" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-sm font-semibold">{title}</h3>
        {sub && <p className="truncate text-[11px] text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

function RankRow({ rank, district, cases, on, onClick }: { rank: number; district: string; cases: number; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        on ? "bg-elevated ring-1 ring-inset ring-accent/40" : "hover:bg-elevated/60"
      }`}
    >
      <span className={`w-4 shrink-0 text-right font-mono text-[10px] tabular-nums ${on ? "text-accent" : "text-muted"}`}>{rank}</span>
      <span className={`min-w-0 flex-1 truncate ${on ? "text-fg" : "text-subtle"}`}>{district}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted">{cases}</span>
    </button>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border/70 bg-elevated/20 p-3 transition-colors hover:border-border">
      <div className="stat-label">{label}</div>
      <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

const SEV_TONE: Record<string, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "success",
};

/** Incident detail built purely from the Cloud Scale FIR row we already hold. */
function IncidentPanel({ p, onClose }: { p: FirPoint; onClose: () => void }) {
  return (
    <div className="card panel-pad animate-fade-in">
      <PanelHead
        icon={MapPin}
        title={p.fir_number || "Incident"}
        sub="First Information Report"
        right={
          <button
            onClick={onClose}
            className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-elevated hover:text-fg"
            aria-label="Close incident"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        }
      />
      <dl className="space-y-2 text-xs">
        <Row label="Type" value={p.crime_type || "—"} />
        <Row label="District" value={p.district || "—"} />
        <Row
          label="Severity"
          value={p.severity ? <Badge tone={SEV_TONE[p.severity] ?? "muted"}>{p.severity}</Badge> : "—"}
        />
        <Row
          label="Coordinates"
          value={<span className="font-mono tabular-nums">{p.lat && p.lng ? `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` : "—"}</span>}
        />
      </dl>
      {p.fir_number && (
        <Link href={`/cases?fir=${encodeURIComponent(p.fir_number)}`} className="btn-ghost mt-4 w-full justify-center text-xs">
          Open full case <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      <p className="mt-3 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted">
        Detail is limited to fields held in Cloud Scale. Suspect &amp; linkage joins appear once those Data Store tables are provisioned.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-subtle">{label}</dt>
      <dd className="min-w-0 truncate text-right text-muted">{value}</dd>
    </div>
  );
}
