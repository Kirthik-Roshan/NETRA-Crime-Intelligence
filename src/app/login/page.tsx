"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Lock, ArrowRight, ShieldCheck, Sparkles, Network, Zap, User, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";
import { Emblem } from "@/components/Emblem";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { Avatar, Badge } from "@/components/ui";
import { DEMO_USERS, login as clientLogin } from "@/lib/auth-client";

const DEMO_ACCOUNTS = DEMO_USERS.map((u) => ({
  username: u.username,
  label: u.label,
  full_name: u.full_name,
  rank: u.rank,
}));
const DEMO_PASSWORD = "police123";

/** Lightweight animated particle-network background (theme-reactive, canvas). */
function NetworkCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const reduced = document.documentElement.getAttribute("data-motion") === "reduced";
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let w = 0, h = 0;
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    const accent = () => getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "45 212 191";
    const N = 64;
    const pts = Array.from({ length: N }, () => ({
      x: Math.random(), y: Math.random(),
      vx: (Math.random() - 0.5) * 0.0006, vy: (Math.random() - 0.5) * 0.0006,
    }));
    function resize() {
      w = canvas!.clientWidth; h = canvas!.clientHeight;
      canvas!.width = w * DPR; canvas!.height = h * DPR;
      ctx!.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    function frame() {
      const a = accent();
      ctx!.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!reduced) { p.x += p.vx; p.y += p.vy; }
        if (p.x < 0 || p.x > 1) p.vx *= -1;
        if (p.y < 0 || p.y > 1) p.vy *= -1;
      }
      // links
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const dx = (pts[i].x - pts[j].x) * w, dy = (pts[i].y - pts[j].y) * h;
          const d = Math.hypot(dx, dy);
          if (d < 130) {
            ctx!.strokeStyle = `rgb(${a} / ${(1 - d / 130) * 0.28})`;
            ctx!.lineWidth = 1;
            ctx!.beginPath();
            ctx!.moveTo(pts[i].x * w, pts[i].y * h);
            ctx!.lineTo(pts[j].x * w, pts[j].y * h);
            ctx!.stroke();
          }
        }
      }
      // nodes
      for (const p of pts) {
        ctx!.fillStyle = `rgb(${a} / 0.7)`;
        ctx!.beginPath();
        ctx!.arc(p.x * w, p.y * h, 1.6, 0, Math.PI * 2);
        ctx!.fill();
      }
      if (!reduced) raf = requestAnimationFrame(frame);
    }
    resize();
    window.addEventListener("resize", resize);
    frame();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return (
    <canvas
      ref={ref}
      aria-hidden
      className="absolute inset-0 h-full w-full opacity-70"
      // Feather the lattice into the panel so it reads as ambient depth,
      // not a graphic pinned to the edges.
      style={{
        maskImage: "radial-gradient(ellipse at 42% 48%, #000 30%, transparent 84%)",
        WebkitMaskImage: "radial-gradient(ellipse at 42% 48%, #000 30%, transparent 84%)",
      }}
    />
  );
}

const CAPABILITIES = [
  { icon: Sparkles, label: "Natural language", sub: "English & Kannada" },
  { icon: Network, label: "Criminal networks", sub: "Link analysis" },
  { icon: ShieldCheck, label: "Explainable AI", sub: "Cited & auditable" },
];

