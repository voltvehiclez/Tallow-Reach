import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  POCKET_FILTERS,
  pocketType,
  pocketRowsHtml,
  readPocketFilters,
  savePocketFilters,
  sortedPocketRows,
} from '../src/ui/pocket-list.js';
import { state, resetPlaces, placeWorld } from '../src/state/state.js';
import { createPlayer } from '../src/sim/player.js';
import { newProfile } from '../src/state/profile.js';
import { configurePlayer } from '../src/sim/session.js';
import { selectPocketObject, isPocketRowLocked, pruneLock, lockPosition } from '../src/sim/targeting.js';
import { V } from '../src/util/math.js';
import { pocketObjects } from '../src/sim/flight-instruments.js';
import { installInput, syncControls, pointer, keys } from '../src/core/input.js';
import { on, emit } from '../src/util/events.js';
import { loadHeadless } from './headless.mjs';

function setup() {
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  state.place = 'reach';
  state.profile = newProfile();
  state.warp = null;
  state.ui.navigation = false;
  const p = configurePlayer(createPlayer(), state.profile);
  p.docked = false;
  return p;
}

/** CSS selector specificity [ids, classes/attrs/pseudos, types/pseudo-elements] for layout cascade checks. */
function selectorSpecificity(selector) {
  const s = selector.replace(/:(?:not|has|is)\(([^)]*)\)/g, ' $1 ').replace(/:where\([^)]*\)/g, '');
  const pseudoEls = (s.match(/::[a-zA-Z0-9_-]+/g) || []).length;
  const withoutPseudoEls = s.replace(/::[a-zA-Z0-9_-]+/g, ' ');
  const ids = (withoutPseudoEls.match(/#[a-zA-Z0-9_-]+/g) || []).length;
  const cls = (withoutPseudoEls.match(/(\.[a-zA-Z0-9_-]+|\[[^\]]+\]|:[a-zA-Z0-9_-]+)/g) || []).length;
  const rest = withoutPseudoEls.replace(/#[a-zA-Z0-9_-]+|\.[a-zA-Z0-9_-]+|\[[^\]]+\]|:[a-zA-Z0-9_-]+/g, ' ');
  const types = (rest.match(/\b[a-zA-Z][a-zA-Z0-9-]*\b/g) || []).length + pseudoEls;
  return [ids, cls, types];
}

/** Flatten top-level and @media CSS rule blocks with source order preserved. */
function cssDisplayRules(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rules = [];
  let order = 0;
  const collect = source => {
    let i = 0;
    while (i < source.length) {
      const open = source.indexOf('{', i);
      if (open < 0) break;
      const prelude = source.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (j < source.length && depth > 0) {
        if (source[j] === '{') depth++;
        else if (source[j] === '}') depth--;
        j++;
      }
      const body = source.slice(open + 1, j - 1);
      if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
        collect(body);
      } else if (!prelude.startsWith('@')) {
        const disp = [...body.matchAll(/(?:^|;)\s*display\s*:\s*([^;]+)/g)].at(-1);
        if (disp) {
          for (const sel of prelude.split(',').map(x => x.trim()).filter(Boolean)) {
            if (!sel.includes('::')) {
              rules.push({ sel, sp: selectorSpecificity(sel), display: disp[1].trim(), order: ++order });
            }
          }
        }
      }
      i = j;
    }
  };
  collect(clean);
  return rules;
}

/** Effective CSS display of `#id` given its `hidden` boolean (honouring specificity and order). */
function resolvedDisplay(rules, id, hidden) {
  const matches = hidden ? [{ sel: '[hidden]', sp: [0, 1, 0], display: 'none', order: 0 }] : [];
  const idPattern = new RegExp(`#${id}(?![a-zA-Z0-9_-])`);
  for (const rule of rules) {
    const tail = rule.sel.split(/[\s>+~]+/).at(-1);
    if (!idPattern.test(tail)) continue;
    if (!hidden && tail.includes('[hidden]')) continue;
    if (hidden && tail.includes(':not([hidden])')) continue;
    matches.push(rule);
  }
  if (!matches.length) return 'block';
  matches.sort((a, b) => a.sp[0] - b.sp[0] || a.sp[1] - b.sp[1] || a.sp[2] - b.sp[2] || a.order - b.order);
  return matches.at(-1).display;
}

