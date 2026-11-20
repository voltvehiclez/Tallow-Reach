// The owner's post-playtest fix list, as tests: friendly fire colour, the
// one-second control hold and its percentage bar, the lesson order (W then
// Ctrl), the 500 m run bonus, the ferrite scenery along the course, the ambush
// reveal, the blank-menu bug and the chapter-box campaign screen.

import { test } from "node:test";
import assert from "node:assert/strict";

import { generateGalaxy } from "../src/sim/galaxy.js";
import { setPlaceCatalog, placeDef } from "../src/data/places.js";
import { CAMPAIGN_GALAXY, CAMPAIGN_GALAXY_SEED, CAMPAIGN_HOME_POCKET } from "../src/data/campaign/galaxy.js";
import { V } from "../src/util/math.js";

const catalog = generateGalaxy(CAMPAIGN_GALAXY_SEED, CAMPAIGN_GALAXY, { places: {}, links: {}, removedPlaces: [], removedLinks: [] });
setPlaceCatalog(catalog);

const { CAMPAIGN_MISSIONS } = await import("../src/data/campaign/index.js");
const { acceptMission, advanceMission, missionDialogue, missionBonusStatus } = await import("../src/sim/missions.js");
const { BULLET_COLOURS } = await import("../src/data/weapons.js");
const { spawnEnemy, updateEnemies } = await import("../src/sim/ai.js");
const { state, placeWorld } = await import("../src/state/state.js");
const { emit, on } = await import("../src/util/events.js");
const { buildCourse, startCourseAtBeginning } = await import("../src/sim/flight-course.js");
const { FLIGHT_COURSES } = await import("../src/data/flight-courses.js");
// Registers the campaign's mission-tick beats (the hold timer and the chase).
await import("../src/sim/campaign-flight.js");

/** A running campaign with the local pilot flying in the school pocket. */
async function campaignWorld() {
  const { applySave, resetPlaces, newRootSave } = await import("../src/state/state.js");
  const { prepareGalaxySave, switchGameMode } = await import("../src/sim/galaxy-session.js");
  const { createPlayer } = await import("../src/sim/player.js");
  const { configurePlayer } = await import("../src/sim/session.js");
  resetPlaces();
  state.players.length = 0;
  state.localPlayerIndex = 0;
  applySave(prepareGalaxySave(newRootSave()));
  switchGameMode("campaign");
  const P = configurePlayer(createPlayer(), state.profile);
  P.docked = false;
  P.place = CAMPAIGN_HOME_POCKET;
  state.place = CAMPAIGN_HOME_POCKET;
  const mission = acceptMission(CAMPAIGN_MISSIONS[0], state.profile, CAMPAIGN_HOME_POCKET);
  return { P, mission };
}

const talk = (mission, P) => {
  for (let guard = 0; guard < 20 && missionDialogue(mission); guard += 1) {
    advanceMission(mission, "dialogue-next", { player: P }, P.profile);
  }
};

test("fix 1: a wingman's rounds are the basic-cannon colour, and still harmless", async () => {
  const { P } = await campaignWorld();
  placeWorld(CAMPAIGN_HOME_POCKET).enemies.length = 0;
  state.world.enemies.length = 0;
  P.pos.set(0, 0, 3800);
  const korr = spawnEnemy("captain_korr", V(0, 0, 3000), CAMPAIGN_HOME_POCKET, "mission:campaign.m01-first-sortie", { role: "guard" });
  const raider = spawnEnemy("raider", V(0, 0, 3150), CAMPAIGN_HOME_POCKET, "test");
  for (let i = 0; i < 160; i += 1) updateEnemies(0.05, CAMPAIGN_HOME_POCKET);

  const shots = state.world.bullets.filter(shot => shot.own || shot.colour != null);
  assert.ok(shots.length > 0, "Dane fires at the hostile");
  const cannon = shots.find(shot => shot.colour === BULLET_COLOURS.cannon);
  assert.ok(cannon, "his rounds carry the basic-cannon colour");
  assert.equal(cannon.own, false, "but they are not the pilot's own shot");
  assert.equal(cannon.dmg, 0, "his guns still do no damage");
  const hostile = state.world.bullets.find(shot => !shot.own && shot.colour == null);
  assert.ok(hostile, "a hostile round has no module colour of its own: it stays red");
  assert.equal(BULLET_COLOURS.cannon, 0xffc870, "the basic cannon is orange");
  assert.equal(raider.hp, raider.mx, "the round never hurt anyone");

  placeWorld(CAMPAIGN_HOME_POCKET).enemies.length = 0;
  state.world.enemies.length = 0;
  state.world.bullets.length = 0;
  void korr;
});

