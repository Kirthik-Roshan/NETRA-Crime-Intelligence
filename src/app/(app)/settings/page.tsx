"use client";
import { useEffect, useState } from "react";
import {
  Check, Palette, Monitor, Sliders, Bell, ShieldCheck, Cpu, Database, Zap, Eye, Languages,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, Badge, PanelHeader } from "@/components/ui";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { useT } from "@/lib/i18n-client";
import { aiOnline } from "@/lib/ai-client";

export default function SettingsPage() {
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
  const compact = useAppStore((s) => s.compact);
  const setCompact = useAppStore((s) => s.setCompact);
  const notifyAlerts = useAppStore((s) => s.notifyAlerts);
  const setNotifyAlerts = useAppStore((s) => s.setNotifyAlerts);

  // Live AI backend status (Zoho Catalyst QuickML) for the System section.
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => { setAi(aiOnline()); }, []);

  const activeTheme = THEMES.find((th) => th.id === theme);

  return (
    <div className="max-w-3xl animate-fade-in">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="space-y-4">
        {/* Appearance */}
        <Section
          icon={Palette}
          title={t("settings.appearance")}
          hint={t("settings.appearance_hint")}
          action={activeTheme && <Badge tone="accent">{activeTheme.label}</Badge>}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {THEMES.map((th) => {
              const on = theme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => setTheme(th.id)}
                  data-theme={th.id}
                  aria-pressed={on}
                  title={th.desc}
                  className={`group overflow-hidden rounded-md border p-2 text-left transition-colors ${
                    on ? "border-accent" : "border-border hover:border-muted/40"
                  }`}
                  style={{ background: "rgb(var(--bg))" }}
                >
                  {/* Miniature console swatch */}
                  <div
                    className="overflow-hidden rounded-sm"
                    style={{ background: "rgb(var(--surface))", boxShadow: "inset 0 0 0 1px rgb(var(--border))" }}
                  >
                    <div className="flex items-center gap-1 px-1.5 pt-1.5">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "rgb(var(--accent))" }} />
                      <span className="h-1 w-6 rounded-full" style={{ background: "rgb(var(--border))" }} />
                    </div>
                    <div className="flex gap-1 p-1.5">
                      <span className="h-5 flex-1 rounded-sm" style={{ background: "rgb(var(--elevated))" }} />
                      <span className="h-5 w-3 shrink-0 rounded-sm" style={{ background: "rgb(var(--info))" }} />
                      <span className="h-5 w-3 shrink-0 rounded-sm" style={{ background: "rgb(var(--accent))" }} />
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold" style={{ color: "rgb(var(--fg))" }}>{th.label}</span>
                    {on && (
                      <span
                        className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-sm"
                        style={{ background: "rgb(var(--accent))" }}
                        aria-hidden
                      >
                        <Check className="h-2.5 w-2.5" style={{ color: "rgb(var(--accent-fg))" }} strokeWidth={3.5} />
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[10.5px]" style={{ color: "rgb(var(--muted))" }}>{th.desc}</div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Interface */}
        <Section icon={Sliders} title={t("settings.interface")} hint={t("settings.interface_hint")}>
          <div>
            <Toggle icon={Zap} label={t("settings.reduce_motion")} desc={t("settings.reduce_motion_desc")} on={reducedMotion} onChange={setReducedMotion} />
            <Toggle icon={Eye} label={t("settings.compact")} desc={t("settings.compact_desc")} on={compact} onChange={setCompact} />
          </div>
          <div className="mt-3 flex items-start gap-2.5 rounded-md border border-border bg-elevated/40 p-3 text-xs leading-relaxed text-muted">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            {t("settings.language_moved")}
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title={t("settings.notifications")} hint={t("settings.notifications_hint")}>
          <Toggle icon={Bell} label={t("settings.ai_alerts")} desc={t("settings.ai_alerts_desc")} on={notifyAlerts} onChange={setNotifyAlerts} />
        </Section>

        {/* Security & session */}
        <Section icon={ShieldCheck} title={t("settings.security")}>
          <dl>
            <Row label={t("settings.session")} value="Signed HTTP-only cookie" />
            <Row label={t("settings.rbac")} value="5 roles · least-privilege" />
            <Row label={t("settings.audit")} value="Immutable · all AI + data actions" />
            <Row label={t("settings.sql_guard")} value="SELECT-only · table whitelist" />
          </dl>
        </Section>

        {/* System */}
        <Section icon={Monitor} title={t("settings.system")}>
          <dl>
            <Row label={t("settings.platform")} value="NETRA v1.1 · KSP Datathon 2026" />
            <Row label={t("settings.deploy_target")} value="Zoho Catalyst (AppSail + Functions)" />
            <Row
              label={t("settings.llm_prod")}
              value={
                <>
                  Catalyst QuickML
                  {ai === null ? (
                    <Badge tone="muted"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /> checking…</Badge>
                  ) : ai ? (
                    <Badge tone="success"><span className="h-1.5 w-1.5 rounded-full bg-current" /> connected</Badge>
                  ) : (
                    <Badge tone="muted"><span className="h-1.5 w-1.5 rounded-full bg-current" /> rule-engine fallback</Badge>
                  )}
                </>
              }
              icon={<Cpu className={`h-3.5 w-3.5 ${ai ? "text-success" : "text-muted"}`} />}
            />
            <Row label={t("settings.database")} value="Catalyst Data Store (SQLite in dev)" icon={<Database className="h-3.5 w-3.5 text-accent" />} />
          </dl>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  hint,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card panel-pad">
      <PanelHeader icon={Icon} title={title} sub={hint} action={action} />
      {children}
    </section>
  );
}

function Toggle({ icon: Icon, label, desc, on, onChange }: { icon: LucideIcon; label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="group flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <Icon className={`h-4 w-4 shrink-0 transition-colors ${on ? "text-accent" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight">{label}</div>
        <div className="mt-0.5 text-xs text-muted">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        onClick={() => onChange(!on)}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors duration-200 ${on ? "border-accent bg-accent" : "border-border bg-elevated group-hover:border-muted/50"}`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full transition-transform duration-200 ease-out ${on ? "translate-x-4 bg-accent-fg" : "translate-x-0.5 bg-muted"}`}
        />
      </button>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/50 py-2.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="flex items-center gap-1.5 text-right text-sm font-medium text-subtle">{icon}{value}</dd>
    </div>
  );
}
