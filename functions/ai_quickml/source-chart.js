'use strict';
const { VISUAL_TERMS } = require('./conversation');
const { passages } = require('./file-library');
const number = text => {
  const value = String(text).trim();
  if (!/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/.test(value)) return null;
  const numeric = Number(value.replace(/[,%]/g, ''));
  return Number.isFinite(numeric) && Math.abs(numeric) < 1e12 ? numeric : null;
};

// Deterministic extraction only. LLM output never supplies a chart value.
function numericSeries(text, query = '') {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const groups = []; let current = null;
  for (const line of lines) {
    if (/^\|?\s*:?-{2,}/.test(line)) continue;
    const cells = line.includes('|') ? line.replace(/^\||\|$/g, '').split('|').map(value => value.trim()) : line.split(/\t+|\s{2,}/).map(value => value.trim());
    if (cells.length >= 2) {
      const columns = cells.map((value, index) => ({ value, index })).filter(item => /^(?:count|firs?|cases?|total|value|percentage|percent|rate|ಎಣಿಕೆ|ಸಂಖ್ಯೆ|ಪ್ರಕರಣಗಳು)(?:\s*\(%\))?$/i.test(item.value));
      if (columns.length) {
        const requested = columns.filter(column => new RegExp(`\\b${column.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(query));
        const selected = requested.length === 1 ? requested[0] : columns[0];
        const ambiguous = columns.length > 1 && requested.length !== 1;
        current = { title: selected.value, dimension: cells[selected.index === 0 ? 1 : 0], valueIndex: selected.index, width: cells.length, ambiguous, rows: [] };
        groups.push(current); continue;
      }
      if (current && cells.length === current.width) {
        const value = number(cells[current.valueIndex]);
        const label = cells[current.valueIndex === 0 ? 1 : 0];
        if (value !== null && label && number(label) === null && !/^(?:total|overall|subtotal)$/i.test(label)) current.rows.push({ label, value, quote: line });
        continue;
      }
    }
    const pair = line.match(/^(?:[-*]\s*)?([^:|]{2,100})\s*:\s*(-?[\d,]+(?:\.\d+)?%?)\s*(?:FIRs?|cases?)?$/i);
    if (pair && !/\b(?:id|number|phone|reference|date|year|latitude|longitude|risk|age|score)\b/i.test(pair[1])) {
      if (!current || current.width !== 0) { current = { title: 'Recorded figures', width: 0, rows: [] }; groups.push(current); }
      const value = number(pair[2]);
      if (value !== null) current.rows.push({ label: pair[1].trim(), value, quote: line });
    } else current = null;
  }
  return groups.filter(group => group.ambiguous || group.rows.length >= 2);
}

function documentChart(payload, documents, scope = 'documents') {
  if (!VISUAL_TERMS.test(String(payload.query || payload.prompt || ''))) return null;
  let candidates = documents.flatMap(file => numericSeries(file.text, payload.query || payload.prompt).map(series => ({ file, series })));
  const query = String(payload.query || payload.prompt || '').toLowerCase();
  const named = candidates.filter(({ series }) => series.dimension && /district|offence|offense|crime type|month|category/i.test(series.dimension) && query.includes(series.dimension.toLowerCase()));
  if (named.length) candidates = named;
  const usable = candidates.filter(item => !item.series.ambiguous && item.series.rows.length >= 2 && item.series.rows.length <= 50);
  const clarify = reason => ({ answer: reason, response: reason, response_scope: scope, response_kind: 'clarification', sources: [], confidence: null, model: 'NETRA Document Chart Validation' });
  if (candidates.length !== 1 || usable.length !== 1) return clarify(candidates.length
    ? 'The attached report has multiple numeric series, ambiguous columns or more than 50 rows. Attach one table with a category column and one numeric column (for example District | FIRs), so I can plot exactly the intended figures.'
    : 'I could not extract a clear numeric table from this report. Provide a table such as District | FIRs, or labelled lines such as Mysuru: 42. I will not invent values or replace your report with crime-database statistics.');
  const { file, series } = usable[0];
  if (file.text_truncated) return clarify('The report text reached the extraction limit. Upload the relevant table separately before charting; an incomplete report has not been treated as the full dataset.');
  if (new Set(series.rows.map(row => /%/.test(row.quote) ? 'percent' : 'value')).size > 1) return clarify('These figures mix percentages and other values. Provide one consistent measure before plotting; different units have not been combined.');
  if (new Set(series.rows.map(row => row.label.toLowerCase())).size !== series.rows.length) return clarify('The report repeats category labels. Specify which table or period to use before plotting; repeated rows have not been added together.');
  const kind = /pie|donut|doughnut/i.test(payload.query) ? 'pie' : /line|trend/i.test(payload.query) ? 'line' : 'bar';
  if (kind === 'pie' && (series.rows.some(row => row.value < 0) || series.rows.every(row => row.value === 0))) return clarify('A pie chart needs nonnegative values and a positive total. Request a bar chart for these figures.');
  const blocks = passages(file.text);
  const chart = { version: 'source-chart-v1', kind, title: `${file.filename} · ${series.title}`, unit: series.title,
    rows: series.rows, source_file: file.filename, warning: 'Values are transcribed from the attached report. They are not independently verified police records. Different metrics must not be added together.' };
  return { answer: `Here is a ${kind} chart of ${chart.rows.length} labelled figures from ${file.filename}. Each value is retained in the table below.`, source_chart: chart,
    response_scope: scope, response_kind: 'records', confidence: null, model: 'NETRA Source Table Chart',
    sources: series.rows.map(row => ({ title: `${file.filename} · Passage ${blocks.find(block => block.text.includes(row.quote))?.number || 'text'}`, snippet: row.quote, score: null })) };
}

// Numbers must come from the officer's message, never a model's previous
// prose. This also lets follow-ups change chart type without inventing values.
function suppliedChart(payload) {
  const query = String(payload.query || payload.prompt || '');
  if (!VISUAL_TERMS.test(query)) return null;
  let source = query;
  if (!numericSeries(source).length && /\b(?:this|that|these|those|same|instead|now|it|them)\b|ಇದೇ|ಅದೇ|ಇವು/.test(query)) {
    for (const message of [...(Array.isArray(payload.history) ? payload.history : [])].reverse()) {
      if (message?.role !== 'user') continue;
      if (numericSeries(message.content).length) { source = message.content; break; }
      if (!VISUAL_TERMS.test(message.content)) break;
    }
  }
  if (!numericSeries(source).length) return null;
  const response = documentChart(payload, [{ id: 'officer-supplied-values', filename: 'Officer-supplied statistics', text: source }], 'supplied');
  if (response?.source_chart) response.source_chart.warning = 'Values were supplied in the conversation and are not verified database statistics. Each value is quoted below; different metrics must not be added together.';
  return response;
}
module.exports = { numericSeries, documentChart, suppliedChart };
