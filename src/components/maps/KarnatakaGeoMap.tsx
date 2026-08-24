"use client";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import karnatakaGeo from "@/data/karnataka-districts.json";

// Minimal local GeoJSON type (avoids a hard dependency on @types/geojson).
type FeatureCollection = { type: "FeatureCollection"; features: Array<{ type: string; properties: Record<string, unknown>; geometry: unknown }> };

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
  // Blend from faint to full accent by opacity.
  return `rgb(var(${accent}) / ${(0.18 + t * 0.62).toFixed(2)})`;
}

function FitToData({ data }: { data: FeatureCollection }) {
  const map = useMap();
  useEffect(() => {
    try {
      const layer = L.geoJSON(data);
      map.fitBounds(layer.getBounds(), { padding: [16, 16] });
    } catch {
      /* noop */
    }
  }, [map, data]);
  return null;
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
  // Bundled (served from _next/static) — Slate does not serve public/ files.
  const geo = karnatakaGeo as unknown as FeatureCollection;

  // Map GeoJSON district → our count (respecting aliases).
  const geoCount = useMemo(() => {
    const inv: Record<string, string> = {};
    for (const [ours, theirs] of Object.entries(NAME_ALIAS)) inv[theirs] = ours;
    return (geoName: string) => counts[inv[geoName] ?? geoName] ?? 0;
  }, [counts]);

  const max = Math.max(1, ...Object.values(counts));
  const selectedGeo = selected ? NAME_ALIAS[selected] ?? selected : null;

  return (
    <div style={{ height }} className="overflow-hidden rounded-xl border border-border bg-surface">
      {!geo ? (
        <div className="grid h-full place-items-center text-sm text-muted">Loading Karnataka map…</div>
      ) : (
        <MapContainer
          zoom={7}
          center={[14.9, 75.9]}
          style={{ height: "100%", width: "100%", background: "transparent" }}
          zoomControl
          scrollWheelZoom
        >
          {/* OpenStreetMap base tiles (ODbL); the district choropleth overlays on top. */}
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            maxZoom={19}
          />
          <FitToData data={geo} />
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
