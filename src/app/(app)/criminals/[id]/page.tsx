import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft, Phone, Car, MapPin, Users, FileText, Fingerprint, Swords, Network, Building2, Sparkles, Database,
} from "lucide-react";
import { get, all } from "@/lib/db";
import { networkGraph } from "@/lib/queries";
import { GraphView } from "@/components/network/GraphView";
import { Avatar, RiskMeter, StatusBadge, Badge } from "@/components/ui";
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

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link href="/criminals" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
          <ArrowLeft className="h-4 w-4" /> All criminals
        </Link>
        <Link href="/database?table=intel_criminals" className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
          <Database className="h-4 w-4" /> View in database
        </Link>
      </div>

      {/* Header */}
      <div className="card panel-pad">
        <div className="flex flex-wrap items-start gap-4">
          <Avatar name={c.name} size={72} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl font-bold">{c.name}</h1>
              <StatusBadge status={c.status} />
              <Badge tone="info">{c.crime_category}</Badge>
            </div>
            {aliases.length > 0 && (
              <div className="mt-1 text-sm text-muted">
                Known as {aliases.map((a) => <span key={a} className="text-subtle">{a}</span>)}
              </div>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
              <span>{c.gender === "F" ? "Female" : "Male"}, {c.age}</span>
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {c.home_district}</span>
              <span>First seen {formatDate(c.first_seen)}</span>
            </div>
            {locations.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {locations.map((l) => <span key={l} className="chip text-[10px]">{l}</span>)}
              </div>
            )}
          </div>
          <div className="rounded-xl border border-border bg-elevated p-4 text-center">
            <div className="stat-label">Risk Score</div>
            <div className={`font-display text-4xl font-bold ${band.color}`}>{c.risk_score}</div>
            <div className={`text-xs font-medium ${band.color}`}>{band.label}</div>
            <div className="mt-2"><RiskMeter score={c.risk_score} /></div>
          </div>
        </div>

        {/* quick stats */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-border/50 pt-4 sm:grid-cols-6">
          {[
            { label: "FIRs", value: firs.length, icon: FileText },
            { label: "Arrests", value: arrests.length, icon: Fingerprint },
            { label: "Associates", value: associates.length, icon: Users },
            { label: "Phones", value: phones.length, icon: Phone },
            { label: "Vehicles", value: vehicles.length, icon: Car },
            { label: "Orgs", value: orgs.length, icon: Building2 },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <s.icon className="mx-auto mb-1 h-4 w-4 text-muted" />
              <div className="font-display text-xl font-bold">{s.value}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Network graph */}
      <div className="card panel-pad">
        <div className="mb-3 flex items-center gap-2">
          <Network className="h-4 w-4 text-accent" />
          <h2 className="font-display text-base font-semibold">Criminal Network</h2>
          <Badge tone="accent"><Sparkles className="h-3 w-3" /> AI-linked</Badge>
          <Link href={`/network?focus=${id}`} className="ml-auto text-xs text-muted hover:text-fg">Open full graph →</Link>
        </div>
        <GraphView data={graph} height={460} />
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted">
          {[["criminal", "--danger"], ["phone", "--info"], ["vehicle", "--warning"], ["address", "--success"], ["fir", "--accent"], ["organization", "--fg"]].map(([t, v]) => (
            <span key={t} className="flex items-center gap-1.5 capitalize">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgb(var(${v}))` }} /> {t}
            </span>
          ))}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: FIRs + arrests */}
        <div className="space-y-5 lg:col-span-2">
          <div className="card panel-pad">
            <h2 className="mb-3 font-display text-base font-semibold">Associated FIRs</h2>
            <div className="space-y-2">
              {firs.map((f) => (
                <Link key={f.id} href={`/cases?fir=${f.id}`} className="flex items-center gap-3 rounded-lg border border-border/50 p-2.5 text-sm transition-colors hover:bg-elevated">
                  <span className="font-mono text-xs text-muted">{f.fir_number}</span>
                  <span className="font-medium">{f.crime_type}</span>
                  {f.role === "prime_accused" && <Badge tone="danger">prime accused</Badge>}
                  <span className="ml-auto text-xs text-muted">{f.district} · {formatDate(f.occurred_at)}</span>
                  <StatusBadge status={f.severity} />
                </Link>
              ))}
              {firs.length === 0 && <p className="text-sm text-muted">No linked FIRs.</p>}
            </div>
          </div>

          <div className="card panel-pad">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold">
              <Fingerprint className="h-4 w-4 text-muted" /> Arrest History
            </h2>
            {arrests.length ? (
              <div className="space-y-3">
                {arrests.map((a, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="mt-1 flex flex-col items-center">
                      <span className="h-2 w-2 rounded-full bg-accent" />
                      {i < arrests.length - 1 && <span className="mt-1 w-px flex-1 bg-border" />}
                    </div>
                    <div className="pb-1">
                      <div className="text-sm font-medium">{formatDate(a.arrested_at)} · {a.district}</div>
                      <div className="text-xs text-muted">IO: {a.arresting_officer} · <span className="capitalize">{a.arrest_type}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No arrest records.</p>
            )}
          </div>
        </div>

        {/* Right: entities */}
        <div className="space-y-5">
          <div className="card panel-pad">
            <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Users className="h-4 w-4 text-muted" /> Known Associates</h2>
            <div className="space-y-2">
              {associates.map((a) => (
                <Link key={a.id} href={`/criminals/${a.id}`} className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-elevated">
                  <Avatar name={a.name} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    <div className="text-[11px] capitalize text-muted">{a.rel_type.replace(/_/g, " ")} · {Math.round(a.confidence * 100)}% conf</div>
                  </div>
                  <span className="font-mono text-xs text-muted">{a.risk_score}</span>
                </Link>
              ))}
              {associates.length === 0 && <p className="text-sm text-muted">No known associates.</p>}
            </div>
          </div>

          <EntityList icon={Phone} title="Phone Numbers" items={phones.map((p) => `${p.number} · ${p.carrier}`)} />
          <EntityList icon={Car} title="Vehicles" items={vehicles.map((v) => `${v.plate} · ${v.color} ${v.make} ${v.model}`)} />
          <EntityList icon={MapPin} title="Addresses" items={addresses.map((a) => `${a.type}: ${a.line}`)} />
          {weapons.length > 0 && <EntityList icon={Swords} title="Weapons" items={weapons.map((w) => w.type)} />}
          {orgs.length > 0 && (
            <div className="card panel-pad">
              <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Building2 className="h-4 w-4 text-muted" /> Organizations</h2>
              {orgs.map((o) => (
                <div key={o.name} className="flex items-center justify-between py-1 text-sm">
                  <span>{o.name}</span>
                  <Badge tone={o.role === "leader" ? "danger" : "muted"}>{o.role}</Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function EntityList({ icon: Icon, title, items }: { icon: typeof Phone; title: string; items: string[] }) {
  return (
    <div className="card panel-pad">
      <h2 className="mb-3 flex items-center gap-2 font-display text-base font-semibold"><Icon className="h-4 w-4 text-muted" /> {title}</h2>
      {items.length ? (
        <ul className="space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="font-mono text-xs text-subtle">{it}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">None on record.</p>
      )}
    </div>
  );
}
