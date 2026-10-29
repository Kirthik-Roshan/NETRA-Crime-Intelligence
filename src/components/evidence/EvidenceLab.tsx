"use client";
import { UiText, useUiText } from '@/components/UiText';


import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "@/components/AppLink";
import {
  AlertTriangle,
  Barcode,
  Camera,
  Car,
  CheckCircle2,
  Clock3,
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
  ScanFace,
  ShieldCheck,
  Upload,
  UserCheck,
  UserRoundSearch,
  Users,
  Video,
} from "lucide-react";
import { Badge, EmptyState, RiskMeter, StatusBadge } from "@/components/ui";
import { EvidenceChat } from './EvidenceChat';
import {
  analyzeCctvEvidence,
  analyzeEvidence,
  linkEvidenceToFir,
  listRecordBundle,
  listRecords,
  resolveEvidenceReference,
  type EvidenceAnalysisMode,
  type EvidenceAnalysisResult,
  type EvidenceCriminalIntelligence,
  type EvidenceReferenceLink,
} from "@/lib/ai-client";
import { cn } from "@/lib/utils";
import { syntheticProfileImage } from "@/lib/profile-assets";
import {
  CCTV_MAX_VIDEO_BYTES,
  extractVideoFrames,
  fileDataUrl,
  inspectVideo,
  type ExtractedVideoFrame,
  type SelectedVideo,
} from "@/lib/video-evidence";

type Row = Record<string, unknown>;
type SelectedImage = { file: File; data: string };

const FIELD_MODES: Array<{ id: EvidenceAnalysisMode; label: string; description: string; icon: typeof Car }> = [
  { id: "plate", label: "Vehicle stop", description: "Plate to FIR and associated records", icon: Car },
  { id: "crowd", label: "Crowd watch", description: "Detect, compare, investigate", icon: Search },
  { id: "compareFace", label: "Face verify", description: "Two-image identity check", icon: UserCheck },
  { id: "cctv", label: "CCTV watchlist", description: "Video frames to accused profile", icon: Video },
];

const LAB_MODES: Array<{ id: EvidenceAnalysisMode; label: string; icon: typeof ScanText }> = [
  { id: "ocr", label: "OCR", icon: ScanText },
  { id: "object", label: "Objects", icon: ScanSearch },
  { id: "face", label: "Faces", icon: UserRoundSearch },
  { id: "moderate", label: "Safety", icon: ShieldCheck },
  { id: "barcode", label: "Barcode", icon: Barcode },
];

const DEMO_ASSETS = {
  plate: "/demo-evidence/vehicle-ka03ab7161-v2.png",
  crowd: "/demo-evidence/crowd-watch-ganesh-nayak-v2.png",
  reference: syntheticProfileImage(15),
  fir: "/demo-evidence/fir-104060011202600001-v2.png",
};
const DEMO_FIR_NUMBER = "104060011202600001";

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

function timecode(seconds: number | null | undefined): string {
  const safe = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
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
      <div className="stat-label mb-2"><UiText text={label} /></div>
      <label
        htmlFor={id}
        className="group relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-elevated/30 transition-colors hover:border-accent/60"
      >
        {selected ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selected.data} alt={selected.file.name} className="h-full w-full object-contain" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-bg/90 px-3 py-2 text-xs text-subtle backdrop-blur">
              <span className="truncate"><UiText text={selected.file.name} /></span>
              <span className="shrink-0 text-accent"><UiText text={"Replace"} /></span>
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted">
            <Camera className="h-5 w-5 text-accent" /><UiText text={" Capture or select image"} /></span>
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

function VideoInput({
  selected,
  videoRef,
  onSelect,
  onError,
}: {
  selected: SelectedVideo | null;
  videoRef: RefObject<HTMLVideoElement>;
  onSelect: (value: SelectedVideo | null) => void;
  onError: (message: string) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="stat-label mb-2"><UiText text={"CCTV source clip"} /></div>
      <div className="group relative grid aspect-video w-full place-items-center overflow-hidden rounded-lg border border-dashed border-border bg-elevated/30 transition-colors hover:border-accent/60">
        {selected ? (
          <>
            <video ref={videoRef} src={selected.url} controls muted playsInline preload="metadata" className="h-full w-full bg-black object-contain" />
            <span className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-2 bg-bg/90 px-3 py-2 pr-20 text-xs text-subtle backdrop-blur">
              <span className="min-w-0 truncate"><UiText text={selected.file.name} /></span>
              <span className="shrink-0 font-mono">{timecode(selected.duration)}</span>
            </span>
            <label htmlFor="evidence-cctv-video" className="absolute right-2 top-1.5 z-10 cursor-pointer rounded border border-border bg-surface px-2 py-1 text-[11px] font-medium text-accent shadow-sm hover:border-accent/50"><UiText text={"Replace"} /></label>
          </>
        ) : (
          <label htmlFor="evidence-cctv-video" className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted">
            <Video className="h-6 w-6 text-accent" />
            <span><UiText text={"Upload CCTV footage"} /></span>
            <span className="text-[11px]"><UiText text={"MP4, WebM, or MOV · up to "} />{CCTV_MAX_VIDEO_BYTES / 1024 / 1024}<UiText text={" MB · 30 seconds"} /></span>
          </label>
        )}
      </div>
      <input
        id="evidence-cctv-video"
        type="file"
        accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (!file) onSelect(null);
          else void inspectVideo(file).then(onSelect).catch((cause) => onError(cause instanceof Error ? cause.message : "The CCTV clip could not be opened."));
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

function normalizedOcrLines(value: string): string[] {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t\u00a0 ]+/g, " ").trim())
    .filter(Boolean);
}

