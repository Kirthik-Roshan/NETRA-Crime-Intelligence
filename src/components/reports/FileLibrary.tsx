"use client";
import { UiText, useUiText, useUiLocale } from '@/components/UiText';


import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Eye, FileText, Loader2, MessageSquare, Paperclip, RefreshCw, Search, X } from 'lucide-react';
import AppLink from '@/components/AppLink';
import { fetchLibraryBlob, listLibraryFiles, type LibraryFile } from '@/lib/file-library';

export function FileLibrary({ kind, onAttach }: { kind: 'document' | 'report'; onAttach?: (file: LibraryFile) => void }) {
  const ui = useUiText();
  const locale = useUiLocale();
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState('');
  const [preview, setPreview] = useState<{ file: LibraryFile; url: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const request = ++generation.current;
    setLoading(true); setError('');
    try { const result = await listLibraryFiles(kind); if (request === generation.current) setFiles(result.rows); }
    catch (cause) { if (request === generation.current) setError(cause instanceof Error ? cause.message : 'The library could not be loaded.'); }
    finally { if (request === generation.current) setLoading(false); }
  }, [kind]);
  useEffect(() => {
    void load();
    const update = () => { if (document.visibilityState === 'visible') void load(); };
    const storage = (event: StorageEvent) => { if (event.key === 'netra:library-updated') update(); };
    window.addEventListener('netra:library-updated', update);
    window.addEventListener('focus', update);
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', update);
    const timer = window.setInterval(update, 30000);
    return () => {
      generation.current++;
      window.clearInterval(timer);
      window.removeEventListener('netra:library-updated', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', update);
    };
  }, [load]);
  useEffect(() => {
    if (preview) dialog.current?.showModal();
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);
  const open = async (file: LibraryFile, download = false) => {
    setBusy(file.id); setError('');
    try {
      const result = await fetchLibraryBlob(file.id);
      const url = URL.createObjectURL(result.blob);
      if (download) {
        const link = document.createElement('a'); link.href = url; link.download = file.filename; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else setPreview({ file, url });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The file could not be opened.'); }
    finally { setBusy(''); }
  };
  const matching = files.filter(file => `${file.title} ${file.filename}`.toLowerCase().includes(query.trim().toLowerCase()));
  return <section className="min-w-0 space-y-3" aria-label={kind === 'report' ? 'Saved reports' : 'Document library'}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-accent" /><UiText text={kind === 'report' ? 'Saved reports' : 'Document library'} /><span className="text-xs text-muted"><UiText text={files.length} /></span></h2>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><label className="flex min-w-0 items-center gap-2"><Search className="h-4 w-4 text-muted" /><input className="input !w-48 max-w-full !py-1 text-xs" aria-label={ui("Search library")} value={query} onChange={event => setQuery(event.target.value)} placeholder={ui("Search files…")} /></label><button type="button" className="btn-ghost !p-2" title={ui("Refresh library")} aria-label={ui("Refresh library")} onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    </div>
    {error && <p role="alert" className="border-l-2 border-danger px-3 py-2 text-sm text-danger"><UiText text={error} /></p>}
    {loading ? <div className="flex items-center gap-2 py-8 text-sm text-muted"><Loader2 className="h-4 w-4 animate-spin" /><UiText text={"Loading files…"} /></div> : !error && !matching.length ? <p className="py-8 text-sm text-muted"><UiText text={query ? 'No matching files.' : kind === 'report' ? 'No reports saved yet.' : 'No documents uploaded yet.'} /></p> : <div className="divide-y divide-border">
      {matching.map(file => <div key={file.id} className="flex min-w-0 flex-wrap items-center gap-3 py-3">
        <FileText className="h-5 w-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1 basis-40"><h3 className="break-words text-sm font-medium"><UiText text={file.title} /></h3><p className="mt-1 break-words text-xs text-muted">{new Date(file.created_at).toLocaleString(locale)} · {Math.ceil(file.size / 1024)}<UiText text={" KB · Catalyst "} /><UiText text={file.provider === 'filestore' ? 'FileStore' : 'Stratus'} /> · <UiText text={file.mime === 'text/html' ? 'Printable report' : file.mime === 'application/pdf' ? 'PDF' : 'Image'} /></p></div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" title={ui("Preview file")} aria-label={`Preview ${file.filename}`} className="btn-ghost !p-2" disabled={!!busy} onClick={() => void open(file)}>{busy === file.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}</button>
          <button type="button" title={ui("Download file")} aria-label={`Download ${file.filename}`} className="btn-ghost !p-2" disabled={!!busy} onClick={() => void open(file, true)}><Download className="h-4 w-4" /></button>
          {file.text_characters > 0 && (onAttach ? <button type="button" title={ui("Attach to conversation")} aria-label={`Attach ${file.filename}`} className="btn-ghost !p-2" onClick={() => onAttach(file)}><Paperclip className="h-4 w-4" /></button> : <AppLink href={`/assistant/?document=${file.id}`} title={ui("Chat about this file")} aria-label={`Chat about ${file.filename}`} className="btn-ghost !p-2"><MessageSquare className="h-4 w-4" /></AppLink>)}
        </div>
      </div>)}
    </div>}
    {preview && <dialog ref={dialog} onCancel={() => setPreview(null)} className="m-auto w-[min(960px,calc(100vw-32px))] rounded-md border border-border bg-surface p-0 text-fg backdrop:bg-black/50">
      <div className="flex items-center justify-between gap-3 border-b border-border p-3"><h3 className="min-w-0 break-words text-sm font-semibold"><UiText text={preview.file.filename} /></h3><button type="button" className="btn-ghost !p-2" title={ui("Close preview")} aria-label={ui("Close preview")} onClick={() => setPreview(null)}><X className="h-4 w-4" /></button></div>
      {['application/pdf', 'text/html'].includes(preview.file.mime) ? <iframe sandbox={preview.file.mime === 'text/html' ? 'allow-modals' : undefined} src={preview.url} title={preview.file.filename} className="h-[70vh] w-full border-0" /> : <img src={preview.url} alt={preview.file.filename} className="max-h-[70vh] w-full object-contain" />}
    </dialog>}
  </section>;
}
