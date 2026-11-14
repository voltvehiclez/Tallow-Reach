// A crash the pilot can read.
//
// A frame that throws does not stop the loop — `main.js` asks for the next frame before it does any
// work — but it does stop the *picture*: the frame breaks before it is drawn, so the last good image
// stays on the screen, the ship stops answering the stick, and the only word about any of it is a
// line in the browser's console, which the pilot is not looking at. Played, that is a crash (owner
// bug report 2026-11-14: the game died a few seconds after the last rift guardian broke up, and all
// anyone could see was a frozen screen).
//
// So anything uncaught is caught here and said on screen, in a sentence, with the error's own first
// line — and `main.js` draws the frame anyway. The card stays until the pilot dismisses it: the game
// does not pretend nothing happened, it just refuses to end the flight over one bad frame.
//
// This is a net, not a rule. Nothing in `sim/` may call it, no game rule may depend on it, and a
// test that expects an error still gets the error thrown at it: this only listens for what the
// browser reports as uncaught, plus the frame loop's own catch.

/** How many distinct problems the card lists before it says how many it left out. */
const MAX_LINES = 4;

let card = null;
let lines = null;
let entries = [];        // [{ key, where, text, n }]
let hidden = 0;          // problems beyond MAX_LINES, counted not listed

/** The card, built the first time something breaks: fixed, on top of everything, styled here so it
 *  shows even if the stylesheet is what broke. */
function setup() {
  if (card) return card;
  card = document.createElement("div");
  card.id = "crash-card";
  card.setAttribute("role", "alert");
  Object.assign(card.style, {
    position: "fixed",
    left: "14px",
    top: "14px",
    zIndex: "10000",
    maxWidth: "min(46vw, 620px)",
    padding: "10px 13px",
    background: "rgba(10, 6, 4, 0.92)",
    border: "1px solid #7a3a18",
    borderLeft: "3px solid #ff7a2a",
    borderRadius: "4px",
    color: "#f0d9c4",
    font: "13px/1.5 ui-monospace, Menlo, Consolas, monospace",
    whiteSpace: "pre-wrap",
    cursor: "pointer",
    pointerEvents: "auto",
  });

  const head = document.createElement("div");
  head.textContent = "The game hit a problem. It is still flying — click this card to clear it.";
  Object.assign(head.style, { color: "#ffb267", marginBottom: "6px" });

  lines = document.createElement("div");
  card.append(head, lines);
  card.addEventListener("click", clearCrash);
  (document.body || document.documentElement).appendChild(card);
  return card;
}

/** One problem per line, with a count when the same one keeps happening. */
function render() {
  if (!lines) return;
  lines.textContent = "";
  for (const entry of entries) {
    const row = document.createElement("div");
    row.textContent = `${entry.where}: ${entry.text}${entry.n > 1 ? `  (×${entry.n})` : ""}`;
    Object.assign(row.style, { color: "#e8b79a" });
    lines.appendChild(row);
  }
  if (hidden > 0) {
    const row = document.createElement("div");
    row.textContent = `and ${hidden} more, in the browser console`;
    lines.appendChild(row);
  }
}

/**
 * Say what broke. `where` is the catch that caught it ("frame", "window"); `err` is whatever was
 * thrown. The same problem twice is counted, not listed again — a per-frame error would otherwise
 * fill the card in a second and hide the sentence the pilot needs.
 */
export function reportCrash(where, err) {
  const kind = err && err.name && err.message ? `${err.name}: ` : "";
  const text = String(kind + ((err && (err.message || err.name)) || err || "unknown problem")).split("\n")[0].slice(0, 240);
  const at = String(where || "game");
  const key = `${at}: ${text}`;
  try {
    const known = entries.find(entry => entry.key === key);
    if (known) {
      known.n += 1;
    } else if (entries.length < MAX_LINES) {
      entries.push({ key, where: at, text, n: 1 });
    } else {
      hidden += 1;
    }
    setup();
    render();
  } catch (setupErr) {
    // The card is the last line of defence: if it cannot be shown, say so where it can still be read.
    if (typeof console !== "undefined") console.error(`Tallow Reach: ${key}`, err, setupErr);
  }
  if (typeof console !== "undefined") console.error(`Tallow Reach (${at}):`, err);
}

/** Clear the card. Clicking it does this; so does a test that has read what it needed. */
export function clearCrash() {
  entries = [];
  hidden = 0;
  if (card) card.remove ? card.remove() : card.parentNode?.removeChild(card);
  card = null;
  lines = null;
}

/** How many distinct problems the card is showing, and how many it left out. */
export const crashReport = () => ({ shown: entries.length, hidden, entries: entries.map(e => `${e.where}: ${e.text}`) });

/**
 * Listen for everything the browser reports as uncaught: a listener, a timer, a promise. The frame
 * loop catches its own errors in `main.js` so it can keep drawing; this catches the rest.
 */
export function installCrashNotice() {
  if (typeof addEventListener !== "function") return;
  addEventListener("error", event => reportCrash("window", event?.error || event?.message));
  addEventListener("unhandledrejection", event => reportCrash("promise", event?.reason));
}
