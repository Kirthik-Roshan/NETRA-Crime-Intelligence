"use client";
import dynamic from "next/dynamic";
import type { FirPoint, DistrictAgg } from "./CrimeMap";

const CrimeMap = dynamic(() => import("./CrimeMap"), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center rounded-xl border border-border bg-surface" style={{ height: 420 }}>
      <div className="text-sm text-muted">Loading map…</div>
    </div>
  ),
});

export function MapPanel({
  points,
  districts,
  crimeTypes,
  height,
  enableControls,
  onIncidentClick,
}: {
  points: FirPoint[];
  districts?: DistrictAgg[];
  crimeTypes?: string[];
  height?: number;
  enableControls?: boolean;
  onIncidentClick?: (p: FirPoint) => void;
}) {
  return <CrimeMap points={points} districts={districts} crimeTypes={crimeTypes} height={height} enableControls={enableControls} onIncidentClick={onIncidentClick} />;
}
