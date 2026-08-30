"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Barcode,
  Camera,
  Car,
  CheckCircle2,
  Database,
  FileImage,
  FileText,
  Fingerprint,
  FlaskConical,
  Link2,
  Loader2,
  ScanSearch,
  ScanText,
  Search,
  ShieldCheck,
  Upload,
  UserCheck,
  UserRoundSearch,
  Users,
} from "lucide-react";
import { Badge, EmptyState, RiskMeter, StatusBadge } from "@/components/ui";
import {
  analyzeEvidence,
  listRecords,
  type EvidenceAnalysisMode,
  type EvidenceAnalysisResult,
  type EvidenceCriminalIntelligence,
} from "@/lib/ai-client";
import { cn } from "@/lib/utils";

type Row = Record<string, unknown>;
type SelectedImage = { file: File; data: string };

const FIELD_MODES: Array<{ id: EvidenceAnalysisMode; label: string; description: string; icon: typeof Car }> = [
  { id: "plate", label: "Vehicle stop", description: "Plate to owner and FIRs", icon: Car },
  { id: "crowd", label: "Crowd watch", description: "Detect, compare, investigate", icon: Search },
  { id: "compareFace", label: "Face verify", description: "Two-image identity check", icon: UserCheck },
];

const LAB_MODES: Array<{ id: EvidenceAnalysisMode; label: string; icon: typeof ScanText }> = [
  { id: "ocr", label: "OCR", icon: ScanText },
  { id: "object", label: "Objects", icon: ScanSearch },
  { id: "face", label: "Faces", icon: UserRoundSearch },
  { id: "moderate", label: "Safety", icon: ShieldCheck },
  { id: "barcode", label: "Barcode", icon: Barcode },
];

const DEMO_ASSETS = {
  plate: "/demo-evidence/vehicle-ka03ab7161.png",
  crowd: "/demo-evidence/crowd-watch-ganesh-nayak.png",
  reference: "/demo-evidence/watchlist-ganesh-nayak.png",
};

