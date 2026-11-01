#!/usr/bin/env python3
"""Generate Ziskeit voice clips in a cloned voice and export them as app-ready m4a files.

Pipeline (one model in memory at a time, so it fits an 8 GB Mac):
  1. synth : for every target phrase, synthesize N candidates with Qwen3-TTS 0.6B Base (mlx-audio),
             cloning the voice from a reference clip + its exact transcript (in-context cloning).
  2. score : transcribe every candidate with Whisper, one call per clip (German decoding, the closest
             the model has to Yiddish), and score it against the intended text with a phonetic key;
             penalise clips whose length is implausible or that Whisper hears as silence.
  3. export: trim, level to the loudness of the existing clips, add a short lead-in/tail, encode
             mono 24 kHz AAC 64 kb/s m4a under docs/audio/..., and write tools/voice/manifest.json.

Environment variables (no secrets; paths to private files that are NOT committed):
  ZISKEIT_VOICE_REF        path to the reference WAV (6-14 s of the speaker, mono, 24 kHz)
  ZISKEIT_VOICE_REF_TEXT   the exact YIVO-romanized words spoken in that WAV
  ZISKEIT_VOICE_REFS       alternatively, a JSON file: [{"name": "...", "path": "...", "text": "..."}, ...]
  ZISKEIT_TTS_MODEL        default mlx-community/Qwen3-TTS-12Hz-0.6B-Base-bf16
  ZISKEIT_ASR_MODEL        default mlx-community/whisper-large-v3-turbo
  HF_HOME                  optional Hugging Face cache location (models are ~2.5 GB in total)

Typical run from the repository root:
  tools/voice/.venv/bin/python tools/voice/generate_clips.py --targets tools/voice/targets.json --out docs
"""
import argparse, datetime, hashlib, json, os, re, subprocess, sys, time, wave
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from normalize import tts_text, phonetic_key, similarity          # noqa: E402
from asr_batch import transcribe_each, DEFAULT_ASR                 # noqa: E402

SR = 24000
DEFAULT_TTS = "mlx-community/Qwen3-TTS-12Hz-0.6B-Base-8bit"   # bf16 variant needs ~2 GB more RAM
TARGET_RMS_DB = -23.0      # the existing Kokoro clips measure about -22 LUFS integrated
PEAK_DB = -3.0
LEAD_S, TAIL_S = 0.06, 0.15
SEC_PER_CHAR, SEC_BASE = 0.09, 0.3   # plausible clip length = SEC_PER_CHAR * letters + SEC_BASE

# ---------------------------------------------------------------- audio helpers
def read_wav(p):
    with wave.open(p) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2, p
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768, w.getframerate()

def write_wav(p, x, sr=SR):
    with wave.open(p, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())

def trim_silence(x, sr=SR, thresh_db=-42.0, frame_ms=20):
    n = int(sr * frame_ms / 1000)
    if len(x) < 2 * n:
        return x
    frames = x[: len(x) // n * n].reshape(-1, n)
    db = 20 * np.log10(np.sqrt((frames ** 2).mean(axis=1)) + 1e-9)
    loud = np.where(db > thresh_db)[0]
    if not len(loud):
        return x
    a = max(0, loud[0] * n - int(0.03 * sr)); b = min(len(x), (loud[-1] + 1) * n + int(0.05 * sr))
    return x[a:b]

def level(x, sr=SR):
    """Gain to TARGET_RMS_DB measured on the louder half of 20 ms frames, limited to PEAK_DB."""
    n = int(sr * 0.02); frames = x[: len(x) // n * n].reshape(-1, n)
    rms = np.sqrt((frames ** 2).mean(axis=1))
    if len(rms) > 4:
        rms = rms[rms >= np.median(rms)]
    cur = 20 * np.log10(rms.mean() + 1e-9)
    g = 10 ** ((TARGET_RMS_DB - cur) / 20)
    peak = np.abs(x).max() * g; lim = 10 ** (PEAK_DB / 20)
    if peak > lim:
        g *= lim / peak
    return x * g

def finish(x, sr=SR):
    x = level(trim_silence(x, sr), sr)
    return np.concatenate([np.zeros(int(LEAD_S * sr), np.float32), x, np.zeros(int(TAIL_S * sr), np.float32)])

def to_m4a(wav_path, m4a_path):
    os.makedirs(os.path.dirname(m4a_path), exist_ok=True)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", wav_path, "-ar", str(SR), "-ac", "1",
                    "-c:a", "aac", "-b:a", "64k", "-movflags", "+faststart", m4a_path], check=True)

def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()[:16]

