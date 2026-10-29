import { UiText } from '@/components/UiText';
import { cn, initials, riskBand } from "@/lib/utils";
import { SYNTHETIC_PROFILE_NOTICE, syntheticProfileImage } from "@/lib/profile-assets";
import type { LucideIcon } from "lucide-react";

type Tone = "default" | "accent" | "danger" | "warning" | "success" | "info";

const ACCENT_BAR: Record<Tone, string> = {
  default: "bg-border",
  accent: "bg-accent",
  danger: "bg-danger",
  warning: "bg-warning",
  success: "bg-success",
  info: "bg-info",
};
const TONE_TEXT: Record<Tone, string> = {
  default: "text-fg",
  accent: "text-fg",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};
const TONE_ICON: Record<Tone, string> = {
  default: "text-muted",
  accent: "text-accent",
  danger: "text-danger",
  warning: "text-warning",
  success: "text-success",
  info: "text-info",
};

/** Compact KPI tile — a flat panel with a thin status edge and a tabular figure. */
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
  tone?: Tone;
}) {
  return (
    <div data-tone={tone} className="workspace-stat card panel-pad group relative min-h-[126px] overflow-hidden">
      <span aria-hidden className={cn("workspace-stat-edge absolute inset-x-0 bottom-0 h-[3px]", ACCENT_BAR[tone])} />
      <div className="workspace-stat-heading flex items-center gap-3">
        {Icon && (
          <span className="workspace-stat-icon grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
            <Icon className={cn("h-5 w-5", TONE_ICON[tone])} />
          </span>
        )}
        <span className="stat-label"><UiText text={label} /></span>
      </div>
      <div className={cn("workspace-stat-value mt-3 font-display text-[1.7rem] font-bold leading-none tabular-nums md:text-[1.9rem]", TONE_TEXT[tone])}>
        <UiText text={value} />
      </div>
      {sub && <div className="mt-1.5 text-xs text-muted"><UiText text={sub} /></div>}
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
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium capitalize", map[tone])}>
      <UiText text={children} />
    </span>
  );
}

/** Squared metadata tag — the neutral, quiet label used across tables & rails. */
export function Tag({ children, className, mono }: { children: React.ReactNode; className?: string; mono?: boolean }) {
  return <span className={cn("tag", mono && "font-mono", className)}><UiText text={children} /></span>;
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
      <UiText text={status.replace(/_/g, " ")} />
    </Badge>
  );
}

export function Avatar({
  name,
  size = 40,
  profileId,
}: {
  name: string;
  size?: number;
  profileId?: number | string;
}) {
  const portrait = syntheticProfileImage(profileId);
  return (
    <div
      className="relative grid shrink-0 select-none place-items-center overflow-hidden rounded-md font-mono font-semibold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.36,
        background: "rgb(var(--accent) / 0.1)",
        color: "rgb(var(--accent))",
        boxShadow: "inset 0 0 0 1px rgb(var(--accent) / 0.24)",
      }}
      title={portrait ? SYNTHETIC_PROFILE_NOTICE : undefined}
    >
      {initials(name)}
      {portrait && (
        // The generated reference set is verified during the release gate.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={portrait}
          alt=""
          aria-hidden="true"
          loading="lazy"
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
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
          style={{ width: `${score}%`, background: `rgb(${fill})` }}
        />
      </div>
      <span className={cn("font-mono text-xs font-semibold tabular-nums", band.color)}><UiText text={score} /></span>
    </div>
  );
}

/** Section heading used inside panels — display title + optional sub + action. */
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
        <h2 className="font-display text-base font-semibold tracking-[-0.02em]"><UiText text={title} /></h2>
        {subtitle && <p className="mt-0.5 text-xs text-muted"><UiText text={subtitle} /></p>}
      </div>
      {action && <div className="shrink-0"><UiText text={action} /></div>}
    </div>
  );
}

/**
 * Standard panel header — a small icon, a title, an optional count and a
 * right-aligned action. The single rhythm every card header should use so the
 * whole console reads consistently.
 */
export function PanelHeader({
  icon: Icon,
  title,
  count,
  sub,
  action,
  tone = "accent",
}: {
  icon?: LucideIcon;
  title: React.ReactNode;
  count?: number;
  sub?: string;
  action?: React.ReactNode;
  tone?: Tone;
}) {
  return (
    <div className="workspace-panel-heading mb-4 flex flex-wrap items-start gap-2.5">
      {Icon && (
        <span className="workspace-panel-icon grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-elevated/60">
          <Icon className={cn("h-[18px] w-[18px]", TONE_ICON[tone])} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="min-w-0 font-display text-sm font-semibold text-fg"><UiText text={title} /></h3>
          {count !== undefined && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted"><UiText text={count} /></span>
          )}
        </div>
        {sub && <p className="mt-0.5 text-[11px] leading-relaxed text-muted"><UiText text={sub} /></p>}
      </div>
      {action && <div className="shrink-0"><UiText text={action} /></div>}
    </div>
  );
}

/** Squared segmented control — the standard tab/toggle for the whole console. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: React.ReactNode; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="seg">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="seg-item"
        >
          {o.icon && <o.icon className="h-3.5 w-3.5" />}
          <UiText text={o.label} />
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, hint }: { icon: LucideIcon; title: string; hint?: string }) {
  return (
    <div className="workspace-empty flex min-h-[180px] flex-col items-center justify-center rounded-md border border-border bg-elevated/35 px-5 py-10 text-center">
      <div className="mb-3 grid h-11 w-11 place-items-center rounded-md border border-border bg-elevated/70">
        <Icon className="h-5 w-5 text-muted" />
      </div>
      <div className="font-display text-sm font-semibold text-subtle"><UiText text={title} /></div>
      {hint && <div className="mt-1 max-w-sm text-xs text-muted"><UiText text={hint} /></div>}
    </div>
  );
}

/** Page header — a compact command title with a thin accent edge. */
export function PageHeader({ title, subtitle, children }: { title: React.ReactNode; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="workspace-page-heading mb-5 border-b border-border pb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-5 gap-y-3">
        <div className="flex min-w-0 items-stretch gap-3">
          <span aria-hidden className="w-1 shrink-0 self-stretch rounded-sm bg-accent" />
          <div className="min-w-0">
            <div className="mb-1 font-mono text-[10px] font-semibold uppercase text-accent"><UiText text={"KSP operational workspace"} /></div>
            <h1 className="font-display text-2xl font-bold leading-tight md:text-[1.85rem]"><UiText text={title} /></h1>
            {subtitle && <p className="mt-1 text-sm text-muted"><UiText text={subtitle} /></p>}
          </div>
        </div>
        {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
