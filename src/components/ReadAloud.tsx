"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { playSpeech, type SpeechPlayback } from "@/lib/speech-playback";
import { naturalizeForSpeech } from "@/lib/answer-format";

/**
 * Small "Listen" button — reads `text` aloud via Catalyst Zia TTS in the
 * officer's current language. Graceful: if the Function/Zia returns nothing it
 * briefly shows "Voice unavailable" and resets; disabled when there's no text.
 */
export function ReadAloud({ text, label = "Listen" }: { text: string; label?: string }) {
  const lang = useAppStore((s) => s.lang);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [voiceStatus, setVoiceStatus] = useState("");
  const audioRef = useRef<SpeechPlayback | null>(null);
  useEffect(() => () => audioRef.current?.stop(), [text, lang]);

  const onClick = useCallback(async () => {
    if (state === "playing" || state === "loading") {
      audioRef.current?.stop();
      audioRef.current = null;
      setState("idle");
      return;
    }
    if (!text.trim()) return;
    setState("loading");
    // Never send raw Markdown / IDs / metadata to TTS — speak a concise,
    // naturalised version (FIR numbers → natural phrases, no audit IDs, etc.).
    const spoken = naturalizeForSpeech(text, lang === "kn" ? "kn" : "en");
    audioRef.current = playSpeech(spoken, lang === "kn" ? "kn-IN" : "en-IN", {
      onStart: () => setState("playing"), onEnd: () => setState("idle"),
      onStop: () => setState("idle"), onError: () => setState("error"),
      onProgress: setVoiceStatus,
      onVoice: source => setVoiceStatus(source === "neural-kn" ? "On-device Kannada neural voice" : source === "basic-kn" ? "Basic Kannada fallback voice" : source === "device" ? "Device voice" : "Catalyst speech"),
    });
  }, [state, text, lang]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!text.trim()}
      className={cn("btn-ghost h-8 py-0 text-xs disabled:opacity-40", state === "playing" && "text-accent")}
      title={state === "playing" || state === "loading" ? "Stop" : voiceStatus || label}
      aria-label={label}
    >
      {state === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : state === "playing" ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
      {state === "error" ? "Voice unavailable" : state === "playing" ? "Stop" : label}
    </button>
  );
}

export default ReadAloud;
