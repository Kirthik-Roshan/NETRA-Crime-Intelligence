"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Table2, Database, Layers, Eye, ScrollText, Loader2, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useT } from "@/lib/i18n-client";

interface TableInfo { name: string; count: number }
interface Group { group: string; tables: TableInfo[] }
interface TableData { table: string; columns: string[]; rows: Record<string, unknown>[]; total: number; limit: number; offset: number; q?: string }

const GROUP_META: Record<string, { icon: typeof Table2; key: "database.official" | "database.intel" | "database.views" | "admin.audit" }> = {
  official: { icon: Database, key: "database.official" },
  intel: { icon: Layers, key: "database.intel" },
  views: { icon: Eye, key: "database.views" },
  audit: { icon: ScrollText, key: "admin.audit" },
};

export function DatabaseExplorer({ initialTable }: { initialTable?: string }) {
  const t = useT();
  const [groups, setGroups] = useState<Group[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [data, setData] = useState<TableData | null>(null);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const [filter, setFilter] = useState(""); // filters the table LIST (left)
  const [dataQuery, setDataQuery] = useState(""); // searches ROWS in the current table
  const activeRef = useRef<string | null>(null);
  const LIMIT = 50;

  const load = useCallback((table: string, off: number, q: string) => {
    setActive(table);
    activeRef.current = table;
    setLoading(true);
    setOffset(off);
    fetch(`/api/database?table=${encodeURIComponent(table)}&limit=${LIMIT}&offset=${off}&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((j) => setData(j))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetch("/api/database").then((r) => r.json()).then((j) => {
      setGroups(j.groups || []);
      const first = initialTable || j.groups?.[0]?.tables?.[0]?.name;
      if (first) load(first, 0, "");
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced row search on the active table.
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => load(active, 0, dataQuery), 280);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataQuery]);

  function selectTable(table: string) {
    setDataQuery("");
    load(table, 0, "");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Table list */}
      <div className="card panel-pad max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter tables…" className="input pl-9 text-sm" />
        </div>
        {groups.map((g) => {
          const meta = GROUP_META[g.group] || GROUP_META.official;
          const tables = g.tables.filter((tb) => tb.name.toLowerCase().includes(filter.toLowerCase()));
          if (!tables.length) return null;
          return (
            <div key={g.group} className="mb-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
                <meta.icon className="h-3.5 w-3.5" /> {t(meta.key)}
              </div>
              <div className="space-y-0.5">
                {tables.map((tb) => (
                  <button
                    key={tb.name}
                    onClick={() => selectTable(tb.name)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-elevated ${active === tb.name ? "bg-elevated text-fg" : "text-subtle"}`}
                  >
                    <Table2 className="h-3.5 w-3.5 shrink-0 text-muted" />
                    <span className="truncate font-mono">{tb.name}</span>
                    <span className="ml-auto font-mono text-[10px] text-muted">{tb.count}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rows */}
      <div className="card panel-pad min-w-0">
        {!data ? (
          <div className="grid h-64 place-items-center text-sm text-muted">
            {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t("database.select_table")}
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Table2 className="h-4 w-4 text-accent" />
              <h2 className="font-mono text-sm font-semibold">{data.table}</h2>
              {loading && <Loader2 className="h-4 w-4 animate-spin text-muted" />}
              {/* Row search — searches every column of this table server-side */}
              <div className="relative ml-auto w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <input
                  value={dataQuery}
                  onChange={(e) => setDataQuery(e.target.value)}
                  placeholder="Search this table…"
                  className="input h-9 py-0 pl-9 pr-8 text-sm"
                />
                {dataQuery && (
                  <button onClick={() => setDataQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-fg">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
            <div className="mb-2 text-xs text-muted">
              {data.q ? <>Found <span className="font-mono text-fg">{data.total.toLocaleString()}</span> matching &ldquo;{data.q}&rdquo;</> : <>{data.total.toLocaleString()} {t("common.rows")}</>} · showing {data.rows.length}
            </div>
            {/* BOTH scrollbars: vertical (max-h) + horizontal (min-w table) */}
            <div className="max-h-[calc(100vh-20rem)] overflow-auto rounded-lg border border-border">
              <table className="min-w-max text-left text-xs">
                <thead className="sticky top-0 z-10 bg-elevated">
                  <tr>
                    {data.columns.map((c) => (
                      <th key={c} className="whitespace-nowrap border-b border-border px-3 py-2 font-mono font-medium text-muted">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.length === 0 && (
                    <tr><td colSpan={Math.max(1, data.columns.length)} className="px-3 py-8 text-center text-muted">No matching rows.</td></tr>
                  )}
                  {data.rows.map((r, i) => (
                    <tr key={i} className="border-t border-border/50 hover:bg-elevated/50">
                      {data.columns.map((c) => (
                        <td key={c} className="max-w-[320px] truncate whitespace-nowrap px-3 py-1.5 font-mono text-subtle" title={String(r[c] ?? "")}>
                          {r[c] === null ? <span className="italic text-muted/50">null</span> : String(r[c])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {data.total > LIMIT && (
              <div className="mt-3 flex items-center justify-end gap-2 text-xs">
                <button onClick={() => load(data.table, Math.max(0, offset - LIMIT), dataQuery)} disabled={offset === 0 || loading} className="btn-ghost h-8 px-2 disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-mono text-muted">{offset + 1}–{Math.min(offset + LIMIT, data.total)} / {data.total}</span>
                <button onClick={() => load(data.table, offset + LIMIT, dataQuery)} disabled={offset + LIMIT >= data.total || loading} className="btn-ghost h-8 px-2 disabled:opacity-40">
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
