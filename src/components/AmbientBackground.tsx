/**
 * Cinematic ambient background — theme-reactive glow blobs + grid + noise.
 * Pure CSS (no JS/canvas) so it's cheap and never blocks. The blobs use the
 * active theme's --glow variable, so switching theme changes the whole
 * environment lighting. Sits behind all content (fixed, -z).
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "rgb(var(--bg))" }}>
      {/* environmental glow — originates from screen edges */}
      <div className="ambient-blob" style={{ top: "-12%", left: "-8%", background: "radial-gradient(circle, rgb(var(--glow) / 0.20), transparent 60%)", animationDelay: "0s" }} />
      <div className="ambient-blob" style={{ bottom: "-15%", right: "-10%", background: "radial-gradient(circle, rgb(var(--glow) / 0.16), transparent 60%)", animationDelay: "-8s" }} />
      <div className="ambient-blob" style={{ top: "30%", right: "12%", width: "40vw", height: "40vw", background: "radial-gradient(circle, rgb(var(--info) / 0.10), transparent 65%)", animationDelay: "-16s" }} />
      {/* subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.35) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.35) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 85%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 40%, #000 30%, transparent 85%)",
        }}
      />
      {/* fine noise texture */}
      <div
        className="absolute inset-0 opacity-[0.035] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
    </div>
  );
}
