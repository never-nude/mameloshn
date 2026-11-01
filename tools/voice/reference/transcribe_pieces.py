"""Split cleaned recording at pauses, pack pieces into ~28 s batches, transcribe each batch twice
(forced English, forced German) with word timestamps, and map words back to pieces."""
import os, re, json, subprocess, numpy as np, mlx_whisper
SR=16000; MODEL=os.environ.get("ASR_MODEL","mlx-community/whisper-large-v3-turbo-4bit"); GAP=0.5; MAXB=28.0
txt=open("clean/silences.txt").read()
sil=[(float(a),float(b)) for a,b in zip(re.findall(r"silence_start: ([\d.]+)",txt),re.findall(r"silence_end: ([\d.]+)",txt))]
pcm=subprocess.run(["ffmpeg","-v","error","-i","clean/yiddish_clean.wav","-ac","1","-ar",str(SR),"-f","f32le","-"],capture_output=True).stdout
audio=np.frombuffer(pcm,np.float32); dur=len(audio)/SR
edges=[0.0]
for a,b in sil: edges += [a,b]
edges.append(dur)
regions=[(edges[k],edges[k+1]) for k in range(0,len(edges),2) if edges[k+1]-edges[k]>=0.2]
chunks=[(max(0,a-0.12),min(dur,b+0.12)) for a,b in regions]
batches=[]; cur=[]; curlen=0.0
for i,(a,b) in enumerate(chunks):
    d=b-a+GAP
    if cur and curlen+d>MAXB: batches.append(cur); cur=[]; curlen=0.0
    cur.append(i); curlen+=d
if cur: batches.append(cur)
print(len(chunks),"pieces in",len(batches),"batches; speech",round(sum(b-a for a,b in regions),1),"s of",round(dur,1),flush=True)
out=[{"i":i,"start":round(a,3),"end":round(b,3),"en":"","en_lp":-9.0,"de":"","de_lp":-9.0,"no_speech":1.0} for i,(a,b) in enumerate(chunks)]
def run(x,lang):
    return mlx_whisper.transcribe(x,path_or_hf_repo=MODEL,language=lang,word_timestamps=True,
                                  condition_on_previous_text=False,temperature=0.0,verbose=None)
for bi,idx in enumerate(batches):
    parts=[]; offs=[]; t=0.0
    for i in idx:
        a,b=chunks[i]; seg=audio[int(a*SR):int(b*SR)]
        offs.append((i,t,t+len(seg)/SR)); parts.append(seg); parts.append(np.zeros(int(GAP*SR),np.float32)); t+=len(seg)/SR+GAP
    x=np.concatenate(parts)
    for lang in os.environ.get("ASR_LANGS","de").split(","):
        r=run(x,lang)
        texts={i:[] for i in idx}; lps={i:[] for i in idx}; nsp={i:[] for i in idx}
        for s in r["segments"]:
            for w in s.get("words",[]):
                mid=(w["start"]+w["end"])/2
                i=min(offs,key=lambda o: 0 if o[1]<=mid<=o[2] else min(abs(mid-o[1]),abs(mid-o[2])))[0]
                texts[i].append(w["word"]); lps[i].append(s["avg_logprob"]); nsp[i].append(s["no_speech_prob"])
        for i in idx:
            out[i][lang]="".join(texts[i]).strip()
            out[i][lang+"_lp"]=round(float(np.mean(lps[i])),3) if lps[i] else -9.0
            if lang=="en": out[i]["no_speech"]=round(float(np.mean(nsp[i])),3) if nsp[i] else 1.0
    print("batch",bi+1,"/",len(batches),"pieces",idx[0],"-",idx[-1],flush=True)
    json.dump(out,open("clean/chunks.json","w"),ensure_ascii=False,indent=1)
print("done",flush=True)