/** Minimal DOM element supporting HUD wiring, event bubbling, selection classes and HTML rows. */
function makeHudDom() {
  const byId = new Map();
  const doc = { activeElement: null, body: null };

  const makeClassList = owner => {
    const set = new Set();
    return {
      add: (...names) => names.forEach(n => set.add(n)),
      remove: (...names) => names.forEach(n => set.delete(n)),
      toggle: (name, force) => {
        const on = force === undefined ? !set.has(name) : Boolean(force);
        if (on) set.add(name); else set.delete(name);
        return on;
      },
      contains: name => set.has(name),
    };
  };

  function makeNode(tag, attrs = {}, parent = null) {
    const listeners = new Map();
    const attrMap = new Map(Object.entries(attrs));
    const node = {
      tagName: tag.toUpperCase(),
      id: attrs.id || '',
      hidden: Boolean(attrs.hidden),
      open: Boolean(attrs.open),
      checked: Boolean(attrs.checked),
      type: attrs.type || '',
      textContent: '',
      style: {
        _cssText: '',
        display: '',
        get cssText() { return this._cssText; },
        set cssText(v) { this._cssText = String(v); this.display = v.includes('display:block') ? 'block' : ''; },
      },
      dataset: {},
      parentElement: parent,
      children: [],
      classList: null,
      _html: '',
      get innerHTML() { return this._html; },
      set innerHTML(html) {
        this._html = String(html);
        // A real browser derives textContent from the parsed markup (the HUD
        // marker labels are name/distance spans since the label-shake fix).
        this.textContent = this._html.replace(/<[^>]+>/g, '');
        this.children = [];
        if (this.id === 'pocket-object-rows') {
          const itemRe = /<li([^>]*)><button([^>]*)>([\s\S]*?)<\/button><\/li>/g;
          for (const [, liAttrs, btnAttrs, content] of this._html.matchAll(itemRe)) {
            const li = makeNode('li', {}, this);
            if (/class="[^"]*\bselected\b/.test(liAttrs)) li.classList.add('selected');
            const idx = btnAttrs.match(/data-pocket-row="(\d+)"/)?.[1] ?? '';
            const pressed = btnAttrs.match(/aria-pressed="(true|false)"/)?.[1] ?? 'false';
            const btn = makeNode('button', { type: 'button', 'aria-pressed': pressed }, li);
            btn.dataset.pocketRow = idx;
            btn.textContent = content.replace(/<[^>]+>/g, '');
            if (/class="[^"]*\bselected\b/.test(btnAttrs)) btn.classList.add('selected');
            li.children.push(btn);
            this.children.push(li);
          }
        } else if (this.id === 'pocket-filters') {
          for (const [, filter, rest] of this._html.matchAll(/data-pocket-filter="([^"]+)"([^>]*)/g)) {
            const input = makeNode('input', { type: 'checkbox', checked: rest.includes('checked') }, this);
            input.dataset.pocketFilter = filter;
            this.children.push(input);
          }
        }
      },
      appendChild(child) { child.parentElement = this; this.children.push(child); return child; },
      setAttribute(k, v) { attrMap.set(k, String(v)); },
      getAttribute(k) { return attrMap.get(k) ?? null; },
      addEventListener(type, fn) {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type).push(fn);
      },
      dispatch(type, extra = {}) {
        let stopped = false;
        const event = {
          type,
          target: this,
          detail: 1,
          preventDefault() {},
          stopPropagation() { stopped = true; },
          ...extra,
        };
        let cur = this;
        while (cur && !stopped) {
          for (const fn of cur._listeners.get(type) || []) fn(event);
          cur = cur.parentElement;
        }
      },
      focus() { doc.activeElement = this; },
      blur() { if (doc.activeElement === this) doc.activeElement = null; },
      contains(other) {
        let cur = other;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentElement;
        }
        return false;
      },
      matches(sel) {
        if (sel === '#close-pocket-objects') return this.id === 'close-pocket-objects';
        if (sel === '[data-pocket-sort]') return this.dataset.pocketSort !== undefined;
        if (sel === '[data-pocket-row]' || sel === 'button[data-pocket-row]') return this.dataset.pocketRow !== undefined;
        if (sel === 'details') return this.tagName === 'DETAILS';
        return false;
      },
      closest(sel) {
        let cur = this;
        while (cur) {
          if (cur.matches(sel)) return cur;
          cur = cur.parentElement;
        }
        return null;
      },
      querySelectorAll(sel) {
        const out = [];
        const walk = n => {
          for (const ch of n.children) {
            if (ch.matches(sel)) out.push(ch);
            walk(ch);
          }
        };
        walk(this);
        return out;
      },
      querySelector(sel) { return this.querySelectorAll(sel)[0] || null; },
      getContext() {
        return {
          clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
        };
      },
      _listeners: listeners,
    };
    node.classList = makeClassList(node);
    if (node.id) byId.set(node.id, node);
    return node;
  }

  doc.body = makeNode('body');
  doc.createElement = tag => makeNode(tag);
  doc.getElementById = id => byId.get(id) || null;

  const hudRoot = makeNode('div', { id: 'hud', hidden: true }, doc.body);
  doc.body.appendChild(hudRoot);
  const nav = makeNode('div', { id: 'pocket-objects', hidden: true }, hudRoot);
  const header = makeNode('header', {}, nav);
  const closeBtn = makeNode('button', { id: 'close-pocket-objects', type: 'button' }, header);
  header.appendChild(closeBtn);
  const tools = makeNode('div', {}, nav);
  for (const key of ['name', 'type', 'distance']) {
    const b = makeNode('button', { type: 'button', 'aria-pressed': String(key === 'distance') }, tools);
    b.dataset.pocketSort = key;
    tools.appendChild(b);
  }
  const details = makeNode('details', {}, tools);
  const filters = makeNode('div', { id: 'pocket-filters' }, details);
  details.appendChild(filters);
  tools.appendChild(details);
  const rows = makeNode('ul', { id: 'pocket-object-rows' }, nav);
  nav.appendChild(header);
  nav.appendChild(tools);
  nav.appendChild(rows);
  hudRoot.appendChild(nav);

  for (const id of [
    'weapon-lead', 'weapon-slots', 'b1', 'b2', 'b3', 'boost-val', 'hud-route',
    'sh-val', 'hull-val', 'tr', 'system-name', 'pocket-name', 'throttle-fill',
    'throttle-label', 'speed', 'sh-pct', 'hull-pct', 'boost-pct', 'pw-pct',
    'pwbar', 'pw-val', 'pw-flow', 'bm', 'bmbar', 'bm-name', 'bm-pct',
    'pr', 'msg', 'cur', 'mcone', 'retc', 'flash', 'mk',
  ]) {
    hudRoot.appendChild(makeNode(id === 'retc' ? 'canvas' : 'div', { id, hidden: id === 'weapon-lead' || id === 'hud-route' || id === 'bm' }, hudRoot));
  }

  return { doc, byId, nav, closeBtn, tools, details, filters, rows };
}

