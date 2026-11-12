import { test } from "node:test";
import assert from "node:assert/strict";
import { loadHeadless } from "./headless.mjs";

// The pause overlay only needs a small DOM surface. Keep this test focused on
// the real pause module rather than replacing it with a source-text check.
function makeElement(tag = "div") {
  const el = {
    tagName: tag.toUpperCase(),
    id: "",
    hidden: false,
    children: [],
    parentNode: null,
    handlers: {},
    attributes: {},
    _html: "",
    textContent: "",
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    append(...children) {
      children.forEach(child => this.appendChild(child));
    },
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    addEventListener(name, fn) {
      this.handlers[name] = fn;
    },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector(selector) {
      const matches = node => {
        if (selector.startsWith("#")) return node.id === selector.slice(1);
        return node.tagName === selector.toUpperCase();
      };
      const walk = node => {
        for (const child of node.children) {
          if (matches(child)) return child;
          const nested = walk(child);
          if (nested) return nested;
        }
        return null;
      };
      return walk(this);
    },
    querySelectorAll() {
      return [];
    },
  };
  Object.defineProperty(el, "innerHTML", {
    get() {
      return el._html;
    },
    set(value) {
      el._html = String(value);
      el.children = [];
      // setupPause writes one fixed fragment. Give the fake DOM the controls
      // that fragment names, so setupPause wires the real click handlers.
      if (el.id === "pz") {
        const group = makeElement("div");
        const sound = makeElement("button");
        sound.id = "pz-sound";
        sound.appendChild(makeElement("i"));
        sound.appendChild(makeElement("span"));
        const resume = makeElement("button");
        resume.id = "pz-resume";
        const mainMenu = makeElement("button");
        mainMenu.id = "pz-main-menu";
        group.append(sound, resume, mainMenu);
        el.appendChild(group);
      }
    },
  });
  return el;
}

globalThis.document = {
  body: makeElement("body"),
  createElement: tag => makeElement(tag),
};
const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, String(value)),
  removeItem: key => storage.delete(key),
};

const pause = await loadHeadless("src/ui/pause.js", {
  state: "src/state/state.js",
  currentSave: "src/state/state.js",
  on: "src/util/events.js",
});


test("pause Exit to main menu saves, unpauses and emits the title-screen transition", () => {
  pause.state.ui.intro = false;
  pause.state.ui.tab = "m";
  pause.state.ui.toast = "old notice";
  pause.state.paused = false;

  let transitions = 0;
  pause.on("main-menu", () => {
    transitions += 1;
  });

  pause.setupPause();
  const overlay = document.body.children.at(-1);
  const resume = overlay.querySelector("#pz-resume");
  const mainMenu = overlay.querySelector("#pz-main-menu");
  assert.ok(resume);
  assert.ok(mainMenu);
  assert.ok(overlay.innerHTML.indexOf('id="pz-resume"') < overlay.innerHTML.indexOf('id="pz-main-menu"'),
    "Resume comes before Exit to main menu");

  pause.setPause(true);
  assert.equal(overlay.hidden, false);
  assert.equal(pause.state.paused, true);

  mainMenu.onclick();

  assert.equal(transitions, 1);
  assert.equal(pause.state.ui.intro, true);
  assert.equal(pause.state.ui.tab, "m");
  assert.equal(pause.state.ui.toast, "");
  assert.equal(pause.state.paused, false);
  assert.equal(overlay.hidden, true);
  assert.ok(storage.has("tr1"), "leaving gameplay keeps a current autosave");
});