function parsedOcrFields(value: string): { fields: Array<{ label: string; value: string }>; notes: string[] } {
  const fields: Array<{ label: string; value: string }> = [];
  const notes: string[] = [];
  for (const line of normalizedOcrLines(value)) {
    if (/^FOR PROTOTYPE\b/i.test(line)) {
      notes.push(line);
      continue;
    }
    const match = line.match(/^([A-Z][A-Z /_-]{2,30}):\s*(.*)$/);
    if (match) {
      fields.push({ label: match[1].replace(/[_-]+/g, " ").trim(), value: match[2].trim() });
      continue;
    }
    const previous = fields.at(-1);
    if (previous && previous.label === "BRIEF FACTS") previous.value = `${previous.value} ${line}`.trim();
    else notes.push(line);
  }
  return { fields, notes };
}

function OcrFindings({
  result,
  onLinkRequest,
  linking,
}: {
  result: EvidenceAnalysisResult;
  onLinkRequest: () => void;
  linking: boolean;
}) {
  const parsed = parsedOcrFields(result.text || "");
  const hasStructuredDocument = parsed.fields.length >= 2;
  const isUnlinkedPlate = !!result.plate && !result.resolved_fir_id;
  const confidence = result.ocr_confidence == null
    ? null
    : Math.round(result.ocr_confidence <= 1 ? result.ocr_confidence * 100 : result.ocr_confidence);

  return (
    <section className="space-y-3">
      {result.plate && !result.correlation?.vehicle && (
        <div className="overflow-hidden rounded-lg border border-accent/35 bg-accent/5">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div>
              <div className="stat-label mb-1 text-accent"><UiText text={"Registration observed"} /></div>
              <div className="font-mono text-2xl font-bold tracking-normal text-fg"><UiText text={result.plate.replace(/^(KA)(\d{2})([A-Z]+)(\d+)$/, "$1 $2 $3 $4")} /></div>
              <div className="mt-1 text-xs text-muted"><UiText text={"Extracted from the submitted image by Catalyst Zia OCR"} /></div>
            </div>
            {isUnlinkedPlate && <button type="button" disabled={linking} onClick={onLinkRequest} className="btn-ghost h-8 px-2.5">{linking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} <UiText text={linking ? "Linking evidence..." : "Select FIR to correlate"} /></button>}
          </div>
        </div>
      )}

      {hasStructuredDocument ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><div className="stat-label"><UiText text={"Extracted record fields"} /></div>{confidence != null && <Badge tone="info"><UiText text={"OCR "} /><UiText text={confidence} />%</Badge>}</div>
          <dl className="grid overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {parsed.fields.map((field) => (
              <div key={`${field.label}-${field.value}`} className={cn("bg-surface px-3.5 py-3", field.label === "BRIEF FACTS" && "sm:col-span-2")}>
                <dt className="stat-label"><UiText text={field.label} /></dt>
                <dd className={cn("mt-1 text-sm leading-relaxed text-subtle", /NUMBER|SECTION/.test(field.label) && "font-mono font-medium text-fg")}>{field.value || "Not read"}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : !result.plate && result.text ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3"><div className="stat-label"><UiText text={"Recognized text"} /></div>{confidence != null && <Badge tone="info"><UiText text={"OCR "} /><UiText text={confidence} />%</Badge>}</div>
          <div className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border bg-surface">
            {normalizedOcrLines(result.text).map((line, index) => <div key={`${index}-${line}`} className="grid grid-cols-[28px_1fr] gap-2 px-3 py-2 text-xs"><span className="font-mono text-muted">{String(index + 1).padStart(2, "0")}</span><span className="break-words font-mono text-subtle"><UiText text={line} /></span></div>)}
          </div>
        </div>
      ) : null}

      {(hasStructuredDocument || result.plate) && result.text && (
        <details className="rounded-lg border border-border/70 bg-bg/40">
          <summary className="cursor-pointer px-3 py-2 text-xs font-medium text-muted"><UiText text={"Normalized OCR transcript"} /></summary>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words border-t border-border/60 p-3 font-mono text-[11px] leading-relaxed text-subtle">{normalizedOcrLines(result.text).join("\n")}</pre>
        </details>
      )}
    </section>
  );
}

