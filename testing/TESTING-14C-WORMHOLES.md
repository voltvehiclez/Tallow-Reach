# Step 14c playtest: simple wormholes

Run `npm install`, `npm run build` and `npm test` (all green), then open `game/tallow-reach.html`.
Start a **new** profile with 600 cr. Ask one question of everything you see: **would this happen like
this in real life?**

What is new: a **Simple Wormhole** — a pocket that **spawns itself in normal space**, inside some
existing system. It appears on **that system's map** as a **Simple Wormhole** with no spawn notice
anywhere, it can be warped to like any pocket for as long as it lives, and the far side is a site the
pilot can leave at any time. There are always **75 of them in the universe**, never more than **3 in
one system**; when one expires a replacement pops up somewhere else. A fresh universe staggers their
clocks at random; every respawn comes back with the full **20 minutes**.

**Save version is v21.** The save keeps the standing wormholes (`world.wormholes`) and their remaining
time; a v20 save loads and fills the universe back to its population on load.

**Not everything in this slice is owner-decided.** The playtest questions are at the end — answer them
in a reply, and anything that is wrong will be fixed before the slice ticks in ROADMAP.

## 1. Seeing one

- [ ] Open the starmap (**M**) and pick a destination system with planets. Any system will do.
- [ ] Look at the pocket list: depending on which systems got what, one or more entries read
      **Simple Wormhole** with no visit badge and no notice. Their positions on the map are fixed —
      an unvisited simple wormhole is still on the map, because it is space, not scenery.
- [ ] Note that **Meridian Station's own system has a low chance of none at all** (never more than
      three anywhere). If the very first system you look at has none, jump to another system — the
      starmap shows every pocket you know, including spawned ones.
- [ ] Warp to the system, and look at the pocket list in the chart: the **Simple Wormhole** is there
      as a warp target. Warp to it.
- [ ] Inside, the sky is the **same sky the system you came from wears** — the pocket is ordinary
      space in the same solar system, not somewhere else. There is **no planet** and **no station**,
      just **asteroid formations** drifting.
- [ ] At the centre hangs one **grey dark sphere** — "Simple Wormhole" — with a **greyish radiance**
      around it. **F** locks it; the lock reticle takes it and the HUD labels it **Locked Simple
      Wormhole** (or **Simple Wormhole** unlocked). It never fires, never flees, never disappears
      behind your back while you watch it.
- [ ] The top right reads **Simple Wormhole** as the place name instead of a system or a pocket name.

## 2. Going in

- [ ] Fly to within a couple of hundred metres of the grey sphere: the hint under the screen reads
      **"Press R to enter Simple Wormhole"** once you are inside **200 m**; further out there is no
      hint, and pressing **R** says **"Nothing to enter here."**
- [ ] Press **R**: you are inside at once, with no loading screen and no docking.
- [ ] **The sky is somewhere else again** — a real **dark-grey nebula panorama with few stars**,
      the owner's reference picture, seen wrapped around you. Not the pocket you left, not a painted
      haze.
- [ ] Top right names the site (**Smuggling operation**, **Lumenite belt**, or **Guardian hive** —
      roughly one in three; each door is rolled when the wormhole first spawns it).
- [ ] There is a way out: a **Stable wormhole** — the same grey sphere, at the far side of the site.
      It is **never sealed**, it never locks behind you, and **it has no countdown**. It is the way
      home, always.
- [ ] Nothing here is in a hurry. The site is **less hardcore than a rift**: leave whenever you like.

## 3. The three sites (each simple wormhole is one of these)

### 3a. Smuggling operation ("Smuggling operation", ~1 in 3 wormholes)
- [ ] You arrive at a smuggling operation: **4 Smugglers** (their own hostile — the lock reads
      **Smuggler**, with hull percentage; they are **not** Newbie Raiders) and **1 Smuggling
      Freighter** (a slow, tough gunmetal freighter with its own name — the lock reads **Smuggling
      Freighter**). They fly in from a few hundred to about a kilometre away — never on top of you.
- [ ] Their wrecks leave salvage; the freighter spills **contraband** (its wreck, not a contract).
      A **hunt contract for pirate raiders does not move** when you kill them.
- [ ] The objective reads **"Destroy the smugglers and the freighter"** — when the last of them dies,
      it reads **— done**.
- [ ] Nothing else is taken from you for doing it. No cache hangs anywhere in this site.

### 3b. Lumenite belt ("Lumenite belt", ~1 in 3 wormholes)
- [ ] You arrive at a **belt of rocks** rich in **lumenite** (~30% of every mined rock). It is quiet —
      nothing shoots at you.
- [ ] The objective reads **"Mine 4 lumenite"** and the counter in the top-right panel ticks up as
      each lumenite goes into your hold. When it reaches 4, it reads **— done**.
- [ ] There is **no canister** in this site. The ore in your hold is the reward.
- [ ] Lumenite sells as ordinary ore at the refinery; **it is a plain item, nothing illegal, nothing
      magic** — just the rare ore from a somewhere else.

### 3c. Guardian hive ("Guardian hive", ~1 in 3 wormholes)
- [ ] You arrive to **6 Hive Guardians** — a umber-green organic hostile, the lock reads **Hive
      Guardian** — holding a hive. Their wrecks pay well (salvage, voidite, cores).
- [ ] The objective reads **"Destroy the hive guardians"** and ends in **— done** when the last dies.
- [ ] There is **no canister** in this site — the hive's wreckage is the reward.

