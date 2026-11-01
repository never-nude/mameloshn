"""Text normalization for Ziskeit voice generation.

tts_text():      YIVO Latin-letter Yiddish -> the spelling handed to the TTS model. Qwen3-TTS has no
                 Yiddish; its German letter-to-sound rules are the closest fit, so YIVO digraphs are
                 rewritten to German orthography in ONE greedy left-to-right pass (outputs are never
                 re-matched). Punctuation, spacing and capitalisation are kept.
phonetic_key():  collapses either YIVO or German/English spellings to a rough phonetic key, used to
                 compare a Whisper transcript with the intended text (round-trip scoring).
"""
import difflib, re

VOWELS = set("aeiou")
# YIVO -> German, longest match first. 'ey'->'ee' (long e), 'ay'->'ai', 'oy'->'oi', 'ts'->'z', 'z'->'s'.
_RULES = [
    ("tsh", "tsch"), ("dzh", "dsch"), ("zh", "sch"), ("sh", "sch"), ("kh", "ch"), ("ts", "z"),
    ("ay", "ai"), ("ey", "ee"), ("oy", "oi"),
    ("z", "s"), ("v", "w"), ("y", "j"),
]

def _word(w: str) -> str:
    out = []; i = 0; low = w.lower()
    while i < len(low):
        for src, dst in _RULES:
            if low.startswith(src, i):
                piece = dst; i += len(src); break
        else:
            ch = low[i]
            # YIVO 's' is always /s/; German voices a single 's' between vowels, so double it there.
            if ch == "s" and i > 0 and low[i-1] in VOWELS and i+1 < len(low) and low[i+1] in VOWELS:
                piece = "ss"
            else:
                piece = ch
            i += 1
        out.append(piece)
    res = "".join(out)
    if w[:1].isupper():
        res = res[:1].upper() + res[1:]
    return res

def tts_text(text: str) -> str:
    """Rewrite a YIVO-romanized Yiddish string for the German-reading TTS model.

    Editorial placeholders in square brackets (e.g. "[family name]") are not spoken, and a
    typographic ellipsis becomes "..." so a trailing-off line keeps its pause.
    """
    text = re.sub(r"\s*\[[^\]]*\]", "", text)
    text = text.replace("\u2026", "...").replace("\u2019", "'")
    text = re.sub(r"\s+([,.;:!?])", r"\1", re.sub(r"\s{2,}", " ", text)).strip()
    return re.sub(r"[A-Za-z]+", lambda m: _word(m.group(0)), text)

def phonetic_key(s: str) -> str:
    s = s.lower()
    for a, b in [("ä","e"),("ö","e"),("ü","i"),("ß","s"),("é","e"),("š","sh"),("č","tsh")]:
        s = s.replace(a, b)
    s = re.sub(r"[^a-z ]", " ", s)
    for a, b in [("tsch","c"),("tsh","c"),("sch","S"),("sh","S"),("ch","x"),("kh","x"),("ck","k"),("tz","s"),("ts","s"),("z","s"),
                 ("ei","ay"),("ai","ay"),("eu","oy"),("äu","oy"),("oi","oy"),("ie","i"),("ey","e"),("ee","e"),("eh","e"),("ah","a"),("oh","o"),("uh","u"),("ih","i"),
                 ("w","f"),("v","f"),("ph","f"),("j","y"),("q","k")]:
        s = s.replace(a, b)
    s = re.sub(r"(.)\1+", r"\1", s)
    return s.replace(" ", "")

def similarity(a: str, b: str) -> float:
    """0..1 similarity of two phonetic keys."""
    if not a or not b:
        return 0.0
    return difflib.SequenceMatcher(None, a, b, autojunk=False).ratio()

if __name__ == "__main__":
    import sys
    for line in (sys.argv[1:] or ["Sholem aleykhem. Vi geyt es aykh?", "Ikh hob dikh lib.", "Hak mir nisht keyn tshaynik!"]):
        print(f"{line}  ->  {tts_text(line)}   [{phonetic_key(line)}]")