# ---------------------------------------------------------------- configuration
def load_references(args):
    refs = []
    if args.refs or os.environ.get("ZISKEIT_VOICE_REFS"):
        for r in json.load(open(args.refs or os.environ["ZISKEIT_VOICE_REFS"])):
            refs.append({"name": r["name"], "path": os.path.expanduser(r["path"]), "text": r["text"]})
    elif os.environ.get("ZISKEIT_VOICE_REF"):
        refs.append({"name": "ref", "path": os.path.expanduser(os.environ["ZISKEIT_VOICE_REF"]),
                     "text": os.environ.get("ZISKEIT_VOICE_REF_TEXT", "")})
    if not refs:
        sys.exit("No reference voice: set ZISKEIT_VOICE_REF + ZISKEIT_VOICE_REF_TEXT or ZISKEIT_VOICE_REFS (see docstring).")
    for r in refs:
        if not os.path.exists(r["path"]):
            sys.exit(f"reference audio not found: {r['path']}")
        if not r["text"].strip():
            sys.exit(f"reference {r['name']} has no transcript; in-context cloning needs the exact words spoken.")
        r["tts"] = r["text"] if args.raw else tts_text(r["text"]); r["sha256"] = sha256(r["path"])
    return refs

def candidate_configs(refs, temps, n):
    cfgs = [{"ref": r, "temp": t} for t in temps for r in refs]
    return cfgs[:n] if n else cfgs

def load_targets(args):
    targets = json.load(open(args.targets))
    if args.kinds:
        targets = [t for t in targets if t.get("kind", "phrase") in args.kinds.split(",")]
    if args.only:
        wanted = set(args.only.split(",")); targets = [t for t in targets if t["id"] in wanted]
    for t in targets:
        source = t.get("ttsOverride") or t["text"]
        t["spoken"] = re.sub(r"\s*\[[^\]]*\]", "", source).strip()   # what the clip should actually say
        t["tts"] = source if args.raw else tts_text(source)
    return targets

def cand_path(work, t, k):
    return os.path.join(work, f"{t['id']}.c{k}.wav")

# ---------------------------------------------------------------- phases
def synth(targets, cfgs, args):
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    t0 = time.time(); model = load_model(args.tts_model)
    print(f"[synth] loaded {args.tts_model} in {time.time()-t0:.1f}s; languages {model.get_supported_languages()}", flush=True)
    todo = [(t, k) for t in targets for k in range(len(cfgs)) if args.force or not os.path.exists(cand_path(args.work, t, k))]
    print(f"[synth] {len(todo)} candidates to generate for {len(targets)} targets", flush=True)
    for n, (t, k) in enumerate(todo, 1):
        cfg = cfgs[k]
        seed = int(hashlib.sha1(f"{args.seed}:{t['id']}:{k}".encode()).hexdigest(), 16) % (2 ** 31)
        mx.random.seed(seed)
        t1 = time.time()
        res = list(model.generate(text=t["tts"], ref_audio=cfg["ref"]["path"], ref_text=cfg["ref"]["tts"],
                                  lang_code=args.lang, temperature=cfg["temp"]))
        x = np.concatenate([np.array(r.audio).astype(np.float32).reshape(-1) for r in res])
        sr = res[0].sample_rate
        if sr != SR:
            sys.exit(f"unexpected model sample rate {sr}")
        write_wav(cand_path(args.work, t, k), x)
        print(f"[synth] {n}/{len(todo)} {t['id']} c{k} ({cfg['ref']['name']} T={cfg['temp']}): {len(x)/SR:.2f}s audio in {time.time()-t1:.1f}s", flush=True)
    del model

def score(targets, cfgs, args):
    items = [(t, k) for t in targets for k in range(len(cfgs)) if os.path.exists(cand_path(args.work, t, k))]
    paths = [cand_path(args.work, t, k) for t, k in items]
    print(f"[score] transcribing {len(paths)} candidates with {args.asr_model}", flush=True)
    asr = transcribe_each(paths, language="de", model=args.asr_model,
                          progress=lambda i, n: print(f"[score] {i}/{n} transcribed", flush=True))
    results = {}
    for (t, k), p, r in zip(items, paths, asr):
        x, sr = read_wav(p); dur = len(trim_silence(x, sr)) / sr
        letters = sum(c.isalpha() for c in t["spoken"]); expected = SEC_PER_CHAR * letters + SEC_BASE
        sim = similarity(phonetic_key(r["text"]), phonetic_key(t["spoken"]))
        penalty = 0.0
        if not (0.45 * expected <= dur <= 2.2 * expected):
            penalty += 0.35
        if r["no_speech"] > 0.5 or not r["text"]:
            penalty += 0.5
        results.setdefault(t["id"], []).append({"k": k, "ref": cfgs[k]["ref"]["name"], "temp": cfgs[k]["temp"],
                                                 "transcript": r["text"], "sim": round(sim, 3), "dur": round(dur, 2),
                                                 "expected": round(expected, 2), "score": round(sim - penalty, 3)})
    return results

