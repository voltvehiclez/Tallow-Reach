import { homeStationPlace, setHomeStation } from "../sim/session.js";
// The outpost panel: renders the current screen and runs the actions behind
// its buttons. Buttons carry a data-a action name and an optional data-b argument.

import { on, emit } from "../util/events.js";
import { notify, showNotice, hideNotice, setupNotices } from "./notice.js";
import { initAudio, uiSound, hoverSound } from "../core/audio.js";
import { state, currentSave, currentRootSave, applySave, resetPlaces, saveCurrentGame, resetAllSave } from "../state/state.js";
import { readSlot, writeSlot, deleteSlot, decodeSave, encodeSave } from "../state/storage.js";
import { setShip } from "../sim/player.js";
import { launch, resumeFromSave } from "../sim/session.js";
import { clearNetEntities } from "../sim/world.js";
import { prepareGalaxySave, switchGameMode } from "../sim/galaxy-session.js";
// Named imports only, like every other line here: `net/session.js` is injected into tests with
// `setSaveKit`, so this file must never hold a copy of something it can ask for.
import { leaveVisit, joinWorld } from "../net/session.js";
import { makeJoinUrl, pageBase } from "../net/join-link.js";
import { readSettings, writeSettings } from "../net/settings.js";
// The same guard `installDragListeners` uses below: a headless import (a test) has a
// `document` stand-in without `addEventListener`, and an import-time throw there takes
// every test that loads this module with it.
if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
  document.addEventListener("input", e => {
    if (e.target?.id === "menu-username") writeSettings({ ...readSettings(), name: e.target.value });
  });
}
import { bringPilotHome, bringPilotHomeAtMenu, requestDock as netRequestDock } from "../net/session.js";
import { refillPower } from "../sim/power.js";
import { refreshDrive } from "../sim/drive.js";
import { refreshShield } from "../sim/shield.js";
import { refreshHull } from "../sim/hull.js";
import { refreshGuns } from "../sim/guns.js";
import * as fitting from "../sim/fitting.js";
import { togglePaintPicker } from "./picker.js";
import * as eco from "../sim/economy.js";
import * as contracts from "../sim/contracts.js";
import * as inv from "../sim/inventory.js";
import { canSell, canDiscard, isModule, itemName } from "../data/items.js";
import { MODULES } from "../data/modules.js";
import { storyMission } from "../data/missions/index.js";
import { campaignMission, campaignAvailable, isCampaignMissionId } from "../sim/campaign.js";
import { startCampaignAct } from "../sim/campaign-act.js";
import { campaignScreenHtml, campaignMenuBack, campaignMenuHtml } from "./campaign.js";
import { openMultiplayer, closeMultiplayer } from "./multiplayer.js";
import {
  assetsResultsHtml,
  introHtml,
  leftPanelHtml,
  outpostHtml,
  shipDetailsHtml,
  shipSellConfirmHtml,
  shopBuyHtml,
  viewedShip,
} from "./screens.js";
import {
  LEFT_TOGGLE_KEYS,
  activeLeftPanel,
  activeRightTab,
  closeLeftPanel,
  hideLeftPanelElement,
  resetStationPanels,
  selectRightTab,
  syncLeftPanelElement,
  toggleLeftPanel,
} from "./left-panel.js";
import { mountOutfitting } from "./outfitting.js";
import { closeStarmap } from "./starmap.js";
import { openDiscardPopover } from "./discard.js";
import {
  buildAssetStationContextMenu,
  buildModuleContextMenu,
  cancelHeldStack,
  clearAssetStationDestination,
  clearHeldGhost,
  clickInventorySlot,
  clickOutfittingBay,
  hasHeldStack,
  measureSlotSquare,
  openModuleInfoPopover,
  openTakeAmountPopover,
  placeHeldOnOutfittingBay,
  rightClickInventorySlot,
  runStackAll,
  setAssetStationDestination,
  showDragGhost,
} from "./inventory-ui.js";

const $ = id => document.getElementById(id);
let panel;
let leftPanel;
let beforeStart = null;
let starting = false;
let activeDrag = null;
let dragDoc = null;
let suppressClickUntil = 0;

function wirePanelSurface(el) {
  if (!el || typeof el.addEventListener !== "function") return;
  el.addEventListener("click", onClick);
  el.addEventListener("dblclick", onDblClick);
  el.addEventListener("input", onPanelInput);
  el.addEventListener("pointerdown", onPanelPointerDown);
  el.addEventListener("dragstart", onPreventNativeDrag);
  el.addEventListener("contextmenu", onInventoryContextMenu);
  el.addEventListener("mouseover", e => {
    if (e.target.closest("button:not(:disabled)")) hoverSound();
  });
}

function hostPanelFor(node) {
  if (!leftPanel) return panel;
  if (node === leftPanel || node?.closest?.("#station-left")) return leftPanel;
  return panel;
}

export function setupMenu(options = {}) {
  beforeStart = options.beforeStart || null;
  panel = $("panel");
  leftPanel = $("station-left");
  if (!leftPanel && typeof document !== "undefined" && typeof document.createElement === "function" && document.body) {
    const created = document.createElement("aside");
    created.id = "station-left";
    created.className = "station-side-panel";
    created.hidden = true;
    created.setAttribute?.("aria-label", "Station window");
    (document.body.append || document.body.appendChild)?.call(document.body, created);
    leftPanel = created;
  }
  setupNotices();
  wirePanelSurface(panel);
  wirePanelSurface(leftPanel);
  installDragListeners();

  // Step 16 slice 4: the pilot crossed into a friend's world, or came home. That changes
  // what the start screen IS — a menu, or one card saying where the pilot is — so it
  // redraws itself instead of waiting for a click. `ui/multiplayer.js` sets `state.away`
  // from the same event; this listener only redraws, so neither file imports the other.
  on("mp-away-changed", () => {
    if (state.ui && state.ui.intro) render();
  });

  // While the start screen is up it owns the panel: booting a save prepares the
  // ship (docked or flying) but must not replace or hide the start screen.
  on("docked", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    hideNotice();
    if (state.ui.tab === "l" && !activeLeftPanel(state.ui)) state.ui.leftPanel = "m";
    render();
  });
  on("launched", ({ player } = {}) => {
    if (player && player !== state.player) return;
    if (state.ui.intro) return;
    clearHeldGhost();
    panel.hidden = true;
    hideLeftPanelElement(leftPanel);
  });
  on("died", text => {
    cancelHeldStack();
    showNotice(text);
    state.ui.tab = "i";
    state.ui.invView = "inv";
    state.ui.leftPanel = null;
    state.ui.fit = null;
    render();
  });
  on("campaign-act-entered", () => {
    state.ui.intro = false;
    state.ui.campaign = false;
    resetStationPanels(state.ui);
    initAudio();
    if (!state.player || state.player.docked) {
      render();
    } else {
      panel.hidden = true;
      hideLeftPanelElement(leftPanel);
    }
    emit("mission-ui-refresh", {});
  });
  on("main-menu", () => {
    cancelHeldStack();
    closeMultiplayer();
    state.ui.intro = true;
    // Arriving at the menu is always the ordinary menu (owner, playtest 18). The away card is
    // raised by a press on Open World and by nothing else, so it is cleared here rather than
    // set: a player who was looking at the card and pressed Main menu lands on the menu.
    state.ui.awayCard = false;
    resetStationPanels(state.ui);
    hideNotice();
    render();
  });
  // A join that started on the title screen ("Join Multiplayer World") enters the open
  // world once it worked: being connected to a world you are not looking at is not a join.
  on("mp-enter-world", () => {
    if (!state.ui.intro) return;
    enterGameMode("open");
    // **This is not your friend's world yet, and the game says so** (owner, playtest 21: *"drop me
    // into the local world, add a pop up that this is not the hosts world (yet)"*). A stand-in
    // that pretends to be somebody's world is worse than a placeholder that admits it: the pilot
    // is in Ada's galaxy, not this one, and anything earned here does not go home with it. The
    // sentence is a notice rather than a card because it has no decision in it — it is news, and
    // the panel the player just left carries the same words for as long as the visit lasts.
    if (state.away) {
      const where = state.away.hostName ? `${state.away.hostName}'s world` : "your friend's world";
      showNotice(`This is your own galaxy, not ${where} — their world on your screen is not built yet (step 16, slice 7). Anything you earn or buy here stays here.`);
    }
    // The same landing as the Open World button: a docked pilot gets the station panel,
    // a pilot out in space gets the view.
    if (!state.player || state.player.docked) render();
    else {
      panel.hidden = true;
      hideLeftPanelElement(leftPanel);
    }
  });
  // A mission changed while a docked screen is open — the last dialogue line
  // closed, a dock-side script finished, a hand-in or an abandon went through.
  // The panel is a snapshot, so redraw it; otherwise the Missions tab keeps
  // showing the old state (an Abandon button on a mission ready to hand in).
  on("mission-ui-refresh", () => {
    if (state.ui.intro || panel.hidden) return;
    render();
  });
  // Tick this station's contract refresh countdown live once a second while the
  // right-hand Missions (Contract board) tab is visible, without touching any
  // expanded Details row in the left-hand Mission log window.
  on("board-timer-changed", ({ placeId } = {}) => {
    if (state.ui.intro || panel.hidden || activeRightTab(state.ui) !== "l") return;
    if (placeId && placeId !== state.place) return;
    panel.innerHTML = outpostHtml(state.ui);
  });

  contracts.ensureBoard();
  render();
}

/**
 * Show a docked tab (or toggle a left station window) from a key binding
 * (I in a station opens the Inventory tab). Does nothing on the title screen.
 */
export function openStationTab(name) {
  if (state.ui.intro || !panel) return false;
  cancelHeldStack();
  closePanelPopovers();
  selectRightTab(name, state.ui);
  render();
  return true;
}

/** The campaign screen's boxes occupy the big left window while the title is up. */
function renderCampaignLeft() {
  if (!leftPanel) return;
  leftPanel.hidden = false;
  if (leftPanel.dataset) leftPanel.dataset.view = "campaign";
  leftPanel.setAttribute?.("aria-label", "Campaign chapters");
  leftPanel.innerHTML = `<div class="station-left-body campaign-menu">${campaignMenuHtml(state.profile, state.ui)}</div>`;
  leftPanel.scrollTop = 0;
}

