"""Whisper (mlx-whisper) transcription helpers.

transcribe_each(): one Whisper call per clip. This is what the clip scorer uses: it is reliable for
short synthetic clips (about 5 s per clip on an 8 GB Mac).

transcribe_many(): packs clips into ~28 s batches separated by 0.5 s of silence, with word
timestamps mapped back to clips by midpoint. Far fewer Whisper windows, fine for consecutive speech
from one recording, but NOT for unrelated short clips: Whisper then tends to stop early or hand one
clip's words to its neighbour (verified in the pilot), so the scorer no longer uses it.
"""
import subprocess, numpy as np

SR = 16000
DEFAULT_ASR = "mlx-community/whisper-large-v3-turbo-q4"

def load_16k(path: str) -> np.ndarray:
    pcm = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                         capture_output=True, check=True).stdout
    return np.frombuffer(pcm, np.float32)

def transcribe_each(paths, language="de", model=DEFAULT_ASR, progress=None):
    """Return a list (same order as paths) of {text, logprob, no_speech}, one Whisper call per clip."""
    import mlx_whisper
    out = []
    for i, p in enumerate(paths):
        r = mlx_whisper.transcribe(load_16k(p), path_or_hf_repo=model, language=language,
                                   condition_on_previous_text=False, temperature=0.0, verbose=None)
        segs = r.get("segments", [])
        out.append({"text": r["text"].strip(),
                    "logprob": round(float(np.mean([s["avg_logprob"] for s in segs])), 3) if segs else -9.0,
                    "no_speech": round(float(np.mean([s["no_speech_prob"] for s in segs])), 3) if segs else 1.0})
        if progress and ((i + 1) % 10 == 0 or i + 1 == len(paths)):
            progress(i + 1, len(paths))
    return out

def transcribe_many(paths, language="de", model=DEFAULT_ASR, gap=0.5, max_batch=28.0, progress=None):
    """Return a list (same order as paths) of {text, logprob, no_speech}."""
    import mlx_whisper
    clips = [load_16k(p) for p in paths]
    batches, cur, cur_len = [], [], 0.0
    for i, x in enumerate(clips):
        d = len(x) / SR + gap
        if cur and cur_len + d > max_batch:
            batches.append(cur); cur, cur_len = [], 0.0
        cur.append(i); cur_len += d
    if cur:
        batches.append(cur)
    out = [{"text": "", "logprob": -9.0, "no_speech": 1.0} for _ in paths]
    for bi, idx in enumerate(batches):
        parts, spans, t = [], [], 0.0
        for i in idx:
            x = clips[i]; spans.append((i, t, t + len(x) / SR))
            parts += [x, np.zeros(int(gap * SR), np.float32)]; t += len(x) / SR + gap
        r = mlx_whisper.transcribe(np.concatenate(parts), path_or_hf_repo=model, language=language,
                                   word_timestamps=True, condition_on_previous_text=False, temperature=0.0, verbose=None)
        words = {i: [] for i in idx}; lps = {i: [] for i in idx}; nsp = {i: [] for i in idx}
        for s in r["segments"]:
            for w in s.get("words", []):
                mid = (w["start"] + w["end"]) / 2
                i = min(spans, key=lambda sp: 0 if sp[1] <= mid <= sp[2] else min(abs(mid - sp[1]), abs(mid - sp[2])))[0]
                words[i].append(w["word"]); lps[i].append(s["avg_logprob"]); nsp[i].append(s["no_speech_prob"])
        for i in idx:
            out[i] = {"text": "".join(words[i]).strip(),
                      "logprob": round(float(np.mean(lps[i])), 3) if lps[i] else -9.0,
                      "no_speech": round(float(np.mean(nsp[i])), 3) if nsp[i] else 1.0}
        if progress:
            progress(bi + 1, len(batches))
    return out
