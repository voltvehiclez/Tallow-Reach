// Where a notice sits. It is centred, and it hangs just below the flight message
// line — the one that says "Empty weapon slot" when a weapon switch finds nothing
// fitted, or names the next warp. That line is empty most of the time, so the
// position is measured when a notice appears rather than pinned in CSS.
import { test } from "node:test";
import assert from "node:assert/strict";
import { setupNotices, showNotice, hideNotice } from "../src/ui/notice.js";

function makeElement(tag = "div") {
  return {
    tagName: tag.toUpperCase(), id: "", hidden: false, textContent: "", innerHTML: "",
    style: {}, children: [], handlers: {}, attributes: {},
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

/** The flight message line, standing in for `#msg` (top: 14% of a 900 px viewport). */
function messageLine(height) {
  const line = makeElement("div");
  line.getBoundingClientRect = () => ({
    left: 500, right: 900, top: 126, bottom: 126 + height, width: 400, height,
  });
  return line;
}

test("a notice hangs just below the message line, never over it", () => {
  let line = messageLine(26);
  const body = makeElement("body");
  globalThis.document = {
    body,
    createElement: makeElement,
    documentElement: { clientHeight: 900 },
    getElementById: id => (id === "msg" ? line : null),
  };
  setupNotices();
  const notice = body.children.find(child => child.id === "panel-notice");
  assert.ok(notice, "the notice is appended to the document");

  showNotice("Discarded 2 Ferrite from the Wasp.");
  assert.equal(notice.style.top, "164px", "12 px under the 14% message line (126 + 26)");
  assert.ok(Number.parseInt(notice.style.top, 10) > 126 + 26, "it cannot overlap \"Empty weapon slot\"");

  // A wrapped two-line message pushes the notice down with it.
  line = messageLine(52);
  showNotice("Warp: Kista Gate to Meridian Station. 18422 m");
  assert.equal(notice.style.top, "190px", "the line's height is measured on every notice");

  // With the HUD away (docked, title screen) the line measures nothing: same band,
  // worked out from the viewport height instead.
  line = messageLine(0);
  showNotice("Still in the same place.");
  assert.equal(notice.style.top, "164px", "0.14 * 900 + one line + the gap");
  assert.equal(notice.hidden, false);

  hideNotice();
  assert.equal(notice.hidden, true, "and it still dismisses");
});
