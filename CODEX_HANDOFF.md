# CODEX_HANDOFF.md — cloned-voice clips for Ziskeit

Branch: `voice/cloned-yiddish-clips` (from `main` at a432acc). Commits: 1c5d3f2 (pipeline + docs), 4e7d8c7 (82 regenerated clips), aea4000 (web-app improvements), then this handoff. Pushed and merged to `main` for GitHub Pages at https://yiddish.wiki/.

## What changed

The web app's 82 fixed voice clips were re-rendered in a **cloned family voice** instead of the
Kokoro-82M English voice. Qwen3-TTS 0.6B Base (open weights, Apache-2.0, run locally with MLX on a
Mac) clones the timbre and pacing of a short reference recording of Mike reading the Yiddish script,
then reads each line in that voice. Every clip keeps its filename, container and sample rate, so no
resolver in `docs/app.js` changed. A reproducible pipeline, documentation and a per-clip provenance
manifest were added under `tools/voice/`. The service-worker cache name was bumped so installed
offline copies drop the old audio. The native Mac/iOS app is untouched (see Remaining work).

Why a local open model rather than a cloud voice API: the reference audio is a family member's
voice; keeping cloning on-device avoids uploading it, needs no API key, and the static site stays
free of secrets. The trade-off is that Qwen3-TTS has no Yiddish, so the YIVO text is respelled in
German orthography (table in `tools/voice/README.md`) and the output is checked by a Whisper
round-trip rather than by a Yiddish-aware model.

## Every affected file

| file | change |
|---|---|
| `docs/audio/phrases/*.m4a` (53) | regenerated, same names |
| `docs/audio/conversations/*.m4a` (29) | regenerated, same names |
| `docs/sw.js` | `CACHE_NAME` → `mameloshn-web-v6`; audio byte-range requests are now answered from the cache (full clip fetched once, sliced to a 206) so played clips work offline; shell precache fetched with `cache: "reload"`; runtime cache writes kept alive with `waitUntil`; 4 s network timeout with cache fallback |
| `docs/app.js` | cancelled playback (`null`) no longer counts as failed: no false "Audio is unavailable" toast and listening questions are not downgraded; offline-aware unavailable messages and a toast when "Hear the exchange" stops on a failed clip; Home notice credits the synthesized family voice and adds "How Ziskeit works" to reopen the welcome; recorded takes survive Previous/Next; Enter autorepeat and sub-400 ms double-taps cannot skip the feedback card; an unreadable saved state is kept as a copy instead of reported as "storage unavailable"; backup file input resets after import; smooth scrolls respect reduced motion; conversation "Say it like" relabelled "Southeastern family form" with a one-line note that the clip reads the reference spelling |
| `docs/styles.css` | opaque two-tone keyboard focus ring; 44 px tap targets for compact buttons; higher contrast for small `--clay` labels and rating sub-labels |
| `docs/conversation-data.js` | the `[family name]` placeholder line becomes "Zi hot geheysn…" with an invitation to add the relative's name, matching the clip |
| `docs/manifest.webmanifest` | `lang`, `dir` and three home-screen shortcuts (Zog mir, Practice, Family words) |
| `README.md` | "Audio" section now describes the cloned voice and links to `tools/voice/README.md` |
| `.gitignore` | ignores `tools/voice/.venv/`, `tools/voice/work/`, `tools/voice/refs*.json` |
| `tools/voice/README.md` | new: model, voice, normalization, pacing, codec, sample rate, env vars, commands |
| `tools/voice/extract_targets.js` | new: lists every playable clip from `course-data.js` / `conversation-data.js` |
| `tools/voice/targets.json` | new: the 82 targets (file, id, kind, text, meaning, speechCue) |
| `tools/voice/normalize.py` | new: YIVO → model spelling; phonetic key used for scoring |
| `tools/voice/asr_batch.py` | new: batched Whisper transcription of many short clips |
| `tools/voice/generate_clips.py` | new: synth → score → export pipeline, writes `manifest.json` |
| `tools/voice/verify_clips.py` | new: checks all 82 files exist, decode, and have sane length/level |
| `tools/voice/manifest.json` | new: provenance for every clip (text, model spelling, candidates, scores, models, reference hashes) |
| `tools/voice/reference/*` | new: scripts + README for turning a raw reading session into reference clips |
| `CODEX_HANDOFF.md` | this file |

