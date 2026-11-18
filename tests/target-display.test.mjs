import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { targetOnScreen, targetHealthMarkup } from '../src/ui/target-display.js';

test('Target square visibility excludes behind-camera, offscreen and clipped targets', () => {
  assert.equal(targetOnScreen(-10, { x: 0, y: 0, z: 0.9 }), true);
  for (const [depth, p] of [[10, {x:0,y:0,z:0.9}], [-10,{x:1.01,y:0,z:0.9}],
    [-10,{x:0,y:-1.01,z:0.9}], [-10,{x:0,y:0,z:1.01}], [-10,{x:0,y:0,z:-1.01}]]) {
    assert.equal(targetOnScreen(depth, p), false);
  }
  const hud = readFileSync('src/ui/hud.js', 'utf8');
  assert.match(hud, /const visible = mark\(pos, lockName\(lock\)/);
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
