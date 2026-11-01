# Ziskeit voice clips: cloned-voice generation

This folder holds the reproducible pipeline that renders every fixed voice clip the web app plays
(`docs/audio/phrases/*.m4a`, `docs/audio/conversations/*.m4a`). The clips are synthesized in a
**cloned voice**: Qwen3-TTS copies the timbre, pace and warmth of a short reference recording of a
family speaker and reads each Yiddish line in it. Nothing runs at runtime; the site stays static.

## Model and voice

| | |
|---|---|
| TTS model | `mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit` (Qwen3-TTS 0.6B Base, Apache-2.0, 8-bit MLX weights, ~0.9 GB). The bf16 variant `…-Base-bf16` sounds the same but needs ~2 GB more RAM. |
| Cloning mode | In-context voice cloning: the model gets the reference WAV **and its exact transcript**, then continues in that voice. No fine-tuning. |
| Reference voice | A private 6–14 s clip of the speaker reading one script line, mono 24 kHz WAV, with the words spoken given verbatim. It is **not committed**; see Environment below. Several references can be supplied and the best per phrase is chosen automatically. |
| Scoring model | `mlx-community/whisper-large-v3-turbo-q4` (Whisper large-v3-turbo, 4-bit MLX), used only to pick the best candidate per phrase. |
| Language code | `german`. Qwen3-TTS has no Yiddish; German letter-to-sound rules are the closest fit, so the YIVO text is respelled (next section). |
| Runtime | Apple Silicon, macOS, Python 3.12, MLX. Runs on an 8 GB machine with one model loaded at a time. |

## Input normalization (YIVO → model spelling)

`normalize.py` rewrites the app's YIVO romanization (`transliteration` field) into German
orthography in one greedy left-to-right pass, so each sound is spelled the way the model will read
it. Capitalisation and punctuation are kept; `[bracketed placeholders]` are dropped; `…` becomes `...`.

| YIVO | spoken as | model text | example |
|---|---|---|---|
| kh | /x/ | ch | *mishpokhe* → *mischpoche* |
| sh | /ʃ/ | sch | *sholem* → *scholem* |
| tsh | /tʃ/ | tsch | *tshaynik* → *tschainik* |
| zh / dzh | /ʒ/ /dʒ/ | sch / dsch | *zhurnal* → *schurnal* |
| ts | /ts/ | z | *tsvey* → *zwee* |
| z | /z/ | s | *zeyde* → *seede* |
| s between vowels | /s/ | ss | *khasene* → *chassene* |
| v | /v/ | w | *vaser* → *wasser* |
| y (consonant) | /j/ | j | *yidish* → *jidisch* |
| ay | /aɪ/ | ai | *mayn* → *main* |
| ey | /eɪ/ | ee | *geyt* → *geet* |
| oy | /ɔɪ/ | oi | *oy* → *oi* |

Run `python tools/voice/normalize.py "Vi geyt es aykh?"` to see any line's model spelling, or
`generate_clips.py --dry-run` for every target. Known limits: word-initial *kh* (`ch`) may be read
/ç/ or /k/ by the German rules; an *h* between vowels (*aher*, *gehat*) may be silent; *ey* is
rendered as a long /eː/ rather than a true diphthong. Sound-map clips (`sound-kh` …) are too short to
synthesize alone, so `extract_targets.js` gives them a carrier syllable (`kh` → *akh*, `ts` → *tsa*,
`sh` → *sha*, `zh` → *zha*; the vowels are spoken as themselves).

## Pacing, loudness and codec

* **Pacing** comes from the reference clip: the model imitates its tempo and phrasing, so choose a
  reference read at the speed the app should teach. There is no speed parameter. The app's *Slow*
  button plays the same file at `playbackRate 0.78` with pitch preserved (`docs/app.js`), so no slow
  files are rendered.
* **Candidates**: each phrase is synthesized `--candidates` times (references × `--temps`, default
  temperatures 0.6 and 0.9, deterministic seeds). Whisper transcribes every candidate in German, one
  call per clip (batching several clips into one window made Whisper drop or merge them); the
  transcript and the intended text are reduced to a phonetic key and compared. Clips whose length is
  implausible for the text or that Whisper hears as silence are penalised. The best candidate wins.
* **Level**: speech frames are set to −23 dBFS RMS with a −3 dBFS peak ceiling, matching the loudness
  of the previous Kokoro clips (about −22 LUFS). Leading/trailing silence is trimmed, then 60 ms of
  lead-in and 150 ms of tail are added (the *Play exchange* feature waits for `ended`, so long tails
  would slow dialogues).
* **Codec**: AAC-LC 64 kb/s, mono, **24 000 Hz**, `.m4a` with `faststart`, encoded by ffmpeg. Same
  container and sample rate as before, so no app code changes are needed to play them.
* **Manifest**: `manifest.json` records, per clip, the intended text, the model spelling, every
  candidate's transcript and score, the chosen candidate, duration, the models and the reference
  clips (by name, transcript and content hash). It is the provenance record `AUDIO_PLAN.md` asks for.

## Environment

No secrets are involved. These variables point at private local files that stay out of git:

| variable | meaning |
|---|---|
| `ZISKEIT_VOICE_REF` | path to the reference WAV (mono, 24 kHz, 6–14 s) |
| `ZISKEIT_VOICE_REF_TEXT` | the exact YIVO words spoken in that WAV |
| `ZISKEIT_VOICE_REFS` | alternatively, a JSON file `[{"name","path","text"}, …]` with several references |
| `ZISKEIT_TTS_MODEL` | optional override of the TTS model id |
| `ZISKEIT_ASR_MODEL` | optional override of the Whisper model id |
| `HF_HOME` | optional Hugging Face cache location (models total ≈ 1.5 GB) |

Dependencies: macOS on Apple Silicon, `ffmpeg` (Homebrew), `uv` or any Python 3.12, Node ≥ 18
(only for `extract_targets.js`). Python packages: `mlx-audio`, `mlx-whisper`, `numpy`.

## Commands (from the repository root)

```bash
# one-time setup
brew install ffmpeg uv
uv venv tools/voice/.venv --python 3.12
uv pip install --python tools/voice/.venv/bin/python mlx-audio mlx-whisper numpy

# 1. list every clip the app plays, straight from the data files
node tools/voice/extract_targets.js --check > tools/voice/targets.json

# 2. point at the private reference voice
export ZISKEIT_VOICE_REFS=~/YiddishVoice/ref/refs.json     # or ZISKEIT_VOICE_REF + ZISKEIT_VOICE_REF_TEXT

# 3. preview the model spelling, then render everything into docs/audio/**
tools/voice/.venv/bin/python tools/voice/generate_clips.py --dry-run
tools/voice/.venv/bin/python tools/voice/generate_clips.py --targets tools/voice/targets.json --out docs

# re-render a few clips only, or just re-score/export existing candidates
tools/voice/.venv/bin/python tools/voice/generate_clips.py --only gut-morgn,vi-geyt-es --force
tools/voice/.venv/bin/python tools/voice/generate_clips.py --phase score
```

Candidates are cached in `tools/voice/work/` (ignored by git), so a re-run only synthesizes what is
missing; `--force` regenerates. After replacing clips, bump `CACHE_NAME` in `docs/sw.js` so
offline installs drop the old audio (clips are cached network-first, not precached).

## Preparing a reference clip

See `reference/README.md`: how the raw family recording was cleaned with ffmpeg, split at pauses,
transcribed with Whisper, aligned to the reading script, and cut into per-line takes from which the
reference clips were chosen.
