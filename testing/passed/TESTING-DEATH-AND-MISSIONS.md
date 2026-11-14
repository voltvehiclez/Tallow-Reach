# Playtest: dying, handing in and mission wording

What changed: a mission is **not accomplished by its last step.** If it collects items, it is only finished when you hand
them in at a station and take the reward. Dying does not fail a mission by itself, but dying while you carry a mission-only
item that the mission still needs (a parcel, the Border Signal beacon) fails it with a red notice saying which item was lost.
Contract guidance names the station and says "Contract complete", never "Mission complete"; the top-right ship UI shows
contract names in light blue and story mission names in amber. Dying also used to hand you a spare Wasp with no fit at all, so
nothing could be equipped afterwards; the replacement ship is now a complete one (see "After a death" below).

Play `TESTING-BASELINE.md` first, then these. Add `?testmissions` to the end of the game's address for the test missions.

## Border Signal (the reported bug)

- [ ] Start **The Border Signal** from the Mission log. Destroy the two raiders, pick up the beacon, and click through the
      in-space chat until it closes. Expected: the top-right mission line now says **"Return to Meridian Station with the
      beacon."** It must **not** say complete, accomplished or "collect the reward".
- [ ] **Now die** (let raiders kill you) before docking. Expected: a red notice "Mission failed: The Border Signal" with
      "Your ship was destroyed and the Beacon it carried was lost." The mission is gone from the Mission log, not stuck.
- [ ] Replay it. After the in-space chat, fly to Meridian Station and press **G** to dock. Open the Mission log. Expected:
      the mission says **Ready to hand in** and the button says **Hand in cargo**. Click it: "Paid 300 cr.", the beacon is
      gone from your hold, and the mission is gone from the log.
- [ ] This time, after picking up the beacon, dock at Meridian Station and **move the beacon into station storage** before
      flying out again. Die out in space. Expected: the mission carries on (the beacon is safe in the station), and you can
      dock and hand it in.

## Contracts

- [ ] Accept a **Salvage** contract. Expected top-right line: **"Recover N derelict crates for delivery to <station>."**
      and the name is **light blue**. Recover every crate. Expected: **"Deliver N derelict crates to <station>."** — it must
      not say complete. Dock and click **Hand in cargo**: "Paid ... cr." and the mission disappears.
- [ ] Recover only some of the crates and dock. Expected: the line still names what you owe, for example
      "Deliver N derelict crates to <station>. You have 2 of N." Nothing claims it is done.
- [ ] Accept a **Destroy** contract (hunt). Expected: the line says "Destroy N pirate raiders."; after the last kill it says
      **"Contract complete. Return to a station to collect the reward."** — the word *Mission* must not appear.
- [ ] Take a **story** mission and a **contract** at the same time. Expected: the story name is amber, the contract name is
      light blue, both readable in the top-right block.

## Hand-in stations

Every mission and contract is handed in at **one named station**. By default that is the station that gave it out; a
mission can name a different one in its data (`handIn.station`, as the Border Signal does with Meridian Station).

- [ ] Accept a contract. Expected: the guidance names the station — "Mine N Ferrite for delivery to **Meridian Station**."
      — and never says "a station".
- [ ] Finish its objective without docking. Expected: the top-right line still names Meridian Station, e.g. "Deliver N
      Ferrite to Meridian Station." (plus "You have N of M." while you are short).
- [ ] Dock at Meridian and open **Mission log**. Expected: "Ready to hand in" and a **Hand in cargo** button. The
      Contracts tab row offers the same button.
- [ ] The Border Signal: its hand-in is Meridian Station whatever station you started it from.
- [ ] **Hand in somewhere else.** Take a contract at Meridian, finish its objective, then warp to another system's station
      (for example **Lumenveil Trading Hub** in the Lumenveil Expanse) and dock. Expected: the log says "Deliver to Meridian
      Station" with a disabled **Hand in at Meridian Station** button next to Abandon, nothing is paid and the cargo stays
      aboard. Dock back at Meridian and the button works.
- [ ] **Take one elsewhere.** Accept a contract *at* that other station, finish it, and dock there. Expected:
      "Ready to hand in" and **Hand in cargo** — the station that gave it out takes it, not Meridian.
- [ ] `tests/mission-handin-station.test.mjs` covers the same rule headlessly with its own second station (Meridian vs.
      Depot Station), including that the wrong counter pays nothing and takes nothing.

## After a death: the replacement ship is a real ship

- [ ] Spend your credits down so you own **one** ship and cannot buy another, then get destroyed. Expected: the death message
      ends "The station lent you a spare Wasp." and you are docked.
- [ ] Open **Outfitting**. Expected: the Wasp has the stock modules in every bay (power, cells, thrusters, shield, cannon, hull)
      and you can fit a module into its empty second primary bay. Nothing says you have no ship or no bays.
- [ ] Launch and fly. Expected: thrusters, Hull HP, shields and guns all work — a real ship, not a bare hull.
- [ ] Die again while you own a second hull. Expected: you fall back to that ship with its own cargo, its own fittings and its
      remembered hull damage.

## Failure and notice

- [ ] **Death with no mission item.** Start "Test: Radio relay" (or accept a contract) and get destroyed. Expected: you are
      docked with the usual death message and the mission is still Active. No red notice.
- [ ] **Death carrying the parcel.** Start "Test: Parcel run", load the parcel at the dock, fly out and get destroyed.
      Expected: red notice "Mission failed: Test: Parcel run" with "Your ship was destroyed and the Parcel it carried was
      lost." The mission can be started again from the beginning.
- [ ] **Death before loading the parcel.** Start "Test: Parcel run" but die before loading the parcel. Expected: the mission
      carries on, no notice.
- [ ] **A mission that wants you to fail.** Start "Test: Ambush run" and get destroyed. Expected: red notice with "The
      ambush run was lost because the ship was destroyed."
- [ ] **Ore run.** Start "Test: Ore run", mine all three Ferrite, then die before docking. Expected: the mission carries on
      (ore can be mined again) and still asks for the delivery; you can mine or hand in more and finish it.
- [ ] **The notice.** It stays up for 15 seconds or until you click it. Abandoning a mission yourself shows no notice.
- [ ] **Old save.** Load an old save that has the Border Signal active: dying without the beacon no longer fails it, and a
      save from before this change still finishes normally.
