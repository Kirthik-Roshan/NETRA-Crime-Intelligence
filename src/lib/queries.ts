import "server-only";
import { all, get } from "./db";
import type { GraphEdge, GraphNode } from "./types";

export function dashboardStats() {
  const activeCases = get<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE status IN ('registered','under_investigation')")!.n;
  const critical = get<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE priority='critical' AND status IN ('registered','under_investigation')")!.n;
  const totalFirs = get<{ n: number }>("SELECT COUNT(*) n FROM firs")!.n;
  const atLarge = get<{ n: number }>("SELECT COUNT(*) n FROM criminals WHERE status='at_large'")!.n;
  const solved = get<{ n: number }>("SELECT COUNT(*) n FROM cases WHERE status IN ('charge_sheeted','closed')")!.n;
  const totalCases = get<{ n: number }>("SELECT COUNT(*) n FROM cases")!.n;
  const arrests30 = get<{ n: number }>(
    "SELECT COUNT(*) n FROM arrests WHERE arrested_at >= ?",
    [new Date(Date.now() - 30 * 86400000).toISOString()]
  )!.n;
  return { activeCases, critical, totalFirs, atLarge, solved, totalCases, arrests30, solveRate: totalCases ? Math.round((solved / totalCases) * 100) : 0 };
}

export function crimeTrend(months = 12) {
  const since = new Date(Date.now() - months * 30 * 86400000).toISOString();
  return all<{ month: string; cases: number }>(
    "SELECT substr(occurred_at,1,7) AS month, COUNT(*) AS cases FROM firs WHERE occurred_at >= ? GROUP BY month ORDER BY month",
    [since]
  );
}

export function districtHotspots() {
  return all<{ district: string; cases: number }>(
    "SELECT district, COUNT(*) AS cases FROM firs GROUP BY district ORDER BY cases DESC"
  );
}

export function crimeByType() {
  return all<{ crime_type: string; count: number }>(
    "SELECT crime_type, COUNT(*) AS count FROM firs GROUP BY crime_type ORDER BY count DESC"
  );
}

export function firGeoPoints() {
  return all<FirPoint>(
    "SELECT id, fir_number, crime_type, district, severity, lat, lng, occurred_at FROM firs WHERE lat IS NOT NULL"
  );
}

/** District-level aggregates (centroid + count + dominant crime) for the district heat view. */
export function districtAggregates() {
  return all<{ district: string; cases: number; lat: number; lng: number; top_crime: string }>(
    `SELECT f.district,
            COUNT(*) AS cases,
            AVG(f.lat) AS lat,
            AVG(f.lng) AS lng,
            (SELECT crime_type FROM firs f2 WHERE f2.district = f.district
              GROUP BY crime_type ORDER BY COUNT(*) DESC LIMIT 1) AS top_crime
     FROM firs f WHERE f.lat IS NOT NULL
     GROUP BY f.district ORDER BY cases DESC`
  );
}

/** Distinct crime types present (for the map filter). */
export function crimeTypeList() {
  return all<{ crime_type: string }>("SELECT DISTINCT crime_type FROM firs ORDER BY crime_type").map((r) => r.crime_type);
}

export function recentActivity(limit = 10) {
  return all<{ ts: string; action: string; role: string; entity: string; detail: string; ai_model: string }>(
    "SELECT ts, action, role, entity, detail, ai_model FROM audit_logs ORDER BY ts DESC LIMIT ?",
    [limit]
  );
}

/** Simple rule-based "AI alerts" derived from the data. */
export function aiAlerts() {
  const alerts: { kind: string; title: string; detail: string; severity: string }[] = [];

  const repeat = all<{ name: string; n: number; district: string }>(
    `SELECT c.name, c.home_district AS district, COUNT(fc.fir_id) n FROM criminals c
     JOIN fir_criminals fc ON fc.criminal_id=c.id GROUP BY c.id HAVING n>=4 ORDER BY n DESC LIMIT 3`
  );
  for (const r of repeat)
    alerts.push({ kind: "repeat_offender", severity: "high", title: "Repeat offender detected", detail: `${r.name} linked to ${r.n} FIRs — concentrated around ${r.district}.` });

  const hotspot = get<{ district: string; n: number }>(
    `SELECT district, COUNT(*) n FROM firs WHERE occurred_at >= ? GROUP BY district ORDER BY n DESC LIMIT 1`,
    [new Date(Date.now() - 60 * 86400000).toISOString()]
  );
  if (hotspot) alerts.push({ kind: "hotspot", severity: "medium", title: "Emerging hotspot", detail: `${hotspot.district} recorded ${hotspot.n} FIRs in the last 60 days — above baseline.` });

  const gang = get<{ name: string; members: number; district: string }>(
    `SELECT o.name, o.district, COUNT(om.criminal_id) members FROM organizations o
     JOIN org_members om ON om.org_id=o.id GROUP BY o.id ORDER BY members DESC LIMIT 1`
  );
  if (gang) alerts.push({ kind: "gang", severity: "high", title: "Potential gang activity", detail: `${gang.name} (${gang.members} members) active in ${gang.district}. Network expanding.` });

  const spike = all<{ crime_type: string; n: number }>(
    `SELECT crime_type, COUNT(*) n FROM firs WHERE occurred_at >= ? GROUP BY crime_type ORDER BY n DESC LIMIT 1`,
    [new Date(Date.now() - 30 * 86400000).toISOString()]
  );
  if (spike[0]) alerts.push({ kind: "spike", severity: "medium", title: "Crime spike", detail: `${spike[0].crime_type} up in the last 30 days (${spike[0].n} incidents). Recommend patrol review.` });

  return alerts;
}

