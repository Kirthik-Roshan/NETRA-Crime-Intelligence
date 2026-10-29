"use client";

type PendingSpeech = {
  resolve(audio: string): void;
  reject(error: Error): void;
  progress?(message: string): void;
  timer: ReturnType<typeof setTimeout>;
  cleanup?(): void;
};
let worker: Worker | null = null;
let sequence = 0;
const pending = new Map<number, PendingSpeech>();

function resetWorker(message: string) {
  worker?.terminate();
  worker = null;
  for (const task of pending.values()) { clearTimeout(task.timer); task.cleanup?.(); task.reject(new Error(message)); }
  pending.clear();
}

/** Kannada VITS inference stays on the device. All model/runtime files are
 * hosted with NETRA; only public model bytes are cached, never speech text.
 */
export function synthesizeNeuralKannada(text: string, progress?: (message: string) => void, signal?: AbortSignal): Promise<string> {
  if (signal?.aborted) return Promise.reject(new DOMException("Speech stopped", "AbortError"));
  if (!worker) {
    const base = process.env.NEXT_PUBLIC_CATALYST_WEB_CLIENT === "true" ? "/app" : "";
    worker = new Worker(`${base}/vendor/piper/worker.js`);
    worker.onerror = () => resetWorker("The Kannada neural voice could not start in this browser.");
    worker.onmessage = event => {
      const message = event.data;
      const task = pending.get(message.id);
      if (!task) return;
      if (message.type === "progress") { task.progress?.(message.message); return; }
      clearTimeout(task.timer);
      task.cleanup?.();
      pending.delete(message.id);
      if (message.type === "audio" && message.audio instanceof ArrayBuffer) {
        const bytes = new Uint8Array(message.audio);
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        task.resolve(`data:audio/wav;base64,${btoa(binary)}`);
      } else task.reject(new Error(message.message || "Kannada neural speech generation failed."));
    };
  }
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resetWorker("The Kannada neural voice download took too long. Try again on a faster connection."), 180000);
    const stop = () => {
      clearTimeout(timer);
      pending.delete(id);
      worker?.postMessage({ type: "cancel", id });
      reject(new DOMException("Speech stopped", "AbortError"));
    };
    pending.set(id, { resolve, reject, progress, timer, cleanup: () => signal?.removeEventListener("abort", stop) });
    signal?.addEventListener("abort", stop, { once: true });
    worker!.postMessage({ id, text });
  });
}
