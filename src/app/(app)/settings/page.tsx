"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useEffect, useState } from "react";
import {
  Check, Palette, Monitor, Sliders, Bell, ShieldCheck, Cpu, Database, Zap, Eye, Languages,
  Loader2, RefreshCw, RotateCcw, Save, LockKeyhole, Users, ScrollText, Code2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, Badge, PanelHeader } from "@/components/ui";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { useT } from "@/lib/i18n-client";
import { fetchInfraHealth, type CatalystInfraHealth } from "@/lib/ai-client";

export default function SettingsPage() {
  const ui = useUiText();
  const t = useT();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const reducedMotion = useAppStore((s) => s.reducedMotion);
  const setReducedMotion = useAppStore((s) => s.setReducedMotion);
  const compact = useAppStore((s) => s.compact);
  const setCompact = useAppStore((s) => s.setCompact);
  const notifyAlerts = useAppStore((s) => s.notifyAlerts);
  const setNotifyAlerts = useAppStore((s) => s.setNotifyAlerts);
  const lang = useAppStore((s) => s.lang);
  const setLang = useAppStore((s) => s.setLang);

  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftMotion, setDraftMotion] = useState(reducedMotion);
  const [draftCompact, setDraftCompact] = useState(compact);
  const [draftAlerts, setDraftAlerts] = useState(notifyAlerts);
  const [draftLang, setDraftLang] = useState(lang);
  const [saved, setSaved] = useState(false);

  // Live AI backend status (Zoho Catalyst QuickML) for the System section.
  const [health, setHealth] = useState<CatalystInfraHealth | null>(null);
  const [checking, setChecking] = useState(false);
  const checkServices = async () => {
    setChecking(true);
    try { setHealth(await fetchInfraHealth()); } finally { setChecking(false); }
  };
  useEffect(() => { void checkServices(); }, []);

  const activeTheme = THEMES.find((th) => th.id === draftTheme);
  const dirty = draftTheme !== theme || draftMotion !== reducedMotion || draftCompact !== compact || draftAlerts !== notifyAlerts || draftLang !== lang;
  const apply = () => {
    setTheme(draftTheme); setReducedMotion(draftMotion); setCompact(draftCompact); setNotifyAlerts(draftAlerts); setLang(draftLang);
    setSaved(true); window.setTimeout(() => setSaved(false), 2400);
  };
  const resetDraft = () => {
    setDraftTheme(theme); setDraftMotion(reducedMotion); setDraftCompact(compact); setDraftAlerts(notifyAlerts); setDraftLang(lang); setSaved(false);
  };
  const restoreDefaults = () => {
    setDraftTheme("daylight"); setDraftMotion(false); setDraftCompact(false); setDraftAlerts(true); setDraftLang("en"); setSaved(false);
  };

  return (
    <div className="settings-workspace animate-fade-in">
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")}>
        <div className="flex flex-wrap items-center gap-2">
          {saved && <Badge tone="success"><Check className="h-3 w-3" /><UiText text={" Preferences saved"} /></Badge>}
          <button type="button" onClick={restoreDefaults} className="btn-ghost h-9"><RotateCcw className="h-4 w-4" /><UiText text={" Defaults"} /></button>
          <button type="button" onClick={apply} disabled={!dirty} className="btn-accent h-9"><Save className="h-4 w-4" /><UiText text={" Apply changes"} /></button>
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Appearance */}
        <Section
          icon={Palette}
          title={t("settings.appearance")}
          hint={t("settings.appearance_hint")}
          action={activeTheme && <Badge tone="accent"><UiText text={activeTheme.label} /></Badge>}
        >
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {THEMES.map((th) => {
              const on = draftTheme === th.id;
              return (
                <button
                  key={th.id}
                  type="button"
                  onClick={() => { setDraftTheme(th.id); setSaved(false); }}
                  data-theme={th.id}
                  aria-pressed={on}
                  title={th.desc}
                  className={`settings-theme group overflow-hidden rounded-md border p-2 text-left transition-colors ${
                    on ? "border-accent" : "border-border hover:border-muted/40"
                  }`}
                  style={{ background: "rgb(var(--bg))" }}
                >
                  {/* Miniature console swatch */}
                  <div
                    className="settings-theme-preview overflow-hidden rounded-sm"
                    aria-hidden="true"
                    style={{ background: "rgb(var(--surface))", boxShadow: "inset 0 0 0 1px rgb(var(--border))" }}
                  >
                    <div className="settings-theme-sidebar">
                      <i style={{ background: "rgb(var(--accent))" }} />
                      {Array.from({ length: 4 }, (_, i) => <span key={i} style={{ background: "rgb(var(--border))" }} />)}
                    </div>
                    <div className="settings-theme-content" style={{ background: "rgb(var(--elevated))" }}>
                      {Array.from({ length: 3 }, (_, i) => <span key={i} style={{ background: "rgb(var(--border))" }} />)}
                      <div><i style={{ background: "rgb(var(--info))" }} /><i style={{ background: "rgb(var(--accent))" }} /></div>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="truncate text-xs font-semibold" style={{ color: "rgb(var(--fg))" }}><UiText text={th.label} /></span>
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
                  <div className="mt-0.5 truncate text-[10.5px]" style={{ color: "rgb(var(--muted))" }}><UiText text={th.desc} /></div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* Interface */}
        <Section icon={Sliders} title={t("settings.interface")} hint={t("settings.interface_hint")}>
          <div>
            <Toggle icon={Zap} label={t("settings.reduce_motion")} desc={t("settings.reduce_motion_desc")} on={draftMotion} onChange={setDraftMotion} />
            <Toggle icon={Eye} label={t("settings.compact")} desc={t("settings.compact_desc")} on={draftCompact} onChange={setDraftCompact} />
          </div>
          <div className="settings-language mt-3 flex flex-wrap items-center gap-3 py-4 text-sm leading-relaxed text-muted">
            <Languages className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1"><div className="font-medium text-fg"><UiText text={"Workspace language"} /></div><div className="mt-0.5"><UiText text={"English and Kannada update after preferences are applied."} /></div></div>
            <div className="seg shrink-0"><button type="button" aria-pressed={draftLang === "en"} onClick={() => setDraftLang("en")} className="seg-item"><UiText text={"EN"} /></button><button type="button" aria-pressed={draftLang === "kn"} onClick={() => setDraftLang("kn")} className="seg-item">ಕನ್ನಡ</button></div>
          </div>
        </Section>

        {/* Notifications */}
        <Section icon={Bell} title={t("settings.notifications")} hint={t("settings.notifications_hint")}>
          <Toggle icon={Bell} label={t("settings.ai_alerts")} desc={t("settings.ai_alerts_desc")} on={draftAlerts} onChange={setDraftAlerts} />
        </Section>

        {/* Security & session */}
        <Section icon={ShieldCheck} title={t("settings.security")}>
          <dl>
            <Row label={t("settings.session")} value="Signed HTTP-only cookie" icon={<LockKeyhole aria-hidden className="h-4 w-4 text-accent" />} />
            <Row label={t("settings.rbac")} value="5 roles · least-privilege" icon={<Users aria-hidden className="h-4 w-4 text-info" />} />
            <Row label={t("settings.audit")} value="Immutable · all AI + data actions" icon={<ScrollText aria-hidden className="h-4 w-4 text-success" />} />
            <Row label={t("settings.sql_guard")} value="SELECT-only · table whitelist" icon={<Code2 aria-hidden className="h-4 w-4 text-warning" />} />
          </dl>
        </Section>

        {/* System */}
        <Section icon={Monitor} title={t("settings.system")} action={<button type="button" onClick={() => void checkServices()} disabled={checking} className="btn-ghost h-8 px-2.5">{checking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}<UiText text={" Verify"} /></button>}>
          <dl>
            <Row label={t("settings.platform")} value="NETRA v1.1 · KSP Datathon 2026" />
            <Row label={t("settings.deploy_target")} value="Zoho Catalyst (AppSail + Functions)" />
            <Row
              label={t("settings.llm_prod")}
              value={
                <><UiText text={"Catalyst QuickML"} />{checking ? (
                    <Badge tone="muted"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" /><UiText text={" checking…"} /></Badge>
                  ) : health?.services.quickml ? (
                    <Badge tone="success"><span className="h-1.5 w-1.5 rounded-full bg-current" /><UiText text={" connected"} /></Badge>
                  ) : (
                    <Badge tone="muted"><span className="h-1.5 w-1.5 rounded-full bg-current" /><UiText text={" rule-engine fallback"} /></Badge>
                  )}
                </>
              }
              icon={<Cpu className={`h-3.5 w-3.5 ${health?.services.quickml ? "text-success" : "text-muted"}`} />}
            />
            <Row label={t("settings.database")} value={health?.services.datastore ? "Catalyst Data Store connected" : "Data Store verification unavailable"} icon={<Database className="h-3.5 w-3.5 text-accent" />} />
            <Row label={ui("Environment")} value={health?.environment || "Detecting from Catalyst request"} />
          </dl>
        </Section>
      </div>
      {dirty && <div className="sticky bottom-3 z-20 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-accent/35 bg-surface/95 px-4 py-3 shadow-card backdrop-blur"><div><div className="text-sm font-semibold"><UiText text={"Unsaved workspace changes"} /></div><div className="text-xs text-muted"><UiText text={"Apply to persist these preferences on this officer workstation."} /></div></div><div className="flex gap-2"><button type="button" onClick={resetDraft} className="btn-ghost h-8"><UiText text={"Discard"} /></button><button type="button" onClick={apply} className="btn-accent h-8"><Save className="h-3.5 w-3.5" /><UiText text={" Apply"} /></button></div></div>}
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
    <section className="settings-section card panel-pad">
      <PanelHeader icon={Icon} title={title} sub={hint} action={action} />
      {children}
    </section>
  );
}

function Toggle({ icon: Icon, label, desc, on, onChange }: { icon: LucideIcon; label: string; desc: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="settings-toggle group flex items-center gap-3 border-b border-border/50 py-3 last:border-0">
      <Icon className={`h-4 w-4 shrink-0 transition-colors ${on ? "text-accent" : "text-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium leading-tight"><UiText text={label} /></div>
        <div className="mt-0.5 text-xs text-muted"><UiText text={desc} /></div>
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
          className={`absolute left-0 top-0.5 h-4 w-4 rounded-full transition-transform duration-200 ease-out ${on ? "translate-x-4 bg-accent-fg" : "translate-x-0.5 bg-muted"}`}
        />
      </button>
    </div>
  );
}

function Row({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-border/50 py-2.5 last:border-0">
      <dt className="text-sm text-muted"><UiText text={label} /></dt>
      <dd className="flex items-center gap-1.5 text-right text-sm font-medium text-subtle"><UiText text={icon} /><UiText text={value} /></dd>
    </div>
  );
}
