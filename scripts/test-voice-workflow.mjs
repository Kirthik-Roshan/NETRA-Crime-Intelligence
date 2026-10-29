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

async function checkVoice({ language, command, name }) {
  const speech = await call({ mode: "tts", text: command, language });
  if (!speech.audio) throw new Error(`${language} text-to-speech returned no audio`);
  const transcript = await call({
    mode: "transcribe",
    audio: speech.audio,
    language: language.startsWith("kn") ? "kn" : "en",
    mime: speech.mime || "audio/wav",
    name,
  });
  if (!String(transcript.text || "").trim()) throw new Error(`${language} speech-to-text returned no transcript`);
  const analysis = await call({ mode: "voice:nlp", text: transcript.text, language: language.startsWith("kn") ? "kn" : "en" });
  if (!String(analysis.text || "").trim()) throw new Error(`${language} NLP returned no command text`);
  return {
    language,
    synthesized: true,
    transcript: transcript.text,
    command: analysis.text,
    analytics_text: analysis.analytics_text || analysis.text,
    analytics: Array.isArray(analysis.analytics) && analysis.analytics.length > 0,
  };
}

const results = [];
results.push(await checkVoice({ language: "en-IN", command: "Show burglary cases in Mysuru", name: "netra-voice-en-smoke.wav" }));
results.push(await checkVoice({ language: "kn-IN", command: "ಮೈಸೂರಿನ ಕಳ್ಳತನ ಪ್ರಕರಣಗಳನ್ನು ತೋರಿಸಿ", name: "netra-voice-kn-smoke.wav" }));

console.log(JSON.stringify({ endpoint: FN_URL, results }, null, 2));
