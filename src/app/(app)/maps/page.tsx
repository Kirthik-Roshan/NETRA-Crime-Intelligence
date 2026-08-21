"use client";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui";
import { MapsWorkspace } from "@/components/maps/MapsWorkspace";
import { useT } from "@/lib/i18n-client";
import { fetchMaps, type MapsData } from "@/lib/cloudscale";

const SEV = [
  { k: "critical", c: "#EF4444" }, { k: "high", c: "#F59E0B" },
  { k: "medium", c: "#3B82F6" }, { k: "low", c: "#10B981" },
];

// Reads geo data from Cloud Scale Data Store via the Catalyst Function.
export default function MapsPage() {
  const t = useT();
  const [data, setData] = useState<MapsData | null>(null);
  useEffect(() => { fetchMaps().then(setData).catch(() => setData({ points: [], districts: [], crimeTypes: [], hotspots: [] })); }, []);

  const geo = data?.points ?? [];
  const hotspots = data?.hotspots ?? [];
  return (
    <div>
      <PageHeader title={t("maps.title")} subtitle={`${geo.length} ${t("maps.subtitle")} ${hotspots.length} ${t("maps.districts")}`}>
        <div className="flex gap-3">
          {SEV.map((s) => (
            <span key={s.k} className="flex items-center gap-1.5 text-xs capitalize text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.c }} /> {s.k}
            </span>
          ))}
        </div>
      </PageHeader>
      {data === null ? (
        <div className="p-6 text-sm text-muted">Loading map data from Cloud Scale…</div>
      ) : (
        <MapsWorkspace points={geo} districts={data.districts} crimeTypes={data.crimeTypes} hotspots={hotspots} />
      )}
    </div>
  );
}
