"use client";
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

function color(count: number, max: number, accent: string): string {
  if (!count) return "rgb(var(--muted) / 0.12)";
  const t = Math.sqrt(count / max);
  return `rgb(var(${accent}) / ${(0.18 + t * 0.62).toFixed(2)})`;
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
      map.fitBounds(b, { padding: [12, 12] });
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
    <div style={{ height }} className="overflow-hidden rounded-lg border border-border bg-surface">
      {!geo ? (
        <div className="grid h-full place-items-center text-sm text-muted">Loading Karnataka map…</div>
      ) : (
        <MapContainer
          zoom={7}
          center={[14.9, 75.9]}
          style={{ height: "100%", width: "100%", background: "rgb(var(--bg))" }}
          zoomControl
          scrollWheelZoom
          worldCopyJump={false}
        >
          {/* OpenStreetMap base tiles (ODbL). We overlay a mask so anything
              outside Karnataka is heavily dimmed — the state stays bright. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            noWrap
            maxZoom={19}
          />

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
            key={selectedGeo ?? "none"}
            data={geo as never}
            style={((feature: { properties?: { district?: string } }) => {
              const name = feature?.properties?.district as string;
              const isSel = name === selectedGeo;
              return {
                fillColor: color(geoCount(name), max, "--accent"),
                fillOpacity: 1,
                color: isSel ? "rgb(var(--accent))" : "rgb(var(--border))",
                weight: isSel ? 2.5 : 0.8,
              };
            }) as never}
            onEachFeature={((feature: { properties?: { district?: string } }, layer: L.Layer) => {
              const name = feature.properties?.district as string;
              const c = geoCount(name);
              const l = layer as L.Path & { bindTooltip: (s: string, o?: unknown) => void };
              l.bindTooltip(`<strong>${name}</strong>${c ? ` · ${c} FIRs` : ""}`, { sticky: true });
              l.on({
                click: () => onSelect?.(name),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mouseover: (e: any) => e.target.setStyle({ weight: 2, color: "rgb(var(--accent))" }),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                mouseout: (e: any) => e.target.setStyle({ weight: name === selectedGeo ? 2.5 : 0.8, color: name === selectedGeo ? "rgb(var(--accent))" : "rgb(var(--border))" }),
              });
            }) as never}
          />
        </MapContainer>
      )}
    </div>
  );
}
