"use client";
import { useEffect, useState } from "react";
import { CriminalsList, type CrimRow } from "@/components/criminals/CriminalsList";
import { fetchCriminals } from "@/lib/cloudscale";

// Reads from Cloud Scale Data Store via the Catalyst Function (not baked data).
export default function CriminalsPage() {
  const [criminals, setCriminals] = useState<CrimRow[] | null>(null);
  useEffect(() => { fetchCriminals().then(setCriminals).catch(() => setCriminals([])); }, []);
  if (criminals === null) return <div className="p-6 text-sm text-muted">Loading criminals from Cloud Scale…</div>;
  return <CriminalsList criminals={criminals} />;
}