def export(targets, cfgs, results, refs, args):
    manifest_path = args.manifest
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {"clips": []}
    by_file = {c["file"]: c for c in manifest.get("clips", [])}
    scores = []
    for t in targets:
        cands = results.get(t["id"])
        if not cands:
            print(f"[export] {t['id']}: no candidates", flush=True); continue
        best = max(cands, key=lambda c: (c["score"], -c["temp"]))
        x, sr = read_wav(cand_path(args.work, t, best["k"]))
        y = finish(x, sr); tmp = os.path.join(args.work, f"{t['id']}.final.wav"); write_wav(tmp, y)
        out = os.path.join(args.out, t["file"]); to_m4a(tmp, out)
        by_file[t["file"]] = {"file": t["file"], "id": t["id"], "kind": t.get("kind", "phrase"), "text": t["text"],
                              "spoken": t["spoken"], "tts_input": t["tts"], "chosen": {k: v for k, v in best.items() if k != "k"},
                              "candidates": cands, "duration": round(len(y) / SR, 2),
                              "generated": datetime.date.today().isoformat()}
        scores.append(best["score"])
        print(f"[export] {t['file']}  score {best['score']:.2f}  {len(y)/SR:.2f}s  <- {best['ref']} T={best['temp']}  heard: {best['transcript']}", flush=True)
    manifest.update({
        "tts_model": args.tts_model, "asr_model": args.asr_model, "lang_code": args.lang, "temps": args.temps,
        "references": [{"name": r["name"], "sha256": r["sha256"], "text": r["text"], "tts_input": r["tts"]} for r in refs],
        "codec": "AAC 64 kb/s, mono, 24 kHz, m4a (faststart)", "level": f"{TARGET_RMS_DB} dBFS RMS (speech frames), peak {PEAK_DB} dBFS",
        "lead_tail_s": [LEAD_S, TAIL_S], "clips": sorted(by_file.values(), key=lambda c: c["file"]),
    })
    json.dump(manifest, open(manifest_path, "w"), ensure_ascii=False, indent=1)
    if scores:
        print(f"[export] {len(scores)} clips written; mean round-trip score {np.mean(scores):.2f}, min {min(scores):.2f}", flush=True)

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--targets", default=os.path.join(HERE, "targets.json"))
    ap.add_argument("--out", default=os.path.join(HERE, "..", "..", "docs"))
    ap.add_argument("--work", default=os.path.join(HERE, "work"))
    ap.add_argument("--manifest", default=os.path.join(HERE, "manifest.json"))
    ap.add_argument("--refs", help="JSON list of reference clips (overrides ZISKEIT_VOICE_REFS)")
    ap.add_argument("--only", help="comma-separated target ids")
    ap.add_argument("--kinds", help="comma-separated kinds, e.g. phrase,conversation")
    ap.add_argument("--candidates", type=int, default=4, help="candidates per target (references x temperatures, capped)")
    ap.add_argument("--temps", default="0.6,0.9")
    ap.add_argument("--lang", default="german", help="Qwen3-TTS lang_code; german reads the normalized spelling best")
    ap.add_argument("--tts-model", default=os.environ.get("ZISKEIT_TTS_MODEL", DEFAULT_TTS))
    ap.add_argument("--asr-model", default=os.environ.get("ZISKEIT_ASR_MODEL", DEFAULT_ASR))
    ap.add_argument("--phase", default="all", choices=["synth", "score", "all"])
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--force", action="store_true", help="regenerate candidates that already exist")
    ap.add_argument("--dry-run", action="store_true", help="print the TTS input text for each target and exit")
    ap.add_argument("--raw", action="store_true", help="feed the YIVO spelling to the model unchanged (baseline for comparison)")
    args = ap.parse_args()
    args.temps = [float(t) for t in args.temps.split(",")]
    os.makedirs(args.work, exist_ok=True)
    targets = load_targets(args)
    if args.dry_run:
        for t in targets:
            print(f"{t['id']:40s} {t['text']!r:50s} -> {t['tts']!r}")
        return
    refs = load_references(args); cfgs = candidate_configs(refs, args.temps, args.candidates)
    print(f"[plan] {len(targets)} targets x {len(cfgs)} candidates; refs {[r['name'] for r in refs]}; temps {args.temps}; lang {args.lang}", flush=True)
    if args.phase in ("synth", "all"):
        synth(targets, cfgs, args)
    if args.phase in ("score", "all"):
        results = score(targets, cfgs, args)
        json.dump(results, open(os.path.join(args.work, "scores.json"), "w"), ensure_ascii=False, indent=1)
        export(targets, cfgs, results, refs, args)

if __name__ == "__main__":
    main()
