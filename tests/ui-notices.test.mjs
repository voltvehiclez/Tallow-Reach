// Messages on the docked screens.
//
// The owner reported that every action printed a line at the top of the panel,
// which pushed the whole menu down: "contract accepted. launch when ready.",
// "sold x items for x cr", "basic power plant moved to storage". Routine
// confirmations are silent now — the panel already shows the result — and a
// message the pilot must read appears in a **fixed** notice that cannot move the
// panel, like the "mission failed" alert (which is unchanged).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { state } from "../src/state/state.js";
import { outpostHtml } from "../src/ui/screens.js";
import { isRoutineReply, notify, showNotice, hideNotice, setupNotices } from "../src/ui/notice.js";

const here = dirname(fileURLToPath(import.meta.url));

function makeElement(tag = "div") {
  return {
    tagName: tag.toUpperCase(), id: "", hidden: false, textContent: "", innerHTML: "",
    children: [], handlers: {}, attributes: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    getAttribute(name) { return this.attributes[name] ?? null; },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    remove() {},
  };
}

function installDom() {
  globalThis.document = { body: makeElement("body"), createElement: makeElement };
}

test("routine confirmations are silent, refusals and warnings are not", () => {
  assert.equal(isRoutineReply(""), true, "nothing to say");
  // The owner's three examples, plus the rest of the same family.
  for (const text of [
    "Contract accepted. Launch when ready.",
    "Story mission accepted.",
    "Sold 12 items for 340 cr.",
    "Sold 3 Ferrite for 90 cr.",
    "Basic Power Plant moved to storage.",
    "Fitted Basic Power Plant. Basic Reactor moved to storage.",
    "Moved 4 Ferrite to Ship hold.",
    "Wasp repaired for 120 cr.",
    "Restocked 12 missiles.",
    "Basic Power Plant in the station inventory. Fit it in a power bay to use it.",
    "Paid 300 cr.",
    "Saved to slot 1",
    "Loaded slot 2",
    "Deleted slot 3",
    "Progress reset.",
    "Save imported.",
  ]) {
    assert.equal(isRoutineReply(text), true, `"${text}" should say nothing`);
  }

  // Anything the pilot has to act on stays visible.
  for (const text of [
    "Not enough credits.",
    "No room in the station for the Basic Power Plant.",
    "Nothing in the hold can be sold.",
    "That module is not in storage.",
    "That slot could not be read.",
    "That code is not a valid save.",
    "Could not save in this browser.",
    "Hand this in at Meridian Station.",
    "Need 2 Ferrite in this station or your ship.",
    "Dock at a station to collect the reward.",
    // A routine reply with something important appended is not routine any more.
    "Loaded slot 1 That pocket no longer exists. Returned to Meridian Station; your character and cargo are safe.",
  ]) {
    assert.equal(isRoutineReply(text), false, `"${text}" must be shown`);
  }
});

test("the panel never renders a message line, so no action moves the layout", () => {
  installDom();
  const previous = state.profile;
  try {
    const html = outpostHtml({ tab: "m", toast: "Contract accepted. Launch when ready." });
    assert.doesNotMatch(html, /Contract accepted/, "a message cannot appear inside the panel");
    assert.doesNotMatch(html, /class="ok"/, "the old inline message element is gone");
  } finally {
    state.profile = previous;
  }
  const screens = readFileSync(join(here, "..", "src", "ui", "screens.js"), "utf8");
  assert.doesNotMatch(screens, /ui\.toast/, "screens no longer read a panel message at all");
  const css = readFileSync(join(here, "..", "src", "styles.css"), "utf8");
  const rule = css.match(/#panel-notice\s*\{[^}]*\}/);
  assert.ok(rule, "the notice has its own rule");
  assert.match(rule[0], /position:\s*fixed/, "and it is fixed to the viewport, so it cannot move the panel");
});

test("a notice is a fixed overlay: shown for a refusal, silent for a confirmation", () => {
  installDom();
  setupNotices();
  const notice = globalThis.document.body.children.find(child => child.id === "panel-notice");
  assert.ok(notice, "the notice element is appended outside the panel");
  assert.equal(notice.getAttribute("role"), "status", "and is announced politely");

  notify("Sold 3 Ferrite for 90 cr.");
  assert.equal(notice.hidden, true, "a routine confirmation shows nothing");

  notify("That module is not in storage.");
  assert.equal(notice.hidden, false, "a refusal is shown");
  assert.match(notice.textContent, /not in storage/, "with the reply text");

  hideNotice();
  assert.equal(notice.hidden, true, "and can be dismissed");

  showNotice("Death message");
  assert.equal(notice.textContent, "Death message", "important notices use the same overlay");
  hideNotice();
});
