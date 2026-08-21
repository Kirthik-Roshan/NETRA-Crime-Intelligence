"use client";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, GeoJSON, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import karnatakaGeo from "@/data/karnataka-districts.json";

// Minimal local GeoJSON type (avoids a hard dependency on @types/geojson).
type FeatureCollection = { type: "FeatureCollection"; features: Array<{ type: string; properties: Record<string, unknown>; geometry: unknown }> };

export interface FirPoint {
  id: number;
  fir_number: string;
  crime_type: string;
  district: string;
  severity: string;
  lat: number;
  lng: number;
}
export interface DistrictAgg {
  district: string;
  cases: number;
  lat: number;
  lng: number;
  top_crime: string;
}

const SEV_COLOR: Record<string, string> = {
  critical: "#EF4444",
  high: "#F59E0B",
  medium: "#3B82F6",
  low: "#10B981",
};
const SEV_WEIGHT: Record<string, number> = { critical: 1, high: 0.8, medium: 0.55, low: 0.35 };

// Karnataka geographic bounds — the map cannot be panned outside the state.
const KA_BOUNDS = new LatLngBounds([11.3, 73.9], [18.6, 78.7]);
const KA_CENTER: [number, number] = [14.9, 75.9];

/** Tile-free base map: Karnataka district outlines from a self-hosted GeoJSON. */
function DistrictBaseLayer() {
  // Bundled (served from _next/static) — Slate does not serve public/ files.
  const geo = karnatakaGeo as unknown as FeatureCollection;
  if (!geo) return null;
  return (
    <GeoJSON
      data={geo as never}
      style={(() => ({
        fillColor: "rgb(var(--muted) / 0.10)",
        fillOpacity: 1,
        color: "rgb(var(--border))",
        weight: 0.8,
      })) as never}
      onEachFeature={((feature: { properties?: { district?: string } }, layer: L.Layer) => {
        const name = feature.properties?.district as string;
        if (name) (layer as L.Path & { bindTooltip: (s: string, o?: unknown) => void }).bindTooltip(name, { sticky: true, className: "!text-[10px]" });
      }) as never}
    />
  );
}

