"use client";
import { useState } from "react";
import { Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
  createdDistricts: string[];
  createdStations: string[];
  createdCrimeTypes: string[];
}

export function DataImport({ canImport }: { canImport: boolean }) {
  const [csv, setCsv] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) setCsv(await f.text());
  }

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ csv }),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error || "Import failed");
      else setResult(data);
    } catch {
      setError("Network error during import");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card panel-pad">
      <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold">
        <FileSpreadsheet className="h-4 w-4 text-accent" /> Import Real FIR Data
      </h2>
      <p className="mb-3 text-xs text-muted">
        Load actual SCRB extracts (CSV) into the official CaseMaster schema. Maps to Catalyst Data Store bulk-import in production.
      </p>

      {!canImport ? (
        <p className="rounded-lg border border-border bg-elevated p-3 text-xs text-muted">
          Importing requires the Administrator role. Sign in as <span className="font-mono">admin</span> to load data.
        </p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <a href="/api/admin/import" className="btn-ghost h-9 text-xs">
              <Download className="h-3.5 w-3.5" /> Download template
            </a>
            <label className="btn-ghost h-9 cursor-pointer text-xs">
              <Upload className="h-3.5 w-3.5" /> Choose CSV file
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            </label>
          </div>

          <textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder="Paste CSV here, or choose a file above. First row must be the header."
            className="input h-32 w-full resize-y font-mono text-xs"
          />

          <button onClick={submit} disabled={busy || !csv.trim()} className="btn-accent mt-3 h-9 text-sm disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</> : <><Upload className="h-4 w-4" /> Import to database</>}
          </button>

          {error && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              <AlertTriangle className="h-4 w-4" /> {error}
            </div>
          )}

          {result && (
            <div className="mt-3 space-y-2 rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
              <div className="flex items-center gap-2 font-medium text-success">
                <CheckCircle2 className="h-4 w-4" /> Imported {result.inserted} FIR{result.inserted === 1 ? "" : "s"}
                {result.skipped > 0 && <span className="text-muted">· {result.skipped} skipped</span>}
              </div>
              {(result.createdDistricts.length > 0 || result.createdStations.length > 0 || result.createdCrimeTypes.length > 0) && (
                <p className="text-xs text-muted">
                  Auto-created lookups:{" "}
                  {[...result.createdDistricts.map((d) => `district ${d}`), ...result.createdStations.map((s) => `station ${s}`), ...result.createdCrimeTypes.map((c) => `crime-type ${c}`)].join(", ")}
                </p>
              )}
              {result.errors.length > 0 && (
                <div className="text-xs text-warning">
                  {result.errors.length} row error{result.errors.length === 1 ? "" : "s"}:{" "}
                  {result.errors.slice(0, 3).map((e) => `row ${e.row}: ${e.message}`).join("; ")}
                </div>
              )}
              <p className="text-[11px] text-muted">Refresh the dashboard or cases list to see the new records.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
