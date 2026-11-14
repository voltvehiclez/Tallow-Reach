// The crash card (step 14, owner bug report 2026-11-14: the game froze with no word about why).
//
// What is worth pinning: the card says the error's own first line, a repeat is counted rather than
// listed again (a per-frame error would otherwise bury the sentence in a second), it stops at
// `MAX_LINES` distinct problems and says how many it left out, it can be dismissed, and none of it
// depends on a browser being well behaved — no message, no error object, no 2D context, no body.
//
// Run with `npm test`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { reportCrash, installCrashNotice, clearCrash, crashReport } from "../src/ui/crash.js";

/** A minimal document: enough element for the card, and a record of what was appended where. */
function stubDocument() {
  const made = [];
  const element = () => {
    let text = "";
    const el = {
      style: {}, attrs: {}, children: [], id: "", hidden: false, parentNode: null,
      // Emptying an element's text really does empty it, the way the card re-renders a line.
      get textContent() { return text; },
      set textContent(value) { text = String(value); if (value === "") el.children.length = 0; },
      setAttribute: (k, v) => { el.attrs[k] = v; },
      addEventListener: (name, fn) => { (el.listeners ||= []).push({ name, fn }); },
      append: (...kids) => el.children.push(...kids),
      appendChild: kid => { el.children.push(kid); kid.parentNode = el; return kid; },
      remove: () => { if (el.parentNode) el.parentNode.children = el.parentNode.children.filter(k => k !== el); },
    };
    made.push(el);
    return el;
  };
  const body = element();
  const prev = globalThis.document;
  globalThis.document = {
    createElement: () => element(),
    body,
    documentElement: element(),
  };
  return { made, body, restore: () => { globalThis.document = prev; } };
}

/** Everything the card is showing, as text. */
const cardText = () => crashReport().entries;

test("a thrown error becomes one sentence on screen, with its own first line", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    reportCrash("frame", new TypeError("e.n.replace is not a function"));

    assert.deepEqual(cardText(), ["frame: TypeError: e.n.replace is not a function"],
      "the pilot reads what broke, and where it was caught");
    assert.equal(crashReport().shown, 1);
    assert.equal(crashReport().hidden, 0);

    const card = doc.body.children.at(-1);
    assert.equal(card.id, "crash-card", "the card is on the page");
    assert.equal(card.attrs.role, "alert", "and announced as one");
    assert.match(card.children[0].textContent, /still flying/,
      "it says the game is still running, because that is the part a frozen screen cannot");
    assert.equal(card.children[1].children[0].textContent,
      "frame: TypeError: e.n.replace is not a function", "the line the pilot will read out");
    assert.equal(card.style.position, "fixed", "it cannot be scrolled or laid out away");
    assert.equal(card.style.zIndex, "10000", "and nothing draws over it");
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("the same problem again is counted, not listed twice", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    for (let i = 0; i < 60; i++) reportCrash("frame", new TypeError("e.n.replace is not a function"));

    assert.equal(crashReport().shown, 1, "one line after a frame's worth of the same error");
    assert.equal(crashReport().hidden, 0);
    const card = doc.body.children.at(-1);
    assert.match(card.children[1].children[0].textContent, /\(×60\)$/, "and it says how often");
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("it lists four distinct problems and says how many it left out", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    reportCrash("frame", new Error("one"));
    reportCrash("window", new Error("two"));
    reportCrash("promise", new Error("three"));
    reportCrash("frame", new Error("four"));
    reportCrash("frame", new Error("five"));
    reportCrash("window", new Error("six"));

    assert.deepEqual(cardText(), ["frame: Error: one", "window: Error: two", "promise: Error: three", "frame: Error: four"]);
    assert.equal(crashReport().hidden, 2, "the rest are counted, not dropped");
    const card = doc.body.children.at(-1);
    assert.match(card.children[1].children.at(-1).textContent, /and 2 more, in the browser console/);
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("clicking the card clears it, and clearing it empties the count", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    reportCrash("frame", new Error("gone in a moment"));
    const card = doc.body.children.at(-1);

    card.listeners.find(l => l.name === "click").fn();

    assert.deepEqual(cardText(), [], "nothing is listed");
    assert.equal(crashReport().hidden, 0, "and nothing is held back");
    assert.ok(!doc.body.children.includes(card), "the card is off the page");

    // A later problem builds a new card rather than writing into a removed one.
    reportCrash("frame", new Error("a second, unrelated problem"));
    assert.deepEqual(cardText(), ["frame: Error: a second, unrelated problem"]);
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("anything thrown is reportable: no message, no object, a whole stack", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    reportCrash("frame", undefined);
    reportCrash("frame", "the sim said no");
    reportCrash("frame", new Error("first line\n    at somewhere.js:1:1\n    at more.js:2:2"));
    reportCrash("frame", { message: "not even an Error" });

    assert.deepEqual(cardText(), [
      "frame: unknown problem",
      "frame: the sim said no",
      "frame: Error: first line",
      "frame: not even an Error",
    ], "one line each, and the stack stays out of the pilot's way");
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("a very long message is cut down to something that fits on a card", () => {
  const doc = stubDocument();
  try {
    clearCrash();
    reportCrash("frame", new Error("x".repeat(900)));
    const [line] = cardText();
    assert.ok(line.length <= 260, `${line.length} characters`);
    assert.match(line, /^frame: Error: x+$/);
  } finally {
    clearCrash();
    doc.restore();
  }
});

test("the card survives a document that cannot make one", () => {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => { throw new Error("no elements today"); }, body: null };
  try {
    clearCrash();
    assert.doesNotThrow(() => reportCrash("frame", new TypeError("e.n.replace is not a function")),
      "the net must not itself become the crash");
    assert.deepEqual(cardText(), ["frame: TypeError: e.n.replace is not a function"],
      "and the problem is still counted, even with nothing on screen to show it");
  } finally {
    clearCrash();
    globalThis.document = prev;
  }
});

test("installCrashNotice listens for everything the browser reports as uncaught", () => {
  const doc = stubDocument();
  const heard = [];
  const prev = globalThis.addEventListener;
  globalThis.addEventListener = (name, fn) => heard.push({ name, fn });
  try {
    clearCrash();
    installCrashNotice();
    assert.deepEqual(heard.map(h => h.name).sort(), ["error", "unhandledrejection"],
      "a listener, a timer and a promise all arrive here");

    // What the browser hands each listener, reported as the game would report it.
    heard.find(h => h.name === "error").fn({ error: new TypeError("e.n.replace is not a function") });
    heard.find(h => h.name === "unhandledrejection").fn({ reason: new Error("a promise nobody caught") });
    assert.deepEqual(cardText(), [
      "window: TypeError: e.n.replace is not a function",
      "promise: Error: a promise nobody caught",
    ]);
  } finally {
    clearCrash();
    globalThis.addEventListener = prev;
    doc.restore();
  }
});
