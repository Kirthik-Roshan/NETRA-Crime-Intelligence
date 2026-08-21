"use client";
import { useEffect, useState } from "react";
import { CasesList, type CaseRow } from "@/components/cases/CasesList";
import { fetchCases } from "@/lib/cloudscale";

// Reads from Cloud Scale Data Store via the Catalyst Function (not baked data).
export default function CasesPage() {
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  useEffect(() => { fetchCases().then(setCases).catch(() => setCases([])); }, []);
  if (cases === null) return <div className="p-6 text-sm text-muted">Loading cases from Cloud Scale…</div>;
  return <CasesList cases={cases} />;
}
