import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Client-reportable audit actions (whitelist — clients cannot invent actions).
const ALLOWED = new Set(["CONVERSATION_EXPORTED", "REPORT_EXPORTED", "VOICE_QUERY"]);

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { action, detail } = await req.json().catch(() => ({}));
  if (!ALLOWED.has(String(action))) {
    return NextResponse.json({ error: "action not permitted" }, { status: 400 });
  }
  const id = audit({ user, action: String(action), detail: typeof detail === "string" ? detail.slice(0, 200) : undefined });
  return NextResponse.json({ ok: true, audit_id: id });
}
