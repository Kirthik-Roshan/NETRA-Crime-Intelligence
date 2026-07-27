import { firGeoPoints, districtHotspots, districtAggregates, crimeTypeList } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { MapsWorkspace } from "@/components/maps/MapsWorkspace";
import { getT } from "@/lib/i18n-server";


export default function MapsPage() {
  const t = getT();
  const geo = firGeoPoints();
  const hotspots = districtHotspots();
  const districts = districtAggregates();
  const crimeTypes = crimeTypeList();
  const sev = [
    { k: "critical", c: "#EF4444" },
    { k: "high", c: "#F59E0B" },
    { k: "medium", c: "#3B82F6" },
    { k: "low", c: "#10B981" },
  ];

  return (
    <div>
      <PageHeader title={t("maps.title")} subtitle={`${geo.length} ${t("maps.subtitle")} ${hotspots.length} ${t("maps.districts")}`}>
        <div className="flex gap-3">
          {sev.map((s) => (
            <span key={s.k} className="flex items-center gap-1.5 text-xs capitalize text-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.c }} /> {s.k}
            </span>
          ))}
        </div>
      </PageHeader>

      <MapsWorkspace points={geo} districts={districts} crimeTypes={crimeTypes} hotspots={hotspots} />
    </div>
  );
}
