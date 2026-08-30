"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScanSearch,
  FolderKanban,
  Users,
  Network,
  BarChart3,
  Map,
  FileText,
  Settings,
  ChevronLeft,
  ShieldCheck,
  Radar,
  Database,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { type SessionUser } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useT, type TransKey } from "@/lib/i18n-client";
import { Emblem } from "@/components/Emblem";

interface NavItem { href: string; key: TransKey; icon: LucideIcon; admin?: boolean }
interface NavGroup { label: string; items: NavItem[] }

// Primary navigation, grouped by workflow so the hierarchy is legible at a
// glance: operational surfaces first, then intelligence, analysis, records.
const GROUPS: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
      { href: "/cases", key: "nav.cases", icon: FolderKanban },
      { href: "/criminals", key: "nav.criminals", icon: Users },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { href: "/assistant", key: "nav.assistant", icon: ScanSearch },
      { href: "/predictions", key: "nav.predictions", icon: Radar },
      { href: "/network", key: "nav.network", icon: Network },
    ],
  },
  {
    label: "Analysis",
    items: [
      { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
      { href: "/maps", key: "nav.maps", icon: Map },
    ],
  },
  {
    label: "Records",
    items: [
      { href: "/database", key: "nav.database", icon: Database },
      { href: "/reports", key: "nav.reports", icon: FileText },
    ],
  },
];

const SYSTEM: NavItem[] = [
  { href: "/admin", key: "nav.admin", icon: ShieldCheck, admin: true },
  { href: "/settings", key: "nav.settings", icon: Settings },
];

const ROLE_KEY: Record<string, TransKey> = {
  administrator: "role.administrator",
  senior_officer: "role.senior_officer",
  investigation_officer: "role.investigation_officer",
  analyst: "role.analyst",
  readonly: "role.readonly",
};

export function Sidebar({ user }: { user: SessionUser }) {
  const pathname = usePathname();
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggle = useAppStore((s) => s.toggleSidebar);
  const t = useT();
  const canAdmin = user.role === "administrator" || user.role === "senior_officer";

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Row = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        className={cn("link-row", active && "link-row-active", collapsed && "justify-center px-0")}
        title={collapsed ? t(item.key) : undefined}
        aria-current={active ? "page" : undefined}
      >
        <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-accent" : "text-muted")} />
        {!collapsed && <span className="truncate">{t(item.key)}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-200 md:flex",
        collapsed ? "w-[68px]" : "w-[248px]"
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center gap-3 border-b border-border px-4 py-4", collapsed && "flex-col gap-2 px-2")}>
        <Link href="/dashboard" className="shrink-0" title="Crime Intelligence">
          <Emblem size={34} />
        </Link>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-[13.5px] font-bold uppercase leading-tight tracking-[0.02em]">{t("brand.name")}</div>
            <div className="truncate font-mono text-[9.5px] uppercase tracking-[0.16em] text-muted">{t("brand.tagline")}</div>
          </div>
        )}
        <button
          onClick={toggle}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-fg",
            collapsed ? "mt-1" : "ml-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {GROUPS.map((g) => (
          <div key={g.label} className="space-y-0.5">
            {!collapsed ? (
              <div className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted/70">{g.label}</div>
            ) : (
              <div className="mx-auto my-2 h-px w-6 bg-border" aria-hidden />
            )}
            {g.items.map((item) => <Row key={item.href} item={item} />)}
          </div>
        ))}

        <div className="space-y-0.5 border-t border-border pt-4">
          {!collapsed && <div className="px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted/70">System</div>}
          {SYSTEM.filter((item) => !item.admin || canAdmin).map((item) => <Row key={item.href} item={item} />)}
        </div>
      </nav>

      {/* Officer */}
      <div className="border-t border-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-elevated font-mono text-xs font-semibold text-accent ring-1 ring-inset ring-border">
            {initials(user.full_name)}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user.full_name}</div>
              <div className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-success" /> {t(ROLE_KEY[user.role] ?? "role.readonly")}
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
