# Step 14a + 14b playtest: rifts, instanced places, and a run that survives a quit

Run `npm install`, `npm run build` and `npm test` (all green), then open `game/tallow-reach.html`.
Start a **new** profile with 600 cr. Ask one question of everything you see: **would this happen like
this in real life?**

What is new: a rift is a **place you carry with you**. You buy a one-use **Basic rift**, open a door in
clear space, fly to it and press **R** to go in. The door — and the way out inside — is a **shimmering
dark-orange anomaly**: a dark spherical core with a bright eye, an orange aura and a flare around it.
Inside is a generated pocket under **a shattered sky of its own**, with no stars and no planet: pirates
guarding a **canister** that stays sealed until the objective is done, and a **Rift gate** that stays
sealed with it. **F** locks any of the three and the HUD labels all of them, so the way out cannot be
lost. The pocket **collapses 20 minutes after you went in** — with you inside it. And the run is
**saved**: log out mid-rift and you come back mid-rift.

## 1. Buying one

- [ ] Dock at Meridian Station → **Shop** (the Weapons shop). At the bottom of the list, after Basic
      cannons and Basic hull, there is a **Basic rift** row at **10 cr** whose description says plainly
      that it is used once, from the in-flight inventory, and what is on the other side.
- [ ] Buy 3. The hold shows them as one stack of 3 and the **cargo value** goes down by 30 cr.
- [ ] Sell one back: it is worth **6 cr** (60% of the price, like everything else).
- [ ] Undock, press **I** (inventory in flight). The rift's tile is labelled **USE**, not ORE or MOD,
      and the line under it says what kind of thing it is.
- [ ] Right-click the stack → **Use** while still **docked**: it refuses with **"Undock before opening
      a rift."** and spends nothing.
- [ ] Undock, stay parked beside the station and **Use** again: it refuses with **"Too close to
      Meridian Station: 1 km of clear space is needed."** and spends nothing.
- [ ] Right-click → **Discard**: allowed, and it drops the whole stack like any item.

## 2. Opening a door

- [ ] Fly out into clear space: at least **1 km** from the station, from the **edge** of the asteroid
      field and from the planet's **surface**, and **150 m** from any single rock.
- [ ] Press **I** → right-click the rift → **Use**. A message reads **"A Guardian rift opens ahead. Fly
      to it and press R."** The hold goes 3 → 2: **one** was spent, no more.
- [ ] Turn around and look: a **shimmering anomaly** hangs exactly where your ship was (about 26 m
      across) — a **dark orange-and-black sphere** with a bright eye at its centre, a glowing aura and
      a wider flare around it, all of it slowly breathing and spinning. It reads as a hole in space,
      not as a ring or a door frame. Nothing was created anywhere else.
- [ ] It is labelled in the HUD at all times: **Guardian rift** with its distance under the name, even
      when it is behind you (the label pins to the edge of the screen then).
- [ ] Press **F** while it is ahead of you: the lock reticle takes it and the label reads **Locked
      Guardian rift**. Press **F** again: the lock lets go.
- [ ] Fly straight **through** the anomaly: nothing happens. Entering is a deliberate press, never a
      collision.
- [ ] Open a second rift elsewhere: a **second door** appears there, and the first one is still where
      you left it. Each door leads to its own run.
- [ ] Press **M** (starmap): no rift appears as a place, a pocket or a warp target. Doors are not
      destinations; you fly to them.

## 3. Going in

- [ ] Fly to within a couple of hundred metres. The hint under the flight screen reads **"Press R to
      enter Guardian rift"** once you are inside **200 m**; further out there is no hint, and pressing
      **R** says **"Nothing to enter here."**
- [ ] Inside 200 m, press **R**: you are inside, at once, with no loading screen and no docking.
- [ ] **The sky is somewhere else.** No stars at all: instead a dark, uneven shell closes the space in,
      with **glowing fracture lines** running through it and **shards drifting** slowly in front of it.
      It is dim and orange-black, and it turns very slowly. It does not look like the pocket you left,
      and there is **no planet** in it — nothing here is copied from normal space.
- [ ] Top right now reads the run's own name (**Guardian rift** or, about one door in seven, **Deep
      rift**) instead of the pocket's, and under it a panel with four lines: the objective, the
      collapse countdown, the canister line, and the exit line.
- [ ] The objective is the authored sentence **"Destroy the rift guardians"** — not a code or a rule
      name. The countdown starts at **20:00** (25:00 in a Deep rift) and ticks down every second.
- [ ] The canister line reads **"Rift cache is locked"** and the exit line reads **"The way out is
      sealed until the rift guardians are destroyed."**
- [ ] **4 raiders** (6 in a Deep rift) are out there between **800 m and 1100 m** — never on top of
      you. Each one takes clearly **more hits** than a raider in normal space, and their shots hurt
      more.
- [ ] Ahead of you, about **180 m** away, hangs a **second anomaly** — the **Rift gate**, drawn exactly
      like the door you came through, labelled **Rift gate (sealed)** with its distance, and locked
      with **F** like any other target. It is in plain sight from the moment you arrive.
- [ ] Behind you, about **840 m** away, hangs the **Rift cache**: a **canister** — a drum with two end
      caps and two bands around it — with a **red lamp** while it is sealed, labelled **Rift cache
      (locked)**. You can see the prize long before you can have it.
- [ ] There is a **debris field** of about 26 rocks (34 in a Deep rift) you can mine, and mining here
      works normally: the ore is ordinary ore.
