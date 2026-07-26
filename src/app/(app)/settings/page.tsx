"use client";
import { useEffect, useState } from "react";
import {
  Check, Palette, Monitor, Sliders, Bell, ShieldCheck, Cpu, Database, Zap, Eye, Languages,
} from "lucide-react";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { useT } from "@/lib/i18n-client";

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
  useEffect(() => {
    fetch("/api/ai/status").then((r) => r.json()).then((j) => setAi(j.online)).catch(() => setAi(false));
  }, []);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 font-display text-2xl font-bold">{t("settings.title")}</h1>
      <p className="mb-6 text-sm text-muted">{t("settings.subtitle")}</p>

      {/* Appearance */}
      <section className="card panel-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Palette className="h-4 w-4 text-accent" /> {t("settings.appearance")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.appearance_hint")}</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {THEMES.map((th) => (
            <button
              key={th.id}
              onClick={() => setTheme(th.id)}
              data-theme={th.id}
              className={`group relative overflow-hidden rounded-xl border-2 p-3 text-left transition-all ${theme === th.id ? "border-accent" : "border-border hover:border-muted"}`}
              style={{ background: "rgb(var(--bg))" }}
            >
              <div className="mb-3 flex gap-1.5">
                <span className="h-6 w-6 rounded-md" style={{ background: "rgb(var(--accent))" }} />
                <span className="h-6 w-6 rounded-md" style={{ background: "rgb(var(--surface))", border: "1px solid rgb(var(--border))" }} />
                <span className="h-6 w-6 rounded-md" style={{ background: "rgb(var(--info))" }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: "rgb(var(--fg))" }}>{th.label}</span>
                {theme === th.id && <Check className="h-4 w-4 text-accent" />}
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Interface */}
      <section className="card panel-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Sliders className="h-4 w-4 text-accent" /> {t("settings.interface")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.interface_hint")}</p>
        <Toggle icon={Zap} label={t("settings.reduce_motion")} desc={t("settings.reduce_motion_desc")} on={reducedMotion} onChange={setReducedMotion} />
        <Toggle icon={Eye} label={t("settings.compact")} desc={t("settings.compact_desc")} on={compact} onChange={setCompact} />
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-elevated p-3 text-xs text-muted">
          <Languages className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          {t("settings.language_moved")}
        </div>
      </section>

      {/* Notifications */}
      <section className="card panel-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Bell className="h-4 w-4 text-accent" /> {t("settings.notifications")}</h2>
        <p className="mb-4 text-sm text-muted">{t("settings.notifications_hint")}</p>
        <Toggle icon={Bell} label={t("settings.ai_alerts")} desc={t("settings.ai_alerts_desc")} on={notifyAlerts} onChange={setNotifyAlerts} />
      </section>

      {/* Security & session */}
      <section className="card panel-pad mb-5">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /> {t("settings.security")}</h2>
        <div className="mt-3 space-y-2 text-sm">
          <Row label={t("settings.session")} value="Signed HTTP-only cookie" />
          <Row label={t("settings.rbac")} value="5 roles · least-privilege" />
          <Row label={t("settings.audit")} value="Immutable · all AI + data actions" />
          <Row label={t("settings.sql_guard")} value="SELECT-only · table whitelist" />
        </div>
      </section>

      {/* System */}
      <section className="card panel-pad">
        <h2 className="mb-1 flex items-center gap-2 font-display text-base font-semibold"><Monitor className="h-4 w-4 text-accent" /> {t("settings.system")}</h2>
        <div className="mt-3 space-y-2 text-sm">
          <Row label={t("settings.platform")} value="NETRA v1.1 · KSP Datathon 2026" />
          <Row label={t("settings.deploy_target")} value="Zoho Catalyst (AppSail + Functions)" />
          <Row
            label={t("settings.llm_prod")}
            value={ai === null ? "Catalyst QuickML (checking…)" : ai ? "Catalyst QuickML · connected" : "Catalyst QuickML · not configured (using rule-engine)"}
            icon={<Cpu className="h-3.5 w-3.5" style={{ color: ai ? "rgb(var(--success))" : "rgb(var(--muted))" }} />}
          />
          <Row label={t("settings.database")} value="Catalyst Data Store (SQLite in dev)" icon={<Database className="h-3.5 w-3.5 text-accent" />} />
        </div>
      </section>
    </div>
  );
}

function Toggle({ icon: Icon, label, desc, on, onChange }: { icon: typeof Bell; label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <Icon className="h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted">{desc}</div>
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-elevated border border-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border/50 py-2 last:border-0">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-1.5 text-right font-medium text-subtle">{icon}{value}</span>
    </div>
  );
}
