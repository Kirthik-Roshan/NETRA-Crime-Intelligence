"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Map as MapIcon, Layers, MapPin, ExternalLink } from "lucide-react";
import { MapPanel } from "./MapPanel";
import type { FirPoint, DistrictAgg } from "./CrimeMap";

const KarnatakaGeoMap = dynamic(() => import("./KarnatakaGeoMap"), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center rounded-xl border border-border bg-surface" style={{ height: 620 }}>
      <div className="text-sm text-muted">Loading Karnataka map…</div>
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5 text-xs">
          {STYLES.map((s) => (
            <button
              key={s.id}
              onClick={() => setStyle(s.id)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors ${style === s.id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
            >
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {style === "map" && "Accurate Karnataka districts on a dark base map · choropleth by FIR volume · click a district for detail"}
          {style === "layers" && "Full base map with heatmap & incident layers"}
        </span>
      </div>

      {/* Crime Map = accurate district map + merged detail panel */}
      {style === "map" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <KarnatakaGeoMap counts={counts} selected={selected} onSelect={setSelected} height={620} />
          <div className="card panel-pad flex flex-col">
            <div className="mb-2 flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent" />
              <h3 className="font-display text-sm font-semibold">{detail?.district ?? "Select a district"}</h3>
              {detail && (
                <Link href={`/database?table=firs`} className="ml-auto inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                  View in database <ExternalLink className="h-3 w-3" />
                </Link>
              )}
            </div>
            {detail && (
              <>
                <div className="mb-3 grid grid-cols-2 gap-2">
                  <Tile label="FIRs" value={detail.cases} />
                  <Tile label="State rank" value={detail.rank > 0 ? `#${detail.rank}` : "—"} />
                </div>
                <div className="mb-1 stat-label">Top offences</div>
                <div className="space-y-1.5">
                  {detail.top.length === 0 && <p className="text-xs text-muted">No FIRs recorded for this district.</p>}
                  {detail.top.map(([type, n]) => {
                    const max = detail.top[0][1];
                    return (
                      <div key={type}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-subtle">{type}</span>
                          <span className="font-mono text-muted">{n}</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
                          <div className="h-full rounded-full bg-accent" style={{ width: `${(n / max) * 100}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
            {/* Ranking merged in */}
            <div className="mt-4 border-t border-border/60 pt-3">
              <div className="mb-2 stat-label">District ranking</div>
              <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
                {hotspots.map((h, i) => (
                  <button key={h.district} onClick={() => setSelected(h.district)} className="flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-xs hover:bg-elevated">
                    <span className={selected === h.district ? "text-accent" : "text-subtle"}>{i + 1}. {h.district}</span>
                    <span className="font-mono text-muted">{h.cases}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {style === "layers" && (
        <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
          <MapPanel points={points} districts={districts} crimeTypes={crimeTypes} height={620} enableControls />
          <div className="card panel-pad">
            <h2 className="mb-3 font-display text-base font-semibold">District Ranking</h2>
            <div className="space-y-1.5">
              {hotspots.map((h, i) => {
                const max = hotspots[0]?.cases || 1;
                return (
                  <button key={h.district} onClick={() => setSelected(h.district)} className="block w-full text-left">
                    <div className="flex items-center justify-between text-xs">
                      <span className={selected === h.district ? "text-accent" : "text-subtle"}>{i + 1}. {h.district}</span>
                      <span className="font-mono text-muted">{h.cases}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-elevated">
                      <div className={`h-full rounded-full ${selected === h.district ? "bg-accent" : "bg-warning"}`} style={{ width: `${(h.cases / max) * 100}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-border p-2.5">
      <div className="stat-label">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
    </div>
  );
}