- [ ] The pocket you came from is **gone from view** — no station, no planet, no other ships.

## 4. The sealed way out

- [ ] Before killing anything, fly to the **Rift gate** (you arrive within **220 m** of it): the hint
      under the screen repeats the sealed sentence, and pressing **R** refuses with it and leaves you
      inside. Nothing is unlocked, nothing is lost.
- [ ] Fly well away from the gate (more than **220 m**) and press **R**: it refuses with **"Fly back to
      Rift gate (within 220 m of it) and press R."** The way out is a place, not a menu.
- [ ] Fly to the canister and press **R** while the objective stands: it refuses with **"The Rift cache
      is still sealed. Destroy the rift guardians"** and takes nothing.

## 5. The run and the reward

- [ ] Kill the guardians. When the **last** one dies, one message reads **"The last rift guardian
      breaks up. Rift cache unlocked — fly to it and press R. The way out is open."** (a Deep rift says
      it in its own words), the panel's canister line becomes **"Rift cache is open — fly to it and
      press R"**, the canister's **lamp turns green**, its label becomes **Rift cache (open)**, and the
      objective line ends in **"— done"**.
- [ ] The exit line now reads **"Rift gate is open — fly back to it and press R"**, the gate's label
      becomes **Rift gate (open)**, and its sealed shells are gone.
- [ ] Fly to the canister (inside **60 m**; the hint under the screen says **"Press R to open Rift
      cache"**) and press **R**: a message names what came aboard — for example **"The Rift cache gives
      up 4 salvage, 4 voidite and 1 Reactor core."** — with the usual pickup sound. Once it is empty the
      canister is **gone** from the world, its label with it, and R there does what R does anywhere
      else in a run: it is the way out.
- [ ] The hold did **not** fill itself at any point: the HUD's hold load changes only when you press R.
- [ ] **Try it with a full hold** (mine the field first, or run a Deep rift in a starter Wasp): R takes
      what fits and says **"…; 4 more will not fit. Make room and press R again."** The canister stays
      where it hangs with the rest inside it, and pressing R again after dropping or selling something
      takes the remainder. Nothing disappears into a hold that has no room.

## 6. Leaving

- [ ] Fly back to the **Rift gate** and press **R**. You are out immediately, in the pocket you opened
      the rift from, at the **exact spot** where you entered, facing the way you were facing, with
      **everything you collected**.
- [ ] The pocket **looks like the pocket again**: its stars, its planet and its station are back, and
      the rift's shattered sky is gone.
- [ ] The anomaly is **gone**: the door collapsed behind you, and the rift you used is spent. There is
      no way back into that run.
- [ ] Your shield and power levels came back with you as they were.

## 7. The clock

- [ ] Open another rift and go in, then idle. With **60 seconds** left a warning message appears and
      the countdown keeps running.
- [ ] Let it reach zero: **you die.** The message starts with the run's own words — **"The rift
      collapsed with your ship inside it."** — and continues with the ordinary death consequences and
      the recovery fee.
- [ ] After that death you are **docked in the pocket you opened the rift from**, your **ship and your
      whole hold are gone** (including any rifts you were carrying), and the run **and its door
      despawned at once** — no rift floating out there to fly back into.
- [ ] Dying to the **guardians** instead works the same way: the run and the door despawn at once and
      you come back at the spot you entered.

## 8. Saving and reloading (slice 14b)

- [ ] Open a rift, go in, fly somewhere recognisable (say halfway to the canister), note the countdown,
      and **reload the page** — or wait for the 30-second autosave and reload.
- [ ] You come back **inside the run**: same name in the top right, same shattered sky, **same
      countdown** (to the second), same rocks, same **Rift gate** and same **canister** in the same
      places, and your ship at the spot and heading you logged out at. Nothing is duplicated and
      nothing crashes.
- [ ] The **guardians are back at full strength** — a save carries the run, not each pilot's damage on
      them. This is deliberate: reloading is never a way to escape a fight you were winning.
- [ ] Kill the wave, **open the canister with R**, take the prize, and reload again: the run comes back
      **finished** — the objective still reads **— done**, the gate is **open** and unsealed, and the
      canister is **gone for good**, so R where it hung cannot farm the prize a second time. Your hold
      still holds exactly what you took.
- [ ] On coming back, the message line reads the objective with **"— done"** appended when it was
      already met, and the plain objective sentence when it was not.
- [ ] Reload while the countdown is under 60 s: the warning has already been shown, so it is not
      repeated, and the clock still runs out and kills you.
- [ ] Load an **old** save (`testing/TEST-OLD-CODES.txt`): it loads exactly as before, with no rift in
      the hold, no door anywhere and nothing inside a run.
- [ ] Save to a **slot** from inside a run (Esc → save), leave the run, then load the slot: you are back
      inside it again.
- [ ] Back up a zip of the project.

## 9. Also check

- [ ] The **intro screen**'s controls list and the hint under the flight screen both mention **R** for
      entering or leaving a wormhole, and **F** for locking a target.
- [ ] No message, panel or hint ever prints a rule name (`objective-done`), an id (`guardian_rift`) or
      a number that should be words.
- [ ] The anomaly, the gate and the canister are all **labelled in the HUD without locking them**, and
      each label says what the thing is and how far away it is.
- [ ] While a run is open, the rest of the game is untouched: missions still tick, warp still charges,
      the starmap still lists the ordinary pockets (and never lists a run).
