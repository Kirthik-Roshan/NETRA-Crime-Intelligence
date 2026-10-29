"use client";

export type BrowserRecognition = {
  lang: string; processLocally?: boolean; interimResults: boolean; continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null; onerror: ((event?: { error?: string }) => void) | null;
  start(): void; stop(): void; abort(): void;
};
type RecognitionConstructor = {
  new(): BrowserRecognition;
  available?(options: { langs: string[]; processLocally: true }): Promise<string>;
  install?(options: { langs: string[] }): Promise<boolean>;
};

export function getSpeechRecognition(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const browser = window as unknown as Record<string, unknown>;
  return (browser.SpeechRecognition || browser.webkitSpeechRecognition || null) as RecognitionConstructor | null;
}

/** Never infer that the regular Web Speech API processes audio locally. */
export async function localSpeechSupport(language: "en" | "kn") {
  const Recognition = getSpeechRecognition();
  if (!Recognition?.available || !("processLocally" in new Recognition())) {
    return { Recognition: null, language: language === "kn" ? "kn-IN" : "en-IN", status: "unsupported" };
  }
  const choices = language === "kn" ? ["kn-IN"] : ["en-IN", "en-US"];
  let pendingPack: { language: string; status: string } | null = null;
  for (const lang of choices) {
    const status = await Recognition.available({ langs: [lang], processLocally: true });
    if (status === "available") return { Recognition, language: lang, status };
    if (["downloadable", "downloading"].includes(status) && !pendingPack) pendingPack = { language: lang, status };
  }
  if (pendingPack) return { Recognition, ...pendingPack };
  return { Recognition, language: choices[0], status: "unavailable" };
}

/** Must be called from an explicit Install button; no automatic pack download. */
export async function installSpeechPack(language: string): Promise<boolean> {
  const Recognition = getSpeechRecognition();
  if (!Recognition?.install) return false;
  return Recognition.install({ langs: [language] });
}

export function microphoneError(error: unknown): string {
  const name = error && typeof error === "object" && "name" in error ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone access is blocked. In Chrome, open this site's settings, allow Microphone, then reload NETRA.";
  if (name === "NotFoundError" || name === "DevicesNotFoundError") return "Chrome could not find an input microphone. Select your microphone in chrome://settings/content/microphone and check Ubuntu Sound → Input.";
  if (name === "NotReadableError" || name === "TrackStartError") return "Chrome could not open the microphone. Close other recording apps or tabs, check the selected input device, and retry.";
  if (name === "OverconstrainedError") return "The selected microphone cannot satisfy the recording settings. Select another input device and retry.";
  if (name === "AbortError") return "Microphone startup was interrupted. Try again.";
  return "Microphone recording could not start. Check this site's permission and the selected input device, then retry.";
}

export function recognitionError(code?: string): string {
  const errors: Record<string, string> = {
    "not-allowed": "Chrome blocked microphone recognition. Allow Microphone in this site's settings, then reload NETRA.",
    "service-not-allowed": "Chrome blocked the speech-recognition service. Check browser policy and on-device speech permissions; changing microphone volume will not fix this error.",
    "no-speech": "No speech was detected. Check the input microphone and try again.",
    "audio-capture": "Chrome could not capture microphone audio. Check the input device and close other recording apps.",
    "language-not-supported": "On-device recognition is unavailable for the selected language. Install its speech pack if Chrome offers one. No other language or remote service was substituted.",
    "network": "The browser speech engine could not start. Try again; NETRA has not substituted a remote recognition service.",
  };
  return errors[code || ""] || "On-device speech recognition failed. Try again or use Catalyst transcription when its service recovers.";
}
