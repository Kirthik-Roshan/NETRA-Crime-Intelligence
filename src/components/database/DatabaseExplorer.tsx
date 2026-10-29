"use client";
import { matchesUiText } from '@/lib/ui-kannada';
import { UiText, useUiText } from '@/components/UiText';

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Table2, Database, Layers, Eye, ScrollText, Loader2, ChevronLeft, ChevronRight, Search, SearchX, X, Rows3, Columns3, KeyRound, Link2, Hash } from "lucide-react";
import { EmptyState, PanelHeader, Tag } from "@/components/ui";
import { useT } from "@/lib/i18n-client";
import { listRecordCounts, listRecords } from "@/lib/ai-client";
import CLOUD_SCHEMA from "../../../data/cloudscale-import/schema.json";
import { orderDatabaseRows } from '@/lib/database-order';

interface TableInfo { name: string; count: number | null | undefined }
interface Group { group: string; tables: TableInfo[] }
interface ColumnSchema { name: string; type: string; key: string | null; reference: string | null }
interface TableData { table: string; columns: string[]; schema: ColumnSchema[]; rows: Record<string, unknown>[]; total: number; unavailable?: boolean }

type SchemaManifest = {
  tables: Array<{
    name: string;
    tier?: string;
    fields?: Array<{ name: string; type: string; key?: string; reference?: string }>;
  }>;
};

const OFFICIAL_SCHEMA = (CLOUD_SCHEMA as SchemaManifest).tables.filter((table) => table.tier === "ksp_er");
const SCHEMA_BY_TABLE = new Map<string, ColumnSchema[]>(OFFICIAL_SCHEMA.map((table) => [
  table.name,
  (table.fields || []).map((field) => ({
    name: field.name,
    type: field.type,
    key: field.key || null,
    reference: field.reference || null,
  })),
]));

const TABLE_GROUPS: Group[] = [
  { group: "er_cases", tables: ["CaseMaster", "ComplainantDetails", "Victim", "Accused", "ArrestSurrender", "ChargesheetDetails", "ActSectionAssociation", "Inv_OccuranceTime", "inv_arrestsurrenderaccused"].map((name) => ({ name, count: undefined })) },
  { group: "er_legal", tables: ["Act", "Section", "CrimeHead", "CrimeSubHead", "CrimeHeadActSection", "CaseCategory", "GravityOffence", "CaseStatusMaster"].map((name) => ({ name, count: undefined })) },
  { group: "er_police", tables: ["Court", "District", "State", "Unit", "UnitType", "Rank", "Designation", "Employee"].map((name) => ({ name, count: undefined })) },
  { group: "er_people", tables: ["CasteMaster", "ReligionMaster", "OccupationMaster"].map((name) => ({ name, count: undefined })) },
];

const CLOUD_TABLES = TABLE_GROUPS.flatMap((group) => group.tables.map((table) => table.name));

const GROUP_META: Record<string, { icon: typeof Table2; label: string }> = {
  er_cases: { icon: Database, label: "Case records" },
  er_legal: { icon: ScrollText, label: "Legal classification" },
  er_police: { icon: Layers, label: "Police organization" },
  er_people: { icon: Eye, label: "Demographic lookup" },
};

function isMissing(value: unknown): boolean {
  return value == null || (typeof value === "string" && value.trim() === "");
}

function catalystType(rows: Record<string, unknown>[], column: string): string {
  const values = rows.map((row) => row[column]).filter((value) => !isMissing(value));
  if (/date|_at$|time/i.test(column)) {
    return values.some((value) => /[T ]\d{2}:\d{2}/.test(String(value))) ? "DateTime" : "Date";
  }
  if (/^(active|is_|victimpolice|physicallychallenged)/i.test(column)) return "Boolean";
  if (values.length && values.every((value) => typeof value === "number" && Number.isInteger(value))) {
    return values.some((value) => Math.abs(Number(value)) > 2147483647) ? "BigInt" : "Int";
  }
  if (values.length && values.every((value) => typeof value === "number")) return "Double";
  return values.some((value) => String(value).length > 255) ? "Text" : "Var Char";
}

