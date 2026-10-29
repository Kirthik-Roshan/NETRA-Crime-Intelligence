"use client";
import { BarSeries, Donut, TrendLine } from '@/components/charts';
import { UiText } from '@/components/UiText';

export interface SourceChartData {
  version: string; kind: 'bar' | 'line' | 'pie'; title: string; unit: string;
  rows: Array<{ label: string; value: number; quote: string }>;
  source_file: string; warning: string;
}
export function SourceChart({ chart }: { chart: SourceChartData }) {
  return <section className="min-w-0 space-y-3 rounded-lg border border-accent/30 bg-surface p-4" aria-label="Report statistics chart">
    <h4 className="font-semibold">{chart.title}</h4>
    <div className="h-[280px] min-w-0">{chart.kind === 'pie'
      ? <Donut data={chart.rows} nameKey="label" valueKey="value" height={280} includeOthers />
      : chart.kind === 'line' ? <TrendLine data={chart.rows} x="label" y="value" height={280} />
      : <BarSeries data={chart.rows} x="label" y="value" height={280} />}</div>
    <div className="max-h-72 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2"><UiText text="Category" /></th><th className="p-2"><UiText text={chart.unit} /></th><th className="p-2"><UiText text="Source" /></th></tr></thead><tbody>{chart.rows.map(row => <tr key={row.label} className="border-t border-border"><td className="p-2"><UiText text={row.label} /></td><td className="p-2 tabular-nums">{row.value}</td><td className="p-2">{row.quote}</td></tr>)}</tbody></table></div>
    <p className="text-xs text-muted">{chart.warning}</p>
  </section>;
}
