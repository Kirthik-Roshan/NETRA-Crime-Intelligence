"use client";
import { useEffect, useRef, useState } from "react";
import { Bell, X, AlertTriangle, FileSearch, Sparkles, Flame, Info } from "lucide-react";
import { fetchNotifications, setNotificationStatus, type NotificationRow } from "@/lib/ai-client";

const KIND_ICON: Record<string, typeof Info> = {
  investigation: FileSearch,
  case_assignment: FileSearch,
  intelligence: Sparkles,
  crime_spike: Flame,
  system: Info,
};
const SEV_TONE: Record<string, string> = { critical: "text-danger", high: "text-warning", medium: "text-info", low: "text-muted" };

function ago(ts: string): string {
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Live notifications bell. Reads durable read/unread/archived state from the
 * Cloud Scale Data Store (via the Function). Empty-safe: an empty or
 * unprovisioned table simply shows "No notifications", never an error.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const boxRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await fetchNotifications();
      setItems(rows.filter((n) => n.status !== "archived"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const unread = items.filter((n) => n.status === "unread").length;

  async function markRead(n: NotificationRow) {
    if (n.status === "unread") {
      setItems((xs) => xs.map((x) => (x.id === n.id ? { ...x, status: "read" } : x)));
      if (n.id) await setNotificationStatus(n.id, "read");
    }
  }
  async function archive(n: NotificationRow) {
    setItems((xs) => xs.filter((x) => x.id !== n.id));
    if (n.id) await setNotificationStatus(n.id, "archived");
  }

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative grid h-9 w-9 place-items-center rounded-lg border border-border text-muted transition-colors hover:bg-elevated hover:text-fg"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {unread > 0 && <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-danger" />}
      </button>

      {open && (
        <div className="absolute right-0 top-11 z-40 w-80 overflow-hidden rounded-xl border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold">Notifications</span>
            <span className="text-[11px] text-muted">{unread ? `${unread} unread` : "all read"}</span>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading && <p className="px-3 py-6 text-center text-xs text-muted">Loading from Cloud Scale…</p>}
            {!loading && items.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted">No notifications.</p>}
            {!loading && items.map((n) => {
              const Icon = KIND_ICON[n.kind] || AlertTriangle;
              return (
                <div
                  key={n.id || n.title}
                  onClick={() => markRead(n)}
                  className={`flex cursor-pointer gap-2.5 border-b border-border/50 px-3 py-2.5 transition-colors hover:bg-elevated ${n.status === "unread" ? "" : "opacity-70"}`}
                >
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${SEV_TONE[n.severity] || "text-accent"}`} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {n.status === "unread" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />}
                      <span className="truncate text-xs font-semibold">{n.title || "Notification"}</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted">{ago(n.ts)}</span>
                    </div>
                    {n.detail && <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{n.detail}</p>}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); archive(n); }}
                    className="shrink-0 self-start rounded p-0.5 text-muted hover:text-danger"
                    aria-label="Archive notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
