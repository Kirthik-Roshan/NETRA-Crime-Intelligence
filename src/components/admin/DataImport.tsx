"use client";
import { FileSpreadsheet, Info } from "lucide-react";
import { useOfficer } from "@/components/OfficerName";

/**
 * FIR CSV import.
 *
 * This writes into the database, which requires a live server. In the static
 * Slate build there is no runtime backend, so import is not available here —
 * it runs in the full server deployment (AppSail) or against Catalyst Data
 * Store in production. Shown as an informational panel.
 */
export function DataImport() {
  const user = useOfficer();
  const isAdmin = user?.role === "administrator";

  return (
    <div className="card panel-pad">
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold">
        <FileSpreadsheet className="h-4 w-4 text-accent" /> Import Real FIR Data
      </h2>
      <p className="mb-3 text-xs text-muted">
        Load actual SCRB extracts (CSV) into the official CaseMaster schema. Maps to Catalyst Data Store bulk-import in production.
      </p>
      <div className="flex items-start gap-2 rounded-lg border border-border bg-elevated p-3 text-xs text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          {isAdmin
            ? "Data import writes to the live database and isn't available in this static demo build. It runs in the full server deployment / Catalyst Data Store."
            : "Importing requires the Administrator role, and runs only in the full server deployment."}
        </span>
      </div>
    </div>
  );
}
