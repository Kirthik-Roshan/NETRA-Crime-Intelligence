"use client";

type LocalSpeechEngine = {
  loadVoice(name: string, callback: (success: boolean) => void): void;
  speak(text: string, options: Record<string, unknown>, callback: (success: boolean, id: number, audio?: string) => void): number;
};

let ready: Promise<LocalSpeechEngine> | null = null;

/** A same-origin, on-device Kannada voice for laptops without a system voice.
 * No text is sent to a third-party service. Catalyst remains the primary TTS.
 */
function loadKannadaVoice(): Promise<LocalSpeechEngine> {
  if (ready) return ready;
  ready = new Promise<LocalSpeechEngine>((resolve, reject) => {
    const base = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true" ? "/app" : "";
    const script = document.createElement("script");
    const timer = setTimeout(() => fail(), 20000);
    const fail = () => {
      clearTimeout(timer);
      script.remove();
      reject(new Error("The bundled Kannada voice could not load. Reload NETRA and try again."));
    };
    script.src = `${base}/vendor/mespeak/mespeak.js`;
    script.async = true;
    script.onerror = fail;
    script.onload = () => {
      const engine = (window as Window & { meSpeak?: LocalSpeechEngine }).meSpeak;
      if (!engine) { fail(); return; }
      engine.loadVoice("kn", success => {
        clearTimeout(timer);
        if (success) resolve(engine);
        else fail();
      });
    };
    document.head.appendChild(script);
  }).catch(error => { ready = null; throw error; });
  return ready;
}

export async function synthesizeOfflineKannada(text: string): Promise<string> {
  const engine = await loadKannadaVoice();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("The on-device Kannada voice timed out. Try a shorter answer.")), 30000);
    engine.speak(text, { voice: "kn", rawdata: "mime", speed: 155, pitch: 48, amplitude: 100 }, (success, _id, audio) => {
      clearTimeout(timer);
      if (success && typeof audio === "string" && /^data:audio\/[\w.+-]+;base64,/i.test(audio)) resolve(audio);
      else reject(new Error("The on-device Kannada voice could not generate audio."));
    });
  });
}