/** Update only the shared `#station-left` window (Outfitting, Shop, Contracts or campaign boxes). */
export function renderLeft() {
  if (!leftPanel) return;
  if (state.ui.intro && state.ui.campaign) {
    renderCampaignLeft();
    return;
  }
  if (state.ui.intro || !panel || panel.hidden) {
    hideLeftPanelElement(leftPanel);
    return;
  }
  const view = activeLeftPanel(state.ui);
  syncLeftPanelElement(leftPanel, view, view ? leftPanelHtml(state.ui) : "");
  if (view === "o") mountOutfitting();
}

/**
 * Redraw the screen after something outside a click changed it (slice 4: the pilot
 * crossing, or coming home). A no-op before the panel exists, so the bus can call it
 * during `main.js` setup without an order dependency.
 */
export function redrawScreen() {
  if (!panel) return;
  render();
}

// Step 16 slice 4: the pilot crossed into a friend's world, or came home. That changes
// what the title screen IS (a menu, or a card saying where the pilot is), so it redraws
// itself rather than waiting for the next click. `state.away` is set by
// `ui/multiplayer.js`, which owns the bus listener; this is only the redraw.

export function render() {
  panel.hidden = false;
  panel.innerHTML = state.ui.intro
    ? state.ui.campaign ? campaignScreenHtml(state.profile) : introHtml()
    : outpostHtml(state.ui);
  renderLeft();
}

function save() {
  saveCurrentGame();
}

/**
 * The one way an action's reply reaches the pilot. Routine confirmations are
 * silent; refusals and warnings go to the fixed notice (ui/notice.js), so the
 * panel never grows a line and never shifts.
 */
function toast(text) {
  notify(text);
}

/** Let pending mission hand-offs retry after the player changes cargo. */
function inventoryChanged() {
  emit("mission-inventory-changed", { profile: state.profile, player: state.player });
}

/** Consume a safe-recovery notice once, without hiding the load/import result. */
function recoveryNotice() {
  if (!state.galaxyRecovery) return "";
  const to = state.galaxyRecovery.to;
  state.galaxyRecovery = null;
  const place = state.galaxy?.pocketsById?.[to];
  return `That pocket no longer exists. Returned to ${place?.n || "Meridian Station"}; your character and cargo are safe.`;
}

function loadedMessage(text) {
  const notice = recoveryNotice();
  return notice ? `${text} ${notice}` : text;
}

/**
 * Coming home: opening your own world from the title ends a visit to somebody else's.
 *
 * (Owner, playtest 7.) Visiting is a connection, and it used to survive the trip to the main
 * menu — so "Open World" put a guest back into their friend's session, still looking at a
 * world they had walked away from. The host's own world is untouched: same room, same menu
 * round trip, so nothing is disconnected for them.
 *
 * The pilot comes home through its suitcase (`state.away.suitcase`, written by slice 4).
 * `net/session.js`'s `bringPilotHome` is the ONE rule for that, and this path asks it
 * rather than opening the suitcase itself, so the two doors cannot drift apart.
 */
function comeHome() {
  const away = state.away;
  if (away) {
    // **The suitcase is opened BEFORE the visit is left** (playtest 15).
    //
    // Leaving first meant a refusal — which is what the broken shape check always produced —
    // dropped the connection *and* kept the pilot frozen: the host's players list lost the
    // row, the laptop showed the away card, and Rejoin could not get back in. The player
    // described exactly that. Opening the suitcase does not need the wire (it is the guest's
    // own copy), so it goes first, and a refusal now leaves everything as it was: still
    // visiting, still listed, still able to try again.
    //
    // From the title there is no open-world save loaded, which is why the unpacking is done
    // against the mode save that is STORED — that is where the frozen pilot actually lives.
    const done = bringPilotHomeAtMenu({ mode: state.mode === "campaign" ? "campaign" : "open" });
    if (!done.ok) {
      showNotice(done.message);
      return false;
    }
    // The stored save now holds the returned pilot; load it so the screen and the runtime
    // agree with the disk before anything else runs.
    applySave(done.modeSave || done.save);
  }
  // Leaving the visit still always happens — but only once the suitcase has opened, so a
  // refusal cannot cost the player its connection. A guest that never carried a pilot (it
  // only looked around) has no suitcase, and leaves here exactly as before.
  leaveVisit();
  if (away) afterSaveChange();
  else clearNetEntities();
  closeMultiplayer();
  saveCurrentGame();
  showNotice(away?.hostName
    ? `Your pilot is home, back from ${away.hostName}'s world.`
    : "You have left your friend's world.");
  return true;
}

/**
 * Re-attempt the world the pilot is already in, from the title card (playtest 14).
 *
 * The join is asynchronous and the screen must not lie about it, so the answer is a
 * sentence either way.
 *
 * **On success the multiplayer screen opens, and the card goes** (owner, playtest 16). It
 * used to leave the player exactly where they were, so the host's list showed the name, the
 * laptop said "Rejoined", and nothing else happened — a rejoin you cannot see is
 * indistinguishable from one that failed. The pilot stays away (that is what makes this a
 * rejoin and not a trip home), and the join half of the screen is where it can be brought
 * home or left; `emit("mp-enter-world")` is deliberately NOT used, because entering the
 * world is what flying your own frozen ship would mean.
 */

function enterGameMode(mode) {
  // **A pilot that is away opens the stand-in world, not its own** (owner, playtests 20 and 21).
  //
  // Playtest 20 (A3) put a guard here that refused every door into the open world while the
  // marker was set, and playtest 21 found the cost: after *Bring my pilot* the player sat on the
  // join screen with nothing left to press — *"Im just stuck at the menu where you add link …
  // Should transition to their world when im in like this."* The owner's answer was to keep the
  // stand-in and say so: what loads today IS this browser's own galaxy, carrying the pilot's
  // latest copy, because the friend's world cannot be drawn on this screen until slices 7-8. The
  // notice in `on("mp-enter-world")` is where that is said; the title's **Open World** press
  // still asks the custody question first (`ACTIONS.intro`), which is the playtest-20 rule that
  // has not changed.
  state.ui.intro = false;
  state.ui.campaign = false;
  // A prompt about a connection is not news once the player is flying their own world
  // (step 16 slice 5); the marker itself is untouched, so nothing is lost by closing it.
  state.ui.lostHost = null;
  const switched = switchGameMode(mode);
  if (switched) afterSaveChange();
  resetStationPanels(state.ui);
  initAudio();
  if (!switched) {
    clearNetEntities();
    resumeFromSave();
  }
  emit("mission-ui-refresh", {});
  const notice = recoveryNotice();
  if (notice) showNotice(notice);
}

