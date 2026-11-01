"""Rank kept per-line takes as voice-cloning references: whole-line transcript match, plausible rate,
5-12 s. Writes ref/ref_ranked.json and, if names are given, ref/refs.json.
usage: pick_refs.py [name=line_id ...]   e.g. pick_refs.py conv=p2_13 warm=p11_04+p11_12"""
import json, sys, re, difflib, wave, numpy as np, os
sys.path.insert(0, os.path.dirname(__file__))
def squash(s):
    s=s.lower()
    for a,b in [("ä","e"),("ö","e"),("ü","i"),("ß","s"),("é","e"),("š","sh"),("č","tsh")]: s=s.replace(a,b)
    s=re.sub(r"[^a-z ]"," ",s)
    for a,b in [("tsch","c"),("tsh","c"),("sch","S"),("sh","S"),("ch","x"),("kh","x"),("ck","k"),("tz","s"),("ts","s"),("z","s"),
                ("ei","ay"),("ai","ay"),("eu","oy"),("äu","oy"),("oi","oy"),("ie","i"),("ey","e"),("eh","e"),("ah","a"),("oh","o"),("uh","u"),("ih","i"),
                ("w","f"),("v","f"),("ph","f"),("j","y"),("q","k")]:
        s=s.replace(a,b)
    s=re.sub(r"(.)\1+",r"\1",s)
    return s.replace(" ","")
W = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
chunks = json.load(open(f"{W}/clean/aligned.json")); man = {m["id"]: m for m in json.load(open(f"{W}/segments/manifest.json"))}
rows = []
for lid, m in man.items():
    cs = [c for c in chunks if c["keep"] and c["line"] == lid]
    heard = " ".join(c["de"] for c in cs)
    full = difflib.SequenceMatcher(None, squash(heard), squash(m["text"]), autojunk=False).ratio()
    letters = sum(ch.isalpha() for ch in m["text"]); rate = m["dur"] / max(letters, 1)
    rows.append({"id": lid, "dur": m["dur"], "full_sim": round(full, 2), "sec_per_letter": round(rate, 3), "heard": heard, "text": m["text"]})
ranked = sorted([r for r in rows if 5 <= r["dur"] <= 12 and 0.06 <= r["sec_per_letter"] <= 0.13], key=lambda r: -r["full_sim"])
json.dump(ranked, open(f"{W}/ref/ref_ranked.json", "w"), ensure_ascii=False, indent=1)
json.dump({r["id"]: r for r in rows}, open(f"{W}/ref/line_quality.json", "w"), ensure_ascii=False, indent=1)
print(f"{len(ranked)} single-line candidates (5-12 s). Top 12:")
for r in ranked[:12]:
    print(f'  {r["id"]:6s} {r["dur"]:5.1f}s sim {r["full_sim"]:.2f} rate {r["sec_per_letter"]:.3f} | {r["text"]}')
print("whole-line match of short closing lines:", [(r["id"], r["full_sim"], r["dur"]) for r in rows if r["id"].startswith("p11_")])
def rd(p):
    with wave.open(p) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
refs = []
for arg in sys.argv[1:]:
    name, ids = arg.split("="); ids = ids.split("+"); parts = []; texts = []
    for lid in ids:
        q = next(r for r in rows if r["id"] == lid)
        if q["full_sim"] < 0.8:
            print(f"!! {lid} whole-line match only {q['full_sim']}; skipped"); continue
        parts += [rd(f"{W}/segments/{lid}.wav"), np.zeros(int(0.35 * 24000), np.float32)]; texts.append(q["text"])
    if not parts: continue
    x = np.concatenate(parts[:-1]); path = f"{W}/ref/ref_{name}.wav"
    with wave.open(path, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())
    refs.append({"name": name, "path": path, "text": " ".join(texts)}); print(f"ref {name}: {len(x)/24000:.1f}s | {' '.join(texts)}")
if refs:
    json.dump(refs, open(f"{W}/ref/refs.json", "w"), ensure_ascii=False, indent=1); print("wrote ref/refs.json")
