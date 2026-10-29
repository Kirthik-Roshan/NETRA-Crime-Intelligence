"use client";
import { UiText } from '@/components/UiText';

import dynamic from "next/dynamic";
import type { FirPoint, DistrictAgg } from "./CrimeMap";

const CrimeMap = dynamic(() => import("./CrimeMap"), {
  ssr: false,
  loading: () => (
    <div className="grid place-items-center rounded-xl border border-border bg-surface" style={{ height: 420 }}>
      <div className="text-sm text-muted"><UiText text={"Loading map…"} /></div>
    </div>
  ),
});

export function MapPanel({
  points,
  districts,
  crimeTypes,
  height,
  enableControls,
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
  return <CrimeMap points={points} districts={districts} crimeTypes={crimeTypes} height={height} enableControls={enableControls} initialView={initialView} onIncidentClick={onIncidentClick} />;
}
