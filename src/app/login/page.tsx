"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Eye, Lock, ArrowRight, ShieldCheck, Sparkles, Network, Zap, User } from "lucide-react";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { DEMO_USERS, login as clientLogin } from "@/lib/auth-client";

const DEMO_ACCOUNTS = DEMO_USERS.map((u) => ({ username: u.username, label: u.label }));
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
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}

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

  return (
    <div className="relative grid min-h-screen overflow-hidden lg:grid-cols-2" style={{ background: "rgb(var(--bg))" }}>
      {/* ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="ambient-blob" style={{ top: "-10%", left: "-6%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgb(var(--glow) / 0.22), transparent 60%)" }} />
        <div className="ambient-blob" style={{ bottom: "-12%", right: "-8%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgb(var(--glow) / 0.16), transparent 60%)", animationDelay: "-10s" }} />
      </div>

      {/* LEFT — cinematic panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 p-12 lg:flex">
        <NetworkCanvas />
        <div className="relative z-10 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-accent text-accent-fg shadow-glow">
            <Eye className="h-6 w-6" />
          </div>
          <div>
            <div className="font-display text-xl font-bold tracking-tight">Crime Intelligence</div>
            <div className="text-xs text-muted">Karnataka State Police · AI Investigation OS</div>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h1 className="max-w-md font-display text-4xl font-bold leading-tight">
            An AI Investigation Operating System — not a dashboard.
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted">
            Reason over FIRs, criminal networks, evidence and geography in natural language.
            Every insight is explainable, auditable, and keeps the officer in command.
          </p>
          <div className="grid max-w-md grid-cols-3 gap-3">
            {[
              { icon: Sparkles, label: "NL + Kannada" },
              { icon: Network, label: "Criminal networks" },
              { icon: ShieldCheck, label: "Explainable AI" },
            ].map((f) => (
              <div key={f.label} className="glass rounded-xl p-3">
                <f.icon className="mb-2 h-5 w-5 text-accent" />
                <div className="text-xs text-subtle">{f.label}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" /> All systems operational</span>
          <span className="flex items-center gap-1.5"><Zap className="h-3 w-3 text-accent" /> Powered by Zoho Catalyst</span>
          <span>Datathon 2026</span>
        </div>
      </div>

      {/* RIGHT — glass login */}
      <div className="relative z-10 flex items-center justify-center p-6 sm:p-12">
        <div className="absolute right-6 top-6"><ThemeSwitcher /></div>
        <div className="w-full max-w-sm animate-fade-in">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-fg"><Eye className="h-5 w-5" /></div>
            <div className="font-display text-lg font-bold">Crime Intelligence</div>
          </div>

          <div className="card panel-pad">
            <h2 className="font-display text-2xl font-bold">Secure sign in</h2>
            <p className="mt-1 text-sm text-muted">Role-based access · every action is audited.</p>

            {/* One-click demo entry */}
            <button
              onClick={() => doLogin(username, DEMO_PASSWORD)}
              disabled={loading}
              className="btn-accent mt-6 w-full shadow-glow"
            >
              {booting ? (
                <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 animate-pulse" /> Booting workspace…</span>
              ) : (
                <><Zap className="h-4 w-4" /> Enter as {DEMO_ACCOUNTS.find((a) => a.username === username)?.label ?? "Demo"}</>
              )}
            </button>

            <div className="my-4 flex items-center gap-3 text-[11px] text-muted">
              <span className="h-px flex-1 bg-border" /> or sign in manually <span className="h-px flex-1 bg-border" />
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); doLogin(username, password); }}
              className="space-y-4"
            >
              <div>
                <label className="stat-label mb-1.5 block">Officer ID</label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className="input pl-9 font-mono" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </div>
              </div>
              <div>
                <label className="stat-label mb-1.5 block">Password</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input className="input pl-9 font-mono" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
              </div>

              {error && <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>}

              <button className="btn-ghost w-full" disabled={loading}>
                Sign in <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Demo role switcher */}
            <div className="mt-6">
              <div className="stat-label mb-2">Demo roles · password <span className="kbd">{DEMO_PASSWORD}</span></div>
              <div className="flex flex-wrap gap-2">
                {DEMO_ACCOUNTS.map((a) => (
                  <button
                    key={a.username}
                    type="button"
                    onClick={() => { setUsername(a.username); setPassword(DEMO_PASSWORD); setError(""); }}
                    className={`chip transition-colors hover:border-accent/50 hover:text-fg ${username === a.username ? "border-accent/60 text-fg" : ""}`}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