Not committed on purpose: the recording, the cleaned takes and the reference clips (private voice
data, under `~/YiddishVoice/` on Mike's Mac), the Python virtualenv, and candidate WAVs.

## Exact generation and build commands

There is no build step for the site (GitHub Pages serves `docs/` as is). To regenerate audio, from
the repository root on an Apple Silicon Mac:

```bash
brew install ffmpeg uv
uv venv tools/voice/.venv --python 3.12
uv pip install --python tools/voice/.venv/bin/python mlx-audio mlx-whisper numpy

node tools/voice/extract_targets.js --check > tools/voice/targets.json
export ZISKEIT_VOICE_REFS=~/YiddishVoice/ref/refs.json        # private reference clips + transcripts
tools/voice/.venv/bin/python tools/voice/generate_clips.py --targets tools/voice/targets.json --out docs \
    --candidates 3 --temps 0.6 --lang german
tools/voice/.venv/bin/python tools/voice/verify_clips.py
```

Useful variants: `--dry-run` (show the model spelling per line), `--only id1,id2 --force`
(re-render a few), `--phase score` (re-pick from cached candidates). Full run time on an 8 GB
A18 Pro MacBook while other apps were running: about 1 h 50 min for 82 lines × 3 candidates (synthesis
~12-45 s per candidate, scoring ~5 s per candidate), then 10 minutes to re-render the ten weakest lines
with `--candidates 6 --temps 0.6,0.9`.

To rebuild the reference clips from a new recording, follow `tools/voice/reference/README.md`.

## Dependencies and environment variables (no secret values exist)

* macOS on Apple Silicon; Homebrew `ffmpeg` ≥ 6; `uv` (or Python 3.12); Node ≥ 18 (extractor only).
* Python: `mlx-audio` 0.6.x, `mlx-whisper` 0.4.x, `numpy`. Models download from Hugging Face on
  first use (~1.5 GB): `mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit`, `mlx-community/whisper-large-v3-turbo-q4`.
* `ZISKEIT_VOICE_REFS` (JSON list of reference clips) **or** `ZISKEIT_VOICE_REF` + `ZISKEIT_VOICE_REF_TEXT`;
  optional `ZISKEIT_TTS_MODEL`, `ZISKEIT_ASR_MODEL`, `HF_HOME`.

## Test results

* `node --check` on `docs/app.js`, `docs/sw.js`, `docs/conversation-data.js`, `docs/course-data.js`: pass; `docs/manifest.webmanifest` parses.
* `python3 tools/voice/verify_clips.py`: 82 targets, 0 problems (every clip decodes as mono 24 kHz AAC with a plausible length and level).
* Round-trip scores (`tools/voice/manifest.json`): mean 0.93, median 0.94, minimum 0.75, none below 0.70. References chosen: conv 37, proverb 23, warm 22.
* Pilot (6 phrases × 3 references × 2 temperatures, scored one clip at a time): mean best score 0.98; by reference proverb 0.87, warm 0.83, conv 0.82; temperature 0.6 averaged 0.86 against 0.82 at 0.9. Feeding raw YIVO spelling with automatic language detection lost the first half of the long dialogue line; the German respelling did not.
* Browser, Chromium inside the Claude desktop app against a local static copy of `docs/`: the home page loads and the welcome dismisses; "Natural pace" plays a conversation line (one 200, then 206 range requests); "Hear the exchange" plays all four lines; with the v6 service worker active all four clips are stored whole in Cache Storage and served as 206 slices; with the server stopped the shell loads and a cached line plays with no error toast; the Home notice and "How Ziskeit works" button render with a 2 px gap; the spelling note shows only on a conversation's first line; the only console error is the missing favicon.
* Not tested: iOS Safari (it probes `Range: bytes=0-1`; check Add to Home Screen plus Airplane Mode after deploy), Firefox, screen readers, and the native Xcode build, which is untouched.

## Known limitations

* **Pronunciation is German-shaped.** The model reads a German respelling; vowels and /x/ are
  close, but word-initial *kh*, *h* between vowels, and the *ey* diphthong can drift. The reference
  voice is authentic; the phonology is an approximation. A Yiddish-aware check does not exist in the
  pipeline: the round-trip score measures intelligibility to Whisper-German, not dialect accuracy.
* **Reference quality bounds the clone.** The source recording was a 24 kbps, 16 kHz phone recording
  with room noise; the clone inherits some of that character.
* **Only 19 of the 82 app lines were in the reading script**, so no human take exists for the rest;
  all 82 shipped clips are synthetic.
* `family-photo-photo-4` contains the placeholder `[family name]`; its clip says the line without
  it ("Zi hot geheysn.").
* Sound-map clips (`sound-kh` …) are rendered from carrier syllables (`akh`, `tsa`, `sha`, `zha`).
* Browser HTTP caching on GitHub Pages (`max-age=600`) can serve old clips for up to ten minutes
  after deploy; the service-worker bump handles the SW cache but not that layer.
* **Deployment rule:** clips are now cache-first in the service worker, so any change to
  `docs/audio/**` must ship with a `CACHE_NAME` bump in `docs/sw.js`.
* The score threshold is heuristic. After the re-render every clip scores ≥ 0.75 (mean 0.93); the
  lowest are `vi-heystu`, `ikh-farshtey-nisht` and `soup-soup-3`, where Whisper normalises the Yiddish
  to the nearest German words ("Wie heißt du?", "Ich verstehe nicht"), so a low score there may be
  the scorer, not the clip. Listen to those first.

## Remaining work

1. **Native app playback.** `Mameloshn/Services/SpeechCoach.swift` still speaks `speechCue` with
   Apple's en-US voice; the native app bundles no audio. Decision needed from Mike before wiring the
   m4a clips into the Xcode target (bundle `docs/audio/**` as resources, play with `AVAudioPlayer`,
   fall back to `AVSpeechSynthesizer` when a clip is missing). Not started, by instruction.
2. **Listening review.** No one has listened to the clips yet. The manifest lists each clip's score
   and what Whisper heard; start with the lowest-scoring entries.
3. **Dialect pass.** Compare a handful of clips against the family pronunciation notes in
   `course-data.js` (`dialectNote`, variants) and adjust `normalize.py` rules if a pattern is off.
4. Optional: fine-tune Qwen3-TTS on the 11 minutes of aligned takes (`~/YiddishVoice/segments/`)
   for truly Yiddish phonology; the aligned data is ready, the training recipe is not in this repo.

## Exact next step for the receiving developer

1. `git checkout voice/cloned-yiddish-clips` and run
   `python3 tools/voice/verify_clips.py` (needs ffmpeg) — expect `82 targets, 0 problem(s)`.
2. Serve `docs/` locally (`python3 -m http.server -d docs 8000`), open the site, play a few phrases
   and one full conversation exchange; confirm the service worker updates to `mameloshn-web-v5`.
3. Open `tools/voice/manifest.json`, sort clips by `chosen.score`, and listen to the bottom ten.
   Re-render any clip with `generate_clips.py --only <id> --force` (optionally a different
   `--temps`), or hand-edit its `ttsOverride` in `targets.json`.
4. Merge to `main` to deploy via GitHub Pages.
