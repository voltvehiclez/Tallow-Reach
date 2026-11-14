# Step 14a playtest: rifts and instanced places

Run `npm install`, `npm run build` and `npm test` (all green), then open `game/tallow-reach.html`.
Start a **new** profile with 600 cr. Ask one question of everything you see: **would this happen like
this in real life?**

What is new: a rift is a **place you carry with you**. You buy a one-use **Basic rift**, open a door in
clear space, fly to it and press **R** to go in. Inside is a generated pocket that belongs to nobody
else's map: pirates holding a **locked cache**, which opens only when the objective is done. The way
out is a **Rift gate** at the point you arrived, and the pocket **collapses 20 minutes after you went
in** — with you inside it.

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
- [ ] Turn around and look: a **glowing ring with a faint core** hangs exactly where your ship was
      (about 26 m across), slowly spinning. Nothing was created anywhere else.
- [ ] Fly straight **through** the ring: nothing happens. Entering is a deliberate press, never a
      collision.
- [ ] Open a second rift elsewhere: a **second door** appears there, and the first one is still where
      you left it. Each door leads to its own run.
- [ ] Press **M** (starmap): no rift appears as a place, a pocket or a warp target. Doors are not
      destinations; you fly to them.

## 3. Going in

- [ ] Fly to within a couple of hundred metres. The hint under the flight screen reads **"Press R to
      enter Guardian rift"** once you are inside **200 m**; further out there is no hint, and pressing
      **R** says **"Nothing to enter here."**
- [ ] Inside 200 m the bottom hint names the rift. Press **R**: you are inside, at once, with no
      loading screen and no docking.
- [ ] Top right now reads the run's own name (**Guardian rift** or, about one door in seven, **Deep
      rift**) instead of the pocket's, and under it a panel with three lines: the objective, the
      collapse countdown, and the exit line.
- [ ] The objective is the authored sentence **"Destroy the rift guardians"** — not a code or a rule
      name.
- [ ] The countdown starts at **20:00** (25:00 in a Deep rift) and ticks down every second.
- [ ] The exit line reads **"The way out is sealed until the rift guardians are destroyed."**
- [ ] **4 raiders** (6 in a Deep rift) are out there between **800 m and 1100 m** — never on top of
      you. Each one takes clearly **more hits** than a raider in normal space, and their shots hurt
      more.
- [ ] A **locked cache** (a pale angular lump) hangs in the distance from the moment you arrive: you
      can see the prize before you can have it.
- [ ] There is a **debris field** of about 26 rocks (34 in a Deep rift) you can mine, and a planet
      behind it. Mining here works normally and the ore is ordinary ore.
- [ ] The pocket you came from is **gone from view** — there is no station, no field, no other ships.

## 4. The sealed way out

- [ ] Before killing anything, fly to where you arrived: the hint under the screen repeats the sealed
      sentence, and pressing **R** refuses with it and leaves you inside. Nothing is unlocked, nothing
      is lost.
- [ ] Fly well away from the arrival point (more than **220 m**) and press **R**: it refuses with
      **"Fly back to Rift gate (within 220 m of where you came in) and press R."** The way out is a
      place, not a menu.

## 5. The run and the reward

- [ ] Kill the guardians. When the **last** one dies, a message says the cache is open.
- [ ] The locked cache **is gone** and ordinary **crates** are scattered where it hung (salvage,
      sometimes a power core, sometimes voidite). The hold did **not** fill itself: the HUD's hold
      load is unchanged until you collect.
- [ ] Fly into the crates: they pull toward you and are picked up **one at a time**, with the usual
      pickup sound, exactly like loot from a wreck. A Guardian rift's cache is about **16 m³** and a
      Deep rift's up to about **24 m³**, and a starter Wasp carries 20 m³ — so a deep run can overflow.
      The crates that do not fit keep drifting and the ordinary **"Cargo hold full"** rule applies;
      nothing disappears into a hold that has no room.
- [ ] The objective line now ends in **"— done"** and the exit line reads **"Rift gate is open — fly
      back to it and press R"**. Near the gate the hint under the screen says **"Press R to leave
      through Rift gate"**.

## 6. Leaving

- [ ] Fly back to the arrival point and press **R**. You are out immediately, in the pocket you opened
      the rift from, at the **exact spot** where you entered, facing the way you were facing, with
      **everything you collected**.
- [ ] The ring is **gone**: the door collapsed behind you, and the rift you used is spent. There is no
      way back into that run.
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

## 8. Saving and reloading (this slice)

- [ ] Open a rift, go in, and **reload the page** (or wait for the 30-second autosave and reload).
      You come back in the **pocket** where you opened the rift, at the **entry spot**, not inside the
      run: saving a run mid-flight is slice **14b**, not this one. Nothing crashes and nothing is
      duplicated.
- [ ] Load an **old** save (`testing/TEST-OLD-CODES.txt`): it loads exactly as before, with no rift in
      the hold and no door anywhere.
- [ ] Back up a zip of the project.

## 9. Also check

- [ ] The **intro screen**'s controls list and the hint under the flight screen both mention **R** for
      entering or leaving a wormhole.
- [ ] No message, panel or hint ever prints a rule name (`objective-done`), an id (`guardian_rift`) or
      a number that should be words.
- [ ] While a run is open, the rest of the game is untouched: missions still tick, warp still charges,
      the starmap still lists the ordinary pockets.