const ACTIONS = {
  home: () => toast(setHomeStation()),
  // Both story modes share the pilot's browser save. "Open World" keeps the
  // existing free-galaxy action; "Campaign" installs its independent galaxy and progress.
  // **Opening your own world leaves a friend's** (owner, playtest 7): a guest who walks out
  // to the menu and back is a pilot at home, not a visitor.
  // No username gate here: a name is only needed to present yourself to other players
  // (the multiplayer action below asks for one). Open World must start with no settings
  // stored at all — the step-10 fixes and the 11B recovery notices depend on it.
  intro() {
    // **A pilot that is away does not open its own world from THIS press** (playtests 16-21).
    //
    // The press asks; the visit opens (playtest 21): a player already in a friend's world gets
    // into the stand-in galaxy from the multiplayer screen, because that is where they are — but
    // a player on the menu pressing Open World is choosing between a pilot at home and a pilot
    // somewhere else, and that is a question about their save, so it is asked here.
    //
    // It used to try `comeHome()` and carry on if that worked, which read as "Open World
    // silently unpacks my pilot". The owner asked for the other thing: the away card is the
    // answer, and its press (**Bring pilot home**) is the only way on. Entering the world with
    // a frozen pilot would fly a hull whose cargo is in another galaxy, and unpacking without
    // being asked is a decision about somebody's save.
    //
    // **Playtest 18 moved WHERE the card appears: a press on Open World, never by itself.**
    // **Playtest 20 moved WHEN it appears from that press: always, while the pilot is away**
    // (owner: *"logging into the guests own open world does not give a prompt to bring their
    // pilot home. It should to confirm its updating to the local open world to latest version
    // of their pilot."*).
    //
    // The earlier rule asked whether a newer copy was waiting and opened the world when there
    // was not, which is a question the player cannot answer: "nothing changed there" and "this
    // world is not up to date with my pilot" are different facts, and only the second one is
    // about the save. Opening your own world while your pilot is in somebody else's is always
    // a custody decision — bring the pilot home, or go back to the menu — so this press always
    // asks. There is nothing to compare, either (owner, playtest 20: *"game should always try to
    // use the latest pilot version"*): the card has one answer, and **Bring pilot home** always
    // takes the copy that world holds. It still has its **Main menu** door (playtest 17), so
    // there is no trap.
    if (state.away) {
      state.ui.awayCard = true;
      state.ui.intro = true;
      render();
      return;
    }
    enterGameMode("open");
  },
  // Step 16 slice 4: the door off the "Your pilot is in Ada's world" card.
  //
  // It is its own press, not Open World (owner, playtest 17). Rejoin was removed in playtest
  // 18: joining is one press from the main menu, and a second, differently-shaped way in was
  // the thing that did not work.
  // **Bring pilot home is its own press, not Open World** (owner, playtest 17).
  //
  // It used to call `ACTIONS.intro()` — the Open World action — on the reasoning that "a pilot
  // at home is a pilot at home". That was wrong twice over: `intro()` refuses whenever a pilot
  // is away (so this button answered with the sentence meant for a different button, and the
  // owner could not come home at all), and the two acts are not the same. The owner's own
  // definition: *"bringing pilot home simply means making the version of your character that
  // was on your friends world be the latest version on your local open world."* That is
  // `bringPilotHomeAtMenu`, and nothing else. It does not enter a world and it does not need
  // the host — the suitcase is the guest's own copy.
  comehome() {
    const done = bringPilotHomeAtMenu({ mode: state.mode === "campaign" ? "campaign" : "open" });
    if (!done.ok) { showNotice(done.message); return; }
    applySave(done.modeSave || done.save);
    leaveVisit();
    afterSaveChange();
    saveCurrentGame();
    // The card asked the question and the player answered it, so it goes (playtest 18): the
    // next thing they see is the ordinary menu, with Open World ready. The older copy is gone
    // by now — `bringPilotHome` put the newer one in its place — so pressing Open World opens
    // the world rather than raising the card again.
    state.ui.awayCard = false;
    // A lost connection and a newer copy are two screens about the same pilot: once it is home,
    // neither of them says anything true (step 16 slice 5).
    state.ui.lostHost = null;
    showNotice("Your pilot is home.");
    render();
  },
  /**
   * **The lost-connection prompt's one button** (step 16 slice 5, owner 2026-11-24).
   *
   * Dismissing it is the whole of it: the player is already on the main menu — `ui/multiplayer.js`
   * put them there when the connection went — so this closes the prompt and reveals the menu
   * underneath. It touches nothing else: not the save, not the away marker, not the session
   * (which is already stopped). That is the point of it — a prompt about a connection must not
   * be able to change anything a player owns.
   */
  lostHostOk() {
    state.ui.lostHost = null;
    render();
  },
  /**
   * Back to the ordinary title menu, with the pilot left where it is (owner, playtest 17: *"the
   * your pilot is in friends world menu has no option even to go to main menu... so hes stuck"*).
   *
   * This does NOT bring the pilot home. It only shows the other menu — the away marker is
   * untouched, so the card comes back the next time the title is drawn, which is what "your
   * pilot is still away" means. Without it the card was a room with no door.
   */
  menu() {
    state.ui.awayCard = false;
    state.ui.lostHost = null;
    render();
  },
  // Step 16 slice 3: the title menu's way into co-op. One screen, opened here, that both
  // hosts a world and takes a friend's link or code — a guest never enters their own
  // world first, which is what the first playtest asked for.
  multiplayer() {
    const who = (readSettings().name || "").trim();
    if (who.length < 3) { showNotice("Enter a username (at least 3 characters) first."); return; }
    openMultiplayer({ focus: "join", from: "menu" });
  },
  // The campaign opens on its own chapter screen, not straight into the world:
  // an act is chosen there and starts as a scene, never accepted like a job.
  campaign() {
    state.ui.campaign = true;
    state.ui.intro = true;
    render();
  },
  campaignBack() {
    campaignMenuBack();
  },
  // One chapter box opens into its acts; the act boxes start the act.
  campaignChapter(id) {
    state.ui.campaignChapter = id || null;
    render();
  },
  campaignChapters() {
    state.ui.campaignChapter = null;
    render();
  },
  campaignAct(id) {
    const result = startCampaignAct(id);
    if (!result.ok) {
      toast(result.message || "That campaign act cannot start.");
      return;
    }
    state.ui.intro = false;
    state.ui.campaign = false;
    resetStationPanels(state.ui);
    initAudio();
    emit("mission-ui-refresh", {});
    const notice = recoveryNotice();
    if (notice) showNotice(notice);
    if (!state.player || state.player.docked) {
      render();
    } else {
      panel.hidden = true;
      hideLeftPanelElement(leftPanel);
    }
  },
  tab(name) {
    cancelHeldStack();
    hideNotice();
    closePanelPopovers();
    selectRightTab(name, state.ui);
  },
  leftTab(name) {
    // Keep an inventory-picked stack on the cursor when opening Outfitting so
    // clicking a module then opening Outfitting lets you click it straight in;
    // always return a bay-picked module when closing or switching away from Outfitting.
    if (name !== "o" || state.ui.leftPanel === "o" || state.ui.invHeld?.fromBay) {
      cancelHeldStack();
    }
    hideNotice();
    closePanelPopovers();
    toggleLeftPanel(name, state.ui);
  },
  closeLeft() {
    cancelHeldStack();
    closePanelPopovers();
    closeLeftPanel(state.ui);
  },
  go() {
    cancelHeldStack();
    closePanelPopovers();
    state.ui.fit = null;
    hideLeftPanelElement(leftPanel);
    // Slice 8c: a visitor cannot launch its own hull — the host owns the sim and the position.
    // The Launch button asks the host to launch it (docked toggle); the snapshot flips the ship
    // and the screen follows it.
    if (state.away) { try { netRequestDock(); } catch (e) { /* the host is the sim; a dead wire shows as no launch */ } }
    else launch();
  },

  // Contracts
  acc(i) {
    toast(contracts.acceptContract(+i));
  },
  ref() {
    // Only this station's board reshuffles, gated by its own 10-minute cooldown.
    const msgText = contracts.refreshBoard(state.worldState, state.place);
    if (msgText) toast(msgText);
  },
  drop(i) {
    // Abandon used to be silent; keep that contract-board behavior while the
    // generic runner removes the selected active mission. The button carries a
    // mission id (the panel lists only this station's missions, so a position
    // would address the wrong record).
    contracts.abandonContract(i);
  },
  done(i) {
    toast(contracts.completeContract(i));
  },
  story(id) {
    const campaignMode = state.mode === "campaign";
    const definition = campaignMode ? campaignMission(id) : storyMission(id);
    if (!definition || (campaignMode !== isCampaignMissionId(id))) {
      toast("That mission is not available in this mode.");
      return;
    }
    if (campaignMode && !campaignAvailable(definition, state.profile)) {
      toast("Finish the previous campaign mission first.");
      return;
    }
    // Story missions belong to the station that gives them out; the log only
    // lists them there, and the rule is enforced here too.
    if (contracts.missionOfferStation(definition) !== state.place) {
      toast("That story mission is not offered here.");
      return;
    }
    if (contracts.activeMissions().some(mission => mission.id === definition.id)) {
      toast("That mission is already active.");
      return;
    }
    const accepted = contracts.acceptMission(definition);
    toast(accepted ? (campaignMode ? "Campaign mission accepted." : "Story mission accepted.") : "Could not start that mission.");
  },

  // Stored ships (inside Inventory)
  sel(id) {
    cancelHeldStack();
    const msgText = eco.selectShip(id);
    if (msgText) toast(msgText);
    state.ui.invShip = null;
    state.ui.fit = null;
    inventoryChanged();
  },
  buy(id) {
    eco.buyShip(id);
  },
  rp(id) {
    const msgText = eco.repairShip(id);
    if (msgText) toast(msgText);
  },

  // Shop: expand/collapse compact one-line groups & subgroups, or direct purchase.
  shopGroup(key) {
    if (!key) return;
    const open = state.ui.shopOpen || (state.ui.shopOpen = {});
    if (open[key]) delete open[key];
    else open[key] = true;
  },
  wb(arg) {
    const parts = String(arg || "").split(":");
    const [shop, kind, id] = parts.length >= 3 ? parts : [parts[0], null, parts[1]];
    const msgText = eco.buyItem(shop, id, 1, state.player, state.profile, state.worldState, kind);
    if (msgText) toast(msgText);
    inventoryChanged();
  },
  wr() {
    toast(eco.restockMissiles());
  },

  // Inventory: switch between Storage & Hold and My Assets, step through local ships'
  // holds, pick up/place/swap/split stacks, or consolidate stacks with Stack all.
  invView(view) {
    cancelHeldStack();
    state.ui.invView = view === "assets" ? "assets" : "inv";
  },
  assetStation(placeId) {
    if (!placeId) return;
    const open = state.ui.assetsOpen || (state.ui.assetsOpen = {});
    if (open[placeId]) delete open[placeId];
    else open[placeId] = true;
  },
  assetShip(shipKey) {
    if (!shipKey) return;
    const open = state.ui.assetShipsOpen || (state.ui.assetShipsOpen = {});
    if (open[shipKey]) delete open[shipKey];
    else open[shipKey] = true;
  },
  invPrev() {
    cancelHeldStack();
    cycleInvShip(-1);
  },
  invNext() {
    cancelHeldStack();
    cycleInvShip(1);
  },
  stackAll(where) {
    const target = where || inv.STATION;
    const res = runStackAll(target);
    if (res.message) toast(res.message);
    if (res.changed) inventoryChanged();
  },
  mv(arg) {
    // Legacy compatibility helper for direct programmatic transfers.
    const [, id, dir, n] = String(arg || "").split(":");
    const ship = viewedShip();
    const [from, to] = dir === "s" ? [inv.STATION, ship] : [ship, inv.STATION];
    const count = n === "all" ? Infinity : Math.max(1, +n || 1);
    inv.moveItem(from, to, id, count);
    inventoryChanged();
  },


  // Outfitting: works just like Inventory — left-click a fitted bay to pick it
  // up onto the cursor, left-click any bay while holding a module to equip/swap,
  // Shift+click to quick-unequip, drag-and-drop, or right-click for Unequip / Show info.
  slot(arg) {
    const [g, i] = String(arg || "").split(":");
    const res = clickOutfittingBay({ group: g, bay: +i });
    if (res.message) toast(res.message);
    if (res.changed && !res.picked) inventoryChanged();
  },
  paint(k) {
    state.ui.fit = togglePaintPicker(state.ui.fit, k);
  },
  bayUnequip(arg) {
    const [g, i] = String(arg || "").split(":");
    let res = fitting.unequipTo(g, +i, inv.STATION, -1);
    if (!res.ok && state.profile.ship) {
      const alt = fitting.unequipTo(g, +i, state.profile.ship, -1);
      if (alt.ok) res = alt;
    }
    if (res.message) toast(res.message);
    if (res.ok) inventoryChanged();
  },

  // Base
  dep() {
    toast(eco.storeHold());
    inventoryChanged();
  },
  wd() {
    eco.withdrawStored();
    inventoryChanged();
  },
  sellh() {
    toast(eco.sellHold());
    inventoryChanged();
  },
  sells() {
    toast(eco.sellStored());
    inventoryChanged();
  },
  up(mod) {
    eco.upgradeBase(mod);
  },

  // Saves
  sv(i) {
    toast(writeSlot(+i, currentRootSave()) ? "Saved to slot " + i : "Could not save in this browser.");
  },
  ld(i) {
    const raw = readSlot(+i);
    if (!raw) return;
    let save;
    try {
      save = prepareGalaxySave(raw);
    } catch (e) {
      toast("That slot could not be read.");
      return;
    }
    applySave(save);
    afterSaveChange();
    toast(loadedMessage("Loaded slot " + i));
    render();
  },
  dl(i) {
    deleteSlot(+i);
    toast("Deleted slot " + i);
  },
  rs1() {
    state.ui.confirmReset = true;
  },
  rs0() {
    state.ui.confirmReset = false;
  },
  rs2() {
    applySave(prepareGalaxySave(resetAllSave()));
    afterSaveChange();
    state.ui.confirmReset = false;
    toast(loadedMessage("Progress reset."));
  },
  xp() {
    state.ui.xcode = encodeSave(currentRootSave());
    try {
      navigator.clipboard.writeText(state.ui.xcode).catch(() => {});
    } catch (e) {
      // clipboard not available; the code is still shown in the box
    }
    toast("Your save code is in the box below. It was also copied if your browser allows it.");
  },
  im() {
    const text = ($("xt") || {}).value || "";
    state.ui.xcode = text;
    let save;
    try {
      save = decodeSave(text, prepareGalaxySave);
    } catch (e) {
      toast("That code is not a valid save.");
      return;
    }
    state.ui.xcode = "";
    applySave(save);
    afterSaveChange();
    toast(loadedMessage("Save imported."));
    render();
  },
};