test('Filters persist every tick including all-off and survive denied/corrupt storage', () => {
  let data = null;
  const storage = { getItem: () => data, setItem: (key, value) => (data = value) };
  let f = readPocketFilters(storage);
  assert.ok(POCKET_FILTERS.every(k => f[k]));
  f.Asteroid = false;
  savePocketFilters(storage, f);
  assert.equal(readPocketFilters(storage).Asteroid, false);
  f = Object.fromEntries(POCKET_FILTERS.map(k => [k, false]));
  savePocketFilters(storage, f);
  assert.deepEqual(readPocketFilters(storage), f);
  data = 'broken';
  assert.equal(readPocketFilters(storage).Ship, true);
  assert.doesNotThrow(() => savePocketFilters(null, f));
  assert.equal(readPocketFilters(null).Station, true);
  assert.equal(pocketType('Hostile'), 'Ship');
  assert.equal(pocketType('station'), 'Station');
  assert.equal(pocketType('new-feature'), 'Other');
});

test('Sorting by name/type/distance is stable, reversible and independent of source rows', () => {
  const rows = [
    { name: 'Zinc', kind: 'Asteroid', distance: 2 },
    { name: 'Alpha', kind: 'Hostile', distance: 3 },
    { name: 'Port', kind: 'station', distance: 1 },
  ];
  assert.deepEqual(sortedPocketRows(rows, {}, 'name').map(r => r.name), ['Alpha', 'Port', 'Zinc']);
  assert.deepEqual(sortedPocketRows(rows, {}, 'distance').map(r => r.distance), [1, 2, 3]);
  assert.deepEqual(sortedPocketRows(rows, {}, 'distance', -1).map(r => r.distance), [3, 2, 1]);
  assert.equal(sortedPocketRows(rows, {}, 'type')[0].kind, 'Asteroid');
  assert.equal(sortedPocketRows(rows, { Asteroid: false }).length, 2);
  assert.equal(rows[0].name, 'Zinc');
});

