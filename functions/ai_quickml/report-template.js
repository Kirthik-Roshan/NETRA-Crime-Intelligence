'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPORT_TEMPLATE_VERSION } = require('./report-contract');
const emblem = `data:image/svg+xml;base64,${fs.readFileSync(path.join(__dirname, 'assets/ksp-emblem.svg')).toString('base64')}`;
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

function documentHtml(payload, actor, body, appendix, metadata) {
  const title = escape(String(payload.title || 'NETRA Investigation Report').slice(0, 160));
  const turns = Array.isArray(payload.turns) ? payload.turns.slice(-80) : [];
  const generated = new Date(metadata.generated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' });
  const audits = new Set(turns.map(turn => turn.audit_id || turn.insight?.explain?.audit_id).filter(Boolean));
  const sources = new Set(turns.flatMap(turn => (turn.sources || []).map(source => `${source.title}|${source.snippet}`)));
  return `<!doctype html><html lang="en" data-report-template="${REPORT_TEMPLATE_VERSION}"><head><meta charset="utf-8"><title>${title}</title><style>
    *{box-sizing:border-box}html{-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,'Noto Sans Kannada',sans-serif;color:#18324b;margin:0;font-size:10pt;line-height:1.65;overflow-wrap:anywhere}
    .masthead{display:flex;align-items:center;gap:16px;border-bottom:3px solid #087eae;padding-bottom:16px}.emblem{width:66px;height:66px;object-fit:contain}.brand{flex:1}.org{font-size:12pt;font-weight:700;letter-spacing:.025em;color:#0a2945}.product{font-size:9pt;color:#527086}.conf{font-size:8pt;font-weight:700;letter-spacing:.06em;color:#ae293c;border:1px solid #e7a8b1;padding:5px 9px;border-radius:4px}
    .report-heading{padding:22px 0 15px}.eyebrow,.section-label{font-size:8pt;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#007eae}h1{font-size:24pt;line-height:1.2;margin:8px 0 14px;color:#092842}h2{font-size:14pt;line-height:1.35;color:#102f4b;margin:19px 0 11px}h3{font-size:10.5pt;color:#0b638d;margin:17px 0 8px}h4{font-size:10pt;margin:12px 0 6px}h1,h2,h3,h4{break-after:avoid}p{margin:6px 0 10px;orphans:3;widows:3}
    .metadata{display:grid;grid-template-columns:1fr 1fr;gap:10px 22px;padding:14px 16px;background:#eff6fb;border:1px solid #d6e5ef;border-radius:6px;font-size:9pt}.metadata b{display:block;font-size:7pt;letter-spacing:.08em;color:#58728b;text-transform:uppercase}.metrics{display:flex;margin:0 0 16px;border:1px solid #d6e5ef;border-radius:6px}.metric{flex:1;padding:11px 14px;border-right:1px solid #d6e5ef}.metric:last-child{border:0}.metric strong{display:block;font-size:18pt;color:#006e9d}.metric span{font-size:8pt;color:#5c7387}
    .contents{padding:13px 16px;margin:0 0 22px;border-left:3px solid #087eae;background:#f6f9fc;font-size:9pt}.contents b{display:block;margin-bottom:4px}.contents a{color:#215a7a;text-decoration:none;margin-right:16px}.note{font-size:8.5pt;line-height:1.6;color:#526c80;padding:11px 14px;background:#f3f7fa;border-left:3px solid #93adc1;margin:14px 0 22px}
    section{margin:0 0 19px}section.conversation-turn{border-bottom:1px solid #dce6ee;padding-bottom:19px}.turn-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:19px 0 9px}.turn,.meta{font-size:8pt;color:#5c7489}.turn{font-weight:700;letter-spacing:.04em}.question{border:1px solid #cfe2ef;background:#f0f7fc;border-radius:5px;padding:12px 14px;margin:8px 0 13px;break-inside:avoid}.question h2{font-size:12pt;margin:5px 0 0}.answer-label{font-size:8pt;letter-spacing:.06em;text-transform:uppercase;font-weight:700;color:#007eae}.answer{white-space:pre-wrap}.source-card{padding:11px 13px;border:1px solid #dce6ee;border-radius:5px;margin:9px 0}.source-card h4{margin:0 0 7px}.source-excerpt,pre{font-family:Arial,sans-serif;font-size:8.5pt;white-space:pre-wrap;word-break:break-word;background:#f5f8fb;padding:10px;line-height:1.6;margin:8px 0 0}
    table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:8pt;margin:9px 0 14px;line-height:1.55}thead{display:table-header-group}th{background:#eaf2f8;color:#17486b;text-align:left;font-size:7.5pt;padding:9px 8px;border-bottom:1px solid #b6cddd}td{padding:8px;border-bottom:1px solid #dee7ee;vertical-align:top;overflow-wrap:anywhere}tbody tr:nth-child(even){background:#f8fafc}tr{break-inside:avoid}table.activity th:nth-child(1){width:20%}table.activity th:nth-child(2){width:22%}table.activity th:nth-child(3){width:13%}table.activity th:nth-child(4){width:45%}
    svg{width:100%;height:auto;max-height:650px;break-inside:avoid}.appendix{break-before:page}.appendix-intro{font-size:9pt;color:#567086}.final-note{border-top:2px solid #087eae;padding-top:12px;font-size:8pt;color:#567086}.source-fields td:first-child{width:30%;font-weight:700}a{color:#006e9d}
    .turn-head,.answer-label{break-after:avoid}.final-note{break-inside:avoid}.appendix section{margin-bottom:12px}
    @media screen{body{max-width:760px;margin:auto;padding:40px;background:white}}@media print{a{color:inherit;text-decoration:none}html.browser-report body{padding:17mm;box-decoration-break:clone;-webkit-box-decoration-break:clone}}
  </style></head><body>
    <header class="masthead"><img class="emblem" src="${emblem}" alt="Karnataka State Police emblem"><div class="brand"><div class="org">KARNATAKA STATE POLICE</div><div class="product">NETRA · Crime Intelligence &amp; Investigation Support</div></div><span class="conf">CONFIDENTIAL</span></header>
    <div class="report-heading"><div class="eyebrow">Intelligence record / NETRA</div><h1>${title}</h1><div class="metadata"><div><b>Report reference</b>${escape(metadata.id)}</div><div><b>Generated · IST</b>${escape(generated)}</div><div><b>Prepared for</b>${escape(actor.full_name || actor.username || 'Officer')}</div><div><b>Access role</b>${escape(String(actor.role_name || actor.role || '').replace(/_/g, ' '))}</div></div></div>
    <div class="metrics"><div class="metric"><strong>${turns.length}</strong><span>Recorded entries</span></div><div class="metric"><strong>${sources.size}</strong><span>Distinct answer sources</span></div><div class="metric"><strong>${audits.size}</strong><span>Audit references</span></div></div>
    <nav class="contents"><b>Document guide</b><a href="#report-content">01 · Report entries</a>${appendix ? '<a href="#activity-appendix">02 · Analysis activity</a>' : ''}<a href="#report-provenance">Provenance &amp; review</a></nav>
    <div class="note">This report preserves the supplied answers, source excerpts and analysis events. An unavailable answer or missing citation remains visible. AI observations require officer review against the original records.</div>
    <div id="report-content">${body}</div>${appendix ? `<div class="appendix" id="activity-appendix"><div class="section-label">Appendix A</div><h2>Analysis activity &amp; audit references</h2><p class="appendix-intro">Recorded retrieval and verification stages, grouped by report entry. Times are shown in Indian Standard Time.</p>${appendix}</div>` : ''}
    <footer class="final-note" id="report-provenance"><strong>Provenance &amp; review</strong><p>Prepared by NETRA from the supplied conversation and source records. Source references identify the records consulted; they do not certify the correctness of an AI response. Synthetic demonstration data remains synthetic. This document is an analytical aid and requires review before operational use.</p><span>Report ${escape(metadata.id)} · ${escape(generated)} IST</span></footer>
  </body></html>`;
}

function reportMetadata() {
  return { id: `NETRA-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`, generated_at: new Date().toISOString() };
}

function pdfOptions(metadata) {
  return { page_options: { javascript_enabled: false }, pdf_options: {
    format: 'A4', print_background: true, display_header_footer: true,
    margin: { top: '18mm', bottom: '19mm', left: '17mm', right: '17mm' },
    header_template: '<span></span>',
    footer_template: `<div style="font-family:Arial;font-size:8px;color:#698096;width:100%;margin:0 17mm;border-top:1px solid #dce6ee;padding-top:6px">${escape(metadata.id)}<span style="float:right">Page <span class="pageNumber"></span> of <span class="totalPages"></span></span></div>`,
  } };
}

module.exports = { documentHtml, reportMetadata, pdfOptions, REPORT_TEMPLATE_VERSION };
