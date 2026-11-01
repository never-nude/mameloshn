#!/usr/bin/env python3
"""Check that every clip the app plays exists and is well-formed: decodable mono 24 kHz AAC in .m4a,
plausible duration, level in range. Also reports the round-trip scores from manifest.json if present.
Usage: python tools/voice/verify_clips.py [--targets tools/voice/targets.json] [--docs docs]
Exit code 1 if any clip is missing or malformed."""
import argparse, json, os, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))

def probe(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                          "stream=codec_name,sample_rate,channels:format=duration", "-of", "json", path],
                         capture_output=True, text=True).stdout
    j = json.loads(out or "{}"); s = (j.get("streams") or [{}])[0]
    return s.get("codec_name"), int(s.get("sample_rate") or 0), int(s.get("channels") or 0), float(j.get("format", {}).get("duration") or 0)

def level_db(path):
    err = subprocess.run(["ffmpeg", "-v", "info", "-i", path, "-af", "volumedetect", "-f", "null", "-"],
                         capture_output=True, text=True).stderr
    mean = [l for l in err.splitlines() if "mean_volume" in l]
    return float(mean[-1].split("mean_volume:")[1].split("dB")[0]) if mean else None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--targets", default=os.path.join(HERE, "targets.json"))
    ap.add_argument("--docs", default=os.path.join(HERE, "..", "..", "docs"))
    a = ap.parse_args()
    targets = json.load(open(a.targets)); bad = 0; rows = []
    for t in targets:
        p = os.path.join(a.docs, t["file"])
        if not os.path.exists(p):
            rows.append((t["file"], "MISSING")); bad += 1; continue
        codec, sr, ch, dur = probe(p); lvl = level_db(p)
        letters = sum(c.isalpha() for c in t["text"]); problems = []
        if codec != "aac": problems.append(f"codec {codec}")
        if sr != 24000: problems.append(f"{sr} Hz")
        if ch != 1: problems.append(f"{ch} ch")
        if not (0.5 <= dur <= max(8.0, 0.25 * letters + 1)): problems.append(f"duration {dur:.2f}s")
        if lvl is None or not (-34 <= lvl <= -14): problems.append(f"level {lvl} dB")
        if problems: bad += 1
        rows.append((t["file"], f"{dur:5.2f}s {lvl:6.1f} dB " + ("OK" if not problems else "; ".join(problems))))
    for f, r in rows:
        print(f"{f:55s} {r}")
    mp = os.path.join(HERE, "manifest.json")
    if os.path.exists(mp):
        m = json.load(open(mp)); sc = [c["chosen"]["score"] for c in m.get("clips", []) if "chosen" in c]
        if sc:
            print(f"\nmanifest: {len(sc)} clips, round-trip score mean {sum(sc)/len(sc):.2f}, min {min(sc):.2f}, "
                  f"{sum(1 for s in sc if s < 0.6)} below 0.60")
    print(f"\n{len(targets)} targets, {bad} problem(s)")
    sys.exit(1 if bad else 0)

if __name__ == "__main__":
    main()
