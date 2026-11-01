"""From clean/aligned.json: cut kept Yiddish takes into per-line WAVs, a takes-only master,
a cut list of removed regions, and candidate reference clips for voice cloning."""
import json, wave, numpy as np, os
SR=24000
def read_wav(p):
    with wave.open(p) as w:
        assert w.getframerate()==SR and w.getnchannels()==1 and w.getsampwidth()==2
        return np.frombuffer(w.readframes(w.getnframes()),np.int16).astype(np.float32)/32768
def write_wav(p,x):
    x=np.clip(x,-1,1); 
    with wave.open(p,"wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((x*32767).astype(np.int16).tobytes())
def fade(x,ms=12):
    n=min(len(x)//2,int(SR*ms/1000)); r=np.linspace(0,1,n,dtype=np.float32)
    x=x.copy(); x[:n]*=r; x[-n:]*=r[::-1]; return x
audio=read_wav("clean/yiddish_clean.wav"); dur=len(audio)/SR
chunks=json.load(open("clean/aligned.json")); lines={l["id"]:l for l in json.load(open("script_lines.json"))}
order=[l["id"] for l in json.load(open("script_lines.json"))]
# group kept chunks per line into one time span (merge when contiguous within 1.2 s)
spans={}
for c in chunks:
    if not c["keep"]: continue
    lid=c["line"]; s,e=c["start"],c["end"]
    if lid in spans and s-spans[lid][1]<=1.2: spans[lid][1]=max(spans[lid][1],e)
    elif lid in spans: spans[lid]=[min(spans[lid][0],s),max(spans[lid][1],e)]  # same line, far apart: widen (rare)
    else: spans[lid]=[s,e]
os.makedirs("segments",exist_ok=True); os.makedirs("ref",exist_ok=True)
manifest=[]; pieces=[]; gap=np.zeros(int(0.45*SR),np.float32)
PAD=0.08
for lid in order:
    if lid not in spans: continue
    s,e=spans[lid]; s=max(0,s-PAD); e=min(dur,e+PAD)
    x=fade(audio[int(s*SR):int(e*SR)])
    write_wav(f"segments/{lid}.wav",x)
    manifest.append({"id":lid,"text":lines[lid]["text"],"meaning":lines[lid]["meaning"],"start":round(s,2),"end":round(e,2),"dur":round(e-s,2)})
    pieces += [x,gap]
write_wav("clean/yiddish_takes_only.wav",np.concatenate(pieces))
json.dump(manifest,open("segments/manifest.json","w"),ensure_ascii=False,indent=1)
# cut list: regions of the recording not inside any kept span
kept=sorted(spans.values()); cuts=[]; t=0.0
for s,e in kept:
    if s-t>0.6: cuts.append([round(t,2),round(s,2)])
    t=max(t,e)
if dur-t>0.6: cuts.append([round(t,2),round(dur,2)])
with open("clean/cutlist.txt","w") as f:
    for a,b in cuts:
        words=" / ".join(c["en"] for c in chunks if c["start"]>=a-0.2 and c["end"]<=b+0.2 and c["en"])
        f.write(f"{a:8.2f} - {b:8.2f}  ({b-a:5.1f}s)  {words[:140]}\n")
# reference-clip candidates: long, well-matched single-line takes (6-14 s)
cands=[]
for m in manifest:
    sims=[c["sim"] for c in chunks if c["keep"] and c["line"]==m["id"]]
    if 6<=m["dur"]<=14 and sims and min(sims)>=0.6: cands.append({**m,"sim":round(min(sims),2)})
cands.sort(key=lambda m:(-m["sim"],-m["dur"]))
for k,m in enumerate(cands[:4]):
    os.system(f'cp segments/{m["id"]}.wav ref/ref{k+1}_{m["id"]}.wav')
json.dump(cands[:4],open("ref/ref_candidates.json","w"),ensure_ascii=False,indent=1)
tot=sum(m["dur"] for m in manifest)
print(f"lines with a kept take: {len(manifest)} of {len(order)}; kept audio {tot/60:.1f} min; cut regions {len(cuts)}; ref candidates {len(cands[:4])}")
