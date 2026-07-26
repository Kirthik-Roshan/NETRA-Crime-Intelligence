import Link from "next/link";
import { Search, Users, ShieldAlert, Database } from "lucide-react";
import { all } from "@/lib/db";
import { PageHeader, Avatar, RiskMeter, StatusBadge, Badge, EmptyState } from "@/components/ui";
import { parseJsonArray } from "@/lib/utils";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

interface CrimRow {
  id: number; name: string; aliases: string; age: number; gender: string; status: string;
  risk_score: number; crime_category: string; home_district: string; fir_count: number; arrest_count: number;
}

export default function CriminalsPage({ searchParams }: { searchParams: { q?: string; risk?: string } }) {
  const t = getT();
  const q = searchParams.q?.trim() || "";
  const risk = searchParams.risk || "all";

  const where: string[] = [];
  const params: unknown[] = [];
  if (q) { where.push("(c.name LIKE ? OR c.home_district LIKE ? OR c.crime_category LIKE ?)"); params.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  if (risk === "high") where.push("c.risk_score >= 70");
  else if (risk === "medium") where.push("c.risk_score >= 40 AND c.risk_score < 70");
  else if (risk === "low") where.push("c.risk_score < 40");

  const rows = all<CrimRow>(
    `SELECT c.id, c.name, c.aliases, c.age, c.gender, c.status, c.risk_score, c.crime_category, c.home_district,
            (SELECT COUNT(*) FROM fir_criminals fc WHERE fc.criminal_id=c.id) AS fir_count,
            (SELECT COUNT(*) FROM arrests a WHERE a.criminal_id=c.id) AS arrest_count
     FROM criminals c ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY c.risk_score DESC LIMIT 100`,
    params
  );

  const filters = [
    { id: "all", label: t("common.all") },
    { id: "high", label: t("criminals.high_risk") },
    { id: "medium", label: t("criminals.moderate") },
    { id: "low", label: t("criminals.low") },
  ];

  return (
    <div>
      <PageHeader title={t("criminals.title")} subtitle={`${rows.length} ${t("criminals.subtitle")}`}>
        <Link href="/database?table=intel_criminals" className="btn-ghost text-sm">
          <Database className="h-4 w-4" /> View in database
        </Link>
      </PageHeader>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input name="q" defaultValue={q} placeholder={t("criminals.search")} className="input pl-9" />
        </div>
        <div className="flex gap-1 rounded-lg border border-border p-1">
          {filters.map((f) => (
            <Link
              key={f.id}
              href={`/criminals?risk=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${risk === f.id ? "bg-elevated text-fg" : "text-muted hover:text-fg"}`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={Users} title="No criminals match your search" hint="Try a different name, district, or risk band." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const aliases = parseJsonArray(c.aliases);
            return (
              <Link key={c.id} href={`/criminals/${c.id}`} className="card panel-pad group animate-fade-in transition-colors hover:border-accent/40">
                <div className="flex items-start gap-3">
                  <Avatar name={c.name} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{c.name}</span>
                      {c.risk_score >= 80 && <ShieldAlert className="h-3.5 w-3.5 shrink-0 text-danger" />}
                    </div>
                    {aliases[0] && <div className="truncate text-xs text-muted">alias {aliases[0]}</div>}
                    <div className="mt-1 flex items-center gap-2">
                      <StatusBadge status={c.status} />
                      <span className="text-xs text-muted">{c.home_district}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-border/50 pt-3">
                  <RiskMeter score={c.risk_score} />
                  <div className="flex gap-3 text-xs text-muted">
                    <span>{c.fir_count} FIRs</span>
                    <span>{c.arrest_count} arrests</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Badge tone="info">{c.crime_category}</Badge>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
