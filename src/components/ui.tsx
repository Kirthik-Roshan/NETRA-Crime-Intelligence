import { cn, initials, hueFromString, riskBand } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "accent" | "danger" | "warning" | "success";
}) {
  const toneMap = {
    default: "text-fg",
    accent: "text-accent",
    danger: "text-danger",
    warning: "text-warning",
    success: "text-success",
  };
  const bar = {
    default: "bg-border", accent: "bg-accent", danger: "bg-danger", warning: "bg-warning", success: "bg-success",
  };
  return (
    <div className="card panel-pad group relative overflow-hidden">
      <span aria-hidden className={cn("absolute inset-x-0 top-0 h-0.5 opacity-70", bar[tone])} />
      <div className="flex items-start justify-between gap-3">
        <span className="stat-label">{label}</span>
        {Icon && (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border/60 bg-elevated/60 transition-colors group-hover:border-border">
            <Icon className={cn("h-4 w-4", toneMap[tone])} />
          </span>
        )}
      </div>
      <div className={cn("mt-3 font-display text-[2.15rem] font-black leading-none tracking-[-0.04em] tabular-nums md:text-[2.5rem]", toneMap[tone])}>{value}</div>
      {sub && <div className="mt-1.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "muted",
}: {
  children: React.ReactNode;
  tone?: "muted" | "accent" | "danger" | "warning" | "success" | "info";
}) {
  const map = {
    muted: "border-border text-muted",
    accent: "border-accent/30 text-accent bg-accent/10",
    danger: "border-danger/30 text-danger bg-danger/10",
    warning: "border-warning/30 text-warning bg-warning/10",
    success: "border-success/30 text-success bg-success/10",
    info: "border-info/30 text-info bg-info/10",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-xs font-medium capitalize", map[tone])}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s.includes("critical") || s.includes("at_large") ? "danger"
    : s.includes("high") || s.includes("active") || s.includes("under") ? "warning"
    : s.includes("solved") || s.includes("closed") || s.includes("convicted") || s.includes("charge") ? "success"
    : s.includes("open") || s.includes("registered") ? "info"
    : "muted";
  return (
    <Badge tone={tone as never}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = hueFromString(name);
  return (
    <div
      className="grid shrink-0 select-none place-items-center rounded-full font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `linear-gradient(140deg, hsl(${hue} 46% 26%), hsl(${hue} 48% 17%))`,
        color: `hsl(${hue} 78% 76%)`,
        boxShadow: `inset 0 0 0 1px hsl(${hue} 55% 45% / 0.35)`,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function RiskMeter({ score }: { score: number }) {
  const band = riskBand(score);
  const fill = score >= 80 ? "var(--danger)" : score >= 60 ? "var(--warning)" : "var(--info)";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-elevated ring-1 ring-inset ring-border/60">
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{
            width: `${score}%`,
            background: `rgb(${fill})`,
            boxShadow: `0 0 8px rgb(${fill} / 0.6)`,
          }}
        />
      </div>
      <span className={cn("font-mono text-xs font-semibold tabular-nums", band.color)}>{score}</span>
    </div>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="font-display text-xl font-bold tracking-[-0.025em]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/70 bg-surface/30 py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full border border-border/60 bg-elevated/70">
        <Icon className="h-6 w-6 text-muted" />
      </div>
      <div className="font-display font-semibold text-subtle">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-7 border-b border-border/50 pb-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-stretch gap-3.5">
          <span aria-hidden className="w-1.5 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0">
            <h1 className="font-display text-[1.75rem] font-black leading-[1.04] tracking-[-0.035em] md:text-[2.15rem]">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
