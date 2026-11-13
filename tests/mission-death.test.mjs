// Death and missions. Dying is punishment enough, so it does not fail a mission by default.
// A mission fails on death only when its data says so on purpose, or when the ship was carrying a
// mission-only item the mission needs (the hold is lost, the item cannot be found again).
// Every failure carries a message, and the "mission failed" notice shows it to the pilot.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emit } from "../src/util/events.js";
import { PARCEL_RUN, AMBUSH_RUN, RADIO_RELAY, ORE_RUN } from "../src/data/missions/test-missions.js";
import { missionOnlyItems, activeMissions, isMissionFailed, failMission } from "../src/sim/missions.js";
import { failureNoticeHtml } from "../src/ui/missionlog.js";
import { accept, ledger, newPilot, resetLedger } from "./mission-driver.mjs";

const withPilot = fn => { const ctx = newPilot(); try { return fn(ctx); } finally { ctx.restore(); } };
const dieWith = (ctx, lost) => emit("player-dead", { player: ctx.player, profile: ctx.profile, lost });

test("death: missions without a death rule carry on after the ship is destroyed", () => withPilot(ctx => {
  for (const def of [RADIO_RELAY, ORE_RUN]) {
    resetLedger();
    accept(ctx, def);
    dieWith(ctx, { ferrite: 5 });
    assert.equal(activeMissions(ctx.profile).length, 1, `${def.id} is still active`);
    assert.deepEqual(ledger.failed, [], `${def.id} did not fail`);
    ctx.profile.missions.length = 0;
  }
}));

test("death: a mission item aboard fails the mission and says so; one left behind does not", () => withPilot(ctx => {
  assert.deepEqual(missionOnlyItems(PARCEL_RUN), ["parcel"]);
  accept(ctx, PARCEL_RUN);
  dieWith(ctx, {});
  assert.deepEqual(ledger.failed, [], "no parcel aboard, so nothing was lost");
  dieWith(ctx, { parcel: 1 });
  assert.equal(ledger.failed.length, 1);
  assert.match(ledger.failed[0].message, /ship was destroyed and the .*parcel.* was lost/i);
  assert.equal(ledger.failed[0].title, PARCEL_RUN.title);
  assert.equal(activeMissions(ctx.profile).length, 0, "and it can be accepted again");
}));

test("death: a mission that asks for it still fails on death, with its own message", () => withPilot(ctx => {
  accept(ctx, AMBUSH_RUN);
  dieWith(ctx, {});
  assert.equal(ledger.failed.length, 1);
  assert.equal(ledger.failed[0].message, AMBUSH_RUN.fails.message);
}));

test("death: a finished mission waiting for its reward is never failed by dying with the item", () => withPilot(ctx => {
  const mission = accept(ctx, PARCEL_RUN);
  mission.completed = true;
  dieWith(ctx, { parcel: 1 });
  assert.equal(isMissionFailed(mission), false);
  assert.deepEqual(ledger.failed, []);
}));

test("failures always carry a message, even when the rule has none", () => withPilot(ctx => {
  for (const [reason, text] of [["player-dead", /ship was destroyed/], ["timeout", /time ran out/], ["left-sector", /left the area/]]) {
    resetLedger();
    const mission = accept(ctx, RADIO_RELAY);
    failMission(mission, reason, ctx.profile, { player: ctx.player }, { action: "abandon" });
    assert.match(ledger.failed[0].message, text, reason);
    ctx.profile.missions.length = 0;
  }
}));

test("the mission failed notice names the mission and the reason; abandoning shows nothing", () => {
  const html = failureNoticeHtml({ title: "Parcel run", reason: "player-dead", message: "Your ship was destroyed and the Parcel it carried was lost." });
  assert.match(html, /Mission failed: Parcel run/);
  assert.match(html, /Your ship was destroyed and the Parcel it carried was lost\./);
  assert.equal(failureNoticeHtml({ title: "Parcel run", reason: "abandon", message: "x" }), "");
  assert.match(failureNoticeHtml({ title: "<b>x</b>", reason: "timeout", message: "<i>" }), /&lt;b&gt;x&lt;\/b&gt;/, "text is escaped");
});

test("the notice is wired: it listens for failures and has a style that sits above the HUD and the docked screen", () => {
  const ui = readFileSync(new URL("../src/ui/missionlog.js", import.meta.url), "utf8");
  assert.match(ui, /on\("mission-failed", showFailureNotice\)/);
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const z = n => Number((css.match(new RegExp(`${n}\\s*\\{[^}]*z-index:\\s*(\\d+)`)) || [])[1]);
  assert.ok(z("#mission-alert") > z("#dialogue-panel"), "above the dialogue card");
});
