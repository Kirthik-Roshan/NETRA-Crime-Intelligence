"use client";
import { synthesizeSpeech } from "./ai-client";
import { synthesizeOfflineKannada } from "./offline-kannada-speech";
import { synthesizeNeuralKannada } from "./neural-kannada-speech";

export interface SpeechPlayback { stop(): void }
export type SpeechVoiceSource = "catalyst" | "device" | "neural-kn" | "basic-kn";
interface Callbacks {
  onStart?(): void; onEnd?(): void; onStop?(): void; onError?(message: string): void;
  onVoice?(source: SpeechVoiceSource): void; onProgress?(message: string): void;
}
let current: SpeechPlayback | null = null;

/** One output channel for the workspace, including requests still synthesizing. */
export function playSpeech(text: string, language: string, callbacks: Callbacks = {}): SpeechPlayback {
  current?.stop();
  window.speechSynthesis?.cancel();
  let finished = false;
  let fallbackStarted = false;
  let offlineStarted = false;
  const offlineAbort = new AbortController();
  let player: HTMLAudioElement | null = null;
  let utterance: SpeechSynthesisUtterance | null = null;
  let voiceTimer: ReturnType<typeof setTimeout> | undefined;
  let cloudTimer: ReturnType<typeof setTimeout> | undefined;
  let voicesChanged: (() => void) | undefined;
  const finish = (reason: "end" | "stop" | "error", message = "") => {
    if (finished) return;
    finished = true;
    offlineAbort.abort();
    clearTimeout(voiceTimer);
    clearTimeout(cloudTimer);
    if (voicesChanged) window.speechSynthesis?.removeEventListener("voiceschanged", voicesChanged);
    if (player) { player.onended = null; player.onerror = null; player.pause(); player.removeAttribute("src"); player.load(); }
    if (utterance) { utterance.onend = null; utterance.onerror = null; window.speechSynthesis?.cancel(); }
    if (current === control) current = null;
    if (reason === "end") callbacks.onEnd?.();
    else if (reason === "stop") callbacks.onStop?.();
    else callbacks.onError?.(message);
  };
  const control: SpeechPlayback = { stop: () => finish("stop") };
  current = control;

  const offlineFallback = async () => {
    if (finished || offlineStarted) return;
    offlineStarted = true;
    try {
      let source: SpeechVoiceSource = "neural-kn";
      let encoded: string;
      try {
        encoded = await synthesizeNeuralKannada(text, message => { if (!finished) callbacks.onProgress?.(message); }, offlineAbort.signal);
      } catch {
        if (finished) return;
        source = "basic-kn";
        callbacks.onProgress?.("Neural voice unavailable; preparing the basic Kannada fallback...");
        encoded = await synthesizeOfflineKannada(text);
      }
      if (finished) return;
      player = new Audio(encoded);
      player.playbackRate = 1; player.volume = 1; player.preservesPitch = true;
      player.onended = () => finish("end");
      player.onerror = () => finish("error", "The Kannada audio could not play. Check browser audio permissions and try again.");
      await player.play();
      if (!finished) { callbacks.onVoice?.(source); callbacks.onStart?.(); }
    } catch (error) {
      if (finished) return;
      finish("error", error instanceof Error && error.name === "NotAllowedError"
        ? "Playback was blocked. Allow audio for NETRA and press Listen again."
        : error instanceof Error ? error.message : "The on-device Kannada voice could not play.");
    }
  };

  const browserFallback = () => {
    if (finished || fallbackStarted) return;
    fallbackStarted = true;
    if (player) { player.onended = null; player.onerror = null; player.pause(); player.removeAttribute("src"); player.load(); }
    const engine = window.speechSynthesis;
    if (!engine || typeof SpeechSynthesisUtterance === "undefined") {
      if (/^kn(?:[-_]|$)/i.test(language)) void offlineFallback();
      else finish("error", "Speech playback is unavailable on this browser.");
      return;
    }
    const speak = () => {
      if (finished) return;
      clearTimeout(voiceTimer);
      if (voicesChanged) engine.removeEventListener("voiceschanged", voicesChanged);
      const requested = language.toLowerCase();
      const voices = engine.getVoices().filter(voice => voice.lang.toLowerCase().split(/[-_]/)[0] === requested.split("-")[0]);
      const ranked = [...voices].sort((a, b) => {
        const score = (voice: SpeechSynthesisVoice) => (voice.lang.toLowerCase().replace("_", "-") === requested ? 10 : 0)
          + (/natural|google|microsoft|online/i.test(voice.name) ? 4 : 0) + (!voice.localService ? 2 : 0);
        return score(b) - score(a);
      });
      if (!ranked.length) {
        if (/^kn(?:[-_]|$)/i.test(language)) void offlineFallback();
        else finish("error", `No ${language} voice is available. Catalyst speech is temporarily unavailable.`);
        return;
      }
      utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = ranked[0]; utterance.lang = language;
      utterance.rate = 0.96; utterance.pitch = 1; utterance.volume = 1;
      utterance.onstart = () => { if (!finished) { callbacks.onVoice?.("device"); callbacks.onStart?.(); } };
      utterance.onend = () => finish("end");
      utterance.onerror = () => {
        if (/^kn(?:[-_]|$)/i.test(language)) void offlineFallback();
        else finish("error", "The system voice could not play. Check the browser audio output and try again.");
      };
      engine.speak(utterance);
    };
    if (engine.getVoices().length) speak();
    else { voicesChanged = speak; engine.addEventListener("voiceschanged", speak, { once: true }); voiceTimer = setTimeout(speak, 700); }
  };

  void (async () => {
    try {
      // A stalled provider must not leave Kannada playback waiting indefinitely.
      // Promise.race also ignores late cloud audio after fallback has started.
      const encoded = /^kn(?:[-_]|$)/i.test(language)
        ? await Promise.race([
          synthesizeSpeech(text, language),
          new Promise<null>(resolve => { cloudTimer = setTimeout(() => resolve(null), 10000); }),
        ])
        : await synthesizeSpeech(text, language);
      clearTimeout(cloudTimer);
      if (finished) return;
      if (!encoded) { browserFallback(); return; }
      player = new Audio(encoded.startsWith("data:") ? encoded : `data:audio/wav;base64,${encoded}`);
      player.playbackRate = 1; player.defaultPlaybackRate = 1; player.volume = 1; player.preservesPitch = true;
      player.onended = () => finish("end");
      player.onerror = () => { if (player) { player.onerror = null; player.pause(); } browserFallback(); };
      await player.play();
      if (!finished) { callbacks.onVoice?.("catalyst"); callbacks.onStart?.(); }
    } catch (error) {
      if (finished) return;
      if (error instanceof Error && error.name === "NotAllowedError") finish("error", "Playback was blocked. Allow audio for NETRA and press Listen again.");
      else browserFallback();
    }
  })();
  return control;
}
