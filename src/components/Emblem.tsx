import { EMBLEM_DATA_URI } from "@/data/emblem";

/**
 * Official State Emblem of Karnataka — government-grade identity mark used
 * across NETRA (login, sidebar, splash, reports). Bundled as a data URI
 * (Slate does not serve /public). Optional glass ring so the colour emblem
 * reads cleanly on the dark theme.
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
      <img src={EMBLEM_DATA_URI} alt="Karnataka State Police emblem" width={size} height={size} className="h-full w-full object-contain" draggable={false} />
    </span>
  );
}
