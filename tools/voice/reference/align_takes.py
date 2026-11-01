"""Align Whisper pieces to script lines; mark English asides and abandoned takes."""
import json, re, difflib, sys
chunks=json.load(open("clean/chunks.json"))
lines=json.load(open("script_lines.json"))

def squash(s):
    s=s.lower()
    for a,b in [("ä","e"),("ö","e"),("ü","i"),("ß","s"),("é","e"),("š","sh"),("č","tsh")]: s=s.replace(a,b)
    s=re.sub(r"[^a-z ]"," ",s)
    for a,b in [("tsch","c"),("tsh","c"),("sch","S"),("sh","S"),("ch","x"),("kh","x"),("ck","k"),("tz","s"),("ts","s"),("z","s"),
                ("ei","ay"),("ai","ay"),("eu","oy"),("äu","oy"),("oi","oy"),("ie","i"),("ey","e"),("eh","e"),("ah","a"),("oh","o"),("uh","u"),("ih","i"),
                ("w","f"),("v","f"),("ph","f"),("j","y"),("q","k"),("c","c")]:
        s=s.replace(a,b)
    s=re.sub(r"(.)\1+",r"\1",s)
    return s.replace(" ","")

L=[squash(l["text"]) for l in lines]
def partial(c, s):
    """best similarity of chunk c to a same-length window of line s -> (score, start_frac, end_frac)"""
    if not c: return (0.0,0,0)
    m,n=len(c),len(s)
    if m>=n*0.85:
        return (difflib.SequenceMatcher(None,c,s,autojunk=False).ratio(),0.0,1.0)
    best=(0.0,0,0)
    for k in range(0,n-m+1):
        r=difflib.SequenceMatcher(None,c,s[k:k+m],autojunk=False).ratio()
        if r>best[0]: best=(r,k/n,(k+m)/n)
    return best

EN_WORDS=set("""a about again all alright and are back be but can do does don't go going good got here hold i i'm is it it's just
let let's me mean my no not now ok okay on one oops over part right say should so sorry start sure that that's the then there this
three time to try two uh um wait was we well what where yeah yes you four five six seven eight nine ten eleven""".split())
LEAD_EN=set("start again okay ok alright all right sorry no wait let me let's once more over nope um uh so oops hold on that was wrong try that's one time the this do it i'll restart redo".split())
def lead_english(t):
    """number of English filler words a transcript STARTS with ("Start again. Es freit mich." -> 2)"""
    n=0
    for x in re.findall(r"[a-zA-Z']+",t.lower()):
        if x in LEAD_EN: n+=1
        else: break
    return n
def englishness(t):
    w=re.findall(r"[a-z']+",t.lower())
    return (sum(x in EN_WORDS for x in w)/len(w)) if w else 0.0

N=len(chunks)
for c in chunks:
    cd=squash(c["de"]); ce=squash(c["en"])
    c["_sq"]=cd if len(cd)>=len(ce)*0.5 else ce
# similarity table, banded around expected position
J=len(L)
S={}
for i,c in enumerate(chunks):
    exp=i*J/N
    for j in range(max(0,int(exp)-70),min(J,int(exp)+70)):
        a=partial(squash(c["de"]),L[j]); b=partial(squash(c["en"]),L[j])
        S[(i,j)]=max(a,b,key=lambda x:x[0])
# monotonic DP: state = last line used (-1 start). chunk either junk (0) or line j>=prev, j<=prev+4
TH=0.55; SKIP=0.15
NEG=-1e9
best={-1:0.0}; back=[]
for i in range(N):
    nb={}; bk={}
    for pj,sc in best.items():
        # junk
        if sc>nb.get(pj,NEG): nb[pj]=sc; bk[pj]=(pj,None)
        for j in range(max(pj,0),min(J,pj+5)):
            s=S.get((i,j),(0,0,0))[0]
            if s<0.35: continue
            v=sc+(s-TH)-SKIP*max(0,j-pj-1)
            if v>nb.get(j,NEG): nb[j]=v; bk[j]=(pj,j)
    # prune
    best=dict(sorted(nb.items(),key=lambda x:-x[1])[:60]); back.append(bk)
# backtrack
j=max(best,key=best.get); assign=[None]*N
for i in range(N-1,-1,-1):
    pj,lab=back[i][j]; assign[i]=lab; j=pj
# label chunks
for i,c in enumerate(chunks):
    lab=assign[i]
    c["line"]=lines[lab]["id"] if lab is not None else None
    sc=S.get((i,lab),(0,0,0)) if lab is not None else (0,0,0)
    c["sim"]=round(sc[0],2); c["span"]=(round(sc[1],2),round(sc[2],2))
    eng=englishness(c.get("en") or "")
    c["english"]= (lab is None or c["sim"]<0.6) and eng>=0.5 and c["en_lp"]>-0.7
    c["contaminated"]= lead_english(c.get("de") or "")>0
# takes: per line, group its chunks into takes; a new take starts when the span restarts near the beginning
# or an English/junk chunk sits between them. keep the last take that covers most of the line.
from collections import defaultdict
byline=defaultdict(list)
for i,c in enumerate(chunks):
    if c["line"]: byline[c["line"]].append(i)
keep=set()
for lid,idx in byline.items():
    takes=[]; cur=[]
    for i in idx:
        if cur:
            gap_junk=any(chunks[k]["line"]!=lid for k in range(cur[-1]+1,i))
            restart=chunks[i]["span"][0]<=0.15 and chunks[cur[-1]]["span"][1]>0.3
            if gap_junk or restart: takes.append(cur); cur=[]
        cur.append(i)
    takes.append(cur)
    def cover(t):
        lo=min(chunks[k]["span"][0] for k in t); hi=max(chunks[k]["span"][1] for k in t); return hi-lo
    def quality(t):
        q=sum(chunks[k]["sim"] for k in t)/len(t)
        return q-(0.25 if any(chunks[k]["contaminated"] for k in t) else 0.0)
    good=[t for t in takes if cover(t)>=0.7] or [max(takes,key=cover)]
    # the LAST complete take is the speaker's intended one, unless an earlier one is clearly cleaner
    chosen=good[-1]; best=max(good,key=quality)
    if quality(best)>quality(chosen)+0.15: chosen=best
    for k in chosen: keep.add(k)
    for t in takes:
        for k in t: chunks[k]["take"]="kept" if t is chosen else "abandoned"
for i,c in enumerate(chunks):
    c["keep"]= i in keep and not c["english"]
    c.pop("_sq",None)
json.dump(chunks,open("clean/aligned.json","w"),ensure_ascii=False,indent=1)
found=sorted(set(c["line"] for c in chunks if c["keep"]))
print("kept pieces",sum(c["keep"] for c in chunks),"of",N)
print("script lines found",len(found),"of",J)
print("english asides",sum(c["english"] for c in chunks),"abandoned takes",sum(c.get("take")=="abandoned" for c in chunks),"unmatched",sum(c["line"] is None for c in chunks))
missing=[l["id"] for l in lines if l["id"] not in found]
print("missing lines:",missing)
