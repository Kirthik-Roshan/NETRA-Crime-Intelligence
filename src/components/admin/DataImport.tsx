"use client";
import { FileSpreadsheet, Info } from "lucide-react";
import { PanelHeader } from "@/components/ui";
import { useOfficer } from "@/components/OfficerName";

/**
 * FIR CSV import.
 *
 * Cloud Scale imports are intentionally performed by the Catalyst CLI so large
 * CSV files never pass through the browser or expose an administrator token.
 */
export function DataImport() {
  const user = useOfficer();
  const isAdmin = user?.role === "administrator";

  return (
    <div className="card panel-pad">
      <PanelHeader
        icon={FileSpreadsheet}
        title="Import real FIR data"
        sub="Load SCRB CSV extracts into production Catalyst Cloud Scale. NETRA reads imported rows live through the serverless Function."
      />
      <div className="flex items-start gap-2.5 rounded-md border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <span>
          {isAdmin
            ? "Use catalyst ds:import <file.csv> --table <TableName> --production. Refresh this page after the Catalyst import job completes."
            : "Cloud Scale import is restricted to Catalyst project administrators."}
        </span>
      </div>
    </div>
  );
}
