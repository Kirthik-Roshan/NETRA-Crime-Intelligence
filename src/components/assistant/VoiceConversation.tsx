"use client";
import { UiText, useUiText } from '@/components/UiText';

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square } from "lucide-react";
import { playSpeech, type SpeechPlayback } from "@/lib/speech-playback";
import { naturalizeForSpeech } from "@/lib/answer-format";
import { localSpeechSupport, installSpeechPack, recognitionError, type BrowserRecognition } from "@/lib/microphone";

export function VoiceConversation({ language, ask }: { language: "en" | "kn"; ask: (query: string) => Promise<string | undefined> }) {
  const ui = useUiText();
  const [state, setState] = useState("off"); const [error, setError] = useState(""); const [transcript, setTranscript] = useState("");
  const [speechPack, setSpeechPack] = useState<string | null>(null);
  const active = useRef(false); const epoch = useRef(0); const rec = useRef<BrowserRecognition | null>(null); const audio = useRef<SpeechPlayback | null>(null); const silence = useRef<ReturnType<typeof setTimeout>>(); const restart = useRef<ReturnType<typeof setTimeout>>();
  const askRef = useRef(ask); askRef.current = ask;
  function halt() { active.current = false; epoch.current++; clearTimeout(silence.current); clearTimeout(restart.current); rec.current?.abort(); audio.current?.stop(); setState("off"); }
  useEffect(() => { setState("off"); setSpeechPack(null); return () => { active.current = false; epoch.current++; clearTimeout(silence.current); clearTimeout(restart.current); rec.current?.abort(); audio.current?.stop(); }; }, [language]);
  async function listen() {
    if (!active.current) return;
    const current = epoch.current;
    setState("preparing");
    let support;
    try { support = await localSpeechSupport(language); }
    catch { setError("Chrome could not check on-device speech support. Check browser policy and permissions, then retry."); halt(); return; }
    if (!active.current || current !== epoch.current) return;
    if (!support.Recognition || support.status !== "available") {
      setSpeechPack(support.status === "downloadable" ? support.language : null);
      setError(support.status === "downloadable" ? "An on-device speech pack is required. Install it below, then restart voice conversation." : "On-device recognition is unavailable for this browser or language. No remote speech service was substituted. Use the query microphone when Catalyst transcription recovers.");
      halt(); return;
    }
    setSpeechPack(null);
    const recognition = new support.Recognition(); rec.current = recognition; let text = ""; let failed = false;
    recognition.lang = support.language; recognition.processLocally = true; recognition.continuous = true; recognition.interimResults = true;
    recognition.onresult = event => { text = Array.from(event.results as any[]).map((r: any) => r[0].transcript).join(" ").trim(); setTranscript(text); clearTimeout(silence.current); silence.current = setTimeout(() => recognition.stop(), 1400); };
    recognition.onerror = event => { if (!active.current || current !== epoch.current || event?.error === "no-speech") return; failed = true; setError(recognitionError(event?.error)); halt(); };
    recognition.onend = async () => {
      clearTimeout(silence.current);
      if (!active.current || current !== epoch.current || failed) return;
      if (!text) { restart.current = setTimeout(listen, 500); return; }
      setState("thinking");
      try {
        const answer = await askRef.current(text);
        if (!active.current || current !== epoch.current) return;
        if (answer) {
          setState("speaking"); const spoken = naturalizeForSpeech(answer, language); const bcp = language === "kn" ? "kn-IN" : "en-IN";
          const resume = () => { if (active.current && current === epoch.current) listen(); };
          audio.current = playSpeech(spoken, bcp, { onEnd: resume, onStop: () => { if (active.current && current === epoch.current) halt(); }, onError: message => { setError(message); resume(); } });
          return;
        }
        listen();
      } catch (e) { setError(e instanceof Error ? e.message : "Voice conversation failed."); halt(); }
    };
    setState("listening"); setTranscript("");
    try { recognition.start(); } catch { setError("Microphone could not start."); halt(); }
  }
  return <div className="flex flex-wrap items-center gap-2"><button type="button" className={state === "off" ? "btn-ghost" : "btn-accent"} onClick={() => { if (active.current) halt(); else { setError(""); active.current = true; void listen(); } }}>{state === "off" ? <Mic size={16}/> : <MicOff size={16}/>} <UiText text={state === "off" ? "Voice conversation" : `End · ${state}`} /></button>{state === "speaking" && <button type="button" className="btn-ghost" title={ui("Interrupt reply and listen")} onClick={() => { epoch.current++; audio.current?.stop(); void listen(); }}><Square size={14}/><UiText text={"Interrupt"} /></button>}
    {speechPack && state === "off" && <button type="button" className="btn-ghost" onClick={() => {
      setState("installing");
      void installSpeechPack(speechPack).then(installed => {
        setError(installed ? "Speech pack installed. Restart voice conversation." : "Chrome could not install the speech pack. No remote recognition service was substituted.");
        if (installed) setSpeechPack(null);
      }).catch(() => setError("Speech-pack installation failed. Check Chrome permissions and retry.")).finally(() => setState("off"));
    }}><UiText text={"Install on-device speech pack"} /> ({speechPack})</button>}
    <span role="status" className="max-w-sm text-xs text-muted"><UiText text={error || transcript} /></span></div>;
}