test('Click targets use F records, toggle off, reject stale rows and match selected-row state across every class', () => {
  const p = setup();
  const w = placeWorld('reach');
  for (const [list, k] of [
    ['enemies', 'e'], ['asteroids', 'a'], ['crates', 'c'],
    ['rifts', 'r'], ['gates', 'g'], ['caches', 'k'],
  ]) {
    const obj = { pos: V(1, 2, 3), n: list, hp: 10 };
    w[list].push(obj);
    assert.equal(selectPocketObject(obj, p), true);
    assert.equal(p.flight.lock.k, k);
    assert.equal(p.flight.lock.o, obj);
    const liveRows = pocketObjects(p);
    const matched = liveRows.filter(r => isPocketRowLocked(r, p.flight.lock, p.place));
    assert.equal(matched.length, 1, `${list}: exactly one row matches the active lock`);
    assert.equal(matched[0].object, obj);
    selectPocketObject(obj, p);
    assert.equal(p.flight.lock, null);
    assert.equal(liveRows.some(r => isPocketRowLocked(r, p.flight.lock, p.place)), false);
    w[list].pop();
    assert.equal(selectPocketObject(obj, p), false);
  }

  // Two same-named rocks: only the locked rock row is marked selected.
  const rockA = { pos: V(10, 0, 0), type: 'ferrite', ore: 3 };
  const rockB = { pos: V(10, 0, 0), type: 'ferrite', ore: 3 };
  w.asteroids.push(rockA, rockB);
  selectPocketObject(rockB, p);
  const rockRows = pocketObjects(p).filter(r => r.kind === 'Asteroid');
  assert.equal(isPocketRowLocked(rockRows.find(r => r.object === rockA), p.flight.lock, p.place), false);
  assert.equal(isPocketRowLocked(rockRows.find(r => r.object === rockB), p.flight.lock, p.place), true);
  w.asteroids.length = 0;

  // Derived place features (station and asteroid field) stay selected across fresh placeDef copies.
  const station = pocketObjects(p).find(r => r.kind === 'station').object;
  selectPocketObject(station, p);
  assert.equal(p.flight.lock.k, 's');
  assert.equal(p.flight.lock.o.feature, station.id);
  const refreshedStation = pocketObjects(p).find(r => r.kind === 'station');
  assert.notEqual(refreshedStation.object, station, 'placeDef returns a fresh feature object');
  assert.equal(isPocketRowLocked(refreshedStation, p.flight.lock, p.place), true);
  assert.equal(isPocketRowLocked(refreshedStation, p.flight.lock, 'hollow'), false);

  const field = pocketObjects(p).find(r => r.kind === 'asteroidField').object;
  selectPocketObject(field, p);
  assert.equal(p.flight.lock.k, 'n');
  const refreshedField = pocketObjects(p).find(r => r.kind === 'asteroidField');
  assert.equal(isPocketRowLocked(refreshedField, p.flight.lock, p.place), true);

  // Runtime extras (projectiles) also highlight while live and clear when pruned.
  const bullet = { pos: V(5, 6, 7) };
  w.bullets.push(bullet);
  selectPocketObject(bullet, p);
  assert.equal(p.flight.lock.k, 'n');
  assert.equal(isPocketRowLocked(pocketObjects(p).find(r => r.object === bullet), p.flight.lock, p.place), true);
  bullet.pos.x = 10;
  pruneLock(p);
  assert.equal(lockPosition(p.flight.lock).x, 10);
  w.bullets.pop();
  pruneLock(p);
  assert.equal(p.flight.lock, null);

  // Pure markup puts `selected` and `aria-pressed="true"` on the active row only.
  const sample = [
    { name: 'Alpha', kind: 'Hostile', distance: 500 },
    { name: 'Meridian Station', kind: 'station', distance: 1000 },
  ];
  const html = pocketRowsHtml(sample, (_, i) => i === 1);
  assert.match(html, /<li class="selected"><button type="button" class="selected" data-pocket-row="1" aria-pressed="true"/);
  assert.match(html, /<li><button type="button" data-pocket-row="0" aria-pressed="false"/);
  assert.equal(pocketRowsHtml([]), '<li class="pocket-empty">No matching objects.</li>');
});

test('Browsing zeros mouse steering/fire while preserving keyboard throttle and resets pointer on close', () => {
  const p = setup();
  state.ui.navigation = true;
  pointer.x = 1;
  pointer.y = -1;
  keys.fire = keys.sec = 1;
  keys.KeyW = 1;
  syncControls();
  assert.equal(p.controls.steer.x, 0);
  assert.equal(p.controls.steer.y, 0);
  assert.equal(p.controls.fire, false);
  assert.equal(p.controls.thrust, 1);
  state.ui.navigation = false;
  emit('navigation-input');
  assert.equal(pointer.x, 0);
  assert.equal(p.controls.fire, false);
  keys.KeyW = 0;
  syncControls();
});

test('Every [hidden] UI surface resolves to display:none, including #hud > #pocket-objects', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const rules = cssDisplayRules(css);
  const toggleableIds = [
    'hud', 'hud-route', 'pocket-objects', 'weapon-lead', 'bm', 'panel',
    'panel-notice', 'cargo', 'cache', 'mission-alert', 'dialogue-panel', 'pz', 'starmap',
  ];
  for (const id of toggleableIds) {
    assert.equal(
      resolvedDisplay(rules, id, true),
      'none',
      `#${id}[hidden] must resolve to display:none, not be overridden by a higher-specificity display rule`
    );
  }
  assert.equal(resolvedDisplay(rules, 'pocket-objects', false), 'flex', 'open pocket list stays a flex column');
});

