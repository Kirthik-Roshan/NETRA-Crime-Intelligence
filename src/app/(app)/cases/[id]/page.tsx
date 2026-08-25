import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Sparkles, FileText, Users, Eye, ShieldQuestion, Clock, Paperclip,
  MapPin, AlertTriangle, Lightbulb, GitCompare, ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { get, all } from "@/lib/db";
import { similarFirs } from "@/lib/embeddings";
import { PageHeader, Badge, StatusBadge, Avatar, RiskMeter, EmptyState } from "@/components/ui";
import { CaseIntelligence } from "@/components/ai/CaseIntelligence";
import { ReadAloud } from "@/components/ReadAloud";
import { Translated } from "@/components/Translated";
import { cn, formatDate } from "@/lib/utils";

// Prerender every case page at build (static export — no runtime server).
export function generateStaticParams() {
  return all<{ id: number }>("SELECT id FROM cases").map((r) => ({ id: String(r.id) }));
}

export default function CaseWorkspace({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const c = get<{ id: number; case_number: string; title: string; fir_id: number; status: string; priority: string; district: string; opened_at: string; updated_at: string; summary: string; officer: string }>(
    `SELECT * FROM cases WHERE id=?`,
    [id]
  );
  if (!c) notFound();

  const fir = get<{ id: number; fir_number: string; crime_type: string; ipc_sections: string; severity: string; modus: string; occurred_at: string; reported_at: string; description: string; status: string }>(
    "SELECT * FROM firs WHERE id=?", [c.fir_id]
  );
  const suspects = fir ? all<{ id: number; name: string; risk_score: number; status: string; role: string }>(
    `SELECT cr.id, cr.name, cr.risk_score, cr.status, fc.role FROM criminals cr JOIN fir_criminals fc ON fc.criminal_id=cr.id WHERE fc.fir_id=? ORDER BY (fc.role='prime_accused') DESC`,
    [fir.id]
  ) : [];
  const victims = fir ? all<{ name: string; gender: string; age: number }>("SELECT name, gender, age FROM victims WHERE fir_id=?", [fir.id]) : [];
  const complainants = fir ? all<{ name: string; age: number; occupation: string }>(
    "SELECT name, age, occupation FROM complainants WHERE fir_id=?", [fir.id]
  ) : [];
  const evidence = fir ? all<{ type: string; description: string; collected_at: string; storage_ref: string }>("SELECT type, description, collected_at, storage_ref FROM evidence WHERE fir_id=?", [fir.id]) : [];
  const arrests = fir ? all<{ name: string; arrested_at: string; arrest_type: string }>(
    `SELECT cr.name, a.arrested_at, a.arrest_type FROM arrests a JOIN criminals cr ON cr.id=a.criminal_id WHERE a.fir_id=? ORDER BY a.arrested_at`, [fir.id]
  ) : [];
  const chargesheet = fir ? get<{ csdate: string; cstype: string; CourtName: string }>(
    `SELECT cs.csdate, cs.cstype, co.CourtName
     FROM ChargesheetDetails cs
     LEFT JOIN CaseMaster cm ON cm.CaseMasterID = cs.CaseMasterID
     LEFT JOIN Court co ON co.CourtID = cm.CourtID
     WHERE cs.CaseMasterID=?`, [fir.id]
  ) : undefined;

  const related = all<{ id: number; case_number: string; title: string; status: string; priority: string }>(
    `SELECT c2.id, c2.case_number, c2.title, c2.status, c2.priority FROM cases c2 LEFT JOIN firs f ON f.id=c2.fir_id
     WHERE c2.id != ? AND (c2.district = ? OR f.crime_type = ?) ORDER BY c2.updated_at DESC LIMIT 5`,
    [id, c.district, fir?.crime_type || ""]
  );
  // Semantic similarity (TF-IDF vector space over crime type + modus + facts).
  const similar = fir ? similarFirs(fir.id, 6) : [];

  // Synthesize a timeline
  const timeline: { icon: LucideIcon; label: string; date: string; tone?: string }[] = [];
  if (fir) {
    timeline.push({ icon: FileText, label: `FIR ${fir.fir_number} registered (${fir.crime_type})`, date: fir.reported_at });
    for (const e of evidence.slice(0, 3)) timeline.push({ icon: Paperclip, label: `${e.type} evidence collected`, date: e.collected_at });
    for (const a of arrests) timeline.push({ icon: ShieldQuestion, label: `${a.arrest_type === "surrender" ? "Surrender" : "Arrest"}: ${a.name}`, date: a.arrested_at, tone: "warning" });
    if (chargesheet?.csdate) {
      const label = chargesheet.cstype === "A" ? "Chargesheet filed" : chargesheet.cstype === "B" ? "Final report: false case" : "Final report: undetected";
      timeline.push({ icon: FileText, label: `${label}${chargesheet.CourtName ? ` — ${chargesheet.CourtName}` : ""}`, date: chargesheet.csdate, tone: "accent" });
    }
  }
  timeline.push({ icon: Sparkles, label: "AI linked this case to related incidents", date: c.updated_at, tone: "accent" });
  timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const questions = [
    `Do any suspects in ${c.district} share a phone or vehicle?`,
    `Show other ${fir?.crime_type?.toLowerCase() || "similar"} cases with modus "${fir?.modus?.replace(/_/g, " ")}"`,
    `Which of these suspects are repeat offenders?`,
  ];

  return (
    <div className="animate-fade-in">
      <Link
        href="/cases"
        className="group mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden /> All cases
      </Link>
      <PageHeader title={c.title} subtitle={`${c.case_number} · ${c.officer || "Unassigned"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={c.priority === "critical" ? "danger" : c.priority === "high" ? "warning" : "info"}>{c.priority}</Badge>
          <StatusBadge status={c.status} />
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr_300px]">
        {/* LEFT — case info */}
        <div className="min-w-0 space-y-4">
          <div className="card panel-pad">
            <CardHead icon={FileText} title="Case Record" />
            <dl className="space-y-2.5 text-sm">
              <Info label="District" value={c.district} icon={MapPin} />
              <Info label="Opened" value={formatDate(c.opened_at)} icon={Clock} />
              {fir && <>
                <Info label="FIR" value={fir.fir_number} icon={FileText} mono />
                <Info label="IPC" value={fir.ipc_sections} icon={AlertTriangle} mono />
                <Info label="Modus" value={fir.modus?.replace(/_/g, " ")} icon={GitCompare} />
              </>}
            </dl>
          </div>

          {victims.length > 0 && (
            <div className="card panel-pad">
              <CardHead icon={Users} title="Victims" count={victims.length} />
              <div className="divide-y divide-border/40">
                {victims.map((v, i) => (
                  <div key={i} className="flex items-baseline gap-2 py-1.5 first:pt-0 last:pb-0 text-sm">
                    <span className="min-w-0 truncate font-medium text-subtle">{v.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] tabular-nums text-muted">
                      {v.gender === "F" ? "F" : "M"} · {v.age}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {complainants.length > 0 && (
            <div className="card panel-pad">
              <CardHead icon={Eye} title="Complainants" count={complainants.length} />
              <div className="divide-y divide-border/40">
                {complainants.map((w, i) => (
                  <div key={i} className="py-2 first:pt-0 last:pb-0">
                    <div className="truncate text-sm font-medium">{w.name}</div>
                    <p className="mt-0.5 text-xs capitalize text-muted">
                      {w.occupation}{w.age ? ` · ${w.age} yrs` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* CENTER — notebook */}
        <div className="min-w-0 space-y-4">
          <div className="card panel-pad">
            <CardHead
              icon={Sparkles}
              title="AI Case Summary"
              meta={<Badge tone="accent">generated</Badge>}
              action={<ReadAloud label="Read Summary" text={[c.summary, fir?.description].filter(Boolean).join(" ")} />}
            />
            <Translated as="p" className="text-[0.9375rem] leading-relaxed text-subtle" text={c.summary} />
            {fir && (
              <div className="mt-4 border-t border-border/50 pt-3">
                <div className="stat-label mb-1.5">FIR narrative</div>
                <Translated as="p" className="text-sm leading-relaxed text-muted" text={fir.description} />
              </div>
            )}
          </div>

          <CaseIntelligence text={[c.summary, fir?.description].filter(Boolean).join("\n\n")} />

          <div className="card panel-pad">
            <CardHead icon={Clock} title="Case Timeline" count={timeline.length} />
            <ol>
              {timeline.map((t, i) => {
                const last = i === timeline.length - 1;
                return (
                  <li key={i} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={cn(
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full ring-1 ring-inset",
                          t.tone === "accent" ? "bg-accent/10 text-accent ring-accent/30"
                          : t.tone === "warning" ? "bg-warning/10 text-warning ring-warning/30"
                          : "bg-elevated/70 text-muted ring-border/60"
                        )}
                      >
                        <t.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {!last && <span className="my-1 w-px flex-1 bg-border/70" />}
                    </div>
                    <div className={cn("min-w-0", last ? "pb-0" : "pb-4")}>
                      <div className="text-sm leading-snug text-subtle">{t.label}</div>
                      <div className="mt-1 font-mono text-[11px] tabular-nums text-muted">{formatDate(t.date)}</div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="card panel-pad">
            <CardHead icon={Paperclip} title="Evidence" count={evidence.length} />
            {evidence.length === 0 ? (
              <EmptyState icon={Paperclip} title="No evidence recorded" hint="Seized items and forensic exhibits appear here once logged against this FIR." />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {evidence.map((e, i) => (
                  <div key={i} className="rounded-lg border border-border/60 bg-elevated/40 p-3 transition-colors hover:border-border">
                    <div className="flex items-center gap-2">
                      <Badge tone="info">{e.type}</Badge>
                      <span className="ml-auto truncate font-mono text-[10px] text-muted" title={e.storage_ref}>{e.storage_ref}</span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-subtle">{e.description}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT — AI intelligence panel */}
        <div className="min-w-0 space-y-4">
          <div className="card panel-pad">
            <CardHead icon={ShieldQuestion} title="Suspects" count={suspects.length} />
            {suspects.length === 0 ? (
              <Blank>No suspects linked to this FIR.</Blank>
            ) : (
              <div className="space-y-1">
                {suspects.map((s) => (
                  <Link
                    key={s.id}
                    href={`/criminals/${s.id}`}
                    className="group flex items-center gap-2.5 rounded-lg border border-transparent p-2 transition-colors hover:border-border/60 hover:bg-elevated/60"
                  >
                    <Avatar name={s.name} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium transition-colors group-hover:text-accent">{s.name}</div>
                      <div className="mt-1 flex items-center gap-2">
                        {s.role === "prime_accused" && (
                          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-danger">Prime accused</span>
                        )}
                        <span className="ml-auto shrink-0"><RiskMeter score={s.risk_score} /></span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="card panel-pad">
            <CardHead icon={Lightbulb} title="Questions to ask" />
            <div className="space-y-2">
              {questions.map((q, i) => (
                <Link
                  key={i}
                  href={`/assistant?q=${encodeURIComponent(q)}`}
                  className="group flex items-start gap-2 rounded-lg border border-border/60 bg-elevated/30 p-2.5 text-xs leading-relaxed text-subtle transition-colors hover:border-accent/40 hover:bg-elevated/60 hover:text-fg"
                >
                  <span className="min-w-0 flex-1">{q}</span>
                  <ChevronRight className="mt-px h-3.5 w-3.5 shrink-0 text-muted transition-all duration-150 group-hover:translate-x-0.5 group-hover:text-accent" aria-hidden />
                </Link>
              ))}
            </div>
          </div>

          <div className="card panel-pad">
            <CardHead icon={GitCompare} title="Related cases" count={related.length} />
            {related.length === 0 ? (
              <Blank>No related cases in this district or offence class.</Blank>
            ) : (
              <div className="space-y-0.5">
                {related.map((r) => (
                  <Link
                    key={r.id}
                    href={`/cases/${r.id}`}
                    className="group block rounded-lg border border-transparent p-2 transition-colors hover:border-border/60 hover:bg-elevated/60"
                  >
                    <div className="truncate text-sm font-medium transition-colors group-hover:text-accent">{r.title}</div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">{r.case_number}</div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {similar.length > 0 && (
            <div className="card panel-pad">
              <CardHead icon={Sparkles} title="Similar FIRs" count={similar.length} />
              <p className="-mt-1.5 mb-3 text-[11px] leading-relaxed text-muted">
                Ranked by AI similarity · crime type, modus &amp; facts
              </p>
              <div className="divide-y divide-border/40">
                {similar.map((m) => (
                  <div key={m.id} className="flex items-center gap-2 py-2 text-xs first:pt-0 last:pb-0">
                    <span className="shrink-0 font-mono text-muted">{m.fir_number}</span>
                    <span className="min-w-0 truncate text-subtle" title={`${m.crime_type} · ${m.district}`}>{m.crime_type} · {m.district}</span>
                    <span className="ml-auto flex shrink-0 items-center gap-1.5">
                      <span className="block h-1.5 w-10 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(m.score * 100)}%` }} />
                      </span>
                      <span className="w-8 text-right font-mono text-[10px] tabular-nums text-accent">{Math.round(m.score * 100)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Card header — one rhythm for every pane on this workspace. */
function CardHead({
  icon: Icon,
  title,
  count,
  meta,
  action,
}: {
  icon: LucideIcon;
  title: string;
  count?: number;
  meta?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-accent" aria-hidden />
      <h3 className="min-w-0 truncate font-display text-sm font-semibold tracking-tight">{title}</h3>
      {count !== undefined && (
        <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{count}</span>
      )}
      {meta}
      {action && <span className="ml-auto shrink-0">{action}</span>}
    </div>
  );
}

/** Compact placeholder for the narrow rails, where EmptyState would tower. */
function Blank({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted">
      {children}
    </p>
  );
}

function Info({ label, value, icon: Icon, mono }: { label: string; value: string; icon: LucideIcon; mono?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <dt className="stat-label shrink-0">{label}</dt>
      <dd
        className={cn(
          "ml-auto min-w-0 truncate text-right font-medium text-subtle",
          mono ? "font-mono text-xs" : "capitalize"
        )}
        title={value}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
