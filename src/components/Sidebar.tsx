"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Sparkles,
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
} from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { type SessionUser } from "@/lib/types";
import { useAppStore } from "@/store/useAppStore";
import { useT, type TransKey } from "@/lib/i18n-client";
import { Emblem } from "@/components/Emblem";

const NAV: { href: string; key: TransKey; icon: typeof LayoutDashboard }[] = [
  { href: "/dashboard", key: "nav.dashboard", icon: LayoutDashboard },
  { href: "/assistant", key: "nav.assistant", icon: Sparkles },
  { href: "/predictions", key: "nav.predictions", icon: Radar },
  { href: "/cases", key: "nav.cases", icon: FolderKanban },
  { href: "/criminals", key: "nav.criminals", icon: Users },
  { href: "/network", key: "nav.network", icon: Network },
  { href: "/analytics", key: "nav.analytics", icon: BarChart3 },
  { href: "/maps", key: "nav.maps", icon: Map },
  { href: "/database", key: "nav.database", icon: Database },
  { href: "/reports", key: "nav.reports", icon: FileText },
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

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-300 md:flex",
        collapsed ? "w-[76px]" : "w-[264px]"
      )}
    >
      <div className={cn("flex items-center gap-3 border-b border-border/60 px-4 py-4", collapsed && "flex-col gap-2 px-2")}>
        <Link href="/dashboard" className="shrink-0" title="Crime Intelligence">
          <Emblem size={38} />
        </Link>
        {!collapsed && (
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-bold leading-tight tracking-tight">{t("brand.name")}</div>
            <div className="truncate text-[11px] text-muted">{t("brand.tagline")}</div>
          </div>
        )}
        <button
          onClick={toggle}
          className={cn(
            "rounded-md p-1.5 text-muted transition-colors hover:bg-elevated hover:text-fg",
            collapsed ? "mt-1" : "ml-auto"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand menu" : "Collapse menu"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("link-row", active && "link-row-active", collapsed && "justify-center px-0")}
              title={collapsed ? t(item.key) : undefined}
            >
              <item.icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-accent" : "text-muted/60")} />
              {!collapsed && <span className="truncate">{t(item.key)}</span>}
              {!collapsed && active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent" />}
            </Link>
          );
        })}

        {(user.role === "administrator" || user.role === "senior_officer") && (
          <Link
            href="/admin"
            className={cn(
              "link-row",
              pathname.startsWith("/admin") && "link-row-active",
              collapsed && "justify-center px-0"
            )}
            title={collapsed ? t("nav.admin") : undefined}
          >
            <ShieldCheck className="h-[18px] w-[18px] shrink-0 text-muted" />
            {!collapsed && <span>{t("nav.admin")}</span>}
          </Link>
        )}
        <Link
          href="/settings"
          className={cn("link-row", pathname.startsWith("/settings") && "link-row-active", collapsed && "justify-center px-0")}
          title={collapsed ? t("nav.settings") : undefined}
        >
          <Settings className="h-[18px] w-[18px] shrink-0 text-muted" />
          {!collapsed && <span>{t("nav.settings")}</span>}
        </Link>
      </nav>

      <div className="border-t border-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-elevated font-mono text-xs font-semibold text-accent ring-1 ring-inset ring-border/70">
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