test('KeyN still closes the pocket list when a filter checkbox has focus, while text fields swallow KeyN', () => {
  const handlers = {};
  const prevAdd = globalThis.addEventListener;
  globalThis.addEventListener = (name, fn) => { handlers[name] = fn; };
  const actions = [];
  const off = on('action', payload => actions.push(payload));
  try {
    state.ui.starmap = state.ui.cargo = state.ui.cache = null;
    installInput();
    const fire = (code, target, repeat = false) =>
      handlers.keydown({ code, repeat, altKey: false, target, preventDefault() {} });

    fire('KeyN', { tagName: 'BODY' });
    fire('KeyN', { tagName: 'BUTTON' });
    fire('KeyN', { tagName: 'INPUT', type: 'checkbox' });
    assert.deepEqual(
      actions.filter(a => a.name === 'navigation').map(a => a.key),
      ['KeyN', 'KeyN', 'KeyN'],
      'body, panel buttons and filter checkboxes all emit navigation on N'
    );

    // Text, number, select and textarea controls must never trigger N while typing.
    const before = actions.length;
    fire('KeyN', { tagName: 'INPUT', type: 'number' });
    fire('KeyN', { tagName: 'INPUT', type: 'text' });
    fire('KeyN', { tagName: 'INPUT' });
    fire('KeyN', { tagName: 'SELECT' });
    fire('KeyN', { tagName: 'TEXTAREA' });
    assert.equal(actions.length, before, 'typing controls never toggle the N list');

    // Escape still leaves inputs and checkboxes cleanly.
    fire('Escape', { tagName: 'INPUT', type: 'checkbox' });
    fire('Escape', { tagName: 'INPUT', type: 'number' });
    assert.equal(actions.filter(a => a.name === 'pause').length, 2);
  } finally {
    if (typeof off === 'function') off();
    globalThis.addEventListener = prevAdd;
    keys.KeyN = keys.Escape = 0;
    syncControls();
  }
});

