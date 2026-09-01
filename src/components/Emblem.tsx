const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true" ? "/app" : "";

/**
 * Official State Emblem of Karnataka — government-grade identity mark used
 * across NETRA (login, sidebar, splash, reports). The shared public asset keeps
 * hundreds of statically exported record pages from embedding duplicate SVG.
 */
export function Emblem({
  size = 44,
  glass = true,
  className = "",
}: {
  size?: number;
  glass?: boolean;
  className?: string;
}) {
  const pad = Math.round(size * 0.14);
  return (
    <span
      className={`inline-grid place-items-center overflow-hidden ${glass ? "glass rounded-xl border border-border/50 shadow-glow" : ""} ${className}`}
      style={{ width: size, height: size, padding: glass ? pad : 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`${PUBLIC_BASE_PATH}/icon.svg`} alt="Karnataka State Police emblem" width={size} height={size} className="h-full w-full object-contain" draggable={false} />
    </span>
  );
}