/** Step the Inventory tab through this station's ships without changing the ship being flown. */
function cycleInvShip(dir) {
  const owned = eco.localShips(state.profile, state.worldState);
  if (!owned || owned.length < 2) return;
  const i = owned.indexOf(viewedShip());
  state.ui.invShip = owned[(Math.max(0, i) + dir + owned.length) % owned.length];
}

/** Common work after the whole save is replaced (load, import, reset). */
function afterSaveChange() {
  cancelHeldStack();
  closeStarmap();
  const placeId = state.worldState.place;
  clearNetEntities();
  resetPlaces();
  state.place = placeId;
  setShip(state.profile.ship);
  refillPower();
  refreshDrive();
  refreshShield();
  refreshHull();
  refreshGuns();
  state.shops = {};
  state.ui.fit = null;
  if (state.ui.tab === "l") state.ui.leftPanel = "m";
  else if (state.ui.leftPanel === "m") state.ui.leftPanel = null;
  state.ui.invShip = null;
  state.ui.invView = "inv";
  state.ui.cargoView = "hold";
  state.ui.assetsOpen = {};
  state.ui.shopOpen = {};
  contracts.ensureBoard();
  state.flight.lock = null;
  state.flight.missileLock = { target: null, t: 0, locked: false };
  resumeFromSave();
}

/** The popover's anchor: the horizontal spot the user right-clicked, vertically
 * derived from the menu entry that was clicked — but with a fixed offset, not
 * "centred on the click line" (owner, 2026-11-14: the Discard popover's old
 * placement, opening at the right-click line so its buttons sat ~23px above
 * the mouse, was perfect; the Sell button sat slightly below it). The Discard
 * entry centres 43.75px below the menu's right-click line (menu pad 4 + entry
 * height ~26.5 + half entry); popover top = clicked-entry centre minus the
 * head-row half-height (~21px) minus those 43.75px would restore Discard
 * exactly, so both flows now share one rule: popover top = entry centre − 44.
 * For Discard that equals the old right-click line (discard entry centre − 44
 * ≈ menu top); for Sell, whose entry sits one row higher, the whole popover
 * rides up by one row, so its buttons land ~23px above the mouse — the same
 * relation Discard had, for both. The head row is ~22px tall and the popover
 * pads 10px on top, hence the -21 half-height folded into the constant. */
function popoverAnchorFor(panel, button, fallbackContext) {
  const rect = panel.getBoundingClientRect();
  const entry = button.getBoundingClientRect();
  const entryCenter = entry.top - rect.top + panel.scrollTop + entry.height / 2;
  const context = fallbackContext || button.closest(".inv-context");
  return {
    left: Number(context?.dataset.anchorLeft || 0),
    top: Math.max(panel.scrollTop, entryCenter - 44),
    width: Number(context?.dataset.anchorWidth || 0),
  };
}

