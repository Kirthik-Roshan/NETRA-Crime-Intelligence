#!/usr/bin/env node

const FN_URL = process.env.FN_URL
  || process.env.NEXT_PUBLIC_AI_FN_URL
  || "https://ksphacks-60080085094.development.catalystserverless.in/server/ai_quickml/";

async function call(payload) {
  const response = await fetch(FN_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${payload.mode} failed (${response.status}): ${body.detail || body.error || "unknown error"}`);
  return body;
}

const command = "Show burglary cases in Mysuru";
const speech = await call({ mode: "tts", text: command, language: "en-IN" });
if (!speech.audio) throw new Error("Zia text-to-speech returned no audio");

const transcript = await call({
  mode: "transcribe",
  audio: speech.audio,
  language: "en",
  mime: speech.mime || "audio/wav",
  name: "netra-voice-smoke.wav",
});
if (!transcript.text) throw new Error("Zia speech-to-text returned no transcript");

const analysis = await call({ mode: "voice:nlp", text: transcript.text });
if (!analysis.text) throw new Error("Zia NLP returned no command text");

console.log(JSON.stringify({
  endpoint: FN_URL,
  synthesized: true,
  transcript: transcript.text,
  command: analysis.text,
  analytics: Array.isArray(analysis.analytics) && analysis.analytics.length > 0,
}, null, 2));