function CctvFindings({
  result,
  intelligence,
  onSeek,
}: {
  result: EvidenceAnalysisResult;
  intelligence: EvidenceCriminalIntelligence | null;
  onSeek: (timestamp: number) => void;
}) {
  const analysis = result.video_analysis;
  if (!analysis) return null;
  const target = intelligence?.criminal || result.target_profile;
  const targetId = num(target, "id") || analysis.target_profile_id || 0;
  const best = analysis.frames.find((frame) => frame.index === analysis.best_frame_index) || analysis.frames[0];
  const confidence = Math.round((result.match?.confidence || 0) * 100);

  return (
    <section className="space-y-4">
      <div className={cn("overflow-hidden rounded-lg border", result.match?.matched ? "border-success/40 bg-success/8" : "border-warning/40 bg-warning/8")}>
        <div className="grid gap-4 p-4 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:items-center">
          <div className={cn("relative h-[72px] w-[72px] overflow-hidden rounded-full border-2 bg-elevated", result.match?.matched ? "border-success" : "border-warning")}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {targetId ? <img src={syntheticProfileImage(targetId)} alt="Registered synthetic reference" className="h-full w-full object-cover" /> : <UserCheck className="m-auto h-full w-8 text-muted" />}
          </div>
          <div className="min-w-0">
            <div className="stat-label mb-1"><UiText text={"Uploaded reference comparison"} /></div>
            <div className="font-display text-xl font-bold"><UiText text={str(target, "name") || "Unregistered reference"} /></div>
            <div className="mt-1 text-xs text-muted">
              <UiText text={result.match?.matched
                ? `Reference match observed at ${timecode(analysis.best_timestamp)}`
                : "Identity was not confirmed in the sampled CCTV frames"} />
            </div>
          </div>
          <div className="flex items-center gap-3 sm:flex-col sm:items-end">
            <div className={cn("font-display text-3xl font-bold tabular-nums", result.match?.matched ? "text-success" : "text-warning")}><UiText text={confidence} />%</div>
            <Badge tone={result.match?.matched ? "success" : "warning"}><UiText text={result.match?.matched ? "Candidate match" : "No confirmed match"} /></Badge>
          </div>
        </div>
        {intelligence?.criminal && targetId > 0 && (
          <div className="flex flex-wrap gap-2 border-t border-border/60 px-4 py-3">
            <Link href={`/criminals/record?id=${targetId}`} className="btn-ghost h-8 text-xs"><UserRoundSearch className="h-3.5 w-3.5" /><UiText text={" Open accused record"} /></Link>
            <Link href={`/network?focus=${targetId}`} className="btn-ghost h-8 text-xs"><Link2 className="h-3.5 w-3.5" /><UiText text={" Open relationship graph"} /></Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-4">
        {[
          ["Clip duration", timecode(analysis.duration_seconds)],
          ["Frames sampled", analysis.sample_count],
          ["Usable comparisons", analysis.successful_frames],
          ["Matching frames", analysis.matching_frames],
        ].map(([label, value]) => (
          <div key={String(label)} className="bg-surface px-3 py-3">
            <div className="stat-label"><UiText text={label} /></div>
            <div className="mt-1 font-mono text-lg font-semibold tabular-nums"><UiText text={value} /></div>
          </div>
        ))}
      </div>

      {best?.preview && (
        <button type="button" onClick={() => onSeek(best.timestamp)} className="group relative block w-full overflow-hidden rounded-lg border border-border bg-black text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={best.preview} alt={`Best CCTV frame at ${timecode(best.timestamp)}`} className="aspect-video w-full object-contain" />
          <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-bg/90 px-3 py-2 text-xs backdrop-blur">
            <span className="flex items-center gap-2 font-medium"><ScanFace className="h-3.5 w-3.5 text-accent" /><UiText text={" Strongest candidate frame"} /></span>
            <span className="font-mono">{timecode(best.timestamp)} · {Math.round(best.confidence * 100)}%</span>
          </span>
        </button>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between gap-3"><div className="stat-label"><UiText text={"Comparison timeline"} /></div><span className="text-[11px] text-muted"><UiText text={"Select a frame to seek the source clip"} /></span></div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {analysis.frames.map((frame) => (
            <button
              type="button"
              key={`${frame.index}-${frame.timestamp}`}
              onClick={() => onSeek(frame.timestamp)}
              className={cn("overflow-hidden rounded-lg border bg-elevated/35 text-left transition-colors hover:border-accent/60", frame.matched ? "border-success/55" : frame.error ? "border-danger/45" : "border-border")}
            >
              {frame.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={frame.preview} alt={`CCTV sample ${frame.index + 1}`} className="aspect-video w-full bg-black object-cover" />
              ) : <div className="grid aspect-video place-items-center bg-bg"><Video className="h-4 w-4 text-muted" /></div>}
              <span className="flex items-center justify-between gap-2 px-2 py-2 text-[11px]">
                <span className="flex items-center gap-1 font-mono"><Clock3 className="h-3 w-3 text-muted" /> {timecode(frame.timestamp)}</span>
                <span className={cn("font-semibold", frame.matched ? "text-success" : frame.error ? "text-danger" : "text-muted")}><UiText text={frame.error ? "Failed" : `${Math.round(frame.confidence * 100)}%`} /></span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-accent/25 bg-accent/5 p-3 text-xs leading-relaxed text-muted">
        <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-accent" />
        <span><UiText text={"Zia compared the sampled frames with the uploaded reference. Registered fictional portraits resolve their own profile by file fingerprint; this is not a search for identities across a face database."} /></span>
      </div>
    </section>
  );
}

function IntelligenceResult({
  result,
  intelligence,
  onLinkRequest,
  linking,
  onVideoSeek,
}: {
  result: EvidenceAnalysisResult;
  intelligence: EvidenceCriminalIntelligence | null;
  onLinkRequest: () => void;
  linking: boolean;
  onVideoSeek: (timestamp: number) => void;
}) {
  const ui = useUiText();
  const criminal = intelligence?.criminal;
  const vehicle = result.correlation?.vehicle;
  const vehicleFirs = result.correlation?.associated_firs || [];
  const match = result.match;
  const firs = intelligence?.firs || [];
  const caseBundle = result.case_intelligence;
  const matchedFir = caseBundle?.fir;
  const faceTotal = facesCount(result);
  const resolvedFirLabel = str(matchedFir, "fir_number")
    || str(vehicle, "linked_fir_number")
    || result.detected_fir_number
    || str(firs[0], "fir_number")
    || `Case ${result.resolved_fir_id}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 pb-4">
        {result.plate && <Badge tone="accent"><Car className="h-3 w-3" /> <UiText text={result.plate} /></Badge>}
        {match && (
          <Badge tone={match.matched ? "success" : "danger"}>
            {match.matched ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
            <UiText text={match.matched ? "Reference match" : "No reference match"} />
          </Badge>
        )}
        {match && <Badge tone="muted">{Math.round(match.confidence * 100)}<UiText text={"% confidence"} /></Badge>}
        {faceTotal > 0 && <Badge tone="info"><Users className="h-3 w-3" /> <UiText text={faceTotal} /><UiText text={" faces detected"} /></Badge>}
        {result.resolved_fir_id && <Badge tone="success"><Link2 className="h-3 w-3" /><UiText text={" FIR "} /><UiText text={resolvedFirLabel} /></Badge>}
      </div>

      {result.video_analysis && <CctvFindings result={result} intelligence={intelligence} onSeek={onVideoSeek} />}

      {vehicle && (
        <section>
          <div className="stat-label mb-2"><UiText text={"Vehicle intelligence linkage"} /></div>
          <div className="grid gap-3 border-l-2 border-accent bg-elevated/30 px-4 py-3 sm:grid-cols-4">
            <div><div className="text-xs text-muted"><UiText text={"Registration"} /></div><div className="mt-1 font-mono font-semibold">{str(vehicle, "plate")}</div></div>
            <div><div className="text-xs text-muted"><UiText text={"Registered vehicle"} /></div><div className="mt-1 text-sm font-medium">{str(vehicle, "color")} {str(vehicle, "make")} {str(vehicle, "model")}</div></div>
            <div><div className="text-xs text-muted"><UiText text={"Vehicle-theft FIRs"} /></div><div className="mt-1 font-mono font-medium"><UiText text={vehicleFirs.length} /></div></div>
            <div><div className="text-xs text-muted"><UiText text={"Record basis"} /></div><div className="mt-1 text-sm text-subtle"><UiText text={"Synthetic registry + official KSP case joins"} /></div></div>
          </div>
          {result.correlation?.duplicate_plate_observed && <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-xs text-warning"><AlertTriangle className="mt-px h-4 w-4 shrink-0" /><span><UiText text={"The same registration was observed on car and motorcycle evidence. Treat this as a possible duplicate or cloned plate and verify both source images."} /></span></div>}
          {vehicleFirs.length > 0 && <div className="mt-3 overflow-hidden rounded-lg border border-border"><div className="border-b border-border bg-elevated px-3 py-2 stat-label"><UiText text={"FIRs associated with this vehicle"} /></div>{vehicleFirs.map((fir) => <Link key={str(fir, "id")} href={`/cases/record?id=${num(fir, "id")}`} className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2.5 text-xs last:border-b-0 hover:bg-elevated/50"><span><span className="font-mono font-medium text-fg">{str(fir, "fir_number")}</span><span className="ml-3 text-muted">{str(fir, "district")} · {str(fir, "occurred_at").slice(0, 10)}</span></span><FileText className="h-3.5 w-3.5 shrink-0 text-accent" /></Link>)}</div>}
        </section>
      )}

      {matchedFir && (
        <section className="rounded-lg border border-success/35 bg-success/10 p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="stat-label mb-1 text-success"><UiText text={"Official CaseMaster match"} /></div>
              <div className="font-mono text-base font-semibold text-fg"><UiText text={"FIR "} />{str(matchedFir, "fir_number")}</div>
              <div className="mt-1 text-sm text-muted">{str(matchedFir, "crime_type")} · {str(matchedFir, "station_name")} · {str(matchedFir, "district")}</div>
            </div>
            <Link href={`/cases/record?id=${num(matchedFir, "id")}`} className="btn-ghost h-8 px-2.5" title={ui("Open the resolved case file")}>
              <FileText className="h-3.5 w-3.5" /><UiText text={" Open case"} /></Link>
          </div>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
            {[
              ["Accused", caseBundle?.suspects.length || 0],
              ["Victims", caseBundle?.victims.length || 0],
              ["Arrests", caseBundle?.arrests.length || 0],
              ["Chargesheets", caseBundle?.chargesheets.length || 0],
            ].map(([label, value]) => <div key={String(label)} className="bg-surface px-3 py-2.5"><div className="stat-label"><UiText text={label} /></div><div className="mt-1 font-display text-lg font-bold"><UiText text={value} /></div></div>)}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">{str(matchedFir, "description")}</p>
        </section>
      )}

      {criminal && (
        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="stat-label mb-1"><UiText text={"Resolved watchlist profile"} /></div>
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
                <div className="stat-label"><UiText text={label} /></div>
                <div className="mt-1 font-display text-xl font-bold tabular-nums"><UiText text={value} /></div>
              </div>
            ))}
          </div>
        </section>
      )}

      {firs.length > 0 && (
        <section>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="stat-label"><UiText text={"Associated FIR history"} /></div>
            <Badge tone="muted"><UiText text={firs.length} /><UiText text={" returned"} /></Badge>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-elevated text-muted"><tr><th className="px-3 py-2"><UiText text={"FIR"} /></th><th className="px-3 py-2"><UiText text={"Offence"} /></th><th className="px-3 py-2"><UiText text={"District"} /></th><th className="px-3 py-2"><UiText text={"Role"} /></th><th className="w-10" /></tr></thead>
              <tbody className="divide-y divide-border/60">
                {firs.map((fir) => (
                  <tr key={str(fir, "ROWID", "id")} className="hover:bg-elevated/45">
                    <td className="px-3 py-2 font-mono text-subtle">{str(fir, "fir_number")}</td>
                    <td className="px-3 py-2">{str(fir, "crime_type")}</td>
                    <td className="px-3 py-2 text-muted">{str(fir, "district")}</td>
                    <td className="px-3 py-2 text-muted"><UiText text={str(fir, "link_role").replace(/_/g, " ")} /></td>
                    <td className="px-2"><Link href={`/cases/record?id=${num(fir, "id")}`} title={ui("Open case file")} className="grid h-7 w-7 place-items-center rounded-md text-accent hover:bg-accent/10"><FileText className="h-3.5 w-3.5" /></Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {result.text && <OcrFindings result={result} onLinkRequest={onLinkRequest} linking={linking} />}

      <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-border/60 pt-4 text-xs text-muted">
        <span><UiText text={"Evidence "} /><strong className="font-mono text-subtle">{result.evidence_id || "Pending"}</strong></span>
        <span><UiText text={"Audit "} /><strong className="font-mono text-subtle">{result.audit_id || "Unavailable"}</strong></span>
        <span><UiText text={"Model "} /><strong className="text-subtle">{result.model || "Catalyst Zia"}</strong></span>
      </div>

      {!!result.warnings?.length && (
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-warning">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0" />
          <span>{result.warnings.join(" ")}</span>
        </div>
      )}

      <details className="rounded-lg border border-border/70 bg-bg/40">
        <summary className="px-3 py-2 text-xs font-medium text-muted"><UiText text={"Raw Zia response"} /></summary>
        <pre className="max-h-64 overflow-auto border-t border-border/60 p-3 font-mono text-[11px] leading-relaxed text-subtle">{JSON.stringify(result.result ?? result.storage_ref ?? {}, null, 2)}</pre>
      </details>

      {(match?.matched || result.plate) && (
        <div className="flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span><UiText text={"This is an investigative lead. An officer must verify the source image, confidence, and FIR record before operational action."} /></span>
        </div>
      )}
    </div>
  );
}

export function EvidenceLab() {
  const ui = useUiText();
  const [mode, setMode] = useState<EvidenceAnalysisMode>("plate");
  const [primary, setPrimary] = useState<SelectedImage | null>(null);
  const [reference, setReference] = useState<SelectedImage | null>(null);
  const [cctvVideo, setCctvVideo] = useState<SelectedVideo | null>(null);
  const [videoFrames, setVideoFrames] = useState<ExtractedVideoFrame[]>([]);
  const [scanStage, setScanStage] = useState("");
  const [firId, setFirId] = useState("");
  const [referenceLink, setReferenceLink] = useState<EvidenceReferenceLink | null>(null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState("");
  const [plateHint, setPlateHint] = useState("");
  const [description, setDescription] = useState("");
  const [firs, setFirs] = useState<Row[]>([]);
  const [history, setHistory] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<EvidenceAnalysisResult | null>(null);
  const firSelectRef = useRef<HTMLSelectElement>(null);
  const videoElementRef = useRef<HTMLVideoElement>(null);
  const videoUrlRef = useRef("");

  const refreshHistory = () => listRecords("Evidence", 500, true).then((rows) => setHistory(rows
    .filter((row) => String(row.type || "").toUpperCase().startsWith("ZIA_"))
    .sort((a, b) => String(b.collected_at || b.CREATEDTIME || "").localeCompare(String(a.collected_at || a.CREATEDTIME || "")))
    .slice(0, 12)));

  useEffect(() => {
    void Promise.all([
      listRecordBundle(["Firs"]),
      listRecords("Evidence", 500),
    ]).then(([bundle, evidenceRows]) => {
      const firRows = bundle.Firs || [];
      setFirs(firRows.sort((a, b) => str(b, "occurred_at").localeCompare(str(a, "occurred_at"))));
      setHistory(evidenceRows
        .filter((row) => String(row.type || "").toUpperCase().startsWith("ZIA_"))
        .sort((a, b) => String(b.collected_at || b.CREATEDTIME || "").localeCompare(String(a.collected_at || a.CREATEDTIME || "")))
        .slice(0, 12));
    });
  }, []);

  useEffect(() => () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current);
  }, []);

  useEffect(() => {
    let current = true;
    setReferenceLink(null);
    setReferenceError("");
    setReferenceBusy(!!reference);
    if (reference) void resolveEvidenceReference(reference.data, reference.file.name, reference.file.type)
      .then(link => { if (current) setReferenceLink(link); })
      .catch(cause => { if (current) setReferenceError(cause instanceof Error ? cause.message : "Reference lookup unavailable."); })
      .finally(() => { if (current) setReferenceBusy(false); });
    return () => { current = false; };
  }, [reference]);

  const needsReference = mode === "compareFace" || mode === "crowd" || mode === "cctv";
  const intelligence = useMemo(
    () => result?.intelligence || result?.correlation?.intelligence || null,
    [result],
  );
  const selectedFir = useMemo(
    () => firs.find((fir) => String(num(fir, "id")) === firId) || null,
    [firId, firs],
  );

  const replaceVideo = (next: SelectedVideo | null) => {
    if (videoUrlRef.current && videoUrlRef.current !== next?.url) URL.revokeObjectURL(videoUrlRef.current);
    videoUrlRef.current = next?.url || "";
    setCctvVideo(next);
    setVideoFrames([]);
    setResult(null);
    setScanStage("");
    setError("");
  };

  const seekVideo = (timestamp: number) => {
    const video = videoElementRef.current;
    if (!video) return;
    video.pause();
    video.currentTime = Math.max(0, Math.min(video.duration || timestamp, timestamp));
    video.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const openFirSelector = () => {
    const select = firSelectRef.current;
    if (!select) return;
    select.scrollIntoView({ behavior: "smooth", block: "center" });
    select.focus({ preventScroll: true });
    const picker = select as HTMLSelectElement & { showPicker?: () => void };
    try {
      if (picker.showPicker) picker.showPicker();
      else select.click();
    } catch {
      select.focus();
    }
  };

  const correlateToFir = async (nextFirId: string) => {
    const numericFirId = Number(nextFirId);
    if (!result || !Number.isSafeInteger(numericFirId) || numericFirId <= 0) return;
    setLinkBusy(true);
    setError("");
    try {
      const linked = await linkEvidenceToFir(result, numericFirId);
      setResult((current) => {
        if (!current) return current;
        const retainedWarnings = (current.warnings || []).filter((warning) => !/vehicle registry|select an (?:official )?incident fir|select an fir|organizer-specified ksp schema/i.test(warning));
        return {
          ...current,
          ...linked,
          warnings: [...retainedWarnings, ...(linked.warnings || [])],
        };
      });
      void refreshHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The evidence could not be linked to the selected FIR.");
    } finally {
      setLinkBusy(false);
    }
  };

  const switchMode = (next: EvidenceAnalysisMode) => {
    setMode(next);
    setPrimary(null);
    setReference(null);
    replaceVideo(null);
    setPlateHint("");
    setResult(null);
    setError("");
    if (next === "cctv") {
      setDescription("Synthetic CCTV clip submitted for dynamic frame extraction and uploaded-reference comparison.");
    }
  };

  const loadDemo = async (kind: "plate" | "crowd" | "compareFace" | "fir") => {
    setDemoBusy(true);
    setError("");
    setResult(null);
    try {
      if (kind === "fir") {
        setMode("ocr");
        setPrimary(await bundledImage(DEMO_ASSETS.fir));
        setReference(null);
        setFirId("");
        setDescription("Synthetic FIR sheet submitted for OCR and automatic CaseMaster resolution.");
      } else if (kind === "plate") {
        const availableFirs = firs.length ? firs : await listRecords("Firs", 1000, true);
        const demoFir = availableFirs.find((row) => str(row, "fir_number") === DEMO_FIR_NUMBER)
          || availableFirs.find((row) => str(row, "crime_type").toLowerCase().includes("vehicle"))
          || availableFirs[0];
        setMode("plate");
        setPrimary(await bundledImage(DEMO_ASSETS.plate));
        setReference(null);
        setFirId(demoFir ? String(num(demoFir, "id")) : "");
        setDescription("Synthetic ANPR camera frame submitted during a vehicle stop.");
      } else {
        const [crowd, portrait] = await Promise.all([bundledImage(DEMO_ASSETS.crowd), bundledImage(DEMO_ASSETS.reference)]);
        setMode(kind);
        setPrimary(crowd);
        setReference(portrait);
        setFirId("");
        setDescription("Synthetic crowd image compared with a registered fictional reference portrait; record linkage requires a Zia match.");
      }
      setPlateHint("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo evidence could not be loaded.");
    } finally {
      setDemoBusy(false);
    }
  };

  const run = async () => {
    if (mode === "cctv") {
      if (!cctvVideo) { setError("Upload a CCTV video clip first."); return; }
      if (!reference) { setError("Upload the reference portrait first. Its registered profile will be linked automatically after a match."); return; }
      setBusy(true);
      setError("");
      setResult(null);
      setVideoFrames([]);
      try {
        setScanStage("Extracting frames from the uploaded clip...");
        const frames = await extractVideoFrames(cctvVideo, (complete, total) => {
          setScanStage(`Extracting frame ${complete} of ${total}...`);
        });
        setVideoFrames(frames);
        setScanStage(`Comparing ${frames.length} frames with Catalyst Zia...`);
        const videoData = await fileDataUrl(cctvVideo.file);
        const response = await analyzeCctvEvidence({
          video: videoData,
          video_name: cctvVideo.file.name,
          video_mime: cctvVideo.file.type || (/\.webm$/i.test(cctvVideo.file.name) ? "video/webm" : /\.mov$/i.test(cctvVideo.file.name) ? "video/quicktime" : "video/mp4"),
          duration_seconds: cctvVideo.duration,
          frames: frames.map((frame) => ({ index: frame.index, timestamp: frame.timestamp, image: frame.data })),
          reference: reference.data,
          reference_name: reference.file.name,
          reference_mime: reference.file.type,
          fir_id: firId ? Number(firId) : undefined,
          description: description.trim() || undefined,
        });
        if (!response) throw new Error("Catalyst Zia did not return a CCTV analysis.");
        const previewByIndex = new Map(frames.map((frame) => [frame.index, frame.data]));
        if (response.video_analysis) {
          response.video_analysis = {
            ...response.video_analysis,
            frames: response.video_analysis.frames.map((frame) => ({ ...frame, preview: previewByIndex.get(frame.index) })),
          };
        }
        setResult(response);
        setScanStage("");
        void refreshHistory();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "CCTV watchlist analysis failed.");
        setScanStage("");
      } finally {
        setBusy(false);
      }
      return;
    }
    if (!primary) { setError("Capture or select an evidence image first."); return; }
    if (needsReference && !reference) { setError("Select the watchlist/reference image."); return; }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const response = await analyzeEvidence(mode, primary.data, {
        name: primary.file.name,
        mime: primary.file.type,
        fir_id: firId ? Number(firId) : undefined,
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
        <div className="mb-3 flex items-center gap-2"><Fingerprint className="h-4 w-4 text-accent" /><h2 className="font-display text-base font-semibold"><UiText text={"Field workflows"} /></h2></div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {FIELD_MODES.map((item) => (
            <button
              key={item.id}
              type="button"
              disabled={busy || demoBusy}
              aria-pressed={mode === item.id}
              onClick={() => switchMode(item.id)}
              className={cn(
                "flex min-h-[70px] items-center gap-3 rounded-lg border border-border bg-surface/45 px-4 text-left transition-colors hover:border-accent/45 hover:bg-elevated/60",
                mode === item.id && "border-accent/60 bg-accent/10",
              )}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-elevated"><item.icon className={cn("h-4 w-4", mode === item.id ? "text-accent" : "text-muted")} /></span>
              <span className="min-w-0"><span className="block text-sm font-semibold"><UiText text={item.label} /></span><span className="mt-0.5 block text-xs text-muted"><UiText text={item.description} /></span></span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 flex items-center gap-1.5 text-xs text-muted"><FlaskConical className="h-3.5 w-3.5" /><UiText text={" Forensic tools"} /></span>
        {LAB_MODES.map((item) => (
          <button key={item.id} type="button" disabled={busy || demoBusy} aria-pressed={mode === item.id} onClick={() => switchMode(item.id)} className={cn("chip hover:border-accent/40 hover:text-fg", mode === item.id && "border-accent/50 bg-accent/10 text-accent")}>
            <item.icon className="h-3.5 w-3.5" /> <UiText text={item.label} />
          </button>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(440px,1.1fr)]">
        <fieldset disabled={busy || demoBusy} className="card panel-pad min-w-0 self-start">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="font-display text-base font-semibold"><UiText text={"Evidence intake"} /></h2><p className="mt-1 text-xs text-muted"><UiText text={"Originals are archived in Stratus with an immutable audit event."} /></p></div>
            <div className="flex flex-wrap gap-2">
              {mode === "plate" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("plate")} className="chip text-accent"><Car className="h-3.5 w-3.5" /><UiText text={" Load vehicle demo"} /></button>}
              {mode === "crowd" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("crowd")} className="chip text-accent"><Users className="h-3.5 w-3.5" /><UiText text={" Load crowd demo"} /></button>}
              {mode === "compareFace" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("compareFace")} className="chip text-accent"><UserCheck className="h-3.5 w-3.5" /><UiText text={" Load compare demo"} /></button>}
              {mode === "ocr" && <button type="button" disabled={demoBusy} onClick={() => void loadDemo("fir")} className="chip text-accent"><FileText className="h-3.5 w-3.5" /><UiText text={" Load FIR scan"} /></button>}
            </div>
          </div>

          <div className={cn("grid gap-4", needsReference && "md:grid-cols-2")}>
            {mode === "cctv" ? (
              <VideoInput
                selected={cctvVideo}
                videoRef={videoElementRef}
                onSelect={replaceVideo}
                onError={(message) => { replaceVideo(null); setError(message); }}
              />
            ) : (
              <ImageInput
                label={mode === "plate" ? "Vehicle / number plate image" : mode === "crowd" ? "Crowd / CCTV image" : "Evidence image"}
                selected={primary}
                onSelect={(image) => { setPrimary(image); setResult(null); setError(""); }}
                capture="environment"
              />
            )}
            {needsReference && <ImageInput label={mode === "cctv" ? "Target watchlist portrait" : "Watchlist reference"} selected={reference} onSelect={(image) => { setReference(image); setResult(null); setError(""); }} capture="user" />}
          </div>

          {mode === "cctv" && (scanStage || videoFrames.length > 0) && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-accent/25 bg-accent/5 px-3 py-2 text-xs text-subtle">
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-accent" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
              <span>{scanStage || `${videoFrames.length} runtime frames extracted from this clip.`}</span>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="evidence-fir" className="stat-label mb-1.5 block"><UiText text={"Incident FIR"} /></label>
              <select
                ref={firSelectRef}
                id="evidence-fir"
                value={firId}
                disabled={linkBusy}
                onChange={(event) => {
                  const nextFirId = event.target.value;
                  setFirId(nextFirId);
                  setError("");
                  if (nextFirId && result && Number(nextFirId) !== result.resolved_fir_id) void correlateToFir(nextFirId);
                }}
                className="input"
              >
                <option value=""><UiText text={"Auto-link from intelligence match"} /></option>
                {firs.map((fir) => <option key={str(fir, "ROWID", "id")} value={str(fir, "id")}>{str(fir, "fir_number")} · {str(fir, "crime_type")}</option>)}
              </select>
            </div>
            {needsReference ? (
              <div>
                <div className="stat-label mb-1.5"><UiText text={"Automatic reference linkage"} /></div>
                <div role="status" className="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2 text-xs leading-relaxed">
                  <div className="flex items-center gap-2 font-semibold">
                    {referenceBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4 text-accent" />}
                    <UiText text={referenceBusy ? "Checking uploaded reference..." : referenceLink?.name || (reference ? "Reference not linked" : "Upload a reference portrait")} />
                  </div>
                  <p className="mt-1 text-muted"><UiText text={referenceError || referenceLink?.notice || "No name selection needed. A registered synthetic portrait links automatically; matching evidence unlocks its case details."} /></p>
                </div>
              </div>
            ) : mode === "plate" ? (
              <div>
                <label htmlFor="evidence-plate" className="stat-label mb-1.5 block"><UiText text={"Manual plate correction"} /></label>
                <input id="evidence-plate" value={plateHint} onChange={(event) => setPlateHint(event.target.value.toUpperCase())} className="input font-mono uppercase" placeholder={ui("Use only if OCR needs correction")} />
              </div>
            ) : null}
          </div>

          <div className={`mt-3 flex items-start gap-3 rounded-lg border px-3 py-3 text-xs ${selectedFir ? "border-success/35 bg-success/8" : "border-warning/35 bg-warning/8"}`}>
            <Link2 className={`mt-0.5 h-4 w-4 shrink-0 ${selectedFir ? "text-success" : "text-warning"}`} />
            {selectedFir ? (
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-fg"><UiText text={linkBusy ? "Linking evidence to official FIR..." : result?.resolved_fir_id === num(selectedFir, "id") ? "Evidence linked to official FIR" : "Official FIR selected for evidence linkage"} /></div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-muted">
                  <span className="font-mono">{str(selectedFir, "fir_number")}</span>
                  <span>{str(selectedFir, "crime_type")}</span>
                  <span>{str(selectedFir, "district")}</span>
                </div>
              </div>
            ) : (
              <div><span className="font-semibold text-fg"><UiText text={"Automatic correlation enabled."} /></span> <UiText text={mode === "cctv" ? "A confirmed watchlist candidate resolves their official FIR history; an incident FIR can also be selected for direct chain-of-custody linkage." : "Select an FIR when demonstrating chain-of-custody linkage so the evidence row is persisted against that official case."} /></div>
            )}
          </div>

          <div className="mt-4">
            <label htmlFor="evidence-description" className="stat-label mb-1.5 block"><UiText text={"Evidence note"} /></label>
            <input id="evidence-description" value={description} onChange={(event) => setDescription(event.target.value)} className="input" placeholder={ui("Collection location, camera, exhibit, or seizure context")} />
          </div>

          {error && <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> <UiText text={error} /></div>}

          <button type="button" onClick={() => void run()} disabled={busy || demoBusy || referenceBusy || (mode === "cctv" ? !cctvVideo : !primary)} className="btn-accent mt-5 w-full sm:w-auto">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "cctv" ? <Video className="h-4 w-4" /> : <Upload className="h-4 w-4" />}
            <UiText text={busy ? scanStage || "Running Catalyst Zia..." : mode === "plate" ? "Read plate and investigate" : mode === "crowd" ? "Detect and check watchlist" : mode === "cctv" ? "Split clip and find target" : "Analyze and preserve evidence"} />
          </button>
        </fieldset>

        <section className="min-h-[470px] rounded-lg border border-border bg-surface/40 p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><h2 className="font-display text-base font-semibold"><UiText text={"Investigation result"} /></h2><p className="mt-1 text-xs text-muted"><UiText text={mode === "cctv" ? "Dynamic frame comparison with official KSP profile and FIR context" : "Zia inference combined with Cloud Scale records"} /></p></div>
            {result?.audit_id && <Badge tone="success"><CheckCircle2 className="h-3 w-3" /><UiText text={" Audited"} /></Badge>}
          </div>
          {!result ? <EmptyState icon={mode === "cctv" ? Video : FileImage} title={busy && mode === "cctv" ? "Analyzing CCTV frames" : "Awaiting evidence"} hint={busy && mode === "cctv" ? scanStage : "Run a field workflow or forensic tool to begin."} /> : <IntelligenceResult result={result} intelligence={intelligence} onLinkRequest={openFirSelector} linking={linkBusy} onVideoSeek={seekVideo} />}
          {result && <EvidenceChat key={`${result.record_id || result.evidence_id || result.audit_id}:${result.resolved_fir_id || ''}`} recordId={result.record_id} evidenceId={result.evidence_id} />}
        </section>
      </div>

      <section className="border-t border-border/60 pt-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div><h2 className="font-display text-base font-semibold"><UiText text={"Evidence chain of custody"} /></h2><p className="mt-1 text-xs text-muted"><UiText text={"Latest Catalyst Cloud Scale evidence records"} /></p></div>
          <Badge tone="muted"><Database className="h-3 w-3" /> <UiText text={history.length} /></Badge>
        </div>
        {history.length ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-elevated/60 text-muted"><tr><th className="px-3 py-2"><UiText text={"Analysis"} /></th><th className="px-3 py-2"><UiText text={"Linked FIR"} /></th><th className="px-3 py-2"><UiText text={"Collected"} /></th><th className="px-3 py-2"><UiText text={"Evidence record"} /></th></tr></thead>
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
        ) : <EmptyState icon={ScanSearch} title={ui("No Zia evidence records")} />}
      </section>
    </div>
  );
}