function openInventorySell(button) {
  const [kind, id, dir, stack] = String(button.dataset.b || "").split(":");
  if (!canSell(id)) return;
  const source = dir === "s" ? inv.STATION : viewedShip();
  const slotIdx = Number.isInteger(Number(button.dataset.slot)) ? Number(button.dataset.slot) : -1;
  const available = inv.countOf(source, id);
  if (!(available > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "Sell item");
  popover.dataset.source = `${kind}:${id}:${dir}`;
  popover.dataset.slot = String(slotIdx);
  popover.innerHTML =
    `<div class="inv-sell-head"><strong>Sell ${itemName(id)}</strong>` +
    `<div class="inv-sell-actions"><button type="button" data-a="invSellConfirm">Sell</button><button type="button" data-a="invSellCancel">Cancel</button></div></div>` +
    `<label>Amount <span>(1–${available})</span><input class="inv-sell-amount" type="number" min="1" max="${available}" step="1" value="${Math.min(available, Math.max(1, Number(stack) || available))}"></label>` +
    `<div class="inv-sell-error" aria-live="polite"></div>`;

  const scrollLeft = panel.scrollLeft, scrollTop = panel.scrollTop;
  const preferredLeft = anchor.left + anchor.width + 8;
  const left = preferredLeft + 240 <= panel.clientWidth + scrollLeft
    ? preferredLeft
    : Math.max(scrollLeft, anchor.left - 240 - 8);
  const maxTop = Math.max(scrollTop, scrollTop + panel.clientHeight - 170);
  const top = Math.max(scrollTop, Math.min(anchor.top, maxTop));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
  panel.append(popover);
  const input = popover.querySelector(".inv-sell-amount");
  input.focus();
  input.select();
}

function confirmInventorySell(button) {
  const popover = button.closest(".inv-sell-popover");
  if (!popover) return;
  const [kind, id, dir] = String(popover.dataset.source || "").split(":");
  const source = dir === "s" ? inv.STATION : viewedShip();
  const available = inv.countOf(source, id);
  const input = popover.querySelector(".inv-sell-amount");
  const amount = Number(input.value);
  if (!Number.isInteger(amount) || amount < 1 || amount > available) {
    popover.querySelector(".inv-sell-error").textContent = `Enter a whole number from 1 to ${available}.`;
    input.focus();
    return;
  }
  const slotIdx = Number(popover.dataset.slot);
  const text = eco.sellInventoryItem(
    id,
    source,
    amount,
    state.profile,
    state.worldState,
    Number.isInteger(slotIdx) ? slotIdx : -1
  );
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

/** Right-click -> Take amount: pick up an exact number from one slot onto the cursor. */
function openInventoryTakeAmount(button) {
  const id = button.dataset.b;
  const where = button.dataset.where || inv.STATION;
  const slot = Number(button.dataset.slot);
  if (!Number.isInteger(slot) || slot < 0) return;
  const entry = inv.slotAt(where, slot);
  if (!entry || entry.id !== id || !(entry.n > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  openTakeAmountPopover({
    host: panel,
    anchor,
    where,
    slot,
    id,
    count: entry.n,
    onTake: () => {
      uiSound("click");
      render();
    },
  });
}

/**
 * Discard, step one: ask how many in a popover beside the tile (the sell box's
 * number field), then step two asks "Are you sure ...?" — see ui/discard.js.
 */
function openInventoryDiscard(button) {
  const id = button.dataset.b;
  const where = button.dataset.where || inv.STATION;
  const slotIdx = Number(button.dataset.slot);
  if (!canDiscard(id)) return;
  const slotEntry = Number.isInteger(slotIdx) && slotIdx >= 0 ? inv.slotAt(where, slotIdx) : null;
  const count = slotEntry && slotEntry.id === id ? slotEntry.n : inv.countOf(where, id);
  if (!(count > 0)) return;

  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  openDiscardPopover({
    host: panel,
    anchor,
    where,
    id,
    count,
    onDiscard: (place, item, amount) => {
      toast(inv.discardItem(
        place,
        item,
        amount,
        state.profile,
        state.worldState,
        Number.isInteger(slotIdx) ? slotIdx : -1
      ));
      inventoryChanged();
      uiSound("confirm");
      save();
      render();
    },
  });
}

const POPOVER_SELECTOR =
  ".inv-context, .inv-sell-popover, .inv-take-popover, .inv-discard-popover, .shop-buy-popover, .ship-info-popover, .mod-info-popover, .ship-sell-popover";

/** Close any open docked context menu/popover (and optionally return held stack or close toggleable left window). */
export function closePanelPopovers({ returnHeld = false, dismissLeft = false } = {}) {
  let closed = false;
  for (const surface of [panel, leftPanel]) {
    if (!surface || typeof surface.querySelectorAll !== "function") continue;
    const open = surface.querySelectorAll(POPOVER_SELECTOR);
    if (open.length) {
      open.forEach(node => node.remove());
      closed = true;
    }
  }
  if (!closed && returnHeld && activeDrag) {
    activeDrag = null;
    clearDragHighlights();
    clearHeldGhost();
    closed = true;
  }
  if (!closed && returnHeld && cancelHeldStack()) {
    inventoryChanged();
    save();
    if (panel && !panel.hidden) render();
    closed = true;
  }
  if (
    !closed &&
    dismissLeft &&
    !state.ui.intro &&
    panel &&
    !panel.hidden &&
    LEFT_TOGGLE_KEYS.has(state.ui.leftPanel) &&
    closeLeftPanel(state.ui)
  ) {
    render();
    closed = true;
  }
  return closed;
}

/** Clamp a floating popover of rough `(w, h)` inside the visible scroll window of `host`. */
function placePanelPopover(popover, x, y, w = 248, h = 175, host = panel) {
  const scrollLeft = host.scrollLeft || 0, scrollTop = host.scrollTop || 0;
  const maxLeft = Math.max(scrollLeft, scrollLeft + (host.clientWidth || 0) - w - 8);
  const maxTop = Math.max(scrollTop, scrollTop + (host.clientHeight || 0) - h - 8);
  popover.style.left = `${Math.max(scrollLeft + 8, Math.min(x, maxLeft))}px`;
  popover.style.top = `${Math.max(scrollTop + 8, Math.min(y, maxTop))}px`;
}

/**
 * Position an already-mounted `popover` inside `host` so that the centre of
 * `targetBtn` (the popup's own Buy button) lands directly over `(localX,
 * localY)` in host scroll coordinates — keeping Buy straight under the cursor
 * inside the left Shop window while staying clamped to visible bounds.
 */
function placePopoverButtonOverCursor(popover, targetBtn, localX, localY, opts = {}, host = panel) {
  const scrollLeft = host.scrollLeft || 0;
  const scrollTop = host.scrollTop || 0;
  const panelW = host.clientWidth || 0;
  const panelH = host.clientHeight || 0;
  const fallbackW = opts.w || 248;
  const fallbackH = opts.h || 158;
  const defaultBtnX = opts.defaultBtnX ?? fallbackW - 34;
  const defaultBtnY = opts.defaultBtnY ?? 46;

  const measure = () => {
    const popRect = popover.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const btnRect = targetBtn?.getBoundingClientRect?.() || { left: 0, top: 0, width: 0, height: 0 };
    const popW = popRect.width > 0 && popRect.width < panelW ? popRect.width : fallbackW;
    const popH = popRect.height > 0 && popRect.height < panelH ? popRect.height : fallbackH;
    const realBtn =
      btnRect.width > 0 &&
      btnRect.height > 0 &&
      btnRect.width < popW &&
      btnRect.height < popH;
    const offX = realBtn ? btnRect.left - popRect.left + btnRect.width / 2 : defaultBtnX;
    const offY = realBtn ? btnRect.top - popRect.top + btnRect.height / 2 : defaultBtnY;
    return { popW, popH, offX, offY, realBtn };
  };

  popover.style.left = `${scrollLeft}px`;
  popover.style.top = `${scrollTop}px`;
  let m = measure();

  if (opts.allowFlipUp && panelH > 0 && localY - m.offY + m.popH > scrollTop + panelH - 4) {
    popover.classList.add("flip-up");
    m = measure();
    if (!m.realBtn) m.offY = Math.max(24, m.popH - 24);
  }

  const minLeft = scrollLeft + 4;
  const maxLeft = Math.max(minLeft, scrollLeft + panelW - m.popW - 4);
  const minTop = scrollTop + 4;
  const maxTop = Math.max(minTop, scrollTop + panelH - m.popH - 4);
  const left = Math.round(Math.max(minLeft, Math.min(localX - m.offX, maxLeft)));
  const top = Math.round(Math.max(minTop, Math.min(localY - m.offY, maxTop)));
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

/** Open the compact Shop's "Buy amount" popover with its Buy button directly over the cursor. */
function openShopBuy(button, clickEvent = null) {
  const parts = String(button.dataset.b || "").split(":");
  const [shopId, rawKind, id] = parts.length >= 3 ? parts : [parts[0], null, parts[1]];
  const kind = rawKind === "ship" || rawKind === "item" ? rawKind : null;
  const row = eco.shopList(shopId).find(r => r.id === id && (!kind || r.kind === kind));
  if (!row) return;
  const maxBuy = eco.shopMaxBuy(shopId, id, state.profile, state.worldState, row.kind);
  if (!(maxBuy > 0)) return;

  const host = hostPanelFor(button);
  const rect = host.getBoundingClientRect();
  const btnRect = button.getBoundingClientRect();
  const scrollLeft = host.scrollLeft || 0, scrollTop = host.scrollTop || 0;
  const hasPointer =
    clickEvent &&
    Number.isFinite(clickEvent.clientX) &&
    Number.isFinite(clickEvent.clientY) &&
    (clickEvent.clientX !== 0 || clickEvent.clientY !== 0);
  const cursorX = (hasPointer ? clickEvent.clientX : btnRect.left + btnRect.width / 2)
    - rect.left - (host.clientLeft || 0) + scrollLeft;
  const cursorY = (hasPointer ? clickEvent.clientY : btnRect.top + btnRect.height / 2)
    - rect.top - (host.clientTop || 0) + scrollTop;
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover shop-buy-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Buy ${row.n}`);
  popover.dataset.shop = shopId;
  popover.dataset.kind = row.kind;
  popover.dataset.id = row.id;
  popover.dataset.price = String(row.price);
  popover.innerHTML = shopBuyHtml(row, maxBuy, 1);

  const input = popover.querySelector(".inv-sell-amount");
  const totalEl = popover.querySelector("[data-buy-total]");
  input?.addEventListener("input", () => {
    const liveMax = Math.max(1, eco.shopMaxBuy(shopId, id, state.profile, state.worldState, row.kind));
    const n = Number(input.value);
    if (totalEl && Number.isInteger(n) && n >= 1 && n <= liveMax) {
      totalEl.textContent = `${n * row.price} cr`;
    }
    const err = popover.querySelector(".inv-sell-error");
    if (err) err.textContent = "";
  });
  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      confirmShopBuy(popover);
    }
  });

  host.append(popover);
  const confirmBtn = popover.querySelector('button[data-a="shopBuyConfirm"]');
  placePopoverButtonOverCursor(popover, confirmBtn, cursorX, cursorY, {
    w: 248,
    h: 158,
    defaultBtnX: 214,
    defaultBtnY: 46,
    allowFlipUp: true,
  }, host);
  if (input) {
    try { input.focus({ preventScroll: true }); } catch { input.focus?.(); }
    input.select?.();
  }
}

function confirmShopBuy(node) {
  const popover = node?.classList?.contains("shop-buy-popover")
    ? node
    : node?.closest?.(".shop-buy-popover");
  if (!popover) return;
  const { shop, kind, id } = popover.dataset;
  const maxBuy = eco.shopMaxBuy(shop, id, state.profile, state.worldState, kind || null);
  const input = popover.querySelector(".inv-sell-amount");
  const amount = Number(input?.value);
  if (!(maxBuy > 0)) {
    popover.remove();
    render();
    return;
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > maxBuy) {
    const error = popover.querySelector(".inv-sell-error");
    if (error) error.textContent = `Enter a whole number from 1 to ${maxBuy}.`;
    input?.focus?.();
    return;
  }
  const text = eco.buyItem(shop, id, amount, state.player, state.profile, state.worldState, kind || null);
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

/** Open the right-click Ship details card for a ship in Shop, Outfitting, or Inventory. */
function openShipDetails(shipType, clientX, clientY, localPos = null, host = panel) {
  const html = shipDetailsHtml(shipType);
  if (!html) return false;
  const stats = eco.shipBaseStats(shipType);
  const targetHost = host || panel;
  const rect = localPos ? null : targetHost.getBoundingClientRect();
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover ship-info-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `${stats.name} details`);
  popover.dataset.shipType = stats.type;
  popover.innerHTML = html;

  const x = localPos ? localPos.left : clientX - rect.left + (targetHost.scrollLeft || 0) + 6;
  const y = localPos ? localPos.top : clientY - rect.top + (targetHost.scrollTop || 0) + 6;
  placePanelPopover(popover, x, y, 256, 195, targetHost);

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
    }
  });

  targetHost.append(popover);
  uiSound();
  return true;
}

/** Open the My Assets right-click menu on a station row: Set / Clear destination. */
function openAssetStationContext(stationEl, clientX, clientY) {
  const placeId = stationEl?.dataset?.assetStation;
  if (!placeId) return false;
  const host = hostPanelFor(stationEl);
  closePanelPopovers();
  const menu = buildAssetStationContextMenu(document, placeId);
  const rect = host.getBoundingClientRect();
  const scrollLeft = host.scrollLeft || 0, scrollTop = host.scrollTop || 0;
  const x = Math.min(scrollLeft + (host.clientWidth || 0) - 148, Math.max(scrollLeft, clientX - rect.left + scrollLeft));
  const y = Math.min(scrollTop + (host.clientHeight || 0) - 72, Math.max(scrollTop, clientY - rect.top + scrollTop));
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  host.append(menu);
  uiSound();
  return true;
}

/** Open the Hangar stored-ship right-click menu: Show info, Fly ship, Sell. */
function openHangarShipContext(row, clientX, clientY) {
  const shipId = row.dataset.hangarShip;
  if (!shipId) return false;
  closePanelPopovers();

  const menu = document.createElement("div");
  menu.className = "inv-context hangar-context";
  menu.setAttribute("role", "menu");

  const info = document.createElement("button");
  info.type = "button";
  info.dataset.a = "hangarInfo";
  info.dataset.b = shipId;
  info.setAttribute("role", "menuitem");
  info.textContent = "Show info";
  menu.append(info);

  const fly = document.createElement("button");
  fly.type = "button";
  fly.dataset.a = "hangarFly";
  fly.dataset.b = shipId;
  fly.setAttribute("role", "menuitem");
  fly.textContent = "Fly ship";
  if (shipId === state.profile.ship) {
    fly.disabled = true;
    fly.title = "Already flying this ship.";
  }
  menu.append(fly);

  const sellCheck = eco.canSellShip(shipId);
  const sell = document.createElement("button");
  sell.type = "button";
  sell.dataset.a = "hangarSellOpen";
  sell.dataset.b = shipId;
  sell.setAttribute("role", "menuitem");
  sell.textContent = "Sell";
  if (!sellCheck.ok) {
    sell.disabled = true;
    sell.title = sellCheck.reason;
  } else {
    sell.title = `Sell ${sellCheck.label} for ${sellCheck.price} cr.`;
  }
  menu.append(sell);

  const rect = panel.getBoundingClientRect();
  const scrollLeft = panel.scrollLeft || 0, scrollTop = panel.scrollTop || 0;
  const x = Math.min(scrollLeft + (panel.clientWidth || 0) - 136, Math.max(scrollLeft, clientX - rect.left + scrollLeft));
  const y = Math.min(scrollTop + (panel.clientHeight || 0) - 104, Math.max(scrollTop, clientY - rect.top + scrollTop));
  menu.dataset.anchorLeft = String(x);
  menu.dataset.anchorTop = String(y);
  menu.dataset.anchorWidth = "0";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  panel.append(menu);
  return true;
}

/** Open the confirmation popover before permanently selling a stored ship. */
function openHangarShipSell(button) {
  const shipId = button.dataset.b;
  const check = eco.canSellShip(shipId);
  if (!check.ok) {
    closePanelPopovers();
    if (check.reason) toast(check.reason);
    return;
  }
  const anchor = popoverAnchorFor(panel, button);
  closePanelPopovers();

  const popover = document.createElement("div");
  popover.className = "inv-sell-popover ship-sell-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Sell ${check.label}`);
  popover.dataset.shipId = shipId;
  popover.innerHTML = shipSellConfirmHtml(check);
  placePanelPopover(popover, anchor.left, anchor.top, 248, 145);

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
    } else if (event.key === "Enter") {
      event.stopPropagation();
      event.preventDefault();
      confirmHangarShipSell(popover);
    }
  });

  panel.append(popover);
  popover.querySelector('button[data-a="shipSellConfirm"]')?.focus?.();
}

function confirmHangarShipSell(target) {
  const popover = target.classList?.contains("ship-sell-popover")
    ? target
    : target.closest(".ship-sell-popover");
  if (!popover) return;
  const shipId = popover.dataset.shipId;
  closePanelPopovers();
  const text = eco.sellShip(shipId);
  if (text) toast(text);
  inventoryChanged();
  uiSound("confirm");
  save();
  render();
}

/** Open the right-click context menu carrying `Show info` for a module in Shop or My Assets. */
function openModuleRowContext(modEl, clientX, clientY) {
  const modId = modEl?.dataset?.moduleId;
  if (!modId || !isModule(modId)) return false;
  const host = hostPanelFor(modEl);
  if (!host) return false;
  closePanelPopovers();
  const menu = buildModuleContextMenu(document, modId, "modInfo");
  if (!menu) return false;
  const rect = host.getBoundingClientRect();
  const scrollLeft = host.scrollLeft || 0;
  const scrollTop = host.scrollTop || 0;
  const rawX = clientX - rect.left + scrollLeft;
  const rawY = clientY - rect.top + scrollTop;
  menu.dataset.anchorLeft = String(rawX);
  menu.dataset.anchorTop = String(rawY);
  menu.dataset.anchorWidth = "0";
  placePanelPopover(menu, rawX, rawY, 136, 42, host);
  host.append(menu);
  uiSound();
  return true;
}

function onInventoryContextMenu(e) {
  // While holding a stack, right-clicking ANY slot places 1 item into it (Minecraft style).
  const slotBtn = e.target.closest("button[data-a='invSlot']");
  if (slotBtn && hasHeldStack()) {
    e.preventDefault();
    closePanelPopovers();
    const res = rightClickInventorySlot({
      where: slotBtn.dataset.where,
      slot: Number(slotBtn.dataset.slot),
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (res?.message) toast(res.message);
    if (res?.changed) {
      inventoryChanged();
      uiSound("click");
      save();
      render();
    }
    return;
  }

  if (hasHeldStack()) {
    e.preventDefault();
    return;
  }

  const tile = e.target.closest("button.inv-item[data-kind]");
  if (!tile) {
    const fittedBay = e.target.closest("button.mod-bay.fitted[data-fit-group][data-fit-bay]");
    if (fittedBay && fittedBay.dataset.module) {
      e.preventDefault();
      openFittedBayContext(fittedBay, e.clientX, e.clientY);
      return;
    }
    const modRow = e.target.closest("[data-module-id]");
    if (modRow && modRow.dataset.moduleId) {
      e.preventDefault();
      openModuleRowContext(modRow, e.clientX, e.clientY);
      return;
    }
    const assetStation = e.target.closest("[data-asset-station]");
    if (assetStation && assetStation.dataset.assetStation) {
      e.preventDefault();
      openAssetStationContext(assetStation, e.clientX, e.clientY);
      return;
    }
    const hangarRow = e.target.closest("[data-hangar-ship]");
    if (hangarRow && hangarRow.dataset.hangarShip) {
      e.preventDefault();
      openHangarShipContext(hangarRow, e.clientX, e.clientY);
      return;
    }
    const shipEl = e.target.closest("[data-ship-type]");
    if (shipEl && shipEl.dataset.shipType) {
      e.preventDefault();
      openShipDetails(shipEl.dataset.shipType, e.clientX, e.clientY, null, hostPanelFor(shipEl));
    }
    return;
  }
  e.preventDefault();
  closePanelPopovers();

  const menu = document.createElement("div");
  menu.className = "inv-context";
  menu.setAttribute("role", "menu");

  if (isModule(tile.dataset.id)) {
    const info = document.createElement("button");
    info.type = "button";
    info.dataset.a = "modInfo";
    info.dataset.b = tile.dataset.id;
    info.setAttribute("role", "menuitem");
    info.textContent = "Show info";
    menu.append(info);
  }

  const tileWhere = tile.dataset.where || inv.STATION;
  const equipCheck = fitting.canEquipModule(tile.dataset.id, tileWhere);
  const equip = document.createElement("button");
  equip.type = "button";
  equip.dataset.a = "invEquip";
  equip.dataset.b = tile.dataset.id;
  equip.dataset.where = tileWhere;
  equip.dataset.slot = tile.dataset.slot || "0";
  equip.setAttribute("role", "menuitem");
  equip.textContent = "Equip";
  if (!equipCheck.ok) {
    equip.disabled = true;
    equip.title = equipCheck.reason || "Cannot equip this item.";
  } else {
    equip.title = equipCheck.replaced
      ? `Equip onto active ship (replaces ${MODULES[equipCheck.replaced]?.n || equipCheck.replaced}).`
      : "Equip onto your active ship.";
  }
  menu.append(equip);

  const take = document.createElement("button");
  take.type = "button";
  take.dataset.a = "invTakeOpen";
  take.dataset.b = tile.dataset.id;
  take.dataset.where = tile.dataset.where || "";
  take.dataset.slot = tile.dataset.slot || "0";
  take.setAttribute("role", "menuitem");
  take.textContent = "Take amount";
  take.title = "Pick up a chosen number of items onto the cursor.";
  menu.append(take);

  const sell = document.createElement("button");
  sell.type = "button";
  sell.dataset.a = "invSellOpen";
  sell.dataset.b = `${tile.dataset.kind}:${tile.dataset.id}:${tile.dataset.dir}:${tile.dataset.count}`;
  sell.dataset.slot = tile.dataset.slot || "0";
  sell.setAttribute("role", "menuitem");
  sell.textContent = "Sell";
  // Goods and spare modules both have a sell value, so both can be sold here; a
  // part fitted in a bay is in no place and never gets a tile.
  if (!canSell(tile.dataset.id)) {
    sell.disabled = true;
    sell.title = "This cannot be sold.";
  }
  menu.append(sell);

  // Discard trashes from the clicked stack, here and in flight (ui/cargo.js).
  const discard = document.createElement("button");
  discard.type = "button";
  discard.dataset.a = "discard";
  discard.dataset.b = tile.dataset.id;
  discard.dataset.where = tile.dataset.where || "";
  discard.dataset.slot = tile.dataset.slot || "0";
  discard.setAttribute("role", "menuitem");
  discard.textContent = `Discard \u00d7${tile.dataset.count}`;
  if (!canDiscard(tile.dataset.id)) {
    discard.disabled = true;
    discard.title = "A mission item: hand it in, do not trash it.";
  } else {
    discard.title = "Throw this stack away. It cannot be recovered.";
  }
  menu.append(discard);

  const rect = panel.getBoundingClientRect();
  const menuH = isModule(tile.dataset.id) ? 162 : 132;
  const x = Math.min(panel.scrollLeft + panel.clientWidth - 136, Math.max(panel.scrollLeft, e.clientX - rect.left + panel.scrollLeft));
  const y = Math.min(panel.scrollTop + panel.clientHeight - menuH, Math.max(panel.scrollTop, e.clientY - rect.top + panel.scrollTop));
  menu.dataset.anchorLeft = String(x);
  menu.dataset.anchorTop = String(y);
  menu.dataset.anchorWidth = "0";
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;
  panel.append(menu);
}

/** Right-click menu on an equipped Outfitting module bay: Unequip and Show info. */
function openFittedBayContext(bayBtn, clientX, clientY) {
  const host = hostPanelFor(bayBtn);
  if (!host) return;
  const group = bayBtn.dataset.fitGroup;
  const bay = bayBtn.dataset.fitBay;
  const modId = bayBtn.dataset.module;
  if (!group || bay == null || !modId) return;
  closePanelPopovers();

  const menu = document.createElement("div");
  menu.className = "inv-context bay-context";
  menu.setAttribute("role", "menu");

  const unequip = document.createElement("button");
  unequip.type = "button";
  unequip.dataset.a = "bayUnequip";
  unequip.dataset.b = `${group}:${bay}`;
  unequip.setAttribute("role", "menuitem");
  unequip.textContent = "Unequip";
  menu.append(unequip);

  const info = document.createElement("button");
  info.type = "button";
  info.dataset.a = "modInfo";
  info.dataset.b = modId;
  info.setAttribute("role", "menuitem");
  info.textContent = "Show info";
  menu.append(info);

  const rect = host.getBoundingClientRect();
  const scrollLeft = host.scrollLeft || 0;
  const scrollTop = host.scrollTop || 0;
  const x = clientX - rect.left + scrollLeft;
  const y = clientY - rect.top + scrollTop;
  menu.dataset.anchorLeft = String(x);
  menu.dataset.anchorTop = String(y);
  menu.dataset.anchorWidth = "0";
  placePanelPopover(menu, x, y, 140, 74, host);
  host.append(menu);
  uiSound();
}

function refreshDockedAssetResults() {
  const results = panel?.querySelector?.("[data-assets-results]");
  if (results) {
    results.innerHTML = assetsResultsHtml(state.profile, state.worldState, {
      docked: true,
      openMap: state.ui.assetsOpen,
      shipOpenMap: state.ui.assetShipsOpen,
      query: state.ui.assetsQuery,
      searchOpen: state.ui.assetsSearchOpen,
    });
  }
  const clearBtn = panel?.querySelector?.("button[data-a='assetSearchClear']");
  if (clearBtn) clearBtn.hidden = !state.ui.assetsQuery;
}

function onPanelInput(e) {
  const input = e.target?.closest?.("[data-asset-search]");
  if (!input) return;
  state.ui.assetsSearchOpen = true;
  state.ui.assetsQuery = String(input.value || "");
  refreshDockedAssetResults();
}

function onPreventNativeDrag(e) {
  if (e.target?.closest?.("button.inv-item, button.mod-bay")) {
    e.preventDefault?.();
  }
}

function forEachDropNode(selector, fn) {
  for (const surface of [panel, leftPanel]) {
    if (!surface || surface.hidden || typeof surface.querySelectorAll !== "function") continue;
    for (const node of surface.querySelectorAll(selector)) fn(node);
  }
}

function clearDragHighlights() {
  forEachDropNode(".is-drop-match, .is-drop-over, .is-drag-source", node => {
    node.classList?.remove?.("is-drop-match", "is-drop-over", "is-drag-source");
  });
}

function applyDragHighlights(drag) {
  clearDragHighlights();
  if (drag.sourceEl) drag.sourceEl.classList?.add?.("is-drag-source");
  if (drag.kind === "inv" && drag.modGroup) {
    forEachDropNode("button.mod-bay", node => {
      if (node.dataset?.fitGroup === drag.modGroup) node.classList?.add?.("is-drop-match");
    });
  } else if (drag.kind === "bay") {
    forEachDropNode(".inv-col", node => {
      if (node.dataset?.invWhere) node.classList?.add?.("is-drop-match");
    });
    forEachDropNode("button.mod-bay", node => {
      if (node.dataset?.fitGroup === drag.group && Number(node.dataset?.fitBay) !== drag.bay) {
        node.classList?.add?.("is-drop-match");
      }
    });
  }
}

function updateDragHover(drag, clientX, clientY, fallbackTarget) {
  forEachDropNode(".is-drop-over", node => node.classList?.remove?.("is-drop-over"));
  const under = resolvePointTarget(clientX, clientY, fallbackTarget);
  if (!under || typeof under.closest !== "function") return;
  const hit = drag.kind === "inv"
    ? under.closest("button.mod-bay[data-fit-group], button[data-a='invSlot']")
    : under.closest("button[data-a='invSlot'], button.mod-bay[data-fit-group], .inv-col[data-inv-where]");
  if (hit && hit !== drag.sourceEl) hit.classList?.add?.("is-drop-over");
}

function resolvePointTarget(clientX, clientY, fallbackTarget) {
  if (
    typeof document !== "undefined" &&
    typeof document.elementFromPoint === "function" &&
    Number.isFinite(clientX) &&
    Number.isFinite(clientY)
  ) {
    const hit = document.elementFromPoint(clientX, clientY);
    if (hit) return hit;
  }
  return fallbackTarget || null;
}

/**
 * Execute a completed docked drag-and-drop between Inventory slots and
 * Outfitting module bays.
 */
export function finishStationDrag(drag, dropTarget) {
  if (!drag || !dropTarget || typeof dropTarget.closest !== "function") {
    return { ok: false, message: "" };
  }
  if (drag.kind === "inv") {
    const bayBtn = dropTarget.closest("button.mod-bay[data-fit-group][data-fit-bay]");
    if (bayBtn) {
      return fitting.fitModuleFrom(
        drag.where,
        drag.slot,
        bayBtn.dataset.fitGroup,
        Number(bayBtn.dataset.fitBay),
        drag.id
      );
    }
    const modCard = dropTarget.closest("section.mod[data-group]");
    if (modCard && modCard.dataset.group) {
      const group = modCard.dataset.group;
      const bays = state.profile.loadout?.[state.profile.ship]?.[group];
      const emptyIdx = Array.isArray(bays) ? bays.findIndex(x => !x) : -1;
      const targetBay = emptyIdx >= 0 ? emptyIdx : 0;
      return fitting.fitModuleFrom(drag.where, drag.slot, group, targetBay, drag.id);
    }
    // Dropping a module anywhere else in the left Outfitting box fits it into
    // the left-most bay of its own group (a specific bay still wins, above).
    // The group comes from the module's own data, not the tile's dataset, so
    // any drag source works.
    const ownGroup = MODULES[drag.id]?.g || drag.modGroup;
    const leftBox = dropTarget.closest("#station-left");
    if (leftBox && ownGroup) {
      const bays = state.profile.loadout?.[state.profile.ship]?.[ownGroup];
      const emptyIdx = Array.isArray(bays) ? bays.findIndex(x => !x) : -1;
      return fitting.fitModuleFrom(drag.where, drag.slot, ownGroup, emptyIdx >= 0 ? emptyIdx : 0, drag.id);
    }
    const slotBtn = dropTarget.closest("button[data-a='invSlot']");
    if (slotBtn) {
      const toWhere = slotBtn.dataset.where;
      const toSlot = Number(slotBtn.dataset.slot);
      if (!toWhere || !Number.isInteger(toSlot) || (toWhere === drag.where && toSlot === drag.slot)) {
        return { ok: false, message: "" };
      }
      const picked = inv.pickupSlot(drag.where, drag.slot);
      if (!picked) return { ok: false, message: "" };
      const placed = inv.placeHeldStack(picked, toWhere, toSlot);
      if (placed.held) inv.returnHeldStack(placed.held);
      return { ok: Boolean(placed.ok), message: placed.message || "" };
    }
    const invCol = dropTarget.closest(".inv-col[data-inv-where]");
    if (invCol && invCol.dataset.invWhere && invCol.dataset.invWhere !== drag.where) {
      return inv.shiftMoveSlot(drag.where, drag.slot, invCol.dataset.invWhere);
    }
    return { ok: false, message: "" };
  }

  if (drag.kind === "bay") {
    const slotBtn = dropTarget.closest("button[data-a='invSlot']");
    if (slotBtn && slotBtn.dataset.where) {
      return fitting.unequipTo(drag.group, drag.bay, slotBtn.dataset.where, Number(slotBtn.dataset.slot));
    }
    const invCol = dropTarget.closest(".inv-col[data-inv-where]");
    if (invCol && invCol.dataset.invWhere) {
      return fitting.unequipTo(drag.group, drag.bay, invCol.dataset.invWhere, -1);
    }
    const bayBtn = dropTarget.closest("button.mod-bay[data-fit-group][data-fit-bay]");
    if (bayBtn) {
      const toGroup = bayBtn.dataset.fitGroup;
      const toBay = Number(bayBtn.dataset.fitBay);
      if (toGroup === drag.group && toBay === drag.bay) return { ok: false, message: "" };
      if (toGroup !== drag.group) {
        const m = MODULES[drag.id];
        return {
          ok: false,
          message: m ? `${m.n} only fits in its own module group.` : "That module does not fit there.",
        };
      }
      return fitting.swapFittedBays(drag.group, drag.bay, toBay);
    }
  }
  return { ok: false, message: "" };
}

function onPanelPointerDown(e) {
  if (state.ui.intro || starting || hasHeldStack()) return;
  if ((e.button ?? 0) !== 0 || e.shiftKey) return;
  const tile = e.target?.closest?.("button.inv-item[data-a='invSlot']");
  if (tile && !tile.disabled && tile.dataset.id) {
    activeDrag = {
      kind: "inv",
      where: tile.dataset.where || inv.STATION,
      slot: Number(tile.dataset.slot),
      id: tile.dataset.id,
      n: Math.max(1, Number(tile.dataset.count) || 1),
      modGroup: tile.dataset.modGroup || null,
      slotSize: measureSlotSquare(tile),
      startX: e.clientX ?? 0,
      startY: e.clientY ?? 0,
      started: false,
      sourceEl: tile,
    };
    return;
  }
  const bay = e.target?.closest?.("button.mod-bay.fitted[data-fit-group][data-fit-bay]");
  if (bay && !bay.disabled && bay.dataset.module) {
    activeDrag = {
      kind: "bay",
      group: bay.dataset.fitGroup,
      bay: Number(bay.dataset.fitBay),
      id: bay.dataset.module,
      n: 1,
      startX: e.clientX ?? 0,
      startY: e.clientY ?? 0,
      started: false,
      sourceEl: bay,
    };
  }
}

function onDocPointerMove(e) {
  if (!activeDrag) return;
  const x = e.clientX ?? 0;
  const y = e.clientY ?? 0;
  if (!activeDrag.started) {
    if (Math.hypot(x - activeDrag.startX, y - activeDrag.startY) < 5) return;
    activeDrag.started = true;
    closePanelPopovers();
    applyDragHighlights(activeDrag);
  }
  e.preventDefault?.();
  activeDrag.lastTarget = e.target || activeDrag.lastTarget || null;
  showDragGhost(activeDrag.id, activeDrag.n, x, y, activeDrag.slotSize);
  updateDragHover(activeDrag, x, y, e.target);
}

function onDocPointerUp(e) {
  if (!activeDrag) return;
  const drag = activeDrag;
  activeDrag = null;
  if (!drag.started) return;
  clearDragHighlights();
  clearHeldGhost();
  suppressClickUntil = Date.now() + 80;
  if (e?.type === "pointercancel") return;
  const dropTarget = resolvePointTarget(e?.clientX, e?.clientY, e?.target);
  let res = finishStationDrag(drag, dropTarget);
  if (!res?.ok && drag.lastTarget && drag.lastTarget !== dropTarget) {
    // The release-point hit-test can land on an overlay or the panel edge;
    // honour where the drag was actually hovering instead of dropping it.
    res = finishStationDrag(drag, drag.lastTarget);
  }
  if (res?.message) toast(res.message);
  if (res?.ok) {
    inventoryChanged();
    uiSound("click");
    save();
    render();
  }
}

function installDragListeners() {
  if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
    return;
  }
  if (dragDoc === document) return;
  dragDoc = document;
  document.addEventListener("pointermove", onDocPointerMove);
  document.addEventListener("pointerup", onDocPointerUp);
  document.addEventListener("pointercancel", onDocPointerUp);
}

function onDblClick(e) {
  if (e.target.closest("button")) return;
  const hangarRow = e.target.closest("[data-hangar-ship]");
  if (!hangarRow || !hangarRow.dataset.hangarShip) return;
  const shipId = hangarRow.dataset.hangarShip;
  closePanelPopovers();
  if (shipId === state.profile.ship) return;
  ACTIONS.sel(shipId);
  uiSound("click");
  save();
  render();
}

async function onClick(e) {
  if (suppressClickUntil > 0) {
    const blocked = Date.now() <= suppressClickUntil;
    suppressClickUntil = 0;
    if (blocked) return;
  }
  const btn = e.target.closest("button[data-a]");
  if (!btn) {
    if (
      e.target.closest(".inv-sell-popover") ||
      e.target.closest(".inv-take-popover") ||
      e.target.closest(".inv-discard-popover") ||
      e.target.closest(".mod-info-popover")
    ) return;
    // Clicking anywhere else on the big Outfitting panel with a module in
    // hand places it too — pick-up-then-click works like an inventory slot,
    // not only on the group cards (ship viewer and headers included). The
    // drag path already treats the whole panel this way.
    if (
      hasHeldStack() && state.ui.leftPanel === "o" &&
      e.target.closest("#station-left") && !e.target.closest("section.mod[data-group]")
    ) {
      const group = MODULES[state.ui.invHeld?.id]?.g;
      if (group) {
        closePanelPopovers();
        const bays = state.profile.loadout?.[state.profile.ship]?.[group];
        const emptyIdx = Array.isArray(bays) ? bays.findIndex(x => !x) : -1;
        const res = placeHeldOnOutfittingBay({
          group,
          bay: emptyIdx >= 0 ? emptyIdx : 0,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        if (res.message) toast(res.message);
        if (res.changed) {
          inventoryChanged();
          uiSound("click");
          save();
        }
        render();
        return;
      }
    }
    const modCard = hasHeldStack() ? e.target.closest("section.mod[data-group]") : null;
    if (modCard && modCard.dataset.group) {
      closePanelPopovers();
      const group = modCard.dataset.group;
      const bays = state.profile.loadout?.[state.profile.ship]?.[group];
      const emptyIdx = Array.isArray(bays) ? bays.findIndex(x => !x) : -1;
      const res = placeHeldOnOutfittingBay({
        group,
        bay: emptyIdx >= 0 ? emptyIdx : 0,
        clientX: e.clientX,
        clientY: e.clientY,
      });
      if (res.message) toast(res.message);
      if (res.changed) {
        inventoryChanged();
        uiSound("click");
        save();
      }
      render();
      return;
    }
    closePanelPopovers();
    return;
  }
  if (btn.disabled) return;
  const name = btn.dataset.a;
  if ((name === "intro" || name === "campaign" || name === "campaignAct") && beforeStart) {
    if (starting) return;
    starting = true;
    btn.disabled = true;
    const label = btn.textContent;
    btn.textContent = "Loading models…";
    initAudio(); // retain the user gesture before awaiting background work
    try {
      await beforeStart();
    } catch (err) {
      showNotice(`Could not prepare models. Please try again. ${err.message || err}`);
      return;
    } finally {
      starting = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }
  if (name === "wb") {
    openShopBuy(btn, e);
    uiSound();
    return;
  }
  if (name === "shopBuyConfirm") {
    confirmShopBuy(btn);
    return;
  }
  if (name === "shopBuyCancel" || name === "shipInfoClose" || name === "modInfoClose" || name === "shipSellCancel") {
    closePanelPopovers();
    return;
  }
  if (name === "modInfo") {
    const modId = btn.dataset.b;
    const ctx = btn.closest(".inv-context");
    const host = hostPanelFor(btn);
    const anchor = ctx
      ? { left: Number(ctx.dataset.anchorLeft || 0), top: Number(ctx.dataset.anchorTop || 0), width: 0 }
      : null;
    closePanelPopovers();
    if (openModuleInfoPopover({ host, moduleId: modId, anchor, clientX: e.clientX, clientY: e.clientY })) {
      uiSound();
    }
    return;
  }
  if (name === "home") {
    closePanelPopovers();
    const alreadyHome = homeStationPlace(state.profile) === state.place;
    const msg = setHomeStation();
    if (alreadyHome && state.profile.homeStation === state.place) {
      const stName = panel?.querySelector?.(".station-head h1")?.textContent || "This station";
      toast(`${stName} is your home station. You recover here after death.`);
      uiSound("click");
    } else {
      if (msg) toast(msg);
      uiSound("confirm");
    }
    save();
    render();
    return;
  }
  if (name === "slot") {
    closePanelPopovers();
    const [g, i] = String(btn.dataset.b || "").split(":");
    const res = clickOutfittingBay({
      group: g,
      bay: Number(i),
      shiftKey: Boolean(e.shiftKey),
      clientX: e.clientX,
      clientY: e.clientY,
    });
    if (res.message) toast(res.message);
    if (res.changed) {
      if (!res.picked) inventoryChanged();
      uiSound("click");
      save();
      render();
    }
    return;
  }
  if (name === "hangarInfo") {
    const ctx = btn.closest(".inv-context");
    const host = hostPanelFor(btn);
    const localPos = ctx
      ? { left: Number(ctx.dataset.anchorLeft || 0), top: Number(ctx.dataset.anchorTop || 0) }
      : null;
    openShipDetails(btn.dataset.b, 0, 0, localPos, host);
    return;
  }
  if (name === "assetSetDest") {
    closePanelPopovers();
    const res = setAssetStationDestination(btn.dataset.b);
    if (res.message) toast(res.message);
    uiSound(res.ok ? "confirm" : "click");
    render();
    return;
  }
  if (name === "assetClearDest") {
    closePanelPopovers();
    clearAssetStationDestination();
    uiSound("click");
    render();
    return;
  }
  if (name === "assetSearchToggle") {
    closePanelPopovers();
    state.ui.assetsSearchOpen = !state.ui.assetsSearchOpen;
    if (!state.ui.assetsSearchOpen) state.ui.assetsQuery = "";
    uiSound("click");
    render();
    if (state.ui.assetsSearchOpen) panel?.querySelector?.("[data-asset-search]")?.focus?.();
    return;
  }
  if (name === "assetSearchClear") {
    state.ui.assetsQuery = "";
    uiSound("click");
    const input = panel?.querySelector?.("[data-asset-search]");
    if (input) {
      input.value = "";
      refreshDockedAssetResults();
      input.focus?.();
    } else {
      render();
    }
    return;
  }
  if (name === "stackAll") {
    closePanelPopovers();
    ACTIONS.stackAll(btn.dataset.where || btn.dataset.b || inv.STATION);
    uiSound("click");
    save();
    render();
    return;
  }
  if (name === "invEquip") {
    const itemId = btn.dataset.b;
    const where = btn.dataset.where || inv.STATION;
    const slotIdx = Number(btn.dataset.slot);
    closePanelPopovers();
    const res = fitting.equipModuleFromInventory(
      where,
      Number.isInteger(slotIdx) ? slotIdx : -1,
      itemId
    );
    if (res.message) toast(res.message);
    uiSound(res.ok ? "confirm" : "click");
    if (res.ok) {
      inventoryChanged();
      save();
    }
    render();
    return;
  }
  if (name === "hangarFly") {
    closePanelPopovers();
    ACTIONS.sel(btn.dataset.b);
    uiSound("click");
    save();
    render();
    return;
  }
  if (name === "hangarSellOpen") {
    openHangarShipSell(btn);
    uiSound();
    return;
  }
  if (name === "shipSellConfirm") {
    confirmHangarShipSell(btn);
    return;
  }
  if (name === "shopGroup") {
    closePanelPopovers();
    ACTIONS.shopGroup(btn.dataset.b);
    uiSound("click");
    render();
    return;
  }
  if (name === "invSlot") {
    closePanelPopovers();
    const where = btn.dataset.where;
    const ship = viewedShip();
    const otherWhere = where === inv.STATION ? ship : inv.STATION;
    const slotSize = btn.classList?.contains?.("inv-item") ? measureSlotSquare(btn) : undefined;
    const res = clickInventorySlot({
      where,
      slot: Number(btn.dataset.slot),
      otherWhere,
      shiftKey: Boolean(e.shiftKey),
      clientX: e.clientX,
      clientY: e.clientY,
      slotSize,
    });
    if (res.message) toast(res.message);
    if (res.changed) {
      if (!res.picked) inventoryChanged();
      uiSound("click");
      save();
      render();
    }
    return;
  }
  if (name === "invTakeOpen") {
    openInventoryTakeAmount(btn);
    uiSound();
    return;
  }
  if (name === "invSellOpen") {
    openInventorySell(btn);
    uiSound();
    return;
  }
  if (name === "discard") {
    openInventoryDiscard(btn);
    uiSound();
    return;
  }
  if (name === "invSellCancel") {
    closePanelPopovers();
    return;
  }
  if (name === "invSellConfirm") {
    confirmInventorySell(btn);
    return;
  }
  const fn = ACTIONS[name];
  if (!fn) return;

  let arg = btn.dataset.b;
  // Inventory tile: a normal click moves one, Shift-click moves the whole stack.
  if (name === "mv" && e.shiftKey) arg = String(arg || "").replace(/:[^:]+$/, ":all");
  fn(arg);
  uiSound(name === "go" ? "go" : ["buy", "up", "done", "sellh", "sells", "wb", "wr", "rp"].includes(name) ? "confirm" : "click");
  save();
  if (name !== "go") {
    if (state.ui.intro) {
      // A title screen (the main menu or the campaign chapter boxes) owns the
      // panel even when the pilot is still out in space behind it: the campaign
      // screen's Back drew the title and this used to hide it a moment later.
      render();
    } else if (!state.player || state.player.docked) {
      render();
    } else {
      // The action put the pilot back out in space: hide both station panels.
      panel.hidden = true;
      hideLeftPanelElement(leftPanel);
    }
  }
}
