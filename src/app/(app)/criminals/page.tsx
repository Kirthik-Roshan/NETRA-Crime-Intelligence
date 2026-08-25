"use client";
import { useEffect, useState } from "react";
import { CriminalsList, type CrimRow } from "@/components/criminals/CriminalsList";
import { fetchCriminals } from "@/lib/cloudscale";

// Reads from Cloud Scale Data Store via the Catalyst Function (not baked data).
export default function CriminalsPage() {
  const [criminals, setCriminals] = useState<CrimRow[] | null>(null);
  useEffect(() => { fetchCriminals().then(setCriminals).catch(() => setCriminals([])); }, []);
  if (criminals === null) return <CriminalsSkeleton />;
  return <CriminalsList criminals={criminals} />;
}

// Structure-matched loading state so the layout doesn't jump when data lands.
function CriminalsSkeleton() {
  return (
    <div className="animate-fade-in" aria-busy="true" aria-label="Loading criminal profiles from Cloud Scale">
      <div className="mb-6 flex items-center gap-3">
        <span className="h-7 w-1 rounded-full bg-accent/40" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-48" />
          <div className="skeleton h-3.5 w-64" />
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card panel-pad space-y-3">
            <div className="skeleton h-3 w-16" />
            <div className="skeleton h-7 w-12" />
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="skeleton h-11 min-w-[240px] flex-1" />
        <div className="skeleton h-11 w-64" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card panel-pad">
            <div className="flex items-start gap-3">
              <div className="skeleton h-11 w-11 rounded-full" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-2/3" />
                <div className="skeleton h-3 w-24" />
                <div className="skeleton h-5 w-32 rounded-md" />
              </div>
            </div>
            <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-3">
              <div className="skeleton h-3 w-28" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton mt-2.5 h-5 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
