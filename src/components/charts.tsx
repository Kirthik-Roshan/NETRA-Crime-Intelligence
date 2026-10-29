"use client";
import { UiText } from '@/components/UiText';

import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  PieChart,
  Pie,
} from "recharts";

const AXIS = { fontSize: 10.5, fill: "rgb(var(--muted))" };
const GRID = "rgb(var(--border) / 0.55)";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-medium text-fg"><UiText text={label} /></div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          <UiText text={p.name} />: <span className="font-mono text-fg"><UiText text={p.value} /></span>
        </div>
      ))}
    </div>
  );
}

export function TrendLine({ data, x = "month", y = "cases", height = 240 }: { data: any[]; x?: string; y?: string; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} />
        <Line type="monotone" dataKey={y} stroke="rgb(var(--accent))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BarSeries({
  data,
  x,
  y,
  height = 260,
  color = "accent",
  compactLabels = false,
}: {
  data: any[];
  x: string;
  y: string;
  height?: number;
  color?: "accent" | "info" | "warning" | "danger";
  compactLabels?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={compactLabels ? "preserveStartEnd" : 0} minTickGap={8} tickFormatter={value => compactLabels && String(value).length > 10 ? `${String(value).slice(0, 8)}...` : value} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 60 : 30} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--elevated) / 0.6)" }} />
        <Bar dataKey={y} radius={[3, 3, 0, 0]} fill={`rgb(var(--${color}))`} maxBarSize={46} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["--accent", "--info", "--warning", "--danger", "--success"];
export function Donut({ data, nameKey, valueKey, height = 240, includeOthers = false }: { data: any[]; nameKey: string; valueKey: string; height?: number; includeOthers?: boolean }) {
  const top = data.slice(0, 5);
  if (includeOthers && data.length > 5) top.push({ [nameKey]: "Others", [valueKey]: data.slice(5).reduce((sum, item) => sum + Number(item[valueKey] || 0), 0) });
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie data={top} dataKey={valueKey} nameKey={nameKey} innerRadius={55} outerRadius={85} paddingAngle={2} stroke="rgb(var(--surface))">
          {top.map((_, i) => (
            <Cell key={i} fill={`rgb(var(${DONUT_COLORS[i % DONUT_COLORS.length]}))`} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
      </PieChart>
    </ResponsiveContainer>
  );
}
