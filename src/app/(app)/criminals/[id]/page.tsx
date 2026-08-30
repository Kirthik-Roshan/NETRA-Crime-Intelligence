import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Phone, Car, MapPin, Users, FileText, Fingerprint, Swords, Network, Building2, Database,
  ChevronRight, CalendarDays, ShieldAlert, User,
} from "lucide-react";
import { get, all } from "@/lib/db";
import { networkGraph } from "@/lib/queries";
import { GraphView } from "@/components/network/GraphView";
import { Avatar, RiskMeter, StatusBadge, Badge, EmptyState, PanelHeader, Tag } from "@/components/ui";
import { parseJsonArray, formatDate, riskBand } from "@/lib/utils";
import type { Criminal } from "@/lib/types";

// Prerender every criminal profile at build (static export — no runtime server).
export function generateStaticParams() {
  return all<{ id: number }>("SELECT id FROM criminals").map((r) => ({ id: String(r.id) }));
}

export default function CriminalProfile({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  const c = get<Criminal>("SELECT * FROM criminals WHERE id=?", [id]);
  if (!c) notFound();

  const firs = all<{ id: number; fir_number: string; crime_type: string; district: string; status: string; severity: string; occurred_at: string; role: string }>(
    `SELECT f.id, f.fir_number, f.crime_type, f.district, f.status, f.severity, f.occurred_at, fc.role
     FROM firs f JOIN fir_criminals fc ON fc.fir_id=f.id WHERE fc.criminal_id=? ORDER BY f.occurred_at DESC`,
    [id]
  );
  const arrests = all<{ arrested_at: string; district: string; arrest_type: string; arresting_officer: string }>(
    "SELECT arrested_at, district, arrest_type, arresting_officer FROM arrests WHERE criminal_id=? ORDER BY arrested_at DESC", [id]
  );
  const phones = all<{ number: string; carrier: string }>("SELECT number, carrier FROM phones WHERE owner_criminal_id=?", [id]);
  const vehicles = all<{ plate: string; make: string; model: string; color: string; type: string }>("SELECT plate, make, model, color, type FROM vehicles WHERE owner_criminal_id=?", [id]);
  const addresses = all<{ type: string; line: string; district: string }>("SELECT type, line, district FROM addresses WHERE criminal_id=?", [id]);
  const weapons = all<{ type: string; description: string }>("SELECT type, description FROM weapons WHERE criminal_id=?", [id]);
  const orgs = all<{ name: string; type: string; role: string }>(
    "SELECT o.name, o.type, om.role FROM organizations o JOIN org_members om ON om.org_id=o.id WHERE om.criminal_id=?", [id]
  );
  const associates = all<{ id: number; name: string; risk_score: number; confidence: number; rel_type: string }>(
    `SELECT c.id, c.name, c.risk_score, r.confidence, r.rel_type FROM relationships r
     JOIN criminals c ON c.id = (CASE WHEN r.source_id=? THEN r.target_id ELSE r.source_id END)
     WHERE r.source_type='criminal' AND r.target_type='criminal' AND (r.source_id=? OR r.target_id=?)
     ORDER BY r.confidence DESC LIMIT 12`,
    [id, id, id]
  );

  const aliases = parseJsonArray(c.aliases);
  const locations = parseJsonArray(c.known_locations);
  const graph = networkGraph(id, 1);
  const band = riskBand(c.risk_score);

  const primeAccused = firs.filter((f) => f.role === "prime_accused").length;
  const linked = graph.nodes.length;
  const risk_bg = c.risk_score >= 80 ? "bg-danger" : c.risk_score >= 60 ? "bg-warning" : c.risk_score >= 40 ? "bg-info" : "bg-success";

  return (
    <div className="animate-fade-in space-y-5">
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/criminals"
          className="group inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" /> All criminals
        </Link>
        <Link href="/database?table=intel_criminals" className="btn-ghost h-8 text-xs">
          <Database className="h-3.5 w-3.5" /> View in database
        </Link>
      </div>

      {/* Identity + risk posture */}
      <div className="card panel-pad relative overflow-hidden">
        <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${risk_bg}`} />
        <div className="flex flex-wrap items-start gap-x-5 gap-y-4">
          <Avatar name={c.name} size={64} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              <h1 className="font-display text-[1.4rem] font-bold tracking-[-0.02em]">{c.name}</h1>
              {c.risk_score >= 80 && (
                <ShieldAlert aria-label="Critical risk subject" className="h-4 w-4 shrink-0 text-danger" />
              )}
              <StatusBadge status={c.status} />
              <Tag>{c.crime_category}</Tag>
            </div>

            {aliases.length > 0 && (
              <p className="mt-1.5 text-sm text-muted">
                Also known as <span className="font-medium text-subtle">{aliases.join(" · ")}</span>
              </p>
            )}

            <dl className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted">
              <div className="flex items-center gap-1.5">
                <User aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <dd>{c.gender === "F" ? "Female" : "Male"}, {c.age}</dd>
              </div>
              <span aria-hidden className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <MapPin aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <dd>{c.home_district}</dd>
              </div>
              <span aria-hidden className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <CalendarDays aria-hidden className="h-3.5 w-3.5 shrink-0" />
                <dd>First seen {formatDate(c.first_seen)}</dd>
              </div>
              <span aria-hidden className="h-3 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <dd className="font-mono text-xs">REC-{String(id).padStart(4, "0")}</dd>
              </div>
            </dl>

            {locations.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {locations.map((l) => (
                  <Tag key={l}>
                    <MapPin aria-hidden className="h-3 w-3 opacity-70" />
                    {l}
                  </Tag>
                ))}
              </div>
            )}
          </div>

          <div className="w-full shrink-0 rounded-md border border-border bg-elevated/40 p-3 text-center sm:ml-auto sm:w-auto sm:min-w-[140px]">
            <div className="stat-label">Risk score</div>
            <div className={`mt-1 font-display text-3xl font-bold leading-none tabular-nums ${band.color}`}>{c.risk_score}</div>
            <div className={`mt-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${band.color}`}>{band.label}</div>
            <div className="mt-2.5 flex justify-center"><RiskMeter score={c.risk_score} /></div>
          </div>
        </div>

        {/* Entity counts */}
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 sm:grid-cols-6">
          {[
            { label: "FIRs", value: firs.length, icon: FileText },
            { label: "Arrests", value: arrests.length, icon: Fingerprint },
            { label: "Associates", value: associates.length, icon: Users },
            { label: "Phones", value: phones.length, icon: Phone },
            { label: "Vehicles", value: vehicles.length, icon: Car },
            { label: "Orgs", value: orgs.length, icon: Building2 },
          ].map((s) => (
            <div key={s.label} className="rounded-md border border-border bg-elevated/40 p-2.5">
              <div className="flex items-center gap-1.5">
                <s.icon aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
                <span className="stat-label truncate">{s.label}</span>
              </div>
              <div className={`mt-1 font-display text-xl font-bold tabular-nums ${s.value ? "text-fg" : "text-muted/60"}`}>
                {s.value}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Network graph */}
      <div className="card panel-pad">
        <PanelHeader
          icon={Network}
          title="Criminal network"
          sub={`${linked} linked ${linked === 1 ? "entity" : "entities"} · ${graph.edges.length} relationships · one hop`}
          action={
            <Link
              href={`/network?focus=${id}`}
              className="btn-ghost h-8 text-xs"
            >
              Open full graph <ChevronRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          }
        />
        {linked > 1 ? (
          <>
            <GraphView data={graph} height={460} />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted">
              {[["criminal", "--danger"], ["phone", "--info"], ["vehicle", "--warning"], ["address", "--success"], ["fir", "--accent"], ["organization", "--fg"]].map(([tp, v]) => (
                <span key={tp} className="flex items-center gap-1.5 capitalize">
                  <span aria-hidden className="h-2 w-2 rounded-sm" style={{ background: `rgb(var(${v}))` }} /> {tp}
                </span>
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={Network}
            title="No linked entities"
            hint="This subject has no recorded relationships yet."
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* FIRs + arrests */}
        <div className="space-y-4 lg:col-span-2">
          <div className="card panel-pad">
            <PanelHeader
              icon={FileText}
              title="Associated FIRs"
              sub={
                firs.length
                  ? `${firs.length} linked ${firs.length === 1 ? "case" : "cases"}${primeAccused ? ` · ${primeAccused} as prime accused` : ""}`
                  : "Cases naming this subject"
              }
              count={firs.length}
            />
            {firs.length ? (
              <div className="space-y-1.5">
                {firs.map((f) => (
                  <Link
                    key={f.id}
                    href={`/cases?fir=${f.id}`}
                    className="group flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-border bg-elevated/30 p-2.5 text-sm transition-colors hover:border-accent/40 hover:bg-elevated"
                  >
                    <span className="font-mono text-xs tabular-nums text-muted">{f.fir_number}</span>
                    <span className="font-medium transition-colors group-hover:text-accent">{f.crime_type}</span>
                    {f.role === "prime_accused" && <Badge tone="danger">prime accused</Badge>}
                    <span className="ml-auto text-xs tabular-nums text-muted">{f.district} · {formatDate(f.occurred_at)}</span>
                    <StatusBadge status={f.severity} />
                    <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState icon={FileText} title="No linked FIRs" hint="Cases naming this subject will appear here." />
            )}
          </div>

          <div className="card panel-pad">
            <PanelHeader
              icon={Fingerprint}
              title="Arrest history"
              sub={
                arrests.length
                  ? `${arrests.length} recorded · most recent ${formatDate(arrests[0].arrested_at)}`
                  : "Custody record"
              }
              count={arrests.length}
            />
            {arrests.length ? (
              <ol className="space-y-3">
                {arrests.map((a, i) => (
                  <li key={i} className="flex gap-3">
                    <div aria-hidden className="mt-1.5 flex flex-col items-center">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent ring-4 ring-accent/15" />
                      {i < arrests.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="min-w-0 pb-1">
                      <div className="text-sm font-medium tabular-nums">
                        {formatDate(a.arrested_at)} <span className="text-muted">·</span> {a.district}
                      </div>
                      <div className="mt-0.5 text-xs text-muted">
                        IO: <span className="text-subtle">{a.arresting_officer}</span> · <span className="capitalize">{a.arrest_type}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState icon={Fingerprint} title="No arrest records" hint="This subject has never been in custody on record." />
            )}
          </div>
        </div>

        {/* Entity rails */}
        <div className="space-y-4">
          <div className="card panel-pad">
            <PanelHeader icon={Users} title="Known associates" count={associates.length} />
            {associates.length ? (
              <div className="space-y-0.5">
                {associates.map((a) => (
                  <Link
                    key={a.id}
                    href={`/criminals/${a.id}`}
                    className="group flex items-center gap-2.5 rounded-md p-1.5 transition-colors hover:bg-elevated"
                  >
                    <Avatar name={a.name} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium transition-colors group-hover:text-accent">{a.name}</div>
                      <div className="truncate text-[11px] capitalize text-muted">
                        {a.rel_type.replace(/_/g, " ")} · {Math.round(a.confidence * 100)}% conf
                      </div>
                    </div>
                    <span className={`font-mono text-xs font-semibold tabular-nums ${riskBand(a.risk_score).color}`}>{a.risk_score}</span>
                  </Link>
                ))}
              </div>
            ) : (
              <NoRecord label="No known associates." />
            )}
          </div>

          <EntityList icon={Phone} title="Phone numbers" items={phones.map((p) => `${p.number} · ${p.carrier}`)} />
          <EntityList icon={Car} title="Vehicles" items={vehicles.map((v) => `${v.plate} · ${v.color} ${v.make} ${v.model}`)} />
          <EntityList icon={MapPin} title="Addresses" items={addresses.map((a) => `${a.type}: ${a.line}`)} />
          {weapons.length > 0 && <EntityList icon={Swords} title="Weapons" items={weapons.map((w) => w.type)} />}
          {orgs.length > 0 && (
            <div className="card panel-pad">
              <PanelHeader icon={Building2} title="Organizations" count={orgs.length} />
              <ul className="divide-y divide-border/50">
                {orgs.map((o) => (
                  <li key={o.name} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0 truncate">{o.name}</span>
                    <Badge tone={o.role === "leader" ? "danger" : "muted"}>{o.role}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function NoRecord({ label }: { label: string }) {
  return (
    <p className="rounded-md border border-dashed border-border px-3 py-4 text-center text-xs text-muted">{label}</p>
  );
}

function EntityList({ icon: Icon, title, items }: { icon: typeof Phone; title: string; items: string[] }) {
  return (
    <div className="card panel-pad">
      <PanelHeader icon={Icon} title={title} count={items.length} />
      {items.length ? (
        <ul className="divide-y divide-border/40">
          {items.map((it, i) => (
            <li key={i} className="py-1.5 font-mono text-xs text-subtle first:pt-0 last:pb-0">{it}</li>
          ))}
        </ul>
      ) : (
        <NoRecord label="None on record." />
      )}
    </div>
  );
}
