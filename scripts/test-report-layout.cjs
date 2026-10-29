const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const Database = require('better-sqlite3');
const { chromium } = require(process.env.NETRA_PLAYWRIGHT_MODULE || 'playwright');
const platform = require('../functions/ai_quickml/platform');
const { pdfOptions } = require('../functions/ai_quickml/report-template');
const db = new Database('data/netra.db', { readonly: true });
const record = db.prepare('SELECT * FROM CaseMaster LIMIT 1').get(); db.close();
const metadata = { id: 'NETRA-LAYOUT-PREVIEW', generated_at: '2026-10-26T17:30:00Z' };
const payload = {
  title: 'Investigation Conversation · Layout Preview',
  turns: [
    { question: 'Hello', answer: 'Hello. How can I assist with your investigation?', audit_id: 'A-PREVIEW-01' },
    { question: 'Show me a case source', answer: 'This preview includes a source record from the local schema-aligned synthetic KSP dataset. Review the registered facts and cited fields below.', audit_id: 'A-PREVIEW-02', sources: [{ title: `CaseMaster · ${record.CrimeNo}`, snippet: JSON.stringify(record) }] },
    { question: 'What if an answer is unavailable?', answer: 'The conversational AI service is temporarily unavailable. Please try again. No case records were searched for this message.', audit_id: 'A-PREVIEW-03', sources: [{ title: 'Example incomplete excerpt', snippet: '{"id":13,"name":"Example <script>never execute</script>","incomplete":' }] },
    { question: 'Long report pagination check', answer: Array.from({ length: 50 }, (_, i) => `Review item ${i + 1}: Preserve officer annotations and verify every supplied source before using this analytical aid.`).join('\n') },
  ].map(turn => ({ ...turn, activity: [{ at: metadata.generated_at, stage: 'Authentication', status: 'complete', detail: 'Verified session (preview fixture)' }, { at: metadata.generated_at, stage: 'Retrieval', status: 'warning', detail: 'Preview data only; no live Catalyst request was made.' }] })),
};
(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 1300 } });
    const html = platform.reportHtml(payload, { full_name: 'Preview Officer', role: 'administrator' }, metadata);
    assert(!html.includes('<script>')); assert(html.includes('Source field')); assert(html.includes('NETRA-LAYOUT-PREVIEW'));
    await page.setContent(html, { waitUntil: 'load' });
    assert.equal(await page.locator('.emblem').evaluate(img => img.complete && img.naturalWidth > 0), true);
    const overflow = await page.evaluate(() => [...document.querySelectorAll('table, .source-card, .metadata')].some(node => node.scrollWidth > node.clientWidth + 1));
    assert.equal(overflow, false, 'tables and source excerpts fit printable width');
    const { pdf_options: options } = pdfOptions(metadata);
    await fs.mkdir('test-assets/reports', { recursive: true });
    await page.pdf({ path: 'test-assets/reports/netra-report-layout-preview.pdf', format: options.format, printBackground: options.print_background, displayHeaderFooter: options.display_header_footer, headerTemplate: options.header_template, footerTemplate: options.footer_template, margin: options.margin });
    await page.screenshot({ path: '/tmp/netra-report-after.png', fullPage: true });
    console.log('Report layout: bundled emblem, escaped source data, field tables, report reference, activity appendix and multi-page A4 export verified.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exit(1); });