export function DatabaseExplorer({ initialTable }: { initialTable?: string }) {
  const ui = useUiText();
  const t = useT();
  const [groups, setGroups] = useState<Group[]>(TABLE_GROUPS);
  const [active, setActive] = useState<string | null>(null);
  const [tableData, setTableData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState("");
  const [dataQuery, setDataQuery] = useState("");
  const [sort, setSort] = useState<{ column: string; direction: 'asc' | 'desc' }>({ column: '', direction: 'asc' });
  const requestId = useRef(0);
  const scroller = useRef<HTMLDivElement>(null);
  const LIMIT = 50;

  const load = useCallback(async (table: string) => {
    const request = ++requestId.current;
    setActive(table);
    setTableData(null);
    setOffset(0);
    setLoading(true);
    const schema = SCHEMA_BY_TABLE.get(table) || [];
    try {
      const [rows, counts] = await Promise.all([
        listRecords(table, 5000, true),
        listRecordCounts([table], true),
      ]);
      if (request !== requestId.current) return;
      const expectedColumns = schema.map((field) => field.name);
      const returnedColumns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
      const columns = [...expectedColumns, ...returnedColumns.filter((column) => !expectedColumns.includes(column))];
      setSort({ column: schema.find(field => field.key === 'PK')?.name || columns[0] || '', direction: 'asc' });
      const storedTotal = Math.max(rows.length, counts[table] || 0);
      setTableData({ table, columns, schema, rows, total: storedTotal });
      setGroups((current) => current.map((group) => ({
        ...group,
        tables: group.tables.map((item) => (
          item.name === table ? { ...item, count: Math.max(item.count || 0, storedTotal) } : item
        )),
      })));
    } catch {
      if (request !== requestId.current) return;
      setTableData({ table, columns: schema.map((field) => field.name), schema, rows: [], total: 0, unavailable: true });
    } finally { if (request === requestId.current) setLoading(false); }
  }, []);

  useEffect(() => {
    const queryTable = new URLSearchParams(window.location.search).get("table") || "";
    const requestedName = initialTable || queryTable;
    const requested = CLOUD_TABLES.includes(requestedName) ? requestedName : undefined;
    const first = requested || groups[0]?.tables[0]?.name;
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
          return { ...item, count: cloudCount };
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
    if (!tableData) return [];
    const q = dataQuery.trim().toLowerCase();
    const rows = q ? tableData.rows.filter((r) => Object.values(r).some((v) => matchesUiText([v], q))) : tableData.rows;
    return orderDatabaseRows(rows, sort.column, sort.direction);
  }, [tableData, dataQuery, sort]);

  useEffect(() => { setOffset(0); }, [dataQuery]);
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); }, [offset, sort, active]);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const fit = () => { element.style.maxHeight = `${Math.max(240, window.innerHeight - element.getBoundingClientRect().top - 90)}px`; };
    fit();
    const observer = new ResizeObserver(fit);
    if (element.parentElement) observer.observe(element.parentElement);
    window.addEventListener('resize', fit);
    return () => { observer.disconnect(); window.removeEventListener('resize', fit); };
  }, [loading, tableData?.table]);

  const data = tableData
    ? {
        table: tableData.table,
        columns: tableData.columns,
        rows: matched.slice(offset, offset + LIMIT),
        total: matched.length,
        storedTotal: dataQuery.trim() ? matched.length : tableData.total,
        q: dataQuery.trim() || undefined,
        unavailable: tableData.unavailable,
      }
    : null;

  const tableCount = useMemo(() => groups.reduce((n, group) => n + group.tables.length, 0), [groups]);
  const visibleGroups = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return groups
      .map((g) => ({ ...g, tables: needle ? g.tables.filter((tb) => matchesUiText([tb.name], needle)) : g.tables }))
      .filter((g) => g.tables.length > 0);
  }, [groups, filter]);

  const columnQuality = useMemo(() => {
    if (!tableData) return new Map<string, { type: string; key: string | null; reference: string | null; missing: number }>();
    return new Map(tableData.columns.map((column) => {
      const contract = tableData.schema.find((field) => field.name === column);
      return [column, {
        type: contract?.type || catalystType(tableData.rows, column),
        key: contract?.key || null,
        reference: contract?.reference || null,
        missing: tableData.rows.filter((row) => isMissing(row[column])).length,
      }] as const;
    }));
  }, [tableData]);
  const missingValues = useMemo(() => [...columnQuality.values()].reduce((total, column) => total + column.missing, 0), [columnQuality]);
  const inspectedValues = tableData ? tableData.rows.length * tableData.columns.length : 0;
  const completeness = inspectedValues ? Math.round(((inspectedValues - missingValues) / inspectedValues) * 1000) / 10 : 100;

  const page = Math.floor(offset / LIMIT) + 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div className="database-workspace grid min-w-0 items-start gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
      {/* Table list */}
      <aside className="database-tables card flex max-h-[300px] min-h-0 flex-col lg:sticky lg:top-20">
        <div className="shrink-0 border-b border-border p-3">
          <div className="mb-2.5 flex items-baseline justify-between gap-2">
            <div className="min-w-0">
              <h2 className="truncate font-display text-sm font-semibold tracking-[-0.01em]">{t("database.tables")}</h2>
              <p className="mt-0.5 truncate text-[10px] uppercase tracking-[0.06em] text-muted"><UiText text={"Official KSP ER schema"} /></p>
            </div>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted"><UiText text={tableCount} /></span>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={ui("Filter tables…")}
              aria-label={ui("Filter tables")}
              className="h-8 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
            />
            {filter && (
              <button
                onClick={() => setFilter("")}
                aria-label={ui("Clear table filter")}
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
              <p className="text-xs text-muted"><UiText text={"No table matches that filter."} /></p>
            </div>
          ) : (
            visibleGroups.map((g) => {
              const meta = GROUP_META[g.group] || GROUP_META.er_cases;
              return (
                <div key={g.group} className="mb-4 last:mb-0">
                  <div className="mb-1.5 flex items-center gap-1.5 stat-label">
                    <meta.icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate"><UiText text={meta.label} /></span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-muted/70"><UiText text={g.tables.length} /></span>
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
                          <span className="truncate font-mono"><UiText text={tb.name} /></span>
                          <span className={`ml-auto min-w-6 shrink-0 text-right font-mono text-[10px] tabular-nums ${on ? "text-subtle" : "text-muted/70"}`}>
                            <UiText text={tb.count === undefined ? "…" : tb.count === null ? "—" : tb.count.toLocaleString()} />
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
      <section className="card card-static panel-pad min-w-0 self-start">
        {!data ? (
          loading ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-xs">{t("common.loading")}</span>
            </div>
          ) : (
            <EmptyState icon={Database} title={t("database.select_table")} hint={ui("Pick a table from the list to inspect its raw records.")} />
          )
        ) : (
          <>
            <PanelHeader
              icon={Table2}
              title={<span className="font-mono"><UiText text={data.table} /></span>}
              sub={`${data.storedTotal.toLocaleString()} records · ${data.total.toLocaleString()} loaded · ${data.columns.length} columns`}
              action={
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                  <input
                    value={dataQuery}
                    onChange={(e) => setDataQuery(e.target.value)}
                    placeholder={ui("Search this table…")}
                    aria-label={`Search rows in ${data.table}`}
                    className="h-8 w-full rounded-md border border-border bg-elevated/40 pl-8 pr-8 text-xs text-fg outline-none placeholder:text-muted focus:border-accent/60 focus:bg-elevated/70 focus:ring-2 focus:ring-accent/15"
                  />
                  {dataQuery && (
                    <button
                      onClick={() => setDataQuery("")}
                      aria-label={ui("Clear row search")}
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
                title={ui("Table not provisioned in this environment")}
                hint={ui("Create this Catalyst Cloud Scale table and import its CSV before browsing rows.")}
              />
            ) : <>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <Tag mono><Rows3 className="h-3 w-3 text-muted" />{data.total.toLocaleString()} {t("common.rows")}</Tag>
              <Tag mono><Columns3 className="h-3 w-3 text-muted" /><UiText text={data.columns.length} /><UiText text={" cols"} /></Tag>
              <Tag><UiText text={"Catalyst Cloud Scale"} /></Tag>
              <Tag><UiText text={"Official KSP schema"} /></Tag>
              <Tag><UiText text={"Sort by"} />: {sort.column} {sort.direction === 'asc' ? '↑' : '↓'}</Tag>
              <Tag><UiText text={completeness} /><UiText text={"% sample complete"} /></Tag>
              {missingValues > 0 && <Tag>{missingValues.toLocaleString()}<UiText text={" not recorded in sample"} /></Tag>}
              {data.q && <Tag><UiText text={"match “"} /><UiText text={data.q} /><UiText text={"”"} /></Tag>}
              <span className="ml-auto text-muted"><UiText text={"showing "} /><span className="font-mono tabular-nums text-subtle">{data.rows.length.toLocaleString()}</span>
              </span>
            </div>

            <div ref={scroller} className="database-scroll relative isolate max-h-[clamp(240px,calc(100dvh-24rem),720px)] overflow-auto overscroll-contain rounded-md border border-border">
              <table className="database-records min-w-max text-left text-xs">
                <thead>
                  <tr>
                    {data.columns.map((c, ci) => (
                      <th
                        key={c}
                        scope="col"
                        aria-sort={sort.column === c ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`whitespace-nowrap border-b border-border px-3 py-2 font-mono text-[10.5px] font-semibold uppercase tracking-[0.06em] ${
                          ci === 0 ? "text-subtle" : "text-muted"
                        }`}
                      >
                        <button type="button" className="flex w-full items-center gap-2 text-left" aria-label={`Sort by ${c}`} onClick={() => { setOffset(0); setSort(current => ({ column: c, direction: current.column === c && current.direction === 'asc' ? 'desc' : 'asc' })); }}>
                          {columnQuality.get(c)?.key === 'PK' ? <KeyRound aria-hidden className="h-3 w-3 shrink-0 text-warning" /> : columnQuality.get(c)?.reference ? <Link2 aria-hidden className="h-3 w-3 shrink-0 text-accent" /> : <Hash aria-hidden className="h-3 w-3 shrink-0 text-muted" />}
                          <span title={c}><UiText text={c} /></span><span aria-hidden>{sort.column === c ? (sort.direction === 'asc' ? '↑' : '↓') : '↕'}</span>
                        </button>
                        <span className="mt-0.5 block text-[9px] font-normal normal-case text-muted/70">
                          {columnQuality.get(c)?.type || "Var Char"}
                          <UiText text={columnQuality.get(c)?.key ? ` · ${columnQuality.get(c)?.key}` : ""} />
                          <UiText text={columnQuality.get(c)?.missing ? ` · ${columnQuality.get(c)?.missing} missing` : ""} />
                        </span>
                        {columnQuality.get(c)?.reference && (
                          <span className="mt-0.5 block max-w-44 truncate text-[9px] font-normal normal-case text-accent/80" title={`References ${columnQuality.get(c)?.reference}`}>
                            → <UiText text={columnQuality.get(c)?.reference} />
                          </span>
                        )}
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
                        <span className="text-sm text-muted"><UiText text={"No matching rows"} />{data.q && <><UiText text={" for "} /><span className="font-mono text-subtle"><UiText text={"“"} /><UiText text={data.q} /><UiText text={"”"} /></span></>}.
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
                          title={isMissing(r[c]) ? "No value recorded for this optional field" : String(r[c])}
                        >
                          {isMissing(r[c]) ? <span className="italic text-muted/60"><UiText text={"Not recorded"} /></span> : String(r[c])}
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
                  {(offset + 1).toLocaleString()}<UiText text={"–"} />{Math.min(offset + LIMIT, data.total).toLocaleString()}
                  <span className="px-1 text-muted/60">/</span>
                  {data.total.toLocaleString()}
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                    disabled={offset === 0 || loading}
                    aria-label={ui("Previous page")}
                    className="btn-ghost h-8 w-8 p-0 disabled:opacity-40"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="px-1 font-mono tabular-nums text-muted"><UiText text={page} /> / <UiText text={pages} /></span>
                  <button
                    onClick={() => setOffset(offset + LIMIT)}
                    disabled={offset + LIMIT >= data.total || loading}
                    aria-label={ui("Next page")}
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
