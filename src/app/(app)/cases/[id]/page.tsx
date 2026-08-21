import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Sparkles, FileText, Users, Eye, ShieldQuestion, Clock, Paperclip,
  MapPin, AlertTriangle, Lightbulb, GitCompare,
} from "lucide-react";
import { get, all } from "@/lib/db";
import { similarFirs } from "@/lib/embeddings";
import { PageHeader, Badge, StatusBadge, Avatar } from "@/components/ui";
import { CaseIntelligence } from "@/components/ai/CaseIntelligence";
import { formatDate } from "@/lib/utils";

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
  const timeline: { icon: typeof Clock; label: string; date: string; tone?: string }[] = [];
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
    <div>
      <Link href="/cases" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="h-4 w-4" /> All cases
      </Link>
      <PageHeader title={c.title} subtitle={`${c.case_number} · ${c.officer || "Unassigned"}`}>
        <div className="flex items-center gap-2">
          <Badge tone={c.priority === "critical" ? "danger" : c.priority === "high" ? "warning" : "info"}>{c.priority}</Badge>
          <StatusBadge status={c.status} />
        </div>
      </PageHeader>

      <div className="grid gap-5 lg:grid-cols-[260px_1fr_300px]">
        {/* LEFT — case info */}
        <div className="space-y-4">
          <div className="card panel-pad space-y-3 text-sm">
            <Info label="District" value={c.district} icon={MapPin} />
            <Info label="Opened" value={formatDate(c.opened_at)} icon={Clock} />
            {fir && <>
              <Info label="FIR" value={fir.fir_number} icon={FileText} />
              <Info label="IPC" value={fir.ipc_sections} icon={AlertTriangle} />
              <Info label="Modus" value={fir.modus?.replace(/_/g, " ")} icon={GitCompare} />
            </>}
          </div>

          {victims.length > 0 && (
            <div className="card panel-pad">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-muted" /> Victims</h3>
              {victims.map((v, i) => (
                <div key={i} className="py-1 text-sm text-subtle">{v.name} · {v.gender === "F" ? "F" : "M"}, {v.age}</div>
              ))}
            </div>
          )}

          {complainants.length > 0 && (
            <div className="card panel-pad">
              <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-muted" /> Complainants</h3>
              {complainants.map((w, i) => (
                <div key={i} className="py-1 text-sm"><span className="font-medium">{w.name}</span><p className="text-xs text-muted">{w.occupation}{w.age ? ` · ${w.age} yrs` : ""}</p></div>
              ))}
            </div>
          )}
        </div>

        {/* CENTER — notebook */}
        <div className="space-y-4">
          <div className="card panel-pad">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-accent" />
              <h3 className="text-sm font-semibold">AI Case Summary</h3>
              <Badge tone="accent">generated</Badge>
            </div>
            <p className="text-sm leading-relaxed text-subtle">{c.summary}</p>
            {fir && <p className="mt-2 text-sm leading-relaxed text-muted">{fir.description}</p>}
          </div>

          <CaseIntelligence text={[c.summary, fir?.description].filter(Boolean).join("\n\n")} />


          <div className="card panel-pad">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Clock className="h-4 w-4 text-muted" /> Case Timeline</h3>
            <div className="space-y-3">
              {timeline.map((t, i) => (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <span className={`grid h-6 w-6 place-items-center rounded-full ${t.tone === "accent" ? "bg-accent/15 text-accent" : t.tone === "warning" ? "bg-warning/15 text-warning" : "bg-elevated text-muted"}`}>
                      <t.icon className="h-3 w-3" />
                    </span>
                    {i < timeline.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                  </div>
                  <div className="pb-2">
                    <div className="text-sm">{t.label}</div>
                    <div className="text-xs text-muted">{formatDate(t.date)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card panel-pad">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Paperclip className="h-4 w-4 text-muted" /> Evidence ({evidence.length})</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {evidence.map((e, i) => (
                <div key={i} className="rounded-lg border border-border/60 p-2.5">
                  <div className="flex items-center gap-2"><Badge tone="info">{e.type}</Badge><span className="font-mono text-[10px] text-muted">{e.storage_ref}</span></div>
                  <p className="mt-1 text-xs text-subtle">{e.description}</p>
                </div>
              ))}
              {evidence.length === 0 && <p className="text-sm text-muted">No evidence recorded.</p>}
            </div>
          </div>
        </div>

        {/* RIGHT — AI intelligence panel */}
        <div className="space-y-4">
          <div className="card panel-pad">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><ShieldQuestion className="h-4 w-4 text-accent" /> Suspects</h3>
            <div className="space-y-2">
              {suspects.map((s) => (
                <Link key={s.id} href={`/criminals/${s.id}`} className="flex items-center gap-2.5 rounded-lg p-1.5 hover:bg-elevated">
                  <Avatar name={s.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{s.name}</div>
                    {s.role === "prime_accused" && <span className="text-[10px] text-danger">prime accused</span>}
                  </div>
                  <span className="font-mono text-xs text-muted">{s.risk_score}</span>
                </Link>
              ))}
              {suspects.length === 0 && <p className="text-sm text-muted">No suspects linked.</p>}
            </div>
          </div>

          <div className="card panel-pad">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Lightbulb className="h-4 w-4 text-accent" /> Questions to ask</h3>
            <div className="space-y-2">
              {questions.map((q, i) => (
                <Link key={i} href={`/assistant?q=${encodeURIComponent(q)}`} className="block rounded-lg border border-border/60 p-2 text-xs text-subtle transition-colors hover:border-accent/40 hover:text-fg">
                  {q}
                </Link>
              ))}
            </div>
          </div>

          <div className="card panel-pad">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><GitCompare className="h-4 w-4 text-accent" /> Related cases</h3>
            <div className="space-y-2">
              {related.map((r) => (
                <Link key={r.id} href={`/cases/${r.id}`} className="block rounded-lg p-1.5 text-sm hover:bg-elevated">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="font-mono text-[10px] text-muted">{r.case_number}</div>
                </Link>
              ))}
              {related.length === 0 && <p className="text-sm text-muted">None found.</p>}
            </div>
          </div>

          {similar.length > 0 && (
            <div className="card panel-pad">
              <h3 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
                <Sparkles className="h-3.5 w-3.5 text-accent" /> Semantically similar FIRs
              </h3>
              <p className="mb-3 text-[11px] text-muted">Ranked by AI similarity (crime type · modus · facts)</p>
              {similar.map((m) => (
                <div key={m.id} className="flex items-center gap-2 py-1.5 text-xs">
                  <span className="font-mono text-muted">{m.fir_number}</span>
                  <span className="truncate text-subtle">{m.crime_type} · {m.district}</span>
                  <span className="ml-auto flex items-center gap-1">
                    <span className="h-1 w-10 overflow-hidden rounded-full bg-elevated">
                      <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.round(m.score * 100)}%` }} />
                    </span>
                    <span className="font-mono text-[10px] text-accent">{Math.round(m.score * 100)}%</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Info({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Clock }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-muted" />
      <span className="stat-label">{label}</span>
      <span className="ml-auto text-right font-medium capitalize text-subtle">{value}</span>
    </div>
  );
}
