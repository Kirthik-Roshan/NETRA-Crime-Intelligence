"use client";
import { useEffect, useState } from "react";
import { CasesList, type CaseRow } from "@/components/cases/CasesList";
import { fetchCases } from "@/lib/cloudscale";

// Reads from Cloud Scale Data Store via the Catalyst Function (not baked data).
export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  useEffect(() => { fetchCases().then(setCases).catch(() => setCases([])); }, []);
  if (cases === null) return <CasesSkeleton />;
  return <CasesList cases={cases} />;
}

// Structure-matched loading state so the layout doesn't jump when data lands.
function CasesSkeleton() {
  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center gap-3">
        <span className="h-7 w-1 rounded-full bg-accent/40" />
        <div className="space-y-2">
          <div className="skeleton h-6 w-40" />
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
        <div className="skeleton h-11 min-w-[220px] flex-1" />
        <div className="skeleton h-11 w-32" />
        <div className="skeleton h-11 w-32" />
      </div>
      <div className="card overflow-hidden">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b border-border/40 px-4 py-3.5 last:border-0">
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-4 w-1/2" />
              <div className="skeleton h-3 w-24" />
            </div>
            <div className="skeleton hidden h-4 w-20 sm:block" />
            <div className="skeleton h-5 w-16 rounded-md" />
            <div className="skeleton h-5 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
