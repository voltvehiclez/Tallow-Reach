// The docs are the project's memory across AI chats, so they have to stay small enough to
// read selectively and every link has to work. This test fails loudly when a doc grows past
// its limit, a link breaks, an index forgets a file, or a stated fact drifts from the code.
// Limits live here so changing one is a visible decision. See "Keeping the docs scalable" in
// docs/ARCHITECTURE.md.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SAVE_VERSION } from "../src/state/profile.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = rel => fs.readFileSync(path.join(root, rel), "utf8");
const list = rel => fs.readdirSync(path.join(root, rel)).filter(f => f.endsWith(".md")).sort();
const KB = 1024;

// ---- size limits (bytes). Archives and the changelog history are exempt. -----------------
const LIMITS = {
  "docs/HANDOFF.md": 14 * KB,
  "docs/LESSONS.md": 30 * KB,
  "docs/MISSION_RULES.md": 14 * KB,
  "docs/ARCHITECTURE.md": 30 * KB,
  "docs/HOW_TO_ADD.md": 10 * KB,
  "docs/ROADMAP.md": 35 * KB,
  "docs/REFACTOR_PLAN.md": 30 * KB,
  "docs/TARGET_ARCHITECTURE.md": 30 * KB,
  "docs/VISION.md": 25 * KB,
  "docs/AI_PROMPTS.md": 14 * KB,
  "docs/CHANGELOG.md": 60 * KB,
};
const PER_AREA_LIMIT = 30 * KB;     // docs/architecture/*.md and docs/recipes/*.md, each

test("docs: every doc stays under its size limit", () => {
  for (const [file, limit] of Object.entries(LIMITS)) {
    const size = fs.statSync(path.join(root, file)).size;
    assert.ok(size <= limit, `${file} is ${size} bytes, over its ${limit} limit: split it by topic (move text word for word, leave a table of contents) or archive finished text to docs/archive/`);
  }
  for (const dir of ["docs/architecture", "docs/recipes"]) {
    for (const f of list(dir)) {
      const size = fs.statSync(path.join(root, dir, f)).size;
      assert.ok(size <= PER_AREA_LIMIT, `${dir}/${f} is ${size} bytes, over ${PER_AREA_LIMIT}: split it`);
    }
  }
  assert.ok(read("docs/HANDOFF.md").split("\n").length <= 150, "HANDOFF.md should stay a short snapshot (about 150 lines at most)");
});

// ---- every relative markdown link points at a file that exists ---------------------------
function markdownFiles() {
  const out = ["README.md", "AGENTS.md"];
  for (const dir of ["docs", "docs/architecture", "docs/recipes", "testing", "testing/passed"]) {
    for (const f of list(dir)) out.push(`${dir}/${f}`);
  }
  return out;
}
test("docs: every relative link resolves to a real file", () => {
  const broken = [];
  for (const file of markdownFiles()) {
    if (file.startsWith("docs/CHANGELOG")) continue;   // history keeps its old wording
    const text = read(file).replace(/```[\s\S]*?```/g, "");
    for (const m of text.matchAll(/\]\(([^)\s]+)\)/g)) {
      const target = m[1].split("#")[0];
      if (!target || /^[a-z]+:/i.test(target)) continue;
      if (!fs.existsSync(path.resolve(root, path.dirname(file), target))) broken.push(`${file} -> ${m[1]}`);
    }
  }
  assert.deepEqual(broken, [], "broken links");
});

// ---- indexes list every file ---------------------------------------------------------------
test("docs: every recipe is listed in HOW_TO_ADD.md and numbers are unique", () => {
  const index = read("docs/HOW_TO_ADD.md");
  const nums = new Set();
  for (const f of list("docs/recipes")) {
    assert.ok(index.includes(`recipes/${f}`), `${f} is missing from the table in docs/HOW_TO_ADD.md`);
    const n = f.slice(0, 2);
    assert.ok(!nums.has(n), `two recipes share the number ${n}`);
    nums.add(n);
  }
});
test("docs: every architecture area file is listed in ARCHITECTURE.md", () => {
  const index = read("docs/ARCHITECTURE.md");
  for (const f of list("docs/architecture")) assert.ok(index.includes(`architecture/${f}`), `${f} is missing from "Area files" in docs/ARCHITECTURE.md`);
});
test("docs: every playtest guide is listed in testing/README.md", () => {
  const index = read("testing/README.md");
  for (const f of list("testing")) if (f !== "README.md") assert.ok(index.includes(f), `${f} is missing from testing/README.md`);
  for (const f of list("testing/passed")) assert.ok(index.includes(`passed/${f}`), `passed/${f} is missing from testing/README.md`);
});

