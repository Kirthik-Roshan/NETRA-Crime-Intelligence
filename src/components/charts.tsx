"use client";
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

const AXIS = { fontSize: 11, fill: "rgb(var(--muted))" };
const GRID = "rgb(var(--border))";

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-elevated px-3 py-2 text-xs shadow-card">
      <div className="mb-1 font-medium text-fg">{label}</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color || p.fill }} />
          {p.name}: <span className="font-mono text-fg">{p.value}</span>
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
}: {
  data: any[];
  x: string;
  y: string;
  height?: number;
  color?: "accent" | "info" | "warning" | "danger";
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis dataKey={x} tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={data.length > 8 ? -30 : 0} textAnchor={data.length > 8 ? "end" : "middle"} height={data.length > 8 ? 60 : 30} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgb(var(--elevated))" }} />
        <Bar dataKey={y} radius={[4, 4, 0, 0]} fill={`rgb(var(--${color}))`} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const DONUT_COLORS = ["--accent", "--info", "--warning", "--danger", "--success"];
export function Donut({ data, nameKey, valueKey, height = 240 }: { data: any[]; nameKey: string; valueKey: string; height?: number }) {
  const top = data.slice(0, 5);
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
