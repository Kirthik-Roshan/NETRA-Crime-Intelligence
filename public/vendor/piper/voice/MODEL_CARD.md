---
language:
- kn
license: other
license_name: cc-by-4.0-data-and-blizzard-2013-research-base
pipeline_tag: text-to-speech
tags:
- piper
- vits
- onnx
- kannada
datasets:
- SYSPIN
---

# Piper voice: Kannada, SYSPIN male (medium)

A [Piper](https://github.com/OHF-Voice/piper1-gpl) voice that reads Kannada in
one male voice. It is a VITS model in ONNX, 22,050 Hz, single speaker, driven
by espeak-ng's `kn` phonemes like every Piper voice. It reads aloud in the
[md-translator](https://github.com/micahchoo/md-translator).

| File | What it is |
| --- | --- |
| `kn_IN-syspin_male-medium.onnx` | The model, 63.5 MB |
| `kn_IN-syspin_male-medium.onnx.json` | Its config: phoneme map, sample rate, inference scales |

```sh
python3 -m piper -m kn_IN-syspin_male-medium.onnx -f hello.wav -- 'ನಮಸ್ಕಾರ, ನೀವು ಹೇಗಿದ್ದೀರಿ?'
```

## How it was made

Fine-tuned from the English `en_US-lessac-medium` checkpoint
([rhasspy/piper-checkpoints](https://huggingface.co/datasets/rhasspy/piper-checkpoints))
on 3,157 clips (7.29 h) of the SYSPIN Kannada male speaker, for 75 epochs
(about 14,500 steps, batch 16, bf16) on one AMD Radeon 8060S. This file is
epoch 2239 of that run.

## How good it is

Measured on 63 held-out clips the voice never trained on, against the real
recordings of the same sentences. UTMOS predicts naturalness from 1 to 5; it
learned from English speech, so read it as a comparison with this speaker's
own recordings, not as an absolute score.

| | UTMOS |
| --- | --- |
| The real recordings | 3.76 |
| This voice | 3.20 |

It speaks about 4% faster than the speaker (length ratio 0.96, range 0.79 to
1.14). Listeners hear a few misplaced pauses and some roughness in the voice.
53 of the training transcripts (1.7%) carried SYSPIN's number markup, the
digits and then the spoken words, so text with that markup reads badly.

## Licence and credits

- **Recordings:** SYSPIN, Indian Institute of Science, Bengaluru, under
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  https://syspin.iisc.ac.in/datasets
- **Starting weights:** the lessac voice, trained on the Blizzard Challenge
  2013 Lessac recordings, which are under a
  [research licence](https://www.cstr.ed.ac.uk/projects/blizzard/2013/lessac_blizzard2013/license.html).
  Whether that licence binds weights fine-tuned from them is unsettled. Treat
  this voice as free for non-commercial use only.
- **Training code:** [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), GPL 3.0.