test('Live HUD opens and closes with N, Close button, Escape and docking, and updates row selection immediately', async () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const rules = cssDisplayRules(css);
  const prevDoc = globalThis.document;
  const prevAdd = globalThis.addEventListener;
  const prevStorage = globalThis.localStorage;
  const prevW = globalThis.innerWidth;
  const prevH = globalThis.innerHeight;

  const { doc, nav, closeBtn, tools, details, filters, rows } = makeHudDom();
  const store = new Map();
  globalThis.document = doc;
  globalThis.addEventListener = () => {};
  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
  globalThis.innerWidth = 1280;
  globalThis.innerHeight = 720;

  try {
    const hud = await loadHeadless('src/ui/hud.js', {
      state: 'src/state/state.js',
      on: 'src/util/events.js',
      emit: 'src/util/events.js',
      createPlayer: 'src/sim/player.js',
      configurePlayer: 'src/sim/session.js',
      newProfile: 'src/state/profile.js',
      selectPocketObject: 'src/sim/targeting.js',
      V: 'src/util/math.js',
    });
    const hs = hud.state;
    hs.players.length = 0;
    hs.localPlayerIndex = 0;
    hs.place = 'reach';
    hs.ui.intro = false;
    hs.paused = false;
    hs.warp = null;
    hs.profile = hud.newProfile();
    const p = hud.configurePlayer(hud.createPlayer(), hs.profile);
    p.docked = false;
    const enemy = { id: 'e1', pos: hud.V(0, 0, -250), v: hud.V(), n: 'Raider', hp: 10, mx: 10 };
    const rock = { id: 'a1', pos: hud.V(0, 0, -400), type: 'ferrite', ore: 4 };
    hs.world.enemies.push(enemy);
    hs.world.asteroids.push(rock);

    hud.on('navigation-select', obj => {
      if (hs.ui.navigation && !hs.paused && !p.docked && !hs.warp) hud.selectPocketObject(obj, p);
    });
    const pressN = (repeat = false) => {
      const playing = !hs.ui.intro && !p.docked && !hs.paused && !hs.ui.starmap && !hs.ui.cargo && !hs.ui.cache;
      if (playing && !repeat) hud.emit('navigation-toggle');
    };
    const pressEscape = () => {
      if (hs.ui.navigation) hud.emit('navigation-toggle', false);
    };

    hud.setupHud();
    hud.emit('launched', { player: p });
    assert.equal(nav.hidden, true);
    assert.equal(hs.ui.navigation, false);
    assert.equal(resolvedDisplay(rules, 'pocket-objects', nav.hidden), 'none');

    // Open with N, resist key repeat, then close with N.
    pressN(false);
    assert.equal(nav.hidden, false);
    assert.equal(hs.ui.navigation, true);
    assert.equal(doc.body.classList.contains('navigation-open'), true);
    assert.equal(resolvedDisplay(rules, 'pocket-objects', nav.hidden), 'flex');
    pressN(true);
    assert.equal(nav.hidden, false, 'key repeat must not close the panel');
    pressN(false);
    assert.equal(nav.hidden, true);
    assert.equal(hs.ui.navigation, false);
    assert.equal(doc.body.classList.contains('navigation-open'), false);
    assert.equal(resolvedDisplay(rules, 'pocket-objects', nav.hidden), 'none');

    // Open with N, expand filters, hover list, focus a filter checkbox, then click Close button.
    pressN(false);
    hud.updateHud(1 / 60);
    assert.ok(rows.children.length >= 3, 'live pocket rows render when opened');
    details.open = true;
    rows.dispatch('pointerenter');
    filters.children[0].focus();
    closeBtn.dispatch('click');
    assert.equal(nav.hidden, true, 'Close button hides the pocket list');
    assert.equal(hs.ui.navigation, false, 'Close button clears navigation state');
    assert.equal(doc.body.classList.contains('navigation-open'), false, 'Close button restores mission HUD');
    assert.equal(resolvedDisplay(rules, 'pocket-objects', nav.hidden), 'none');
    assert.equal(details.open, false, 'Close collapses the filter menu');
    assert.equal(rows.dataset.hover, undefined, 'Close releases hover freeze for next open');
    assert.equal(doc.activeElement, null, 'Close releases focus inside the panel');

    // Open again, select and switch rows while hovered: white-rectangle class updates immediately without reordering.
    pressN(false);
    hud.updateHud(1 / 60);
    rows.dispatch('pointerenter');
    const initialLabels = rows.children.map(li => li.children[0].textContent);
    const firstBtn = rows.children[0].children[0];
    const secondBtn = rows.children[1].children[0];
    firstBtn.focus();
    firstBtn.dispatch('click', { detail: 1 });
    assert.equal(firstBtn.classList.contains('selected'), true);
    assert.equal(firstBtn.parentElement.classList.contains('selected'), true);
    assert.equal(firstBtn.getAttribute('aria-pressed'), 'true');
    assert.equal(secondBtn.classList.contains('selected'), false);
    assert.equal(doc.activeElement, null, 'pointer click releases focus so flight Space cannot re-click row');
    assert.deepEqual(rows.children.map(li => li.children[0].textContent), initialLabels, 'row order stays frozen under pointer');

    // Switch selection to row 2, then toggle row 2 off.
    secondBtn.dispatch('click', { detail: 1 });
    assert.equal(firstBtn.classList.contains('selected'), false);
    assert.equal(secondBtn.classList.contains('selected'), true);
    secondBtn.dispatch('click', { detail: 1 });
    assert.equal(secondBtn.classList.contains('selected'), false);
    assert.equal(p.flight.lock, null);

    // Live world markers & lock boxes share exact label colours (Meridian blue, Raider red, Asteroid amber, Rift blue).
    const activeMarkers = () => doc.getElementById('mk').children.filter(m => m.style.display === 'block');
    p.flight.lock = null;
    hud.updateHud(1 / 60);
    const idleMeridian = activeMarkers().find(m => m.textContent.startsWith('Meridian Station'));
    assert.equal(idleMeridian?.className, 'mk i', 'Meridian Station floating label is blue');

    p.flight.lock = { k: 's', o: { place: 'reach', feature: 'meridian' } };
    hud.updateHud(1 / 60);
    const lockedMeridian = activeMarkers().find(m => m.textContent.startsWith('Meridian Station'));
    assert.equal(lockedMeridian?.className, 'mk i lock', 'locking Meridian Station keeps it blue instead of brown');
    assert.ok(activeMarkers().every(m => !m.className.endsWith('lk') || m.className === 'mk i lk'), 'station lock box is blue');

    p.flight.lock = { k: 'a', o: rock };
    hud.updateHud(1 / 60);
    assert.equal(activeMarkers().find(m => m.textContent.startsWith('Ferrite rock'))?.className, 'mk lock', 'asteroid lock uses default amber-brown');

    const rift = { id: 901, kind: 'rift', n: 'Rift', pos: hud.V(0, 0, -250), r: 20 };
    hs.world.rifts.push(rift);
    p.flight.lock = { k: 'r', o: rift };
    hud.updateHud(1 / 60);
    assert.equal(activeMarkers().find(m => m.textContent.startsWith('Rift'))?.className, 'mk i lock', 'rift lock matches its blue label');
    hs.world.rifts.pop();

    const customRock = { id: 'a2', pos: hud.V(0, 0, -300), type: 'ferrite', ore: 2, markerColor: '#6fd08c' };
    hs.world.asteroids.push(customRock);
    p.flight.lock = { k: 'a', o: customRock };
    hud.updateHud(1 / 60);
    assert.match(activeMarkers().find(m => m.textContent.startsWith('Ferrite rock'))?.style.cssText || '', /--marker-color:#6fd08c/, 'future custom markerColor propagates to lock marker');
    hs.world.asteroids.pop();
    p.flight.lock = null;

    // F-lock while hovered reflects immediately on the matching row and clears when target dies.
    p.flight.lock = { k: 'e', o: enemy };
    hud.updateHud(1 / 60);
    assert.equal(activeMarkers().find(m => m.innerHTML.includes('Raider'))?.className, 'mk h lock', 'hostile lock matches its red label');
    const selectedBtns = rows.querySelectorAll('button[data-pocket-row]').filter(b => b.classList.contains('selected'));
    assert.equal(selectedBtns.length, 1);
    assert.match(selectedBtns[0].textContent, /Raider/);

    // Leaving hover and sorting by name preserves selection on the Raider row.
    rows.dispatch('pointerleave');
    tools.children[0].dispatch('click', { detail: 1 });
    hud.updateHud(1 / 60);
    const afterSort = rows.querySelectorAll('button[data-pocket-row]').filter(b => b.classList.contains('selected'));
    assert.equal(afterSort.length, 1);
    assert.match(afterSort[0].textContent, /Raider/);

    // Removing the locked hostile drops both the lock and the row highlight.
    hs.world.enemies.length = 0;
    rows.dispatch('pointerenter');
    hud.updateHud(1 / 60);
    assert.equal(p.flight.lock, null);
    assert.equal(rows.querySelectorAll('button[data-pocket-row]').some(b => b.classList.contains('selected')), false);

    // Escape closes without pausing; docking also closes.
    pressEscape();
    assert.equal(nav.hidden, true);
    assert.equal(hs.ui.navigation, false);
    pressN(false);
    assert.equal(nav.hidden, false);
    hud.emit('docked', { player: p });
    assert.equal(nav.hidden, true);
    assert.equal(hs.ui.navigation, false);
  } finally {
    globalThis.document = prevDoc;
    globalThis.addEventListener = prevAdd;
    globalThis.localStorage = prevStorage;
    globalThis.innerWidth = prevW;
    globalThis.innerHeight = prevH;
  }

  // main.js closes a top modal before the N panel on Escape, and closes N on P.
  const main = readFileSync('src/main.js', 'utf8');
  const pauseBranch = main.slice(main.indexOf('case "pause":'), main.indexOf('addEventListener("resize"'));
  assert.ok(pauseBranch.indexOf('isStarmapOpen()') < pauseBranch.indexOf('else if (state.ui.navigation)'));
  assert.match(pauseBranch, /else if \(state\.ui\.navigation\) \{\s*emit\("navigation-toggle", false\)/);
});

test('Compact 16px rows have faint grey separators, full-row white selection outline and 35+ rows at 720p', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /#pocket-object-rows li \{ margin: 0; padding: 0; height: 16px; \}/);
  const rowRule = css.match(/#pocket-object-rows button \{([^}]*)\}/)?.[1] || '';
  assert.match(rowRule, /\bwidth: 100%/);
  assert.match(rowRule, /\bheight: 16px/);
  assert.match(rowRule, /\bpadding: 0 \d+px/);
  assert.match(rowRule, /\bborder: 0/);
  const sep = rowRule.match(/box-shadow: inset 0 -1px 0 rgba\((\d+),(\d+),(\d+),(\.\d+|0\.\d+)\)/);
  assert.ok(sep, 'rows carry an inset 1px bottom separator that adds zero layout height');
  assert.equal(sep[1], sep[2], 'separator is neutral grey');
  assert.equal(sep[2], sep[3], 'separator is neutral grey');
  assert.ok(Number(sep[4]) > 0 && Number(sep[4]) <= 0.3, 'separator stays faint');

  assert.match(
    css,
    /#pocket-object-rows li\.selected > button, #pocket-object-rows li\.selected > button:hover, #pocket-object-rows li\.selected > button:focus-visible \{[^}]*box-shadow: inset 0 0 0 1px #fff/
  );
  assert.match(css, /#pocket-object-rows li:not\(\.selected\):has\(\+ li\.selected\) > button:not\(:focus-visible\) \{ box-shadow: none; \}/);

  // Left hollow-square icon inherits --marker-color from the shared .mk/.pocket-icon rules and keeps 16px rows.
  assert.match(css, /\.mk,\s*\.pocket-icon\s*\{\s*--marker-color:\s*var\(--amber\)/);
  assert.match(css, /\.mk\.h,\s*\.pocket-icon\.h\s*\{\s*--marker-color:\s*var\(--red\)/);
  assert.match(css, /\.mk\.i,\s*\.pocket-icon\.i\s*\{\s*--marker-color:\s*var\(--ice\)/);
  const iconRule = css.match(/#pocket-object-rows \.pocket-icon \{([^}]*)\}/)?.[1] || '';
  const iconW = Number(iconRule.match(/\bwidth:\s*(\d+)px/)?.[1]);
  const iconH = Number(iconRule.match(/\bheight:\s*(\d+)px/)?.[1]);
  assert.ok(iconW > 0 && iconW === iconH && iconH <= 12, `icon is a ${iconW}x${iconH}px square inside 16px row`);
  assert.match(iconRule, /border:\s*1px solid var\(--marker-color\)/);
  assert.match(iconRule, /background:\s*none/);

  // pocketRowsHtml puts the hollow-square icon to the left of every object name with inherited colours.
  const html = pocketRowsHtml([
    { kind: 'station', name: 'Meridian Station', distance: 1200, object: { kind: 'station', id: 'meridian' } },
    { kind: 'Hostile', name: 'Raider', distance: 800, object: { kind: 'enemy' } },
    { kind: 'Asteroid', name: 'Ferrite', distance: 500, object: { kind: 'rock' } },
    { kind: 'relay', name: 'Signal Buoy', distance: 900, object: { kind: 'relay', markerColor: '#6fd08c' } },
  ]);
  assert.match(html, /<i class="pocket-icon i" aria-hidden="true"><\/i><span class="pocket-name">Meridian Station/);
  assert.match(html, /<i class="pocket-icon h" aria-hidden="true"><\/i><span class="pocket-name">Raider/);
  assert.match(html, /<i class="pocket-icon" aria-hidden="true"><\/i><span class="pocket-name">Ferrite/);
  assert.match(html, /<i class="pocket-icon" style="--marker-color:#6fd08c" aria-hidden="true"><\/i><span class="pocket-name">Signal Buoy/);

  assert.ok(Math.floor((720 - 20 - 24 - 64) / 16) >= 35);
  assert.match(css, /body\.navigation-open #tr \{ visibility: hidden/);
  assert.match(css, /--weapon-bottom: calc\(123\.2px - 25px - var\(--weapon-size\)\)/);
  assert.match(css, /#bc \{[^}]*bottom: calc\(var\(--weapon-bottom\) - 6px - 24px\)/);
  const weaponBottom = 123.2 - 25 - 44;
  const throttleBottom = weaponBottom - 6 - 24;
  assert.equal(Math.round((weaponBottom - (throttleBottom + 24)) * 10) / 10, 6);
  assert.equal(weaponBottom + 25 + 44, 123.2);
});

test('N panel, weapon slots, status boxes and throttle share slight transparency while keeping meter and throttle colours', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const surface = css.match(/--hud-surface:\s*rgba\((\d+),(\d+),(\d+),(\.\d+|0\.\d+)\)/);
  const selected = css.match(/--hud-surface-selected:\s*rgba\((\d+),(\d+),(\d+),(\.\d+|0\.\d+)\)/);
  const throttleBg = css.match(/--hud-throttle-bg:\s*rgba\((\d+),(\d+),(\d+),(\.\d+|0\.\d+)\)/);
  assert.ok(surface && selected && throttleBg, 'shared HUD transparency variables are defined as rgba()');

  const alpha = Number(surface[4]);
  assert.ok(alpha >= 0.55 && alpha <= 0.85, `HUD surface alpha ${alpha} should be slightly transparent`);
  assert.equal(Number(selected[4]), alpha, 'selected weapon slot matches surface transparency');
  assert.equal(Number(throttleBg[4]), alpha, 'throttle background uses slight transparency');
  assert.deepEqual(throttleBg.slice(1, 4).map(Number), [20, 27, 32], 'throttle preserves its #141b20 base RGB');

  // N panel, weapon slots and grey status boxes share the exact same background token.
  assert.match(css, /#hud > #pocket-objects \{[^}]*background: var\(--hud-surface\)/);
  assert.match(css, /\.weapon-slot \{[^}]*background: var\(--hud-surface\)/);
  assert.match(css, /\.weapon-slot\.selected \{[^}]*background: var\(--hud-surface-selected\)/);
  assert.match(css, /\.vital-column::before \{[^}]*background: var\(--hud-surface\)/);

  // Coloured meter fills stay solid and keep their original hues.
  const fillRule = css.match(/\.vital-track i \{([^}]*)\}/)?.[1] || '';
  assert.match(fillRule, /background: currentColor/);
  assert.doesNotMatch(fillRule, /\bopacity\b/);
  assert.doesNotMatch(css.match(/\.vital-column \{([^}]*)\}/)?.[1] || '', /\bopacity\b/);
  assert.match(css, /\.vital-hull \{ color: var\(--ink\); \}/);
  assert.match(css, /\.vital-shield, \.vital-power \{ color: var\(--ice\); \}/);
  assert.match(css, /\.vital-boost \{ color: var\(--amber\); \}/);

  // Throttle background is slightly transparent while border, fill stripes and text colours stay unchanged.
  assert.match(css, /#throttle-track \{[^}]*border: 1px solid var\(--line\); background: var\(--hud-throttle-bg\)/);
  assert.match(css, /#throttle-fill \{[^}]*background: rgba\(127,183,196,\.4\)/);
  assert.match(css, /#throttle-fill\.reverse \{[^}]*repeating-linear-gradient\(135deg, rgba\(127,183,196,\.4\) 0 4px, rgba\(127,183,196,\.16\) 4px 8px\)/);
  assert.match(css, /#throttle-label \{[^}]*color: var\(--ink\)/);
  assert.match(css, /#speed \{[^}]*color: var\(--ink\)/);
});