/** Socio-demographic insight over official ComplainantDetails lookups. */
export function complainantOccupations() {
  return all<{ occupation: string; count: number }>(
    "SELECT COALESCE(occupation,'Not Stated') AS occupation, COUNT(*) AS count FROM complainants GROUP BY occupation ORDER BY count DESC"
  );
}

export function victimGenderSplit() {
  return all<{ gender: string; count: number }>(
    "SELECT CASE gender WHEN 'F' THEN 'Female' WHEN 'T' THEN 'Transgender' ELSE 'Male' END AS gender, COUNT(*) AS count FROM victims GROUP BY gender ORDER BY count DESC"
  );
}

/**
 * Build a FOCUSED ego-network around one criminal (or the highest-risk
 * criminal with connections if no id given). Neighbor expansion is capped
 * per node and globally so the graph stays readable and explorable — the
 * investigator expands outward by clicking a node rather than being shown
 * a thousand-node hairball up front.
 */
export function networkGraph(
  criminalId?: number,
  depth = 1,
  opts: { perNodeCap?: number; nodeCap?: number } = {}
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const perNodeCap = opts.perNodeCap ?? 16; // strongest N links per person
  const nodeCap = opts.nodeCap ?? 55; // total nodes rendered
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const addNode = (n: GraphNode) => { if (!nodes.has(n.id)) nodes.set(n.id, n); };

  const seeds: number[] = [];
  if (criminalId) seeds.push(criminalId);
  else {
    // Highest-risk criminal that actually has links → a meaningful, bounded ego network.
    const seed = get<{ id: number }>(
      `SELECT c.id FROM criminals c
       WHERE EXISTS (SELECT 1 FROM relationships r
                     WHERE (r.source_type='criminal' AND r.source_id=c.id)
                        OR (r.target_type='criminal' AND r.target_id=c.id))
       ORDER BY c.risk_score DESC LIMIT 1`
    );
    if (seed) seeds.push(seed.id);
  }

  const visited = new Set<number>();
  let frontier = [...seeds];
  for (let d = 0; d <= depth; d++) {
    const next: number[] = [];
    for (const cid of frontier) {
      if (visited.has(cid)) continue;
      visited.add(cid);
      const c = get<{ id: number; name: string; risk_score: number; status: string; crime_category: string }>(
        "SELECT id, name, risk_score, status, crime_category FROM criminals WHERE id=?", [cid]
      );
      if (!c) continue;
      addNode({ id: `criminal:${c.id}`, type: "criminal", label: c.name, meta: { risk: c.risk_score, status: c.status, category: c.crime_category } });

      // Strongest links first, capped per node.
      const rels = all<{ source_type: string; source_id: number; target_type: string; target_id: number; rel_type: string; confidence: number; frequency: number | null }>(
        `SELECT source_type, source_id, target_type, target_id, rel_type, confidence, frequency FROM relationships
         WHERE (source_type='criminal' AND source_id=?) OR (target_type='criminal' AND target_id=?)
         ORDER BY confidence DESC, frequency DESC LIMIT ?`,
        [cid, cid, perNodeCap]
      );
      for (const r of rels) {
        const other = r.source_type === "criminal" && r.source_id === cid
          ? { type: r.target_type, id: r.target_id }
          : { type: r.source_type, id: r.source_id };
        const otherKey = `${other.type}:${other.id}`;
        // Respect the global node budget (but always allow edges between nodes already shown).
        if (!nodes.has(otherKey)) {
          if (nodes.size >= nodeCap) continue;
          addNode(makeNode(other.type, other.id));
        }
        edges.push({ source: `criminal:${cid}`, target: otherKey, rel_type: r.rel_type, confidence: r.confidence, frequency: r.frequency });
        if (other.type === "criminal") next.push(other.id);
      }
    }
    frontier = next;
  }
  return { nodes: [...nodes.values()], edges: dedupeEdges(edges) };
}

function makeNode(type: string, id: number): GraphNode {
  switch (type) {
    case "criminal": {
      const c = get<{ name: string; risk_score: number }>("SELECT name, risk_score FROM criminals WHERE id=?", [id]);
      return { id: `criminal:${id}`, type: "criminal", label: c?.name || `#${id}`, meta: { risk: c?.risk_score } };
    }
    case "phone": {
      const p = get<{ number: string }>("SELECT number FROM phones WHERE id=?", [id]);
      return { id: `phone:${id}`, type: "phone", label: p?.number || `phone#${id}` };
    }
    case "vehicle": {
      const v = get<{ plate: string; make: string; model: string }>("SELECT plate, make, model FROM vehicles WHERE id=?", [id]);
      return { id: `vehicle:${id}`, type: "vehicle", label: v ? `${v.plate}` : `veh#${id}`, meta: { make: v?.make, model: v?.model } };
    }
    case "address": {
      const a = get<{ line: string; district: string }>("SELECT line, district FROM addresses WHERE id=?", [id]);
      return { id: `address:${id}`, type: "address", label: a?.district || `addr#${id}`, meta: { line: a?.line } };
    }
    case "fir": {
      const f = get<{ fir_number: string; crime_type: string }>("SELECT fir_number, crime_type FROM firs WHERE id=?", [id]);
      return { id: `fir:${id}`, type: "fir", label: f?.fir_number || `FIR#${id}`, meta: { crime: f?.crime_type } };
    }
    case "organization": {
      const o = get<{ name: string }>("SELECT name FROM organizations WHERE id=?", [id]);
      return { id: `organization:${id}`, type: "organization", label: o?.name || `org#${id}` };
    }
    default:
      return { id: `${type}:${id}`, type: type as GraphNode["type"], label: `${type}#${id}` };
  }
}

function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const seen = new Set<string>();
  const out: GraphEdge[] = [];
  for (const e of edges) {
    const key = [e.source, e.target].sort().join("|") + e.rel_type;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}
