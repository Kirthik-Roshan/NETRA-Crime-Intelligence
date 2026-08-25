"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { MapsWorkspace } from "@/components/maps/MapsWorkspace";
import { useT } from "@/lib/i18n-client";
import { fetchMaps, type MapsData } from "@/lib/cloudscale";

// Severity legend — token-driven so all seven themes re-skin it with the app.
const SEV = [
  { k: "critical", c: "bg-danger" },
  { k: "high", c: "bg-warning" },
  { k: "medium", c: "bg-info" },
  { k: "low", c: "bg-success" },
];

// Reads geo data from Cloud Scale Data Store via the Catalyst Function.
export default function MapsPage() {
  const t = useT();
  const [data, setData] = useState<MapsData | null>(null);
  useEffect(() => { fetchMaps().then(setData).catch(() => setData({ points: [], districts: [], crimeTypes: [], hotspots: [] })); }, []);

  const geo = data?.points ?? [];
  const hotspots = data?.hotspots ?? [];
  return (
    <div className="animate-fade-in">
      <PageHeader
        title={t("maps.title")}
        subtitle={data === null ? "Syncing geospatial layers from Cloud Scale…" : `${geo.length} ${t("maps.subtitle")} ${hotspots.length} ${t("maps.districts")}`}
      >
        <div className="flex items-center gap-3 rounded-lg border border-border/70 bg-surface/40 px-3 py-2">
          <span className="stat-label shrink-0">Severity</span>
          <span aria-hidden className="h-3.5 w-px shrink-0 bg-border" />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            {SEV.map((s) => (
              <span key={s.k} className="flex items-center gap-1.5 text-xs font-medium capitalize text-muted">
                <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${s.c}`} /> {s.k}
              </span>
            ))}
          </div>
        </div>
      </PageHeader>
      {data === null ? (
        <MapsSkeleton />
      ) : (
        <MapsWorkspace points={geo} districts={data.districts} crimeTypes={data.crimeTypes} hotspots={hotspots} />
      )}
    </div>
  );
}

// Structure-matched loading state — mirrors the workspace toolbar, map canvas
// and detail rail so nothing shifts once Cloud Scale responds.
function MapsSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading map data from Cloud Scale">
      <div className="flex flex-wrap items-center gap-3">
        <div className="skeleton h-9 w-[19rem] rounded-lg" />
        <div className="skeleton h-3 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="skeleton rounded-xl" style={{ height: 620 }} />
        <div className="card panel-pad space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="skeleton h-7 w-7 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-32" />
              <div className="skeleton h-2.5 w-20" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="skeleton h-16 rounded-lg" />
            <div className="skeleton h-16 rounded-lg" />
          </div>
          <div className="space-y-2.5">
            <div className="skeleton h-2.5 w-24" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-1.5 w-full rounded-full" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
