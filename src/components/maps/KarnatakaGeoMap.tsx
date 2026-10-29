"use client";
import { UiText } from '@/components/UiText';

import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import karnatakaGeo from "@/data/karnataka-districts.json";

// Minimal local GeoJSON type (avoids a hard dependency on @types/geojson).
type Feature = { type: string; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } };
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

interface DistrictCounts {
  [district: string]: number;
}

// Our internal district names → GeoJSON `district` property, where they differ.
const NAME_ALIAS: Record<string, string> = {
  "Hubballi-Dharwad": "Dharwad",
};

function color(count: number, max: number): string {
  if (!count) return "#e6eff5";
  const t = Math.sqrt(count / max);
  return `hsl(${201 - t * 12} 72% ${87 - t * 48}%)`;
}

/**
 * Fit the map to the Karnataka bounds and hold it there — cannot pan to
 * neighbouring states, cannot zoom out to see the rest of India.
 */
function LockToKarnataka({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    try {
      const layer = L.geoJSON(data as never);
      const b = layer.getBounds();
      const padded = b.pad(0.05);
      map.setMaxBounds(padded);
      map.options.maxBoundsViscosity = 1.0;
      // The zoom that fits Karnataka is the floor — you can zoom in, not out.
      const fitZoom = map.getBoundsZoom(b, false);
      map.setMinZoom(Math.max(1, fitZoom - 1));
    } catch {
      /* noop */
    }
  }, [map, data]);
  return null;
}

// Build a "mask" feature: a world-covering polygon with the Karnataka outline
// as a hole. Rendered semi-opaque with the theme bg, so tiles outside the state
// visually recede while Karnataka's districts stay bright and legible.
function buildMask(fc: FeatureCollection): FeatureCollection {
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
  // Outer ring is (nearly) the whole world; holes cut Karnataka out of it so
  // only the surrounding area is filled.
  const outer: number[][] = [
    [-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85],
  ];
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { role: "mask" },
        geometry: { type: "Polygon", coordinates: [outer, ...holes] } as never,
      } as Feature,
    ],
  };
}

export default function KarnatakaGeoMap({
  counts,
  selected,
  onSelect,
  height = 560,
}: {
  counts: DistrictCounts;
  selected?: string | null;
  onSelect?: (district: string) => void;
  height?: number;
}) {
  const geo = karnatakaGeo as unknown as FeatureCollection;

  const geoCount = useMemo(() => {
    const inv: Record<string, string> = {};
    for (const [ours, theirs] of Object.entries(NAME_ALIAS)) inv[theirs] = ours;
    return (geoName: string) => counts[inv[geoName] ?? geoName] ?? 0;
  }, [counts]);

  const mask = useMemo(() => buildMask(geo), [geo]);
  const max = Math.max(1, ...Object.values(counts));
  const selectedGeo = selected ? NAME_ALIAS[selected] ?? selected : null;

  return (
    <div style={{ height }} className="relative overflow-hidden rounded-md border border-border bg-surface">
      <div className="pointer-events-none absolute left-14 top-4 z-[500] rounded-md border border-border bg-surface/95 px-3 py-2 shadow-sm"><strong className="block text-sm"><UiText text={"Karnataka crime intelligence"} /></strong><span className="text-[11px] text-muted">{Object.values(counts).reduce((sum, n) => sum + n, 0)}<UiText text={" FIRs · district concentration"} /></span></div>
      <div className="pointer-events-none absolute bottom-5 left-4 z-[500] rounded-md border border-border bg-surface/95 p-3 text-[11px] shadow-sm"><div className="mb-2 text-muted"><UiText text={"Recorded FIR volume"} /></div><div className="h-2 w-36 rounded-sm" style={{ background: "linear-gradient(90deg, #e6eff5, #8bc8e7, #1c84b8)" }}/><div className="mt-1 flex justify-between"><span>0</span><span><UiText text={max} /></span></div></div>
      {!geo ? (
        <div className="grid h-full place-items-center text-sm text-muted"><UiText text={"Loading Karnataka map…"} /></div>
      ) : (
        <MapContainer
          bounds={[[11.608, 74.086], [18.45, 78.586]]}
          boundsOptions={{ padding: [12, 12] }}
          zoomSnap={0.1}
          zoomDelta={0.5}
          style={{ height: "100%", width: "100%", background: "rgb(var(--bg))" }}
          zoomControl
          scrollWheelZoom
          worldCopyJump={false}
        >
          <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' noWrap maxZoom={19} updateWhenIdle keepBuffer={1}/>
          <LockToKarnataka data={geo} />

          {/* Mask everything outside Karnataka with the theme background. */}
          <GeoJSON
            data={mask as never}
            style={(() => ({
              stroke: false,
              fillColor: "rgb(var(--bg))",
              fillOpacity: 0.88,
              interactive: false,
            })) as never}
          />

          {/* District choropleth (Karnataka only). */}
          <GeoJSON
            key={`${selectedGeo ?? "none"}-${JSON.stringify(counts)}`}
            data={geo as never}
            style={((feature: { properties?: { district?: string } }) => {
              const name = feature?.properties?.district as string;
              const isSel = name === selectedGeo;
              return {
                fillColor: color(geoCount(name), max),
                fillOpacity: geoCount(name) ? .38 : .04,
                color: isSel ? "#024f83" : "#6c8490",
                weight: isSel ? 2.5 : 0.8,
              };
            }) as never}
            onEachFeature={((feature: { properties?: { district?: string } }, layer: L.Layer) => {
              const name = feature.properties?.district as string;
              const c = geoCount(name);
              const l = layer as L.Path & { bindTooltip: (s: string, o?: unknown) => void };
              l.bindTooltip(`<strong>${name}</strong>${c ? ` · ${c} FIRs` : ""}`, { sticky: true });
              l.on({
                click: () => onSelect?.(Object.keys(counts).find(key => (NAME_ALIAS[key] ?? key) === name) ?? name),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mouseover: (e: any) => e.target.setStyle({ weight: 2, color: "rgb(var(--accent))" }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mouseout: (e: any) => e.target.setStyle({ weight: name === selectedGeo ? 2.5 : 0.8, color: name === selectedGeo ? "#024f83" : "#6c8490" }),
              });
            }) as never}
          />
        </MapContainer>
      )}
    </div>
  );
}