const str = (row: Row | null | undefined, ...keys: string[]) => {
  for (const key of keys) if (row?.[key] != null) return String(row[key]);
  return "";
};
const num = (row: Row | null | undefined, ...keys: string[]) => {
  for (const key of keys) {
    const value = Number(row?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

function readImage(file: File): Promise<SelectedImage> {
  return new Promise((resolve, reject) => {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      reject(new Error("Select a JPEG, PNG, or WebP image."));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error("Each evidence image must be 6 MB or smaller."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ file, data: String(reader.result || "") });
    reader.onerror = () => reject(new Error("The image could not be read."));
    reader.readAsDataURL(file);
  });
}

async function bundledImage(url: string): Promise<SelectedImage> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("The bundled demo evidence could not be loaded.");
  const blob = await response.blob();
  return readImage(new File([blob], url.split("/").pop() || "demo-evidence.png", { type: blob.type || "image/png" }));
}

function ImageInput({
  label,
  selected,
  onSelect,
  capture,
}: {
  label: string;
  selected: SelectedImage | null;
  onSelect: (value: SelectedImage | null) => void;
  capture?: "user" | "environment";
}) {
  const id = `evidence-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="min-w-0">
      <div className="stat-label mb-2">{label}</div>
      <label
        htmlFor={id}
        className="group relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-elevated/30 transition-colors hover:border-accent/60"
      >
        {selected ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.data} alt={selected.file.name} className="h-full w-full object-contain" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-bg/90 px-3 py-2 text-xs text-subtle backdrop-blur">
              <span className="truncate">{selected.file.name}</span>
              <span className="shrink-0 text-accent">Replace</span>
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted">
            <Camera className="h-5 w-5 text-accent" /> Capture or select image
          </span>
        )}
      </label>
      <input
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture={capture}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) onSelect(null);
          else void readImage(file).then(onSelect).catch(() => onSelect(null));
          event.currentTarget.value = "";
        }}
      />
    </div>
  );
}

function facesCount(result: EvidenceAnalysisResult | null): number {
  const payload = result?.result as Row | undefined;
  const detection = (payload?.detection as Row | undefined) || payload;
  const data = detection?.data as Row | undefined;
  return num(detection, "faces_count") || num(data, "faces_count");
}

function IntelligenceResult({
  result,
  intelligence,
}: {
  result: EvidenceAnalysisResult;
  intelligence: EvidenceCriminalIntelligence | null;
}) {
  const criminal = intelligence?.criminal;
  const vehicle = result.correlation?.vehicle;
  const match = result.match;
  const firs = intelligence?.firs || [];
  const faceTotal = facesCount(result);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-4">
        {result.plate && <Badge tone="accent"><Car className="h-3 w-3" /> {result.plate}</Badge>}
        {match && (
          <Badge tone={match.matched ? "success" : "danger"}>
            {match.matched ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            {match.matched ? "Identity candidate matched" : "No identity match"}
          </Badge>
        )}
        {match && <Badge tone="muted">{Math.round(match.confidence * 100)}% confidence</Badge>}
        {faceTotal > 0 && <Badge tone="info"><Users className="h-3 w-3" /> {faceTotal} faces detected</Badge>}
        {result.resolved_fir_id && <Badge tone="success"><Link2 className="h-3 w-3" /> FIR {result.resolved_fir_id}</Badge>}
      </div>

      {vehicle && (
        <section>
          <div className="stat-label mb-2">Vehicle registry match</div>
          <div className="grid gap-3 border-l-2 border-accent bg-elevated/30 px-4 py-3 sm:grid-cols-3">
            <div><div className="text-xs text-muted">Registration</div><div className="mt-1 font-mono font-semibold">{str(vehicle, "plate")}</div></div>
            <div><div className="text-xs text-muted">Vehicle</div><div className="mt-1 font-medium">{[str(vehicle, "color"), str(vehicle, "make"), str(vehicle, "model")].filter(Boolean).join(" ")}</div></div>
            <div><div className="text-xs text-muted">Registry source</div><div className="mt-1 text-sm text-subtle">{result.correlation?.source === "catalyst-cloud-scale" ? "Cloud Scale" : "Synthetic demo registry"}</div></div>
          </div>
        </section>
      )}

      {criminal && (
        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="stat-label mb-1">Resolved watchlist profile</div>
              <div className="font-display text-xl font-bold">{str(criminal, "name")}</div>
              <div className="mt-1 text-sm text-muted">{str(criminal, "crime_category")} · {str(criminal, "home_district")}</div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={str(criminal, "status") || "unknown"} />
              <RiskMeter score={num(criminal, "risk_score")} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
            {[
              ["Linked FIRs", intelligence?.counts.firs || 0],
              ["Arrests", intelligence?.counts.arrests || 0],
              ["Vehicles", intelligence?.counts.vehicles || (vehicle ? 1 : 0)],
              ["Evidence items", intelligence?.counts.evidence || 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-elevated/70 px-3 py-3">
                <div className="stat-label">{label}</div>
                <div className="mt-1 font-display text-xl font-bold tabular-nums">{value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {firs.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="stat-label">Associated FIR history</div>
            <Badge tone="muted">{firs.length} returned</Badge>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-elevated text-muted"><tr><th className="px-3 py-2">FIR</th><th className="px-3 py-2">Offence</th><th className="px-3 py-2">District</th><th className="px-3 py-2">Role</th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-border/60">
                {firs.map((fir) => (
                  <tr key={str(fir, "ROWID", "id")} className="hover:bg-elevated/45">
                    <td className="px-3 py-2 font-mono text-subtle">{str(fir, "fir_number")}</td>
                    <td className="px-3 py-2">{str(fir, "crime_type")}</td>
                    <td className="px-3 py-2 text-muted">{str(fir, "district")}</td>
                    <td className="px-3 py-2 text-muted">{str(fir, "link_role").replace(/_/g, " ")}</td>
                    <td className="px-2"><Link href={`/cases/${num(fir, "id")}`} title="Open case file" className="grid h-7 w-7 place-items-center rounded-md text-accent hover:bg-accent/10"><FileText className="h-3.5 w-3.5" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result.text && (
        <section>
          <div className="stat-label mb-2">Extracted text</div>
          <div className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-border/70 bg-bg/50 p-3 font-mono text-xs leading-relaxed">{result.text}</div>
        </section>
      )}

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-4 text-xs text-muted">
        <span>Evidence <strong className="font-mono text-subtle">{result.evidence_id || "Pending"}</strong></span>
        <span>Audit <strong className="font-mono text-subtle">{result.audit_id || "Unavailable"}</strong></span>
        <span>Model <strong className="text-subtle">{result.model || "Catalyst Zia"}</strong></span>
      </div>

      {!!result.warnings?.length && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <span>{result.warnings.join(" ")}</span>
        </div>
      )}

      <details className="rounded-lg border border-border/70 bg-bg/40">
        <summary className="px-3 py-2 text-xs font-medium text-muted">Raw Zia response</summary>
        <pre className="max-h-64 overflow-auto border-t border-border/60 p-3 font-mono text-[11px] leading-relaxed text-subtle">{JSON.stringify(result.result ?? result.storage_ref ?? {}, null, 2)}</pre>
      </details>

      {(match?.matched || result.plate) && (
        <div className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span>This is an investigative lead. An officer must verify the source image, confidence, and FIR record before operational action.</span>
        </div>
      )}
    </div>
  );
}

export function EvidenceLab() {
  const [mode, setMode] = useState<EvidenceAnalysisMode>("plate");
  const [primary, setPrimary] = useState<SelectedImage | null>(null);
  const [reference, setReference] = useState<SelectedImage | null>(null);
  const [firId, setFirId] = useState("");
  const [criminalId, setCriminalId] = useState("");
  const [plateHint, setPlateHint] = useState("");
  const [description, setDescription] = useState("");
  const [firs, setFirs] = useState<Row[]>([]);
  const [criminals, setCriminals] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvidenceAnalysisResult | null>(null);

  const refreshHistory = () => listRecords("Evidence", 500, true).then((rows) => setHistory(rows
    .filter((row) => String(row.type || "").toUpperCase().startsWith("ZIA_"))
    .sort((a, b) => String(b.collected_at || b.CREATEDTIME || "").localeCompare(String(a.collected_at || a.CREATEDTIME || "")))
    .slice(0, 12)));

  useEffect(() => {
    void Promise.all([
      listRecords("Firs", 1000),
      listRecords("Criminals", 500),
      listRecords("Evidence", 500),
    ]).then(([firRows, criminalRows, evidenceRows]) => {
      setFirs(firRows.sort((a, b) => str(b, "occurred_at").localeCompare(str(a, "occurred_at"))));
      setCriminals(criminalRows.sort((a, b) => num(b, "risk_score") - num(a, "risk_score")));
      setHistory(evidenceRows
        .filter((row) => String(row.type || "").toUpperCase().startsWith("ZIA_"))
        .sort((a, b) => String(b.collected_at || b.CREATEDTIME || "").localeCompare(String(a.collected_at || a.CREATEDTIME || "")))
        .slice(0, 12));
    });
  }, []);

  const needsReference = mode === "compareFace" || mode === "crowd";
  const needsSubject = mode === "crowd";
  const intelligence = useMemo(
    () => result?.intelligence || result?.correlation?.intelligence || null,
    [result],
  );

  const switchMode = (next: EvidenceAnalysisMode) => {
    setMode(next);
    setPrimary(null);
    setReference(null);
    setPlateHint("");
    setResult(null);
    setError("");
  };

  const loadDemo = async (kind: "plate" | "crowd" | "compareFace") => {
    setDemoBusy(true);
    setError("");
    setResult(null);
    try {
      if (kind === "plate") {
        setMode("plate");
        setPrimary(await bundledImage(DEMO_ASSETS.plate));
        setReference(null);
        setCriminalId("");
        setDescription("Synthetic ANPR camera frame submitted during a vehicle stop.");
      } else {
        const [crowd, portrait] = await Promise.all([bundledImage(DEMO_ASSETS.crowd), bundledImage(DEMO_ASSETS.reference)]);
        setMode(kind);
        setPrimary(crowd);
        setReference(portrait);
        setCriminalId("66");
        setDescription("Synthetic CCTV frame compared with the selected NETRA watchlist profile.");
      }
      setFirId("");
      setPlateHint("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo evidence could not be loaded.");
    } finally {
      setDemoBusy(false);
    }
  };

  const run = async () => {
    if (!primary) { setError("Capture or select an evidence image first."); return; }
    if (needsReference && !reference) { setError("Select the watchlist/reference image."); return; }
    if (needsSubject && !criminalId) { setError("Select the watchlist subject to correlate."); return; }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await analyzeEvidence(mode, primary.data, {
        name: primary.file.name,
        mime: primary.file.type,
        fir_id: firId ? Number(firId) : undefined,
        criminal_id: criminalId ? Number(criminalId) : undefined,
        plate_hint: plateHint.trim() || undefined,
        description: description.trim() || undefined,
        language: "eng",
        image2: reference?.data,
        name2: reference?.file.name,
        mime2: reference?.file.type,
      });
      if (!response) throw new Error("Catalyst Zia did not return an analysis.");
      setResult(response);
      void refreshHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Evidence analysis failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="border-b border-border/60 pb-5">
        <div className="mb-3 flex items-center gap-2"><Fingerprint className="h-4 w-4 text-accent" /><h2 className="font-display text-base font-semibold">Field workflows</h2></div>
        <div className="grid gap-2 md:grid-cols-3">
          {FIELD_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={mode === item.id}
              onClick={() => switchMode(item.id)}
              className={cn(
                "flex min-h-[70px] items-center gap-3 rounded-lg border border-border bg-surface/45 px-4 text-left transition-colors hover:border-accent/45 hover:bg-elevated/60",
                mode === item.id && "border-accent/60 bg-accent/10",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-elevated"><item.icon className={cn("h-4 w-4", mode === item.id ? "text-accent" : "text-muted")} /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold">{item.label}</span><span className="mt-0.5 block text-xs text-muted">{item.description}</span></span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="h-3.5 w-3.5" /> Forensic tools</span>
        {LAB_MODES.map((item) => (
          <button key={item.id} type="button" aria-pressed={mode === item.id} onClick={() => switchMode(item.id)} className={cn("chip hover:border-accent/40 hover:text-fg", mode === item.id && "border-accent/50 bg-accent/10 text-accent")}>
            <item.icon className="h-3.5 w-3.5" /> {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
        <section className="card panel-pad self-start">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-display text-base font-semibold">Evidence intake</h2><p className="mt-1 text-xs text-muted">Originals are archived in Stratus with an immutable audit event.</p></div>
            <div className="flex flex-wrap gap-2">
              {mode === "plate" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("plate")} className="chip text-accent"><Car className="h-3.5 w-3.5" /> Load vehicle demo</button>}
              {mode === "crowd" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("crowd")} className="chip text-accent"><Users className="h-3.5 w-3.5" /> Load crowd demo</button>}
              {mode === "compareFace" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("compareFace")} className="chip text-accent"><UserCheck className="h-3.5 w-3.5" /> Load compare demo</button>}
            </div>
          </div>

          <div className={cn("grid gap-4", needsReference && "md:grid-cols-2")}>
            <ImageInput
              label={mode === "plate" ? "Vehicle / number plate image" : mode === "crowd" ? "Crowd / CCTV image" : "Evidence image"}
              selected={primary}
              onSelect={(image) => { setPrimary(image); setError(""); }}
              capture="environment"
            />
            {needsReference && <ImageInput label="Watchlist reference" selected={reference} onSelect={(image) => { setReference(image); setError(""); }} capture="user" />}
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="evidence-fir" className="stat-label mb-1.5 block">Incident FIR</label>
              <select id="evidence-fir" value={firId} onChange={(event) => setFirId(event.target.value)} className="input">
                <option value="">Auto-link from intelligence match</option>
                {firs.map((fir) => <option key={str(fir, "ROWID", "id")} value={str(fir, "id")}>{str(fir, "fir_number")} · {str(fir, "crime_type")}</option>)}
              </select>
            </div>
            {(needsSubject || mode === "compareFace") ? (
              <div>
                <label htmlFor="evidence-subject" className="stat-label mb-1.5 block">Watchlist subject</label>
                <select id="evidence-subject" value={criminalId} onChange={(event) => setCriminalId(event.target.value)} className="input">
                  <option value="">{needsSubject ? "Select a profile" : "No profile correlation"}</option>
                  {criminals.map((criminal) => <option key={str(criminal, "ROWID", "id")} value={str(criminal, "id")}>{str(criminal, "name")} · risk {num(criminal, "risk_score")} · {str(criminal, "status").replace(/_/g, " ")}</option>)}
                </select>
              </div>
            ) : mode === "plate" ? (
              <div>
                <label htmlFor="evidence-plate" className="stat-label mb-1.5 block">Manual plate correction</label>
                <input id="evidence-plate" value={plateHint} onChange={(event) => setPlateHint(event.target.value.toUpperCase())} className="input font-mono uppercase" placeholder="Use only if OCR needs correction" />
              </div>
            ) : null}
          </div>

          <div className="mt-4">
            <label htmlFor="evidence-description" className="stat-label mb-1.5 block">Evidence note</label>
            <input id="evidence-description" value={description} onChange={(event) => setDescription(event.target.value)} className="input" placeholder="Collection location, camera, exhibit, or seizure context" />
          </div>

          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}</div>}

          <button type="button" onClick={() => void run()} disabled={busy || !primary} className="btn-accent mt-5 w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Running Catalyst Zia..." : mode === "plate" ? "Read plate and investigate" : mode === "crowd" ? "Detect and check watchlist" : "Analyze and preserve evidence"}
          </button>
        </section>

        <section className="min-h-[470px] rounded-lg border border-border bg-surface/40 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-display text-base font-semibold">Investigation result</h2><p className="mt-1 text-xs text-muted">Zia inference combined with Cloud Scale records</p></div>
            {result?.audit_id && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Audited</Badge>}
          </div>
          {!result ? <EmptyState icon={FileImage} title="Awaiting evidence" hint="Run a field workflow or forensic tool to begin." /> : <IntelligenceResult result={result} intelligence={intelligence} />}
        </section>
      </div>

      <section className="border-t border-border/60 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-display text-base font-semibold">Evidence chain of custody</h2><p className="mt-1 text-xs text-muted">Latest Catalyst Cloud Scale evidence records</p></div>
          <Badge tone="muted"><Database className="h-3 w-3" /> {history.length}</Badge>
        </div>
        {history.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-elevated/60 text-muted"><tr><th className="px-3 py-2">Analysis</th><th className="px-3 py-2">Linked FIR</th><th className="px-3 py-2">Collected</th><th className="px-3 py-2">Evidence record</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {history.map((row) => (
                  <tr key={str(row, "ROWID", "id")}>
                    <td className="px-3 py-2 font-medium text-subtle">{str(row, "type") || "ZIA"}</td>
                    <td className="px-3 py-2 font-mono text-muted">{str(row, "fir_id") || "Unlinked"}</td>
                    <td className="px-3 py-2 text-muted">{str(row, "collected_at", "CREATEDTIME") || "-"}</td>
                    <td className="px-3 py-2 font-mono text-muted">{str(row, "ROWID", "id") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon={ScanSearch} title="No Zia evidence records" />}
      </section>
    </div>
  );
}
