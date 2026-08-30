"use client";
import { FileSpreadsheet, Info } from "lucide-react";
import { PanelHeader } from "@/components/ui";
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
      <PanelHeader
        icon={FileSpreadsheet}
        title="Import real FIR data"
        sub="Load actual SCRB extracts (CSV) into the official CaseMaster schema — maps to Catalyst Data Store bulk-import in production."
      />
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-muted">
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
