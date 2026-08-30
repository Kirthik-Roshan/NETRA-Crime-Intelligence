/**
 * Backdrop for the workspace — deliberately restrained. A solid theme-ground
 * with a single faint survey grid and a soft top vignette for depth. No glow
 * blobs, no animation, no noise: this reads as a professional operations
 * console, not an AI product. Sits behind all content (fixed, -z).
 */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" style={{ background: "rgb(var(--bg))" }}>
      {/* Faint survey grid — static, very low contrast, feathered at the edges. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgb(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, rgb(var(--border) / 0.5) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 92%)",
          WebkitMaskImage: "radial-gradient(ellipse at 50% 0%, #000 40%, transparent 92%)",
        }}
      />
      {/* Soft top vignette so content lifts off the ground without any bloom. */}
      <div
        className="absolute inset-x-0 top-0 h-64"
        style={{ background: "linear-gradient(to bottom, rgb(var(--elevated) / 0.35), transparent)" }}
      />
    </div>
  );
}
