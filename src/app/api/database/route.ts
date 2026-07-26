import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { all, get } from "@/lib/db";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Read-only database browser. Strictly whitelisted — `users` (password
 * hashes) is never exposed. All access is SELECT-only and audit-logged.
 */
const GROUPS: { group: string; tables: string[] }[] = [
  {
    group: "official",
    tables: [
      "CaseMaster", "ComplainantDetails", "Victim", "Accused", "ArrestSurrender",
      "ChargesheetDetails", "ActSectionAssociation", "Inv_OccuranceTime",
      "Act", "Section", "CrimeHead", "CrimeSubHead", "CrimeHeadActSection",
      "Court", "District", "State", "Unit", "UnitType", "Rank", "Designation",
      "Employee", "CaseCategory", "GravityOffence", "CaseStatusMaster",
      "CasteMaster", "ReligionMaster", "OccupationMaster",
    ],
  },
  {
    group: "intel",
    tables: [
      "intel_criminals", "intel_relationships", "intel_phones", "intel_vehicles",
      "intel_addresses", "intel_weapons", "intel_organizations", "intel_org_members",
      "intel_evidence", "intel_case_enrichment", "intel_accused_link",
    ],
  },
  {
    group: "views",
    tables: [
      "firs", "cases", "criminals", "arrests", "victims", "complainants",
      "police_stations", "evidence", "phones", "vehicles", "addresses",
      "weapons", "organizations", "org_members", "relationships",
    ],
  },
  { group: "audit", tables: ["audit_logs"] },
];

const WHITELIST = new Set(GROUPS.flatMap((g) => g.tables));
const IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export async function GET(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const table = url.searchParams.get("table");

  // No table → return the catalogue with row counts.
  if (!table) {
    const groups = GROUPS.map((g) => ({
      group: g.group,
      tables: g.tables.map((t) => ({
        name: t,
        count: (get<{ n: number }>(`SELECT COUNT(*) n FROM "${t}"`)?.n) ?? 0,
      })),
    }));
    return NextResponse.json({ groups });
  }

  if (!IDENT.test(table) || !WHITELIST.has(table)) {
    return NextResponse.json({ error: "Table not permitted" }, { status: 403 });
  }

  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const q = (url.searchParams.get("q") || "").trim();

  // Discover columns (from a sample row) so search can span every column.
  const sample = get<Record<string, unknown>>(`SELECT * FROM "${table}" LIMIT 1`);
  const allCols = sample ? Object.keys(sample) : [];

  let where = "";
  const params: unknown[] = [];
  if (q && allCols.length) {
    // Cast every column to text and LIKE-match — "search anything and find it".
    where = "WHERE " + allCols.map((c) => `CAST("${c}" AS TEXT) LIKE ?`).join(" OR ");
    for (const _c of allCols) params.push(`%${q}%`);
  }

  const rows = all<Record<string, unknown>>(`SELECT * FROM "${table}" ${where} LIMIT ? OFFSET ?`, [...params, limit, offset]);
  const total = (get<{ n: number }>(`SELECT COUNT(*) n FROM "${table}" ${where}`, params)?.n) ?? 0;
  const columns = rows.length ? Object.keys(rows[0]) : allCols;

  audit({ user, action: q ? "DB_SEARCHED" : "DB_BROWSED", entity: "table", entity_id: table, detail: q ? `q="${q}"` : undefined });
  return NextResponse.json({ table, columns, rows, total, limit, offset, q });
}
