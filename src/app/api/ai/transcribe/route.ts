import { NextResponse } from "next/server";
import { ziaTranscribe, catalystConfigured } from "@/lib/catalyst";

export const dynamic = "force-dynamic";

/**
 * Speech-to-text via Zoho Catalyst Zia — the production voice path.
 * Accepts base64 audio + a BCP-47 language tag and returns the transcript.
 * Returns 503 when Catalyst isn't configured (local dev), so the client can
 * fall back to the browser's built-in dictation.
 */
export async function POST(req: Request) {
  if (!catalystConfigured()) {
    return NextResponse.json({ error: "not-configured", text: null }, { status: 503 });
  }
  try {
    const { audio, language } = (await req.json()) as { audio?: string; language?: string };
    if (!audio) return NextResponse.json({ error: "audio required", text: null }, { status: 400 });
    const text = await ziaTranscribe(String(audio), language || "en-IN");
    return NextResponse.json({ text });
  } catch {
    return NextResponse.json({ error: "transcription failed", text: null }, { status: 500 });
  }
}