test("fix 2/3: W then Ctrl, a one-second hold, and a percentage bar that fills to 100", async () => {
  const { P, mission } = await campaignWorld();
  P.docked = true;                     // the graduation briefing is said at the station
  talk(mission, P);
  P.docked = false;
  advanceMission(mission, "mission-tick", { dt: 0, player: P }, P.profile);
  talk(mission, P);                    // throttle orders
  assert.equal(mission.steps[mission.step].id, "learn-throttle");
  assert.equal(mission.steps[mission.step].hold, 1, "one second is the whole lesson");

  P.controls = { thrust: 1, brake: false };
  emit("mission-tick", { dt: 0.5, player: P, profile: P.profile });
  assert.equal(mission.steps[mission.step].id, "learn-throttle", "half a second is not a hold");
  assert.equal(state.ui.controlHold.percent, 50, "the bar reads the hold as a percentage");
  assert.equal(state.ui.controlHold.label, "W — throttle forward");

  emit("mission-tick", { dt: 0.55, player: P, profile: P.profile });
  assert.equal(mission.steps[mission.step].id, "brief-brake", "a full bar is a learned control");
  assert.equal(state.ui.controlHold, null, "and the bar goes away with the step");

  talk(mission, P);                    // brake orders
  assert.equal(mission.steps[mission.step].id, "learn-brake", "the brake comes straight after W");
  assert.equal(mission.steps[mission.step].control, "brake");
  P.controls = { thrust: 0, brake: true };
  emit("mission-tick", { dt: 0.5, player: P, profile: P.profile });
  assert.equal(state.ui.controlHold.percent, 50);
  emit("mission-tick", { dt: 0.55, player: P, profile: P.profile });
  assert.equal(mission.steps[mission.step].id, "brief-reverse");
});

test("fix 4: the bonus is a live 500 m readout during the run, and 1 km still resets it", async () => {
  const { P, mission } = await campaignWorld();
  const chase = mission.steps.findIndex(step => step.id === "chase");
  mission.step = chase;
  const status = missionBonusStatus(mission, 320);
  assert.equal(status.limit, 500, "the authored pass mark is 500 m");
  assert.equal(status.metres, 320);
  assert.equal(status.over, false);
  assert.equal(missionBonusStatus(mission, 520).over, true, "past 500 m the chip turns red");
  assert.equal(mission.steps[chase].maxGap, 1000, "the run's own reset is still a kilometre");

  advanceMission(mission, "mission-near", { actor: "captain_korr", metres: 520, player: P }, P.profile);
  assert.equal(mission.optionalProgress["stay-with-korr"].failed, true);
  assert.equal(missionBonusStatus(mission, 300), null, "a lost bonus is not shown again");
});

test("fix 5: ferrite clusters dress the 10 km course and stay clear of the flown line", () => {
  const fields = placeDef(CAMPAIGN_HOME_POCKET).features
    .filter(feature => feature.kind === "asteroidField" && String(feature.id).startsWith("chase-rocks"));
  assert.equal(fields.length, 8, "eight clusters along the run");
  const rocks = fields.reduce((sum, field) => sum + field.count, 0);
  assert.ok(rocks >= 130, `enough rock to read as a field (${rocks})`);
  assert.ok(fields.every(field => field.ore === "ferrite"), "all of it is ferrite");
  assert.ok(fields.some(field => field.rock.giantChance > 0), "some clusters grow giants");
  const sizes = new Set(fields.map(field => `${field.rock.rMin}-${field.rock.rMax}`));
  assert.ok(sizes.size >= 5, "the rocks vary in size");

  const course = buildCourse("m01-range", "chase");
  const points = [course.start, ...course.points.map(point => point.pos)];
  const segmentDistance = (p, a, b) => {
    const ab = b.clone().sub(a);
    const t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
    return p.distanceTo(a.clone().addScaledVector(ab, t));
  };
  for (const field of fields) {
    const centre = V(...field.pos);
    let nearest = Infinity;
    for (let i = 1; i < points.length; i += 1) nearest = Math.min(nearest, segmentDistance(centre, points[i - 1], points[i]));
    assert.ok(nearest - field.radius >= 300,
      `${field.id} leaves the course ${Math.round(nearest - field.radius)} m clear for Dane`);
  }
  // Nothing new lands on the chase's fixed start.
  for (const field of fields) {
    assert.ok(V(...field.pos).distanceTo(V(400, 240, 3200)) > field.radius + 200, `${field.id} is clear of the start`);
  }
});

