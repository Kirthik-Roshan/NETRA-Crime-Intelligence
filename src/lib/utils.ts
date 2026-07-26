import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const s = Math.max(1, Math.floor((now - then) / 1000));
  const units: [number, string][] = [
    [60, "s"],
    [60, "m"],
    [24, "h"],
    [30, "d"],
    [12, "mo"],
    [Number.POSITIVE_INFINITY, "y"],
  ];
  let val = s;
  let unit = "s";
  let prev = 1;
  for (const [div, label] of units) {
    if (val < div) {
      unit = label;
      break;
    }
    prev *= div;
    val = Math.floor(s / prev);
    unit = label;
  }
  return `${val}${unit} ago`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function severityColor(sev: string): string {
  switch (sev) {
    case "critical":
      return "text-danger";
    case "high":
      return "text-warning";
    case "medium":
      return "text-info";
    default:
      return "text-muted";
  }
}

export function riskBand(score: number): { label: string; color: string } {
  if (score >= 80) return { label: "Critical", color: "text-danger" };
  if (score >= 60) return { label: "High", color: "text-warning" };
  if (score >= 40) return { label: "Moderate", color: "text-info" };
  return { label: "Low", color: "text-success" };
}

export function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Deterministic hue from a string — used for avatar colors. */
export function hueFromString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

export function parseJsonArray(s: string | null | undefined): string[] {
  if (!s) return [];
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
