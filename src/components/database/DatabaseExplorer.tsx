"use client";
import { useEffect, useState, useCallback, useMemo } from "react";
import { Table2, Database, Layers, Eye, ScrollText, Loader2, ChevronLeft, ChevronRight, Search, SearchX, X, Rows3, Columns3 } from "lucide-react";
import { EmptyState, PanelHeader, Tag } from "@/components/ui";
import { useT } from "@/lib/i18n-client";
import { listRecordCounts, listRecords } from "@/lib/ai-client";
import { getRecordSnapshot } from "@/lib/record-snapshot";

type DataSource = "cloud" | "snapshot";
interface TableInfo { name: string; count: number | null | undefined; source?: DataSource }
interface Group { group: string; tables: TableInfo[] }
interface BakedTable { table: string; columns: string[]; rows: Record<string, unknown>[]; total: number; source: DataSource; unavailable?: boolean }

function snapshotFallback(table: string): BakedTable | null {
  const snapshot = getRecordSnapshot(table);
  return snapshot ? { ...snapshot, source: "snapshot" } : null;
}

const CLOUD_GROUPS: Group[] = [
  { group: "official", tables: ["Firs", "Cases", "Criminals", "FirCriminals", "Arrests", "Victims", "Complainants", "Evidence"].map((name) => ({ name, count: undefined })) },
  { group: "intel", tables: ["Relationships", "Phones", "Vehicles", "Addresses", "Weapons", "Organizations", "OrgMembers", "PoliceStations", "Chargesheets", "OcrResult"].map((name) => ({ name, count: undefined })) },
  { group: "audit", tables: ["AuditLogs", "Notifications"].map((name) => ({ name, count: undefined })) },
];

const CLOUD_TABLES = CLOUD_GROUPS.flatMap((group) => group.tables.map((table) => table.name));

const GROUP_META: Record<string, { icon: typeof Table2; key: "database.official" | "database.intel" | "database.views" | "admin.audit" }> = {
  official: { icon: Database, key: "database.official" },
  intel: { icon: Layers, key: "database.intel" },
  views: { icon: Eye, key: "database.views" },
  audit: { icon: ScrollText, key: "admin.audit" },
};