test("fix 6: the run waits for the pilot to form up, and the rule is 1 km / 500 m", async () => {
  const { P, mission } = await campaignWorld();
  const chase = mission.steps.find(step => step.id === "chase");
  assert.equal(chase.gather, 300, "the run waits until the pilot is 300 m from Dane");
  assert.equal(chase.maxGap, 1000, "1 km is the pass mark for the whole course");

  // The first leg is a slow one, so the chase can be joined from a standing start.
  const courseDef = FLIGHT_COURSES["m01-range"].chase;
  assert.equal(courseDef.legs[0].speed, 95, "a warm-up leg before the chase gets fast");
  assert.ok(courseDef.legs.some(leg => leg.speed > 150 && leg.boost), "and it still gets fast");

  // The call that starts it tells the pilot to come to him.
  const intro = mission.steps.find(step => step.id === "chase-intro");
  assert.match(intro.lines.join(" "), /come to my wing/i);
  assert.match(intro.lines.join(" "), /300 m/i);

  // Put the act on the chase step with Dane waiting at the course start.
  placeWorld(CAMPAIGN_HOME_POCKET).enemies.length = 0;
  state.world.enemies.length = 0;
  mission.step = mission.steps.findIndex(step => step.id === "chase");
  const start = startCourseAtBeginning("m01-range", "chase");
  const korr = spawnEnemy("captain_korr", start.start.clone(), CAMPAIGN_HOME_POCKET,
    "mission:campaign.m01-first-sortie", { role: "lead", course: "m01-range", phase: "chase" });
  korr.course.gather = chase.gather;
  P.controls = { thrust: 0 };
  P.pos.copy(start.start).add(V(0, 0, 600));           // still far away
  updateEnemies(0.05, CAMPAIGN_HOME_POCKET);            // he arrives and waits

  let near = 0;
  on("mission-near", () => { near += 1; });
  emit("mission-tick", { dt: 0.05, player: P, profile: P.profile });
  assert.equal(state.ui.chaseRun.gathering, true, "the run has not started");
  assert.equal(state.ui.chaseRun.gather, 300);
  assert.equal(near, 0, "and the 500 m bonus is not judged while he is still waiting");
  assert.equal(korr.course.mode, "wait", "he holds at the fixed start");

  // Close the distance: the course starts and the rule takes over.
  P.pos.copy(start.start).add(V(0, 0, 200));
  updateEnemies(0.05, CAMPAIGN_HOME_POCKET);
  assert.equal(korr.course.mode, "run", "within 300 m, the run begins");
  emit("mission-tick", { dt: 0.05, player: P, profile: P.profile });
  assert.equal(state.ui.chaseRun.gathering, false);
  assert.ok(near > 0, "and the bonus is judged from then on");

  placeWorld(CAMPAIGN_HOME_POCKET).enemies.length = 0;
  state.world.enemies.length = 0;
});

test("fix 6b: the strangers introduce themselves; nobody calls them raiders", async () => {
  const m01 = CAMPAIGN_MISSIONS[0];
  const spoken = m01.steps.flatMap(step => [
    step.objective || "",
    ...(Array.isArray(step.lines) ? step.lines : []),
    step.line || "",
  ]).join(" ");
  assert.doesNotMatch(spoken, /raider/i, "no line, and no objective, names them");

  const taunt = m01.steps.find(step => step.id === "ambush-taunt");
  assert.ok(taunt, "the strangers get a line of their own");
  assert.equal(taunt.speaker, "Unmarked pilot");
  assert.match(taunt.lines.join(" "), /cadet/i, "and it is aimed at the pilot, not at Dane");
  assert.match(taunt.lines.join(" "), /engines/i, "it is a threat, not a briefing");

  // The warning Dane does say stays honest: unknown hulls, guns live.
  const warning = m01.steps.find(step => step.id === "ambush-warning");
  assert.match(warning.lines.join(" "), /not school drones/i);
  assert.match(warning.lines.join(" "), /do not recognise/i);
  // Order: warning, taunt, then the ships appear.
  const order = m01.steps.map(step => step.id);
  assert.ok(order.indexOf("ambush-warning") < order.indexOf("ambush-taunt"));
  assert.ok(order.indexOf("ambush-taunt") < order.indexOf("spawn-ambush"));
  assert.equal(m01.steps.find(step => step.id === "defeat-ambush").objective, "Defeat both attackers.");
});

