"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import karnatakaGeo from "@/data/karnataka-districts.json";

type GeoFeature = { type: string; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } };
type GeoFC = { type: "FeatureCollection"; features: GeoFeature[] };

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

// Extents of the bundled district GeoJSON, used before the first tile loads.
const KA_BOUNDS = new LatLngBounds([11.608, 74.086], [18.45, 78.586]);

function buildMask(fc: GeoFC): GeoFC {
  const holes: number[][][] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === "Polygon") {
      const coords = g.coordinates as number[][][];
      if (coords[0]) holes.push(coords[0]);
    } else if (g.type === "MultiPolygon") {
      const multi = g.coordinates as number[][][][];
      for (const poly of multi) if (poly[0]) holes.push(poly[0]);
    }
  }
  const outer: number[][] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { role: "mask" }, geometry: { type: "Polygon", coordinates: [outer, ...holes] } as never } as GeoFeature],
  };
}

function LockToKarnataka() {
  const map = useMap();
  useEffect(() => {
    map.setMaxBounds(KA_BOUNDS.pad(0.05));
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(Math.max(1, map.getBoundsZoom(KA_BOUNDS, false) - 1));
  }, [map]);
  return null;
}

/** Tile-free base map: Karnataka district outlines from a self-hosted GeoJSON. */
function DistrictBaseLayer({ points, streetMap }: { points: FirPoint[]; streetMap: boolean }) {
  const geo = karnatakaGeo as unknown as FeatureCollection;
  if (!geo) return null;
  return (
    <GeoJSON
      data={geo as never}
      style={((feature: { properties?: { district?: string } }) => ({
        fillColor: "#0d9fc5",
        fillOpacity: streetMap ? .03 : Math.min(.62, .08 + points.filter(p => (p.district === "Hubballi-Dharwad" ? "Dharwad" : p.district).toLowerCase() === String(feature.properties?.district ?? "").toLowerCase()).length / Math.max(1, points.length) * 4),
        color: streetMap ? "#687f89" : "#64b5d5",
        weight: 1.2,
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
      maxZoom: 8,
      minOpacity: 0.35,
      gradient: { 0.2: "#ffe989", 0.45: "#ffb23d", 0.65: "#ff6236", 0.85: "#e62b32" },
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
  initialView,
  onIncidentClick,
}: {
  points: FirPoint[];
  districts?: DistrictAgg[];
  crimeTypes?: string[];
  height?: number;
  enableControls?: boolean;
  initialView?: "heatmap" | "district" | "incident";
  onIncidentClick?: (p: FirPoint) => void;
}) {
  const ui = useUiText();
  const [view, setView] = useState<"heatmap" | "district" | "incident">(initialView || (enableControls ? "heatmap" : "incident"));
  const [streetMap, setStreetMap] = useState(true);
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
      <UiText text={label} />
    </button>
  );

  return (
    <div className="space-y-2">
      {enableControls && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-border p-0.5 text-xs">
            <Btn id="heatmap" label={ui("Heatmap")} />
            <Btn id="district" label={ui("District")} />
            <Btn id="incident" label={ui("Incidents")} />
          </div>
          <select value={districtFilter} onChange={(e) => setDistrictFilter(e.target.value)} className="input h-9 w-auto py-0 text-xs">
            <option value="all"><UiText text={"All districts"} /></option>
            {districtNames.map((d) => <option key={d} value={d}><UiText text={d} /></option>)}
          </select>
          <select value={crimeFilter} onChange={(e) => setCrimeFilter(e.target.value)} className="input h-9 w-auto py-0 text-xs">
            <option value="all"><UiText text={"All crime types"} /></option>
            {crimeTypes.map((c) => <option key={c} value={c}><UiText text={c} /></option>)}
          </select>
          <label className="ml-auto flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={streetMap} onChange={e => setStreetMap(e.target.checked)} /><UiText text={"Street map"} /></label>
          <span className="text-xs text-muted">
            <UiText text={view === "district" ? `${filteredDistricts.length} districts` : `${filteredPoints.length} incidents`} />
          </span>
        </div>
      )}

      <div style={{ height }} className="crime-intelligence-map relative overflow-hidden rounded-md border border-border">
        <MapContainer
          bounds={KA_BOUNDS}
          boundsOptions={{ padding: [12, 12] }}
          zoomSnap={0.1}
          zoomDelta={0.5}
          style={{ height: "100%", width: "100%", background: "rgb(var(--bg))" }}
          zoomControl
          scrollWheelZoom
          worldCopyJump={false}
        >
          {streetMap && <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            updateWhenIdle
            keepBuffer={1}
            noWrap
            maxZoom={19}
          />}
          <LockToKarnataka />
          <GeoJSON
            data={buildMask(karnatakaGeo as unknown as GeoFC) as never}
            style={(() => ({ stroke: false, fillColor: "rgb(var(--bg))", fillOpacity: 0.88, interactive: false })) as never}
          />
          <DistrictBaseLayer key={`${districtFilter}-${crimeFilter}-${points.length}-${streetMap}`} points={filteredPoints} streetMap={streetMap} />

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
                    <span style={{ color: "rgb(var(--fg))", fontWeight: 600, textShadow: "0 1px 4px rgb(var(--bg))" }}><UiText text={d.district} /> · <UiText text={d.cases} /></span>
                  </Tooltip>
                  <Popup>
                    <div style={{ minWidth: 160 }}>
                      <strong><UiText text={d.district} /></strong>
                      <br />
                      <UiText text={d.cases} /><UiText text={" FIRs · top: "} /><UiText text={d.top_crime} />
                      <br />
                      <em><UiText text={"Click to filter incidents here"} /></em>
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
                      <strong><UiText text={p.fir_number} /></strong>
                      <br />
                      <UiText text={p.crime_type} /> · <UiText text={p.district} />
                      <br />
                      <span style={{ textTransform: "capitalize" }}><UiText text={"Severity: "} /><UiText text={p.severity} /></span>
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