// ---- facts that must match the code ---------------------------------------------------------
test("docs: HANDOFF states the real save version", () => {
  const m = read("docs/HANDOFF.md").match(/Save version: \*\*v(\d+)\*\*/);
  assert.ok(m, "HANDOFF.md must say 'Save version: **vNN**'");
  assert.equal(Number(m[1]), SAVE_VERSION, "HANDOFF.md save version differs from SAVE_VERSION in src/state/profile.js: update HANDOFF.md");
});
test("docs: the docs that state facts carry a 'Last checked' date", () => {
  for (const f of ["docs/HANDOFF.md", "docs/LESSONS.md", "docs/ROADMAP.md", "docs/ARCHITECTURE.md", "docs/MISSION_RULES.md"]) {
    assert.match(read(f), /Last checked: \d{4}-\d{2}-\d{2}/, `${f} needs a "Last checked: YYYY-MM-DD" line`);
  }
});

// ---- lessons are enforceable -----------------------------------------------------------------
test("docs: every lesson names what enforces it, and the tests it names exist", () => {
  const text = read("docs/LESSONS.md").split("## Template")[0];
  const lessons = text.split(/^### /m).slice(1);
  assert.ok(lessons.length >= 10);
  for (const lesson of lessons) {
    const title = lesson.split("\n")[0];
    assert.match(lesson, /\*\*Rule[^*]*:\*\*/, `${title}: needs a Rule`);
    assert.match(lesson, /\*\*Enforced by:\*\*/, `${title}: needs "Enforced by" (write "NOT YET: add a test" if there is none)`);
    for (const m of lesson.matchAll(/`(tests\/[A-Za-z0-9._-]+\.mjs)`/g)) {
      assert.ok(fs.existsSync(path.join(root, m[1])), `${title}: cites ${m[1]}, which does not exist`);
    }
  }
});

// ---- the changelog keeps at most 10 full entries, and its index matches the archive -------
test("docs: CHANGELOG.md holds at most 10 full entries; its index matches the archive", () => {
  const log = read("docs/CHANGELOG.md");
  const [recent, index] = log.split(/^## Older entries.*$/m);
  const full = (recent.match(/^## .+$/gm) || []);
  assert.ok(full.length <= 10, `CHANGELOG.md has ${full.length} full entries; keep 10: move the oldest ${full.length - 10} word for word to docs/CHANGELOG_ARCHIVE.md and add an index line for each`);
  const indexed = (index || "").split("\n").filter(l => l.startsWith("- ")).map(l => l.slice(2).trim());
  const archived = read("docs/CHANGELOG_ARCHIVE.md").split("\n").filter(l => l.startsWith("## ")).map(l => l.slice(3).trim());
  assert.deepEqual([...indexed].sort(), [...archived].sort(), "the 'Older entries' index in CHANGELOG.md and the headings in CHANGELOG_ARCHIVE.md must list exactly the same entries");
  assert.equal(new Set(archived).size, archived.length, "CHANGELOG_ARCHIVE.md has a duplicated entry title");
  const stillFull = full.map(l => l.slice(3).trim()).filter(t => archived.includes(t));
  assert.deepEqual(stillFull, [], "an entry is both in CHANGELOG.md in full and in the archive: it was copied, not moved");
});

// ---- every src/ folder README names every .js file in its folder -------------------------
test("docs: each src/ folder README lists every file in that folder", () => {
  const walk = d => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(`${d}/${e.name}`) : e.name.endsWith(".js") ? [e.name] : []);
  const missing = [];
  for (const dir of fs.readdirSync(path.join(root, "src"), { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)) {
    const readme = read(`src/${dir}/README.md`);
    for (const f of walk(`src/${dir}`)) if (!readme.includes(f)) missing.push(`src/${dir}/README.md does not mention ${f}`);
  }
  assert.deepEqual(missing, [], "add a row for each new file to its folder's README.md");
});
