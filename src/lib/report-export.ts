"use client";
import { REPORT_TEMPLATE_VERSION } from '../../functions/ai_quickml/report-contract';
export interface ReportExport {
  pdf?: string; html?: string; filename?: string; mime?: string;
  template_version?: string; warning?: string | null; library_id?: string | null;
}

/** Every export uses the server's single report renderer, including fallback. */
export async function presentReport(result: ReportExport | null): Promise<'pdf' | 'print'> {
  if (!result) throw new Error('Report generation could not be reached. Retry the export; no application screenshot was substituted.');
  if (result.template_version !== REPORT_TEMPLATE_VERSION) throw new Error('The Function is serving an older report template. Promote the matching Function and Web Client, then export again. Your existing downloaded reports remain unchanged.');
  if (!result.library_id) throw new Error('The report archive was not confirmed. Update the matching Function and retry; every export must first appear in Reports → Saved reports.');
  if (result.library_id) {
    window.dispatchEvent(new Event('netra:library-updated'));
    try { localStorage.setItem('netra:library-updated', String(Date.now())); } catch { /* Current-tab refresh remains available. */ }
  }
  if (result.pdf) {
    const bytes = Uint8Array.from(atob(result.pdf), char => char.charCodeAt(0));
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== '%PDF-') throw new Error('The report service returned an invalid PDF.');
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url; link.download = result.filename || 'netra-report.pdf';
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return 'pdf';
  }
  if (!result.html?.includes(`data-report-template="${REPORT_TEMPLATE_VERSION}"`)) throw new Error('The report preview is missing the current branded template. Please retry after updating the Function.');
  const frame = document.createElement('iframe');
  frame.title = 'NETRA branded report print preview';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:1100px;border:0';
  const ready = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Report print preview timed out. Please retry.')), 20000);
    frame.onload = () => { clearTimeout(timer); resolve(); };
  });
  frame.srcdoc = result.html;
  document.body.appendChild(frame);
  try {
    await ready;
    const content = frame.contentDocument, target = frame.contentWindow;
    if (!content || !target) throw new Error('The browser blocked report preview.');
    content.documentElement.classList.add('browser-report');
    const style = content.createElement('style'); style.textContent = '@page { size:A4; margin:0; }'; content.head.appendChild(style);
    await content.fonts.ready;
    await Promise.all(Array.from(content.images).map(image => image.decode()));
    target.addEventListener('afterprint', () => frame.remove(), { once: true });
    target.focus(); target.print();
    setTimeout(() => frame.remove(), 300000);
    return 'print';
  } catch (error) { frame.remove(); throw error; }
}
