import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { targetOnScreen, targetHealthMarkup, markerStyle, lockMarkerStyle, markerClasses } from '../src/ui/target-display.js';

test('Target square visibility excludes behind-camera, offscreen and clipped targets', () => {
  assert.equal(targetOnScreen(-10, { x: 0, y: 0, z: 0.9 }), true);
  for (const [depth, p] of [[10, {x:0,y:0,z:0.9}], [-10,{x:1.01,y:0,z:0.9}],
    [-10,{x:0,y:-1.01,z:0.9}], [-10,{x:0,y:0,z:1.01}], [-10,{x:0,y:0,z:-1.01}]]) {
    assert.equal(targetOnScreen(depth, p), false);
  }
  const hud = readFileSync('src/ui/hud.js', 'utf8');
  assert.match(hud, /const visible = mark\(pos, lockedBeltName \?\? lockName\(lock\)/);
  assert.match(hud, /if \(visible\) mark\(pos, null/);
});
test('Both health rows have right-side percentages and safe clamped fills', () => {
  const html = targetHealthMarkup({ shield: 25, hull: 72 });
  assert.match(html, /target-shield.*width:25%.*target-percent">25%/);
  assert.match(html, /target-hull.*width:72%.*target-percent">72%/);
  assert.ok(html.indexOf('target-shield') < html.indexOf('target-hull'));
  const safe = targetHealthMarkup({ shield: -10, hull: 200 });
  assert.match(safe, /Shield 0%, hull 100%/);
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.target-health \{[^}]*width: 100%[^}]*margin: 2px 0 4px/);
});

test('Label, lock box and N-tab icon colours share one markerStyle source of truth across current and future kinds', () => {
  // Friendly stations (including Meridian), friendly ships, rifts, gates & caches are blue ("i").
  for (const kind of ['station', 's', 'Ship', 'Rift', 'r', 'Gate', 'g', 'Cache', 'k']) {
    assert.deepEqual(markerStyle(kind, {}), { tone: 'i', color: '' }, `${kind} uses friendly/info blue`);
  }
  assert.deepEqual(
    lockMarkerStyle({ k: 's', o: { place: 'reach', feature: 'meridian' } }, () => ({ kind: 'station', id: 'meridian' })),
    { tone: 'i', color: '' },
    'locking Meridian Station uses the same blue tone as its label'
  );
  assert.deepEqual(
    lockMarkerStyle({ k: 's', o: { place: 'x', feature: 'fort' } }, () => ({ kind: 'station', hostile: true })),
    { tone: 'h', color: '' },
    'a future hostile station inherits red automatically'
  );

  // Hostiles and enemy shots are red ("h"); asteroids, fields, cargo, planets and own shots are amber ("").
  for (const kind of ['Hostile', 'enemy', 'e']) {
    assert.deepEqual(markerStyle(kind, {}), { tone: 'h', color: '' });
  }
  assert.deepEqual(markerStyle('Projectile', { own: false }), { tone: 'h', color: '' });
  assert.deepEqual(markerStyle('Projectile', { own: true }), { tone: '', color: '' });
  for (const kind of ['Asteroid', 'a', 'asteroidField', 'Cargo', 'c', 'planet', 'scenery', 'Missile']) {
    assert.deepEqual(markerStyle(kind, {}), { tone: '', color: '' }, `${kind} uses default amber/brown`);
  }

  // Future objects with custom markerTone or markerColor propagate automatically without coding twice.
  const custom = { kind: 'relay', markerColor: '#6fd08c' };
  assert.deepEqual(markerStyle('relay', custom), { tone: '', color: '#6fd08c' });
  assert.deepEqual(lockMarkerStyle({ k: 'n', o: { source: custom, rowKind: 'relay' } }), { tone: '', color: '#6fd08c' });
  const ally = { kind: 'convoy', markerTone: 'ally' };
  assert.deepEqual(markerStyle('convoy', ally), { tone: 'ally', color: '' });
  assert.deepEqual(lockMarkerStyle({ k: 'n', o: { source: ally, rowKind: 'convoy' } }), { tone: 'ally', color: '' });
  assert.equal(markerClasses('mk', 'i', 'lock'), 'mk i lock');

  // Unsafe CSS strings are ignored rather than injected.
  assert.deepEqual(markerStyle('relay', { markerTone: 'bad class', markerColor: 'red;position:fixed' }), { tone: '', color: '' });
});

test('A prowling ship is incognito: grey "Unmarked" until it drops the role', async () => {
  // Floating label/lock tone: neutral grey while prowling, hostile red after.
  assert.deepEqual(markerStyle('Hostile', { role: 'prowl', hostile: true }), { tone: 'u', color: '' });
  assert.deepEqual(markerStyle('Hostile', { role: null, hostile: true }), { tone: 'h', color: '' });
  const { lockName } = await import('../src/sim/targeting.js');
  const ship = { n: 'Newbie Raider', role: 'prowl' };
  assert.equal(lockName({ k: 'e', o: ship }), 'Unmarked');
  ship.role = null; // aggression reveals the true identity
  assert.equal(lockName({ k: 'e', o: ship }), 'Newbie Raider');
  const hud = readFileSync('src/ui/hud.js', 'utf8');
  assert.match(hud, /e\.role === "prowl" \? "Unmarked"/);
  const css = readFileSync('src/styles.css', 'utf8');
  assert.match(css, /\.mk\.u, \.pocket-icon\.u \{\s*--marker-color: #a7adb2;/);
});
