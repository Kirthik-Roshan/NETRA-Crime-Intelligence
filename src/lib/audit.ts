import { randomBytes } from "node:crypto";
import { run } from "./db";
import type { SessionUser } from "./types";

export function newRequestId(): string {
  return `req_${randomBytes(6).toString("hex")}`;
}

interface AuditEntry {
  user?: SessionUser | null;
  action: string;
  entity?: string;
  entity_id?: string | number;
  request_id?: string;
  ai_model?: string;
  processing_ms?: number;
  detail?: string;
}

/** Immutable audit trail — every significant action is recorded. */
export function audit(e: AuditEntry): string {
  const request_id = e.request_id || newRequestId();
  try {
    run(
      `INSERT INTO audit_logs (ts, user_id, username, role, action, entity, entity_id, request_id, ai_model, processing_ms, detail)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        new Date().toISOString(),
        e.user?.id ?? null,
        e.user?.username ?? null,
        e.user?.role ?? null,
        e.action,
        e.entity ?? null,
        e.entity_id != null ? String(e.entity_id) : null,
        request_id,
        e.ai_model ?? null,
        e.processing_ms ?? null,
        e.detail ?? null,
      ]
    );
  } catch {
    // never let audit failures break the request
  }
  return request_id;
}
