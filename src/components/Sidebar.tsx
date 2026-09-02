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
  Sparkles,
  Compass,
  Search,
  BrainCircuit,
  Archive,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { type SessionUser } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useT, type TransKey } from "@/lib/i18n-client";
import { Emblem } from "@/components/Emblem";
import { can } from "@/lib/auth-client";

type NavItem = { href: string; key: TransKey; icon: LucideIcon; cap?: string; roles?: string[] };
type NavSection = { key: TransKey; icon: LucideIcon; items: NavItem[] };

const NAV_SECTIONS: NavSection[] = [
  {
    key: "nav.group.overview",
    icon: Compass,
    items: [{ href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard }],
  },
  {
    key: "nav.group.investigation",
    icon: Search,
    items: [
      { href: "/assistant", key: "nav.assistant", icon: Sparkles, cap: "ai" },
      { href: "/cases", key: "nav.cases", icon: FolderKanban, cap: "cases" },
      { href: "/evidence", key: "nav.evidence", icon: ScanSearch, cap: "evidence" },
    ],
  },
  {
    key: "nav.group.intelligence",
    icon: BrainCircuit,
    items: [
      { href: "/predictions", key: "nav.predictions", icon: Radar, cap: "predictive" },
      { href: "/criminals", key: "nav.criminals", icon: Users, cap: "criminals" },
      { href: "/network", key: "nav.network", icon: Network, cap: "network" },
      { href: "/analytics", key: "nav.analytics", icon: BarChart3, cap: "analytics" },
      { href: "/maps", key: "nav.maps", icon: Map, cap: "analytics" },
    ],
  },
  {
    key: "nav.group.records",
    icon: Archive,
    items: [
      { href: "/database", key: "nav.database", icon: Database, cap: "search" },
      { href: "/reports", key: "nav.reports", icon: FileText, cap: "reports" },
    ],
  },
  {
    key: "nav.group.system",
    icon: ShieldCheck,
    items: [
      { href: "/admin", key: "nav.admin", icon: ShieldCheck, cap: "audit" },
      { href: "/settings", key: "nav.settings", icon: Settings },
    ],
  },
];

const ROLE_KEY: Record<string, TransKey> = {
  administrator: "role.administrator",
  senior_officer: "role.senior_officer",
  investigation_officer: "role.investigation_officer",
  analyst: "role.analyst",
  readonly: "role.readonly",
};

export function Sidebar({ user, mobile = false, onClose }: { user: SessionUser; mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const storedCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const collapsed = mobile ? false : storedCollapsed;
  const toggle = useAppStore((s) => s.toggleSidebar);
  const t = useT();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const Row = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    return (
      <Link
        href={item.href}
        onClick={onClose}
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
        "top-0 h-screen shrink-0 flex-col border-r border-border bg-surface shadow-[4px_0_24px_-22px_rgb(8_34_52/0.8)] transition-[width] duration-200",
        mobile ? "fixed left-0 z-10 flex w-[min(86vw,296px)]" : "sticky hidden md:flex",
        !mobile && (collapsed ? "w-[72px]" : "w-[272px]")
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
          onClick={mobile ? onClose : toggle}
          className={cn(
            "grid h-7 w-7 place-items-center rounded-md text-muted transition-colors hover:bg-elevated hover:text-fg",
            collapsed ? "mt-1" : "ml-auto"
          )}
          aria-label={mobile ? "Close navigation" : collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={mobile ? "Close navigation" : collapsed ? "Expand menu" : "Collapse menu"}
        >
          {mobile ? <X className="h-4 w-4" /> : <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />}
        </button>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-label="Primary navigation">
        {NAV_SECTIONS.map((section, sectionIndex) => {
          const items = section.items.filter((item) =>
            (!item.cap || can(user.role, item.cap)) && (!item.roles || item.roles.includes(user.role))
          );
          if (!items.length) return null;

          return (
            <div key={section.key} className={cn("space-y-0.5", sectionIndex > 0 && collapsed && "border-t border-border/60 pt-3")}>
              {!collapsed ? (
                <div className="flex items-center gap-1.5 px-2.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted/70">
                  <section.icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{t(section.key)}</span>
                </div>
              ) : (
                sectionIndex > 0 && <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
              )}
              {items.map((item) => <Row key={item.href} item={item} />)}
            </div>
          );
        })}
      </nav>

      {/* Officer */}
      <div className="border-t border-border bg-elevated/45 p-3">
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