/** True heat layer (leaflet.heat) rendered imperatively over the map. */
function HeatLayer({ points }: { points: FirPoint[] }) {
  const map = useMap();
  useEffect(() => {
    const heatPoints = points.map((p) => [p.lat, p.lng, SEV_WEIGHT[p.severity] ?? 0.5] as [number, number, number]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layer = (L as any).heatLayer(heatPoints, {
      radius: 22,
      blur: 18,
      maxZoom: 12,
      minOpacity: 0.35,
      gradient: { 0.2: "#3B82F6", 0.45: "#10B981", 0.65: "#F59E0B", 0.85: "#EF4444" },
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map, points]);
  return null;
}

export default function CrimeMap({
  points,
  districts = [],
  crimeTypes = [],
  height = 420,
  enableControls = false,
  onIncidentClick,
}: {
  points: FirPoint[];
  districts?: DistrictAgg[];
  crimeTypes?: string[];
  height?: number;
  enableControls?: boolean;
  onIncidentClick?: (p: FirPoint) => void;
}) {
  const [view, setView] = useState<"heatmap" | "district" | "incident">(enableControls ? "heatmap" : "incident");
  const [districtFilter, setDistrictFilter] = useState("all");
  const [crimeFilter, setCrimeFilter] = useState("all");

  const districtNames = useMemo(
    () => Array.from(new Set([...districts.map((d) => d.district), ...points.map((p) => p.district)])).sort(),
    [districts, points]
  );

  const filteredPoints = useMemo(
    () =>
      points.filter(
        (p) => (districtFilter === "all" || p.district === districtFilter) && (crimeFilter === "all" || p.crime_type === crimeFilter)
      ),
    [points, districtFilter, crimeFilter]
  );

  const filteredDistricts = useMemo(() => {
    if (crimeFilter === "all") {
      return districts.filter((d) => districtFilter === "all" || d.district === districtFilter);
    }
    const map = new Map<string, { sum_lat: number; sum_lng: number; n: number }>();
    for (const p of filteredPoints) {
      const cur = map.get(p.district) || { sum_lat: 0, sum_lng: 0, n: 0 };
      cur.sum_lat += p.lat; cur.sum_lng += p.lng; cur.n += 1;
      map.set(p.district, cur);
    }
    return Array.from(map.entries()).map(([district, v]) => ({
      district, cases: v.n, lat: v.sum_lat / v.n, lng: v.sum_lng / v.n, top_crime: crimeFilter,
    }));
  }, [districts, filteredPoints, crimeFilter, districtFilter]);

  const maxCases = Math.max(1, ...filteredDistricts.map((d) => d.cases));

  const Btn = ({ id, label }: { id: typeof view; label: string }) => (
    <button
      onClick={() => setView(id)}
      className={`rounded-md px-3 py-1.5 transition-colors ${view === id ? "bg-accent text-accent-fg" : "text-muted hover:text-fg"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      {enableControls && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            <Btn id="heatmap" label="Heatmap" />
            <Btn id="district" label="District" />
            <Btn id="incident" label="Incidents" />
          </div>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="input h-9 w-auto py-0 text-xs">
            <option value="all">All districts</option>
            {districtNames.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select value={crimeFilter} onChange={(e) => setCrimeFilter(e.target.value)} className="input h-9 w-auto py-0 text-xs">
            <option value="all">All crime types</option>
            {crimeTypes.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <span className="ml-auto text-xs text-muted">
            {view === "district" ? `${filteredDistricts.length} districts` : `${filteredPoints.length} incidents`}
          </span>
        </div>
      )}

      <div style={{ height }} className="overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={KA_CENTER}
          zoom={7}
          maxBounds={KA_BOUNDS}
          maxBoundsViscosity={1.0}
          minZoom={6}
          maxZoom={14}
          style={{ height: "100%", width: "100%", background: "rgb(var(--surface))" }}
          scrollWheelZoom
        >
          {/* Tile-free base map — self-hosted district outlines (no external tiles). */}
          <DistrictBaseLayer />

          {view === "heatmap" && <HeatLayer points={filteredPoints} />}

          {view === "district" &&
            filteredDistricts.map((d) => {
              // sqrt scaling keeps similar counts visually distinct but small enough not to blob.
              const intensity = d.cases / maxCases;
              const radius = 6 + Math.sqrt(intensity) * 15; // ~6–21 px
              const color = intensity > 0.75 ? "#EF4444" : intensity > 0.45 ? "#F59E0B" : "#3B82F6";
              return (
                <CircleMarker
                  key={d.district}
                  center={[d.lat, d.lng]}
                  radius={radius}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.45, weight: 1.5 }}
                  eventHandlers={{ click: () => setDistrictFilter(d.district) }}
                >
                  <Tooltip permanent direction="top" offset={[0, -radius]} className="!bg-transparent !border-0 !shadow-none !text-[10px]">
                    <span style={{ color: "rgb(var(--fg))", fontWeight: 600, textShadow: "0 1px 4px rgb(var(--bg))" }}>{d.district} · {d.cases}</span>
                  </Tooltip>
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <strong>{d.district}</strong>
                      <br />
                      {d.cases} FIRs · top: {d.top_crime}
                      <br />
                      <em>Click to filter incidents here</em>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}

          {view === "incident" &&
            filteredPoints.map((p) => {
              const color = SEV_COLOR[p.severity] || "#3B82F6";
              return (
                <CircleMarker
                  key={p.id}
                  center={[p.lat, p.lng]}
                  radius={p.severity === "critical" ? 7 : p.severity === "high" ? 5 : 3.5}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.6, weight: 1 }}
                  eventHandlers={onIncidentClick ? { click: () => onIncidentClick(p) } : undefined}
                >
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <strong>{p.fir_number}</strong>
                      <br />
                      {p.crime_type} · {p.district}
                      <br />
                      <span style={{ textTransform: "capitalize" }}>Severity: {p.severity}</span>
                    </div>
                  </Popup>
                </CircleMarker>
              );
            })}
        </MapContainer>
      </div>
    </div>
  );
}
