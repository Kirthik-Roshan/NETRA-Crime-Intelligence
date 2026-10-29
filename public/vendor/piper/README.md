# NETRA on-device Kannada neural voice

Text is phonemized and synthesized inside a dedicated browser worker. No
speech text is sent to a new cloud provider. Runtime and model files are served
by NETRA's Catalyst Web Client hosting. The model is integrity-checked and
cached in CacheStorage where available. No query text or generated audio is
written to that persistent cache.

First use downloads approximately 93 MB (model, phonemizer and runtime);
subsequent requests reuse the in-memory engine and cached model. WASM runs
with one thread, so Catalyst does not need COOP/COEP header changes. Devices
with working native Kannada voices keep their existing voice path.

## Pinned components and credits

- ONNX Runtime Web 1.17.3, Microsoft, MIT (`ort/LICENSE`). Unmodified runtime
  files from https://www.npmjs.com/package/onnxruntime-web/v/1.17.3 .
- `@diffusionstudio/piper-wasm` 1.0.0, unmodified phonemizer runtime, from
  https://www.npmjs.com/package/@diffusionstudio/piper-wasm/v/1.0.0 .
  Piper phonemizer license in `phonemize/LICENSE`; eSpeak NG source/data
  originate at https://github.com/espeak-ng/espeak-ng .
- `micahchoo/piper-kn`, revision
  `c73546cb70012e28f6093a61c71162924398fee1`, Kannada SYSPIN male medium.
  Original model card and dataset/training credits in `voice/MODEL_CARD.md`.
  Model source: https://huggingface.co/micahchoo/piper-kn .
  SHA-256: `bff423259625c0c1182e5b417f68560b6a55f3c4d27557a6abf2fbe51e7e00ee`.

The model author's card limits this model to non-commercial/research use due
to the starting weights' research license. This is an experimental voice for
NETRA's synthetic-data hackathon prototype, not a model cleared for operational
departmental/commercial deployment. Retain these notices and model card.

The neural engine may still mispronounce names or abbreviations. Tests verify
actual model execution, Kannada phonemizer selection, playable audio, local
requests, cancellation and cache behavior; they do not guarantee perfect
pronunciation or substitute for a Kannada listener's assessment.
