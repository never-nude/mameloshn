#!/usr/bin/env node
/*
 * Build tools/voice/targets.json: every audio clip the web app can play, with the Yiddish text it
 * must pronounce. Reads docs/course-data.js and docs/conversation-data.js exactly as the browser
 * does (they assign to window.*), so the list can never drift from the app's data.
 *
 * Usage: node tools/voice/extract_targets.js [--check] > tools/voice/targets.json
 *   --check   also report, on stderr, targets without an existing file and files without a target.
 *
 * Filenames follow docs/app.js: phrases  -> audio/phrases/<phrase.id>.m4a
 *                               dialogue -> audio/conversations/<conversation.id>-<line.id>.m4a
 * Sound-map entries ("kh", "oy", ...) are too short to synthesize alone, so they carry a ttsOverride:
 * a minimal syllable the generator speaks instead (the clip is still filed under the sound's id).
 */
const fs = require("fs"), path = require("path"), vm = require("vm");
const docs = path.join(__dirname, "..", "..", "docs");
const argv = process.argv.slice(2);
const SOUND_CARRIER = { kh: "akh", ts: "tsa", sh: "sha", zh: "zha", oy: "oy", ey: "ey", ay: "ay" };
const ctx = { window: {} }; vm.createContext(ctx);
for (const f of ["course-data.js", "conversation-data.js"]) {
  vm.runInContext(fs.readFileSync(path.join(docs, f), "utf8"), ctx, { filename: f });
}
const W = ctx.window;
const textOf = (o) => (typeof o.transliteration === "string" && o.transliteration) || (typeof o.text === "string" && o.text) || "";
const targets = [];
const seen = new Set();
(function walk(node, lesson) {
  if (Array.isArray(node)) return node.forEach((n) => walk(n, lesson));
  if (!node || typeof node !== "object") return;
  if (typeof node.id === "string" && textOf(node) && node.canSpeak !== false && !seen.has(node.id)) {
    seen.add(node.id);
    const sound = node.id.startsWith("sound-");
    const t = { file: `audio/phrases/${node.id}.m4a`, id: node.id, kind: sound ? "sound" : "phrase",
      text: textOf(node), meaning: node.meaning || "", speechCue: node.speechCue || "", lesson: lesson ? lesson.id || lesson.title || "" : "" };
    if (sound && SOUND_CARRIER[t.text]) t.ttsOverride = SOUND_CARRIER[t.text];
    targets.push(t);
  }
  for (const [k, v] of Object.entries(node)) if (k !== "variants" && typeof v === "object") walk(v, node.lessonMarker ? node : lesson);
})(W.MAMELOSHN_LESSONS.map((l) => ({ ...l, lessonMarker: true })), null);
for (const c of W.MAMELOSHN_CONVERSATIONS || []) {
  (c.lines || []).forEach((l, i) => {
    targets.push({ file: `audio/conversations/${c.id}-${l.id}.m4a`, id: `${c.id}-${l.id}`, kind: "conversation",
      conversationId: c.id, lineId: l.id, index: i, speaker: l.speaker || "", text: textOf(l), meaning: l.meaning || "", speechCue: l.speechCue || "" });
  });
}
if (argv.includes("--check")) {
  const existing = new Set();
  for (const d of ["phrases", "conversations"]) for (const f of fs.readdirSync(path.join(docs, "audio", d))) if (f.endsWith(".m4a")) existing.add(`audio/${d}/${f}`);
  const want = new Set(targets.map((t) => t.file));
  const missing = [...want].filter((f) => !existing.has(f)), extra = [...existing].filter((f) => !want.has(f));
  console.error(`${targets.length} targets (${targets.filter((t) => t.kind !== "conversation").length} phrase/sound, ${targets.filter((t) => t.kind === "conversation").length} conversation); ${existing.size} files; missing files: ${missing.length} ${JSON.stringify(missing.slice(0, 10))}; files without target: ${extra.length} ${JSON.stringify(extra.slice(0, 10))}`);
}
process.stdout.write(JSON.stringify(targets, null, 1) + "\n");
