import re, json, sys
lines=[]; part=None; n=0
for raw in open("script.md"):
    s=raw.strip()
    m=re.match(r"## (Part \d+) — (.*)", s)
    if m: part=m.group(1).replace("Part ","p"); n=0; continue
    if not part: continue
    for b in re.findall(r"\*\*(.+?)\*\*", s):
        n+=1
        text=re.sub(r"^[AB]: ","",b).strip()
        meaning=""
        cells=[c.strip() for c in s.strip("|").split("|")]
        if len(cells)>=2: meaning=cells[1]
        lines.append({"id":f"{part}_{n:02d}","part":part,"text":text,"meaning":meaning})
json.dump(lines,open("script_lines.json","w"),ensure_ascii=False,indent=1)
print(len(lines),"lines")
