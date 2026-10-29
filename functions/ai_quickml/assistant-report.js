'use strict';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const list = (value, limit = 20000) => Array.isArray(value) ? value.slice(0, limit) : [];
const table = (headers, rows) => `<table><thead><tr>${headers.map(value => `<th>${escape(value)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
const paragraphs = values => values.map(value => `<p>${escape(value)}</p>`).join('');

function chartSvg(rows, kind = 'bar') {
  const values = rows.map(row => Number(row.value));
  if (!rows.length || values.some(value => !Number.isFinite(value))) return '';
  if (kind === 'pie' && values.every(value => value >= 0) && values.some(value => value > 0)) {
    const total = values.reduce((sum, value) => sum + value, 0);
    const colors = ['#087faf', '#00a599', '#7052ba', '#d58a20', '#d83e65'];
    let angle = -Math.PI / 2;
    const sectors = rows.map((row, index) => {
      const next = angle + Number(row.value) / total * 2 * Math.PI;
      const start = [170 + 110 * Math.cos(angle), 135 + 110 * Math.sin(angle)];
      const end = [170 + 110 * Math.cos(next), 135 + 110 * Math.sin(next)];
      const shape = Number(row.value) === total ? `<circle cx="170" cy="135" r="110" fill="${colors[index % 5]}"/>` : Number(row.value) === 0 ? '' : `<path d="M170 135 L${start.join(' ')} A110 110 0 ${next - angle > Math.PI ? 1 : 0} 1 ${end.join(' ')} Z" fill="${colors[index % 5]}"/>`;
      angle = next;
      return shape;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${Math.max(270, rows.length * 22 + 20)}" role="img" aria-label="Source statistics pie chart">${sectors}${rows.map((row, index) => `<rect x="310" y="${index * 22 + 10}" width="10" height="10" fill="${colors[index % 5]}"/><text x="328" y="${index * 22 + 20}" font-size="11">${escape(String(row.label).slice(0, 37))}: ${escape(row.value)}</text>`).join('')}</svg>`;
  }
  const min = Math.min(0, ...values), max = Math.max(1, ...values), scale = value => 190 + (value - min) / (max - min) * 400;
  if (kind === 'line' && rows.length > 1) {
    const x = index => 50 + index / (rows.length - 1) * 540;
    const y = value => 200 - (value - min) / (max - min) * 170;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 265" role="img" aria-label="Source statistics line chart"><polyline fill="none" stroke="#087faf" stroke-width="3" points="${rows.map((row, index) => `${x(index)},${y(row.value)}`).join(' ')}"/>${rows.map((row, index) => `<circle cx="${x(index)}" cy="${y(row.value)}" r="4" fill="#087faf"/><text x="${x(index)}" y="${y(row.value) - 10}" text-anchor="middle" font-size="11">${escape(row.value)}</text><text x="${x(index)}" y="225" text-anchor="middle" font-size="9">${escape(String(row.label).slice(0, 12))}</text>`).join('')}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${rows.length * 27 + 10}" role="img" aria-label="Source statistics bar chart">${rows.map((row, index) => `<text x="0" y="${index * 27 + 16}" font-size="11" fill="#12324a">${escape(String(row.label).slice(0, 27))}</text><rect x="${Math.min(scale(0), scale(row.value))}" y="${index * 27 + 3}" width="${Math.abs(scale(row.value) - scale(0))}" height="17" fill="#087faf"/><text x="615" y="${index * 27 + 16}" font-size="11">${escape(row.value)}</text>`).join('')}</svg>`;
}

function analysisHtml(a, options = {}) {
  if (!a || a.version !== 'track1-v1') return '';
  const rows = list(a.rows, 200);
  let chart = '';
  if (['bar', 'line', 'pie'].includes(a.context?.view) && rows.length) {
    chart = chartSvg(rows.map(row => ({ label: row.label, value: row.count })), a.context.view).replace(/aria-label="[^"]+"/, 'aria-label="Recorded FIR counts"');
  }
  const periods = a.periods ? `<h3>Equal-length incident-date windows</h3><p>Current: ${escape(a.periods.current_start)} to ${escape(a.periods.current_end)} (${escape(a.periods.current)} FIRs). Previous: ${escape(a.periods.previous_start)} to ${escape(a.periods.previous_end)} (${escape(a.periods.previous)} FIRs).</p>${table(['District', 'Current', 'Previous', 'Change', 'Review signal'], list(a.periods.changes, 200).map(row => [row.label, row.current, row.previous, row.delta, row.flagged ? 'Review increase' : 'Below rule threshold']))}<h3>Previous-window FIR references</h3>${paragraphs(list(a.periods.previous_sources).map(row => `CaseMaster #${row.id} | FIR ${row.fir_number}`))}` : '';
  const map = a.context?.view === 'map' ? `<h3>Map observations</h3><p>Recorded coordinates from the interactive OpenStreetMap view. ${a.points_truncated ? 'The display is limited to 1,000 points.' : ''}</p>${table(['FIR', 'District', 'Latitude', 'Longitude'], list(a.points, 1000).map(row => [row.fir_number, row.district, row.lat, row.lng]))}` : '';
  const comparison = a.comparison;
  let graph = '', findings = '';
  if (comparison) {
    const cases = list(comparison.cases, 6), items = list(comparison.findings, 100);
    const height = Math.max(cases.length * 55, items.length * 45, 60);
    const edges = items.map((finding, index) => list(finding.case_ids, 6).map(id => {
      const position = cases.findIndex(row => row.id === id);
      return position < 0 ? '' : `<line x1="210" y1="${position * 55 + 20}" x2="310" y2="${index * 45 + 18}" stroke="${finding.active ? '#087faf' : '#94a3b8'}" ${finding.active ? '' : 'stroke-dasharray="4 4"'}/>`;
    }).join('')).join('');
    graph = `<h3>Evidence dependency graph</h3><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 660 ${height}" role="img" aria-label="FIRs and supporting or conflicting findings">${edges}${cases.map((row, i) => `<rect x="0" y="${i * 55}" width="210" height="40" rx="4" fill="#edf6fb" stroke="#087faf"/><text x="8" y="${i * 55 + 25}" font-size="10">${escape(row.fir_number)}</text>`).join('')}${items.map((row, i) => `<rect x="310" y="${i * 45}" width="345" height="35" rx="4" fill="#f8fafc" stroke="${!row.active ? '#94a3b8' : row.kind === 'conflict' ? '#d12b42' : '#087faf'}"/><text x="318" y="${i * 45 + 22}" font-size="10">${escape(String(row.title).slice(0, 56))}</text>`).join('')}</svg>`;
    findings = `<h3>Findings</h3>${list(comparison.findings, 600).map(row => `<h4>${escape(row.title)}</h4><p>${row.active ? escape(row.kind) : 'Inactive after exclusion'}: ${escape(row.detail)}</p><p class="meta">Sources: ${escape(list(row.source_ids, 300).join(', '))}</p>`).join('')}<h3>Missing information</h3>${paragraphs(list(comparison.gaps, 100).map(row => `${row.title}: ${row.detail}`))}<h3>Next checks</h3>${paragraphs(list(comparison.next_checks, 100))}<h3>Comparison source register</h3>${list(comparison.sources, 300).map(row => `<h4>${escape(row.label)} (${escape(row.table)} #${escape(row.record_id)})</h4><p>${escape(row.excerpt)}</p><p class="meta">Origin: ${escape(row.origin)} | Source ID: ${escape(row.id)} | SHA-256: ${escape(row.fingerprint)}</p>${row.excluded ? `<p>Excluded: ${escape(row.exclusion_reason)}</p>` : ''}`).join('')}`;
  }
  const references = options.includeFirReferences === false
    ? `<p class="meta">Matching CaseMaster IDs (full FIR numbers appear in the consolidated register): ${escape(list(a.sources).map(row => row.id).join(', '))}</p>`
    : `<h3>Matching FIR references</h3>${paragraphs(list(a.sources).map(row => `CaseMaster #${row.id} | FIR ${row.fir_number}`))}`;
  return `<div class="analysis-snapshot"><h3>Recorded-data analysis</h3><p>${escape(a.scope)}</p><p class="meta">Retrieved: ${escape(a.generated_at)} | Matching FIRs: ${escape(a.total)} | Snapshot SHA-256: ${escape(a.fingerprint)}</p>${chart}${!comparison ? table(['Group', 'FIR count'], rows.map(row => [row.label, row.count])) : ''}${map}${periods}${graph}${findings}<h3>Coverage and limitations</h3>${paragraphs(list(a.warnings, 40))}${references}</div>`;
}

function activityHtml(activity, heading = true) {
  const time = value => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
  };
  return activity.length ? `${heading ? '<h3>Analysis activity</h3>' : ''}${table(['Time · IST', 'Stage', 'Status', 'Detail'], activity.map(row => [time(row.at), row.stage, row.status, row.detail])).replace('<table>', '<table class="activity">')}` : '';
}

function sourceHtml(row, index) {
  const snippet = String(row.snippet || 'No source excerpt was supplied.');
  let fields;
  try { fields = JSON.parse(snippet); } catch { /* Preserve incomplete source excerpts exactly as returned. */ }
  const value = fields && !Array.isArray(fields) && typeof fields === 'object'
    ? table(['Source field', 'Recorded value'], Object.entries(fields).map(([key, value]) => [key.replace(/_/g, ' '), typeof value === 'object' ? JSON.stringify(value) : value])).replace('<table>', '<table class="source-fields">')
    : `<div class="source-excerpt">${escape(snippet)}</div>`;
  return `<div class="source-card"><h4>Source ${index + 1} · ${escape(row.title || row.table || 'Record reference')}</h4>${value}</div>`;
}

function conversationAttachments(turn, options = {}) {
  const sources = list(turn.sources, 100);
  const activity = list(turn.activity, 100);
  const c = turn.source_chart;
  const sourceChart = c?.version === 'source-chart-v1' ? `<h3>${escape(c.title)}</h3>${chartSvg(list(c.rows, 50), c.kind)}${table(['Category', c.unit, 'Source excerpt'], list(c.rows, 50).map(row => [row.label, row.value, row.quote]))}<p>${escape(c.warning)}</p>` : '';
  const reportTable = Array.isArray(turn.table?.columns) && Array.isArray(turn.table?.rows)
    ? table(list(turn.table.columns, 12), list(turn.table.rows, 1000).filter(Array.isArray).map(row => row.slice(0, 12))) : '';
  return analysisHtml(turn.analysis, options) + sourceChart + reportTable + (sources.length ? `<h3>Answer sources</h3>${sources.map(sourceHtml).join('')}` : '') + (options.includeActivity === false ? '' : activityHtml(activity));
}

module.exports = { analysisHtml, conversationAttachments, activityHtml, chartSvg };