## 4. How the sites behave

- [ ] **They are not rifts.** You can leave at any time — the lock on the Stable wormhole never
      closes, the objective never seals the way out, and nothing ever says "the objective is not
      finished" at the exit.
- [ ] Fly to the **Stable wormhole** (within **220 m**) and press **R**: you are back in the Simple
      Wormhole pocket, at the spot you entered, facing the way you were facing.
- [ ] **The grey sphere is still there.** Press **R** again and you are back inside the site — same
      sky, same counter, same wrecks still floating where they were. A simple wormhole's site is
      **re-enterable** until the 20 minutes are spent.
- [ ] **Objectives and rewards are one-time per wormhole.** If you complete the objective, leave and
      come back, the objective still reads **— done** and killing the same site a second time does
      nothing twice. (If you mine lumenite before the objective is done, the count comes with you
      through a leave and a reload.)
- [ ] The pocket's clock keeps running the whole time — it does not pause because you are inside,
      outside, warping, docked or dead.

## 5. The clock

- [ ] The pocket spawned with a clock and the save keeps it. **20 minutes from pocket spawn** — not
      from when you first entered, not from the first talk with the map. Warp away for ten minutes,
      come back: the wormhole's line in the starmap (if it is on it) tells the truth by then.
- [ ] Let it reach zero — or find one that is already at 19:30 when you arrive: the wormhole
      **collapses**. **Only `collapse` fires.** The way in fades from normal space — the marker is
      gone from the map — and **you are not killed**.
- [ ] **If you are inside the site when it collapses:** the site remains escapable — the **Stable
      wormhole** is still there, still never locked, with no clock of its own — and the way back out
      to the pocket is gone with the pocket.
- [ ] A collapsed pocket you were not in, and were not warping towards, is **gone at once** — no
      pocket stuck on the map with no way in. A collapsed pocket you were in (or in its site, or
      flying towards it) lingers until you leave it, then despawns.
- [ ] When any simple wormhole expires, a **replacement pops up somewhere else** — never the same
      system back to back on purpose, and never more than 3 per system.
- [ ] Fresh universe: the very first fill rolls each of the 75 a random remaining life between **0
      and 20 minutes**, so they never all cycle together. Every respawn after that gets the full
      **20 minutes**.

## 6. No notice, no spawn, no kill

- [ ] You never get a message that a wormhole appeared or disappeared. The only trace is the map —
      the marker appears and clears itself without ceremony.
- [ ] Nothing in a simple wormhole ever says **"the wormhole collapsed with your ship inside it"** —
      the `kill` expiry does not exist here. The rift rule is not the wormhole rule.
- [ ] Dying inside a site (the hive, the freighter) puts you back where you entered the pocket from
      with the ordinary death rules — it does not fill the sky with fire or leave a rift in its wake.

## 7. Saving and reloading

- [ ] With a simple wormhole on the map (note its system and its name), **back up your save** (Esc,
      copy the export code into a text file) or just note the system it is in.
- [ ] Reload the page. The wormholes are **back with the save** — the one you saw is still on the map,
      with its own clock, its own mapPos and its own site. Nothing duplicated, nothing crashes.
- [ ] Enter the site, note the clock on the panel and the pocket's, then reload: you come back
      **inside** the site with both clocks to the second. The guardians are **at full strength** —
      a save carries the run, not the damage on them.
- [ ] Take a slot save from inside the site, fly out, load the slot: you are back inside it with the
      same state as you saved.
- [ ] **Load a v20 save** (`testing/TEST-OLD-CODES.txt`): it loads as before. Because the universe always
      insists on its standing population, this build fills it to **75** wormholes on the first load of the
      old save — lifetimes staggered between 0 and 20 minutes, exactly like a fresh universe — and saves
      them from then on like any other wormholes.
- [ ] **Save v21 round trips in the `TR1:` export code**: export one, reset the slots, import it —
      the same wormholes, clocks and pockets come back.

## 8. Questions for the owner (please answer in your reply)

These are the decisions this slice left open on purpose:

1. **Countdown visibility.** Should the starmap tooltip (or the HUD) show the wormhole's remaining
   time, or none at all? Today nothing shows it — the clock lives in the save, not on any screen.
2. **Spawn eligibility.** Should the home system (Meridian's neighbourhood) be allowed simple
   wormholes, or none? Is there any system they must never hang in?
3. **Collapsed pockets.** The build keeps a collapsed pocket only while the local pilot is in it (or
   in its site, or warping towards it) and despawns it at once otherwise. Is that right, or should it
   linger for everyone until its natural end?
4. **Reward scale.** The three sites are sketches — smuggler/freighter salvage and contraband,
   lumenite, or hive loot. What should a **well-run** wormhole actually pay?
5. **Spawn weighting.** The three sites are equally likely. Should any be rarer? Should the lumenite
   belt be the only one with an objective?
6. **Legality.** Contraband is an ordinary trade item right now — no police, no fencing, no
   confiscation. Keep it that way, or make it "illegal" in the full sense later?
7. **Lock semantics.** The grey sphere locks with **F** (a reticle), but there is no rule that it
   "does" anything. Is locking it enough, or should it also be tappable with **R** from range,
   warp-targeted, or simply unlockable?
8. **Whether the stable wormhole ever needs a lock** — today it does not, by design. Confirm.

If any of the answers is "different", say which — fixes land in a follow-up and this slice ticks in ROADMAP only when the round passes.
