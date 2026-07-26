import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { answerQuery } from "@/lib/nl2sql";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const { query } = body;
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query required" }, { status: 400 });
  }
  // Conversation memory: previous user turns (most recent last, capped).
  const history: string[] = Array.isArray(body.history)
    ? body.history.filter((h: unknown) => typeof h === "string").slice(-8)
    : [];
  const insight = await answerQuery(query, user, history);
  return NextResponse.json(insight);
}
