"use client";
import { useMemo, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Link from "@/components/AppLink";
import { Map as MapIcon, Layers, MapPin, ExternalLink, X, ListOrdered, Loader2, Database } from "lucide-react";
import { Badge, EmptyState, PanelHeader, Segmented } from "@/components/ui";
import { MapPanel } from "./MapPanel";
import type { FirPoint, DistrictAgg } from "./CrimeMap";

const KarnatakaGeoMap = dynamic(() => import("./KarnatakaGeoMap"), {
  ssr: false,
  loading: () => (
    <div
      className="grid place-items-center rounded-lg border border-border bg-surface"
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

  return (
    <div className="space-y-4">
      {/* Compact control bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/60 p-2">
        <Segmented<Style>
          ariaLabel="Map style"
          value={style}
          onChange={setStyle}
          options={[
            { value: "map", label: "Crime map", icon: MapIcon },
            { value: "layers", label: "Layers", icon: Layers },
          ]}
        />
        <p className="min-w-0 flex-1 truncate text-xs text-muted">
          {style === "map" && "Karnataka districts on a dark base map · choropleth by FIR volume · click a district for detail."}
          {style === "layers" && "Full base map with heatmap & incident layers."}
        </p>
      </div>

      {/* Map — dominant */}
      {style === "map" && (
        <div className="grid animate-fade-in gap-4 lg:grid-cols-[1fr_320px]">
          <KarnatakaGeoMap counts={counts} selected={selected} onSelect={setSelected} height={640} />
          <div className="card panel-pad flex flex-col">
            <PanelHeader
              icon={MapPin}
              title={detail?.district ?? "Select a district"}
              sub={detail ? "District profile" : "Click the map or a ranking row"}
              action={
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
                <div className="stat-label mb-2 mt-4">Top offences</div>
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
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border">
                          <div
                            className="h-full rounded-full bg-accent transition-[width] duration-500 ease-out"
                            style={{ width: `${(n / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Link href="/database?table=firs" className="btn-ghost mt-4 h-8 w-full justify-center text-xs">
                  <Database className="h-3.5 w-3.5" aria-hidden /> Open in database <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </>
            ) : (
              <EmptyState icon={MapPin} title="No district selected" hint="Choose a district on the map to open its FIR profile." />
            )}
            <div className="mt-4 border-t border-border pt-3">
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
          <MapPanel points={points} districts={districts} crimeTypes={crimeTypes} height={640} enableControls onIncidentClick={setIncident} />
          {incident ? (
            <IncidentPanel p={incident} onClose={() => setIncident(null)} />
          ) : (
            <div className="card panel-pad">
              <PanelHeader icon={ListOrdered} title="District ranking" sub="Click a marker on the Incidents layer for detail" />
              <div className="space-y-2">
                {hotspots.map((h, i) => {
                  const max = hotspots[0]?.cases || 1;
                  const on = selected === h.district;
                  return (
                    <button key={h.district} onClick={() => setSelected(h.district)} aria-pressed={on} className="group block w-full text-left">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className={`min-w-0 truncate transition-colors ${on ? "text-accent" : "text-subtle group-hover:text-fg"}`}>
                          <span className="mr-2 font-mono tabular-nums text-muted">{String(i + 1).padStart(2, "0")}</span> {h.district}
                        </span>
                        <span className="shrink-0 font-mono tabular-nums text-muted">{h.cases}</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border">
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

function RankRow({ rank, district, cases, on, onClick }: { rank: number; district: string; cases: number; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
        on ? "bg-elevated ring-1 ring-inset ring-accent/40" : "hover:bg-elevated/60"
      }`}
    >
      <span className={`w-6 shrink-0 text-right font-mono text-[10px] tabular-nums ${on ? "text-accent" : "text-muted"}`}>{rank}</span>
      <span className={`min-w-0 flex-1 truncate ${on ? "text-fg" : "text-subtle"}`}>{district}</span>
      <span className="shrink-0 font-mono tabular-nums text-muted">{cases}</span>
    </button>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-elevated/40 p-2.5">
      <div className="stat-label">{label}</div>
      <div className="mt-1 font-display text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

const SEV_TONE: Record<string, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  high: "warning",
  medium: "info",
  low: "success",
};

function IncidentPanel({ p, onClose }: { p: FirPoint; onClose: () => void }) {
  return (
    <div className="card panel-pad animate-fade-in">
      <PanelHeader
        icon={MapPin}
        title={p.fir_number || "Incident"}
        sub="First Information Report"
        action={
          <button
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-fg"
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
        <Link href={`/cases?fir=${encodeURIComponent(p.fir_number)}`} className="btn-ghost mt-4 h-8 w-full justify-center text-xs">
          Open full case <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
      <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-muted">
        Detail is limited to fields held in Cloud Scale. Suspect &amp; linkage joins appear once those tables are provisioned.
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
