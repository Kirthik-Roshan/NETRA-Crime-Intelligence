"use client";

import { portalSessionRequest } from './ai-client';

const KEY = 'netra_portal_presence_v1';
let id = '';
let stopped = false;
let inFlight: Promise<unknown> | null = null;
function sessionId() {
  if (id) return id;
  try { id = sessionStorage.getItem(KEY) || ''; } catch { /* Storage is optional. */ }
  if (!id) id = crypto.randomUUID();
  try { sessionStorage.setItem(KEY, id); } catch { /* Keep the identifier in memory. */ }
  return id;
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Macintosh/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Device';
  return `${browser} / ${os}`;
}

/** Only verified server credentials establish identity; this ID is not an auth token. */
export function startPortalPresence() {
  stopped = false;
  let pending = false;
  let disposed = false;
  const beat = async () => {
    if (stopped || disposed || pending || inFlight || document.visibilityState === 'hidden') return;
    pending = true;
    try { inFlight = portalSessionRequest({ mode: 'auth:presence', session_id: sessionId(), path: location.pathname, device: deviceLabel() }); await inFlight; }
    catch { /* Presence failures must not block the officer's workspace. Admin shows read failures. */ }
    finally { pending = false; inFlight = null; }
  };
  void beat();
  const timer = window.setInterval(() => void beat(), 60000);
  const visible = () => { if (document.visibilityState === 'visible') void beat(); };
  document.addEventListener('visibilitychange', visible);
  return () => { disposed = true; window.clearInterval(timer); document.removeEventListener('visibilitychange', visible); };
}

export async function endPortalPresence() {
  stopped = true;
  try { await inFlight?.catch(() => undefined); await portalSessionRequest({ mode: 'auth:presence-end', session_id: sessionId() }); }
  finally {
    id = '';
    try { sessionStorage.removeItem(KEY); } catch { /* Storage may be blocked. */ }
  }
}
