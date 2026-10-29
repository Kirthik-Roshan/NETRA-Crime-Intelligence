/* NETRA local Kannada neural speech. Runtime/model loaded from the same host.
 * Piper phonemizer: @diffusionstudio/piper-wasm 1.0.0.
 * Inference: onnxruntime-web 1.17.3, single-thread WASM (no COOP/COEP needed).
 */
"use strict";
let ready;
let phonemeOutput = [];
let queue = Promise.resolve();
const cancelled = new Set();
const base = new URL(".", self.location.href);
const progress = (id, message) => postMessage({ id, type: "progress", message });

async function modelBytes(id) {
  const url = new URL("voice/kn-v1.onnx", base).href;
  let cache;
  try { cache = await caches.open("netra-kannada-neural-v1"); } catch { /* session cache still works */ }
  const cached = cache && await cache.match(url);
  if (cached) { progress(id, "Loading cached Kannada voice..."); return cached.arrayBuffer(); }
  progress(id, "Downloading Kannada neural voice (64 MB, first use only)...");
  const response = await fetch(url);
  if (!response.ok) throw new Error("The Kannada neural voice download failed.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== 63516051) throw new Error("The Kannada voice download is incomplete.");
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), n => n.toString(16).padStart(2, "0")).join("");
  if (digest !== "bff423259625c0c1182e5b417f68560b6a55f3c4d27557a6abf2fbe51e7e00ee") throw new Error("The Kannada voice failed its integrity check.");
  if (cache) try { await cache.put(url, new Response(bytes)); } catch { /* quota/private mode: retain session only */ }
  return bytes;
}

async function initialize(id) {
  if (!ready) ready = (async () => {
    progress(id, "Preparing Kannada neural voice (about 90 MB on first use)...");
    importScripts(new URL("ort/ort.wasm.min.js", base).href, new URL("phonemize/piper_phonemize.js", base).href);
    ort.env.wasm.wasmPaths = new URL("ort/", base).href;
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.simd = true;
    ort.env.logLevel = "error";
    const [bytes, config, phonemizer] = await Promise.all([
      modelBytes(id),
      fetch(new URL("voice/kn-v1.json", base)).then(r => { if (!r.ok) throw new Error("Kannada voice configuration unavailable."); return r.json(); }),
      createPiperPhonemize({
        print: line => { try { phonemeOutput.push(JSON.parse(line)); } catch { /* runtime log */ } },
        printErr: () => {},
        locateFile: file => new URL("phonemize/" + file, base).href,
      }),
    ]);
    if (config.espeak?.voice !== "kn") throw new Error("Incorrect Kannada voice configuration.");
    progress(id, "Starting Kannada neural voice...");
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ["wasm"] });
    return { config, phonemizer, session };
  })().catch(error => { ready = null; throw error; });
  return ready;
}

function wav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2), view = new DataView(buffer);
  const text = (offset, value) => { for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i)); };
  text(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); text(8, "WAVE"); text(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, "data"); view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), true);
  return buffer;
}

async function speak({ id, text }) {
  if (cancelled.has(id)) return;
  if (typeof text !== "string" || !text.trim() || text.length > 2000) throw new Error("Use a shorter Kannada summary for speech.");
  const { config, phonemizer, session } = await initialize(id);
  if (cancelled.has(id)) return;
  progress(id, "Generating Kannada speech on this device...");
  phonemeOutput = [];
  const status = phonemizer.callMain(["--espeak_data", "/espeak-ng-data", "--language", "kn", "--input", JSON.stringify([{ text: text.normalize("NFC") }])]);
  const ids = phonemeOutput.flatMap(row => row.phoneme_ids || []);
  if (status !== 0 || !ids.length || ids.some(n => !Number.isInteger(n) || n < 0 || n >= config.num_symbols)) throw new Error("Kannada pronunciation processing failed.");
  const eos = config.phoneme_id_map.$[0], sentences = []; let current = [];
  for (const token of ids) { current.push(token); if (token === eos) { sentences.push(current); current = []; } }
  if (current.length) sentences.push(current);
  const rate = config.audio.sample_rate, chunks = [];
  for (const sentence of sentences) {
    if (cancelled.has(id)) return;
    const feeds = {
      input: new ort.Tensor("int64", BigInt64Array.from(sentence, BigInt), [1, sentence.length]),
      input_lengths: new ort.Tensor("int64", BigInt64Array.from([sentence.length], BigInt), [1]),
      scales: new ort.Tensor("float32", Float32Array.from([0.5, 1.08, 0.6]), [3]),
    };
    const result = await session.run(feeds);
    if (cancelled.has(id)) return;
    const samples = result[session.outputNames[0]].data;
    chunks.push(Float32Array.from(samples), new Float32Array(Math.round(rate * 0.24)));
  }
  const samples = new Float32Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0; for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
  const audio = wav(samples, rate);
  postMessage({ id, type: "audio", audio, sampleRate: rate, sentences: sentences.length, engine: "piper-kn-neural-v1" }, [audio]);
}

self.onmessage = event => {
  const message = event.data;
  if (message.type === "cancel") { cancelled.add(message.id); return; }
  queue = queue.then(() => speak(message)).catch(error => postMessage({ id: message.id, type: "error", message: String(error?.message || error) })).finally(() => cancelled.delete(message.id));
};
