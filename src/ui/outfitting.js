// The 3D window on the Outfitting screen: mounts the ship viewer into the panel,
// turns pointer and wheel input into camera moves, and draws one frame per game
// frame. The three.js side lives in render/shipviewer.js.
//
// The outpost panel replaces its HTML on every click, which throws the canvas
// element out of the page but does not destroy it. mountOutfitting() therefore
// runs after every render of the panel and simply puts the same canvas back,
// keeping the ship's angle and zoom between clicks.

import { state } from "../state/state.js";
import {
  shipViewerCanvas,
  setShip,
  renderShip,
  resizeShipViewer,
  dragShip,
  zoomShip,
  resetShipView,
} from "../render/shipviewer.js";

let host = null;          // the element on the page the canvas sits in
let canvas = null;        // the viewer's canvas, kept across panel re-renders
let observer = null;      // watches the box the canvas has to fill
let drag = null;          // { id, x, y } while the pointer is down
let failed = false;       // the browser refused a second WebGL context
/** Called by menu.render() whenever the Outfitting tab has just been drawn. */
export function mountOutfitting() {
  host = document.getElementById("shipview");
  if (!host || failed) return;

  try {
    canvas = shipViewerCanvas();
  } catch (e) {
    failed = true;
    host.classList.add("no-webgl");
    host.innerHTML = `<div class="outfit-tip">The ship preview needs WebGL, which this browser did not provide.</div>`;
    return;
  }

  if (canvas.parentNode !== host) host.appendChild(canvas);
  canvas.className = "shipview-canvas";
  setShip(state.profile.ship);
  bindOnce();
  watchSize();
}

/** Wire the pointer and wheel handlers once, however often the panel redraws. */
function bindOnce() {
  if (canvas.dataset.bound) return;
  canvas.dataset.bound = "1";

  canvas.addEventListener("pointerdown", e => {
    drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", e => {
    if (!drag) return;
    dragShip(e.clientX - drag.x, e.clientY - drag.y);
    drag.x = e.clientX;
    drag.y = e.clientY;
  });

  const release = () => {
    if (!drag) return;
    if (canvas.hasPointerCapture(drag.id)) canvas.releasePointerCapture(drag.id);
    drag = null;
    canvas.classList.remove("dragging");
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  canvas.addEventListener(
    "wheel",
    e => {
      e.preventDefault();       // do not scroll the panel while zooming the ship
      zoomShip(e.deltaY);
    },
    { passive: false }
  );

  canvas.addEventListener("dblclick", () => {
    resetShipView();
  });
}

/** Keep the drawing buffer the same shape as the box, on every resize. */
function watchSize() {
  if (observer) observer.disconnect();
  observer = new ResizeObserver(fit);
  observer.observe(host);
  fit();
}

function fit() {
  if (!host || !canvas) return;
  const r = host.getBoundingClientRect();
  resizeShipViewer(Math.round(r.width), Math.round(r.height));
}

/**
 * One frame. Called from the main loop; does nothing unless the ship window is
 * actually on screen (docked, on the Outfitting tab, canvas attached).
 */
export function updateOutfitting(dt) {
  if (failed || !canvas || !canvas.isConnected) return;
  if (state.ui.intro || state.ui.tab !== "o") return;
  if (!state.player || !state.player.docked) return;
  renderShip();
}