export default function LoginPage() {
  const router = useRouter();
  // Auto-filled demo account (one-click enter).
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(false);

  const doLogin = useCallback((u: string, p: string) => {
    setLoading(true);
    setError("");
    setBooting(true);
    const user = clientLogin(u, p);
    if (user) {
      // brief boot sequence for the "OS" feel
      setTimeout(() => { router.push("/dashboard"); }, 650);
    } else {
      setError("Invalid officer ID or password");
      setLoading(false);
      setBooting(false);
    }
  }, [router]);

  const active = DEMO_ACCOUNTS.find((a) => a.username === username);

  return (
    <div className="relative grid min-h-screen overflow-hidden lg:grid-cols-2" style={{ background: "rgb(var(--bg))" }}>
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="ambient-blob" style={{ top: "-10%", left: "-6%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgb(var(--glow) / 0.22), transparent 60%)" }} />
        <div className="ambient-blob" style={{ bottom: "-12%", right: "-8%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgb(var(--glow) / 0.16), transparent 60%)", animationDelay: "-10s" }} />
      </div>

      {/* LEFT — cinematic panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-12 xl:p-16 lg:flex">
        <NetworkCanvas />
        {/* Survey grid — same environmental language as the app shell. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            backgroundImage:
              "linear-gradient(rgb(var(--border) / 0.3) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.3) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse at 40% 45%, #000 20%, transparent 80%)",
            WebkitMaskImage: "radial-gradient(ellipse at 40% 45%, #000 20%, transparent 80%)",
          }}
        />

        <div className="relative z-10 flex items-start justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <Emblem size={48} />
            <div className="min-w-0">
              <div className="font-display text-xl font-bold tracking-tight">Crime Intelligence</div>
              <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                Karnataka State Police
              </div>
            </div>
          </div>
          <span className="chip shrink-0 text-[10px] uppercase tracking-[0.14em]">
            <Lock className="h-3 w-3" /> Restricted
          </span>
        </div>

        <div className="relative z-10 space-y-7">
          <div className="space-y-4">
            <span className="stat-label block">Officer workspace</span>
            <h1 className="max-w-md font-display text-4xl font-bold leading-tight xl:text-[2.75rem]">
              Advanced Criminal Intelligence Platform
            </h1>
            <p className="max-w-md text-sm leading-relaxed text-muted">
              Reason over FIRs, criminal networks, evidence and geography in natural language.
              Every insight is explainable, auditable, and keeps the officer in command.
            </p>
          </div>

          <div className="grid max-w-lg grid-cols-3 gap-3">
            {CAPABILITIES.map((f) => (
              <div
                key={f.label}
                className="glass rounded-xl p-3.5 transition-colors duration-200 hover:border-border"
              >
                <span className="mb-2.5 grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-elevated/60">
                  <f.icon className="h-4 w-4 text-accent" />
                </span>
                <div className="text-xs font-semibold leading-snug text-subtle">{f.label}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-muted">{f.sub}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border/50 pt-5 text-[11px] font-medium text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> All systems operational</span>
          <span aria-hidden className="h-3 w-px bg-border" />
          <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-accent" /> Powered by Zoho Catalyst</span>
          <span className="ml-auto tabular-nums">NETRA v1.1 · Datathon 2026</span>
        </div>
      </div>

      {/* RIGHT — glass login */}
      <div className="relative z-10 flex items-center justify-center p-6 sm:p-12">
        <div className="absolute right-6 top-6"><ThemeSwitcher /></div>
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Emblem size={40} />
            <div className="min-w-0">
              <div className="font-display text-lg font-bold leading-tight tracking-tight">Crime Intelligence</div>
              <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Karnataka State Police</div>
            </div>
          </div>

          <div className="card panel-pad sm:p-6">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-accent/25 bg-accent/10">
                <Lock className="h-4 w-4 text-accent" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-2xl font-bold tracking-tight">Secure sign in</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted">Role-based access · every action is audited.</p>
              </div>
            </div>

            {/* Identity preview — which officer the workspace will open as. */}
            <div className="mt-5 flex items-center gap-3 rounded-lg border border-border/60 bg-elevated/40 p-3">
              {active ? (
                <>
                  <Avatar name={active.full_name} size={36} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold leading-tight">{active.full_name}</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">{active.rank}</div>
                  </div>
                  <Badge tone="accent">{active.label}</Badge>
                </>
              ) : (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-dashed border-border/70 bg-surface/50">
                    <User className="h-4 w-4 text-muted" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium leading-tight text-subtle">Unrecognised officer ID</div>
                    <div className="mt-0.5 truncate text-[11px] text-muted">Pick a role below, or sign in manually</div>
                  </div>
                </>
              )}
            </div>

            {/* One-click demo entry */}
            <button
              onClick={() => doLogin(username, DEMO_PASSWORD)}
              disabled={loading}
              aria-busy={booting}
              className="btn-accent mt-4 w-full shadow-glow"
            >
              {booting ? (
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 animate-pulse" /> Booting workspace…</span>
              ) : (
                <><Zap className="h-4 w-4" /> Enter as {active?.label ?? "Demo"}</>
              )}
            </button>

            <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted">
              <span className="h-px flex-1 bg-border/70" /> or sign in manually <span className="h-px flex-1 bg-border/70" />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); doLogin(username, password); }}
              className="space-y-4"
            >
              <div>
                <label htmlFor="officer-id" className="stat-label mb-1.5 block">Officer ID</label>
                <div className="group relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
                  <input id="officer-id" name="username" className="input pl-9 font-mono" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </div>
              </div>
              <div>
                <label htmlFor="officer-password" className="stat-label mb-1.5 block">Password</label>
                <div className="group relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted transition-colors group-focus-within:text-accent" />
                  <input id="officer-password" name="password" className="input pl-9 font-mono" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2.5 text-sm text-danger animate-fade-in">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="leading-snug">{error}</span>
                </div>
              )}

              <button type="submit" className="btn-ghost w-full" disabled={loading} aria-busy={loading}>
                {loading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</>
                ) : (
                  <>Sign in <ArrowRight className="h-4 w-4" /></>
                )}
              </button>
            </form>

            {/* Demo role switcher */}
            <div className="mt-6 border-t border-border/50 pt-5">
              <div className="stat-label mb-2.5">Demo roles · password <span className="kbd">{DEMO_PASSWORD}</span></div>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((a) => {
                  const on = username === a.username;
                  return (
                    <button
                      key={a.username}
                      type="button"
                      aria-pressed={on}
                      title={`${a.full_name} · ${a.rank}`}
                      onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); setError(""); }}
                      className={`chip transition-colors duration-150 hover:border-accent/50 hover:text-fg ${on ? "border-accent/60 bg-accent/10 text-fg" : ""}`}
                    >
                      {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                      {a.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-6 flex items-start justify-center gap-2 px-2 text-center text-[11px] leading-relaxed text-muted">
            <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>Authorised personnel only. Access is role-based and every action is written to the audit log.</span>
          </p>
          <div className="mt-3 text-center text-[10px] uppercase tracking-[0.14em] text-muted/70 lg:hidden">
            NETRA v1.1 · Datathon 2026
          </div>
        </div>
      </div>
    </div>
  );
}
