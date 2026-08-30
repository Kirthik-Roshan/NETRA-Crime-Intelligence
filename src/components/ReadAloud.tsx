"use client";
import { useCallback, useRef, useState } from "react";
import { Volume2, Square, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/useAppStore";
import { synthesizeSpeech } from "@/lib/ai-client";
import { naturalizeForSpeech } from "@/lib/answer-format";

/**
 * Small "Listen" button — reads `text` aloud via Catalyst Zia TTS in the
 * officer's current language. Graceful: if the Function/Zia returns nothing it
 * briefly shows "Voice unavailable" and resets; disabled when there's no text.
 */
export function ReadAloud({ text, label = "Listen" }: { text: string; label?: string }) {
  const lang = useAppStore((s) => s.lang);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const onClick = useCallback(async () => {
    if (state === "playing") {
      audioRef.current?.pause();
      audioRef.current = null;
      setState("idle");
      return;
    }
    if (state === "loading" || !text.trim()) return;
    setState("loading");
    // Never send raw Markdown / IDs / metadata to TTS — speak a concise,
    // naturalised version (FIR numbers → natural phrases, no audit IDs, etc.).
    const spoken = naturalizeForSpeech(text, lang === "kn" ? "kn" : "en");
    const b64 = await synthesizeSpeech(spoken, lang === "kn" ? "kn-IN" : "en-IN");
    if (!b64) {
      setState("error");
      setTimeout(() => setState("idle"), 1800);
      return;
    }
    const audio = new Audio(b64.startsWith("data:") ? b64 : `data:audio/wav;base64,${b64}`);
    audioRef.current = audio;
    audio.onended = () => setState("idle");
    audio.onerror = () => setState("idle");
    audio.play().then(() => setState("playing")).catch(() => setState("idle"));
  }, [state, text, lang]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!text.trim() || state === "loading"}
      className={cn("btn-ghost h-8 py-0 text-xs disabled:opacity-40", state === "playing" && "text-accent")}
      title={state === "playing" ? "Stop" : label}
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
