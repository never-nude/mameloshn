# Preparing the reference voice

The cloned voice is only as good as its reference clip. These scripts turn a long, informal reading
session (English asides, restarts, corrections included) into clean per-line takes and a few
candidate reference clips. They run from a private work folder that is **not** part of this repo,
e.g. `~/YiddishVoice/`, laid out as `raw/ clean/ segments/ ref/` plus `script.md`.

Inputs: a recording of one speaker reading a script written in YIVO romanization, and the script
itself as Markdown where every line to be read is in **bold** (tables or paragraphs; the text after
the bold is the English meaning). The reading here was the 259-line "Yiddish Voice Script".

```bash
cd ~/YiddishVoice
VENV=.venv-asr; uv venv $VENV --python 3.12; uv pip install --python $VENV/bin/python mlx-whisper numpy

# 1. lossless master, then a cleaned 24 kHz working copy (rumble filter, light denoise, loudness)
ffmpeg -i ~/Downloads/Yiddish.m4a -ac 1 -ar 16000 -c:a pcm_s16le raw/yiddish_master.wav
ffmpeg -i raw/yiddish_master.wav -af "highpass=f=70,afftdn=nr=10:nf=-40,loudnorm=I=-20:TP=-2:LRA=11" \
       -ar 24000 -ac 1 -c:a pcm_s16le clean/yiddish_clean.wav
# 2. pause map (silence >= 0.4 s below -38 dB) -> one "piece" of speech between pauses
ffmpeg -i clean/yiddish_clean.wav -af silencedetect=noise=-38dB:d=0.4 -f null - 2> clean/silences.txt
# 3. the script's bold lines -> script_lines.json (ids p<part>_<n>)
python3 extract_script_lines.py
# 4. transcribe the pieces (packed into ~28 s batches, German decoding, word timestamps)
ASR_MODEL=mlx-community/whisper-large-v3-turbo-q4 $VENV/bin/python transcribe_pieces.py   # -> clean/chunks.json
# 5. align pieces to script lines in order; mark asides and abandoned takes; keep the last full take
python3 align_takes.py                                                                    # -> clean/aligned.json
# 6. cut per-line WAVs, a takes-only master, a cut list, and reference candidates
$VENV/bin/python cut_takes.py                     # -> segments/<line>.wav, clean/cutlist.txt, ref/ref*.wav
```

How the alignment works: each piece's German-decoded transcript and each script line are reduced to
a phonetic key (`kh/ch → x`, `sh/sch → S`, `ts/z → s`, vowels collapsed), compared with a
subsequence similarity, and matched in script order by dynamic programming. Pieces that match
nothing (English asides, "start again", stray words) are dropped. When a line was read more than
once, the **last** take that covers at least 70 % of the line wins, which is how restarts and
corrections are resolved without listening.

Choosing references: `ref/ref_candidates.json` lists kept single-line takes of 6–14 s with the
highest match. Pick two or three with different moods (a warm closing line, a story sentence) and
write `ref/refs.json`:

```json
[
  {"name": "warm",  "path": "~/YiddishVoice/ref/ref1_p11_04.wav", "text": "Zol zayn mit mazl un mit brokhe."},
  {"name": "story", "path": "~/YiddishVoice/ref/ref2_p8_05.wav",  "text": "Nokh dem shpatsir geyen mir aheym. ..."}
]
```

`text` must be exactly what is spoken in the clip, in YIVO spelling; the generator respells it the
same way as the target lines. Then `export ZISKEIT_VOICE_REFS=~/YiddishVoice/ref/refs.json`.
