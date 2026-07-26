import { NextResponse } from "next/server";
import { catalystConfigured, LLM_MODEL } from "@/lib/catalyst";

export const dynamic = "force-dynamic";

/**
 * AI backend status. In production the only AI backend is Zoho Catalyst
 * QuickML — no external LLM. When CATALYST_QUICKML_TOKEN isn't set (local
 * dev), NETRA falls back to its built-in deterministic engine.
 */
export async function GET() {
  const online = catalystConfigured();
  return NextResponse.json({
    online,
    model: online ? LLM_MODEL : "built-in reasoning engine",
    mode: online ? "catalyst-quickml" : "demo-engine",
  });
}