test("fix 7/8: the campaign screen is chapter boxes that open into acts, and leaving it cannot blank the menu", async () => {
  const { P } = await campaignWorld();
  const profile = P.profile;

  const prevDoc = globalThis.document;
  const make = (tag = "div") => ({
    tagName: String(tag).toUpperCase(), id: "", hidden: false, innerHTML: "", textContent: "",
    children: [], dataset: {}, handlers: {}, attributes: {},
    appendChild(child) { this.children.push(child); child.parentNode = this; return child; },
    setAttribute(name, value) { this.attributes[name] = String(value); },
    addEventListener(name, fn) { this.handlers[name] = fn; },
    classList: { add() {}, remove() {}, toggle() {} },
    querySelector() { return null; }, querySelectorAll() { return []; },
  });
  globalThis.document = { body: make("body"), createElement: make };
  try {
    const { campaignMenuHtml, campaignScreenHtml, setupCampaign } = await import("../src/ui/campaign.js");

    // The screen opens on chapters only: no act button exists until one is chosen.
    const chapters = campaignMenuHtml(profile, { campaignChapter: null });
    assert.ok((chapters.match(/data-a="campaignChapter"/g) || []).length >= 4, "several large chapter boxes");
    assert.doesNotMatch(chapters, /data-a="campaignAct"/, "and no acts until a chapter is opened");
    assert.match(chapters, /Chapter 1/, "chapter 1 is on the screen");
    assert.match(chapters, /Coming soon/, "future chapters are visible, locked");
    assert.doesNotMatch(chapters, /Kestrel Line/, "without advertising a story that is not written");
    assert.match(chapters, /is-planned/, "and their placeholders are drawn redacted");

    // Opening chapter 1 reveals its acts, playable first and planned after.
    const acts = campaignMenuHtml(profile, { campaignChapter: "chapter-1" });
    assert.match(acts, /data-a="campaignAct" data-b="act-1"/, "Act 1 can be started");
    assert.match(acts, /data-a="campaignChapters"/, "and the way back to the chapters");
    assert.ok((acts.match(/Coming soon/g) || []).length >= 5, "the rest of the chapter is marked out");
    assert.doesNotMatch(acts, /Ferrite Run/, "with no placeholder name");
    assert.ok((acts.match(/campaign-box is-locked|campaign-act-box is-locked/g) || []).length >= 5);

    // Opening a future chapter shows its acts, all locked.
    const future = campaignMenuHtml(profile, { campaignChapter: "chapter-2" });
    assert.doesNotMatch(future, /data-a="campaignAct"/, "no act of a locked chapter can be started");
    assert.doesNotMatch(future, /Freight|Toll|Kestrel/, "and its planned names stay hidden");
    assert.match(future, /Coming soon/);

    const side = campaignScreenHtml(profile);
    assert.match(side, /data-a="campaignBack"/, "the right panel still has a way back to the title");

    // fix 7: an end card left open while the pilot leaves the act must not become
    // a full-screen blank over the main menu.
    setupCampaign();
    const card = globalThis.document.body.children.find(el => el.id === "campaign-end");
    state.mode = "campaign";
    emit("campaign-act-completed", { mission: { id: "campaign.m01-first-sortie", title: "First Sortie" }, reward: 150 });
    assert.equal(card.hidden, false, "the card is up");
    emit("main-menu", {});
    assert.equal(card.hidden, true, "leaving to the main menu takes it with it");
    assert.equal(card.innerHTML, "");
    assert.equal(state.ui.campaignEnd, null);
  } finally {
    globalThis.document = prevDoc;
  }
});
