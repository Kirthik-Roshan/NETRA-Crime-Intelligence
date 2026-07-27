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
  return (
    <div className="card panel-pad">
      <div className="flex items-start justify-between">
        <span className="stat-label">{label}</span>
        {Icon && <Icon className={cn("h-4 w-4", toneMap[tone])} />}
      </div>
      <div className={cn("mt-3 font-display text-3xl font-bold tracking-tight", toneMap[tone])}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
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
    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium capitalize", map[tone])}>
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
  return <Badge tone={tone as never}>{status.replace(/_/g, " ")}</Badge>;
}

export function Avatar({ name, size = 40 }: { name: string; size?: number }) {
  const hue = hueFromString(name);
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: `hsl(${hue} 45% 22%)`,
        color: `hsl(${hue} 70% 72%)`,
      }}
    >
      {initials(name)}
    </div>
  );
}

export function RiskMeter({ score }: { score: number }) {
  const band = riskBand(score);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full rounded-full"
          style={{
            width: `${score}%`,
            background: score >= 80 ? "rgb(var(--danger))" : score >= 60 ? "rgb(var(--warning))" : "rgb(var(--info))",
          }}
        />
      </div>
      <span className={cn("font-mono text-xs font-semibold", band.color)}>{score}</span>
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
      <div>
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-14 text-center">
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-full bg-elevated">
        <Icon className="h-6 w-6 text-muted" />
      </div>
      <div className="font-medium text-subtle">{title}</div>
      {hint && <div className="mt-1 max-w-sm text-sm text-muted">{hint}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}