export function DatabaseExplorer({ initialTable }: { initialTable?: string }) {
  const t = useT();
  const [groups, setGroups] = useState<Group[]>(CLOUD_GROUPS);
  const [active, setActive] = useState<string | null>(null);
  const [baked, setBaked] = useState<BakedTable | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const [dataQuery, setDataQuery] = useState("");
  const LIMIT = 50;

  const load = useCallback(async (table: string) => {
    setActive(table);
    setOffset(0);
    setLoading(true);
    const fallback = snapshotFallback(table);
    try {
      const [rows, counts] = await Promise.all([
        listRecords(table, 5000, true),
        listRecordCounts([table], true),
      ]);
      if (rows.length === 0 && fallback && fallback.total > 0) {
        setBaked(fallback);
        setGroups((current) => current.map((group) => ({
          ...group,
          tables: group.tables.map((item) => item.name === table
            ? { ...item, count: fallback.total, source: "snapshot" }
            : item),
        })));
        return;
      }
      const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const storedTotal = Math.max(rows.length, counts[table] || 0);
      setBaked({ table, columns, rows, total: storedTotal, source: "cloud" });
      setGroups((current) => current.map((group) => ({
        ...group,
        tables: group.tables.map((item) => (
          item.name === table ? { ...item, count: Math.max(item.count || 0, storedTotal), source: "cloud" } : item
        )),
      })));
    } catch {
      if (fallback) {
        setBaked(fallback);
      } else {
        setBaked({ table, columns: [], rows: [], total: 0, source: "cloud", unavailable: true });
      }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const first = initialTable || groups?.[0]?.tables?.[0]?.name;
    if (first) void load(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    void listRecordCounts(CLOUD_TABLES, true).then((counts) => {
      if (!active) return;
      setGroups((current) => current.map((group) => ({
        ...group,
        tables: group.tables.map((item) => {
          const cloudCount = counts[item.name] ?? null;
          const fallback = snapshotFallback(item.name);
          if ((cloudCount === null || cloudCount === 0) && fallback && fallback.total > 0) {
            return { ...item, count: fallback.total, source: "snapshot" };
          }
          return { ...item, count: cloudCount, source: cloudCount === null ? undefined : "cloud" };
        }),
      })));
    });
    return () => { active = false; };
  }, []);

  function selectTable(table: string) {
    setDataQuery("");
    void load(table);
  }

  // Client-side full-row search over records fetched from Cloud Scale.
  const matched = useMemo(() => {
    if (!baked) return [];
    const q = dataQuery.trim().toLowerCase();
    if (!q) return baked.rows;
    return baked.rows.filter((r) => Object.values(r).some((v) => String(v ?? "").toLowerCase().includes(q)));
  }, [baked, dataQuery]);

  useEffect(() => { setOffset(0); }, [dataQuery]);

  const data = baked
    ? {
        table: baked.table,
        columns: baked.columns,
        rows: matched.slice(offset, offset + LIMIT),
        total: matched.length,
        storedTotal: dataQuery.trim() ? matched.length : baked.total,
        source: baked.source,
        q: dataQuery.trim() || undefined,
        unavailable: baked.unavailable,
      }
    : null;

  const tableCount = useMemo(() => groups.reduce((n, g) => n + g.tables.length, 0), [groups]);
  const visibleGroups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, tables: needle ? g.tables.filter((tb) => tb.name.toLowerCase().includes(needle)) : g.tables }))
      .filter((g) => g.tables.length > 0);
  }, [groups, filter]);

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="grid min-h-[560px] items-stretch gap-4 lg:min-h-[calc(100vh-13rem)] lg:grid-cols-[280px_1fr]">
      {/* Table list */}
      <aside className="card flex max-h-[660px] flex-col lg:max-h-none">
        <div className="shrink-0 border-b border-border p-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <h2 className="truncate font-display text-sm font-semibold tracking-[-0.01em]">{t("database.tables")}</h2>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">{tableCount}</span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter tables…"
              aria-label="Filter tables"
              className="h-8 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                aria-label="Clear table filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted transition-colors hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="-mr-2 min-h-0 flex-1 overflow-y-auto p-3 pr-2">
          {visibleGroups.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-2 py-10 text-center">
              <SearchX className="h-5 w-5 text-muted/60" />
              <p className="text-xs text-muted">No table matches that filter.</p>
            </div>
          ) : (
            visibleGroups.map((g) => {
              const meta = GROUP_META[g.group] || GROUP_META.official;
              return (
                <div key={g.group} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex items-center gap-1.5 stat-label">
                    <meta.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{t(meta.key)}</span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted/70">{g.tables.length}</span>
                  </div>
                  <div className="space-y-0.5">
                    {g.tables.map((tb) => {
                      const on = active === tb.name;
                      return (
                        <button
                          key={tb.name}
                          onClick={() => selectTable(tb.name)}
                          title={tb.name}
                          aria-current={on ? "true" : undefined}
                          className={`lift-row group relative flex w-full items-center gap-2 rounded-md border py-1.5 pl-2 pr-2 text-left text-xs ${
                            on ? "border-accent/30 bg-elevated text-fg" : "border-transparent text-muted hover:bg-elevated/60 hover:text-subtle"
                          }`}
                        >
                          {on && <span aria-hidden className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-accent" />}
                          <Table2 className={`h-3.5 w-3.5 shrink-0 ${on ? "text-accent" : "text-muted/70 group-hover:text-muted"}`} />
                          <span className="truncate font-mono">{tb.name}</span>
                          <span className={`ml-auto min-w-6 shrink-0 text-right font-mono text-[10px] tabular-nums ${on ? "text-subtle" : "text-muted/70"}`}>
                            {tb.count === undefined ? "…" : tb.count === null ? "—" : tb.count.toLocaleString()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* Data view */}
      <section className="card card-static panel-pad min-h-[560px] min-w-0">
        {!data ? (
          loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">{t("common.loading")}</span>
            </div>
          ) : (
            <EmptyState icon={Database} title={t("database.select_table")} hint="Pick a table from the list to inspect its raw records." />
          )
        ) : (
          <>
            <PanelHeader
              icon={Table2}
              title={<span className="font-mono">{data.table}</span>}
              sub={`${data.storedTotal.toLocaleString()} records · ${data.total.toLocaleString()} loaded · ${data.columns.length} columns`}
              action={
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    value={dataQuery}
                    onChange={(e) => setDataQuery(e.target.value)}
                    placeholder="Search this table…"
                    aria-label={`Search rows in ${data.table}`}
                    className="h-8 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
                  />
                  {dataQuery && (
                    <button
                      onClick={() => setDataQuery("")}
                      aria-label="Clear row search"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded text-muted transition-colors hover:text-fg"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              }
            />

            {data.unavailable ? (
              <EmptyState
                icon={Database}
                title="Table not provisioned in this environment"
                hint="Create this Catalyst Cloud Scale table and import its CSV before browsing rows."
              />
            ) : <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Tag mono><Rows3 className="h-3 w-3 text-muted" />{data.total.toLocaleString()} {t("common.rows")}</Tag>
              <Tag mono><Columns3 className="h-3 w-3 text-muted" />{data.columns.length} cols</Tag>
              {data.q && <Tag>match &ldquo;{data.q}&rdquo;</Tag>}
              <span className="ml-auto text-muted">
                showing <span className="font-mono tabular-nums text-subtle">{data.rows.length.toLocaleString()}</span>
              </span>
            </div>

            <div className="max-h-[calc(100vh-22rem)] overflow-auto rounded-md border border-border">
              <table className="min-w-max text-left text-xs">
                <thead className="sticky top-0 z-10 bg-elevated">
                  <tr>
                    {data.columns.map((c, ci) => (
                      <th
                        key={c}
                        scope="col"
                        className={`whitespace-nowrap border-b border-border px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                          ci === 0 ? "text-subtle" : "text-muted"
                        }`}
                      >
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={Math.max(1, data.columns.length)} className="px-3 py-12">
                      <div className="sticky left-0 inline-flex items-center gap-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-elevated/70">
                          <SearchX className="h-4 w-4 text-muted" />
                        </span>
                        <span className="text-sm text-muted">
                          No matching rows{data.q && <> for <span className="font-mono text-subtle">&ldquo;{data.q}&rdquo;</span></>}.
                        </span>
                      </div>
                    </td></tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/40 transition-colors hover:bg-elevated/50">
                      {data.columns.map((c, ci) => (
                        <td
                          key={c}
                          className={`max-w-[320px] truncate whitespace-nowrap px-3 py-2 font-mono tabular-nums ${ci === 0 ? "text-fg" : "text-subtle"}`}
                          title={String(r[c] ?? "")}
                        >
                          {r[c] === null ? <span className="italic text-muted/50">null</span> : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.total > LIMIT && (
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs">
                <span className="font-mono tabular-nums text-muted">
                  {(offset + 1).toLocaleString()}&ndash;{Math.min(offset + LIMIT, data.total).toLocaleString()}
                  <span className="px-1 text-muted/60">/</span>
                  {data.total.toLocaleString()}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0 || loading}
                    aria-label="Previous page"
                    className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 font-mono tabular-nums text-muted">{page} / {pages}</span>
                  <button
                    onClick={() => setOffset(offset + LIMIT)}
                    disabled={offset + LIMIT >= data.total || loading}
                    aria-label="Next page"
                    className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
            </>}
          </>
        )}
      </section>
    </div>
  );
}
