# Step 13d playtest: mission rules and test missions

Build with `npm run build`, run `npm test`, then open the game with **`?testmissions`** on the end of
the address (for example `tallow-reach.html?testmissions`). Under **Mission log** a **Test missions**
list appears. Normal play shows none of this.

Ask one question of everything you see: **would this happen like this in real life?**

## 1. Parcel run (cargo delivery)
1. Start it. Hear the dispatcher at the station. The parcel should come aboard only once you have room.
2. Fill your hold first, then continue: it must wait and say to make room (and, if you have undocked, to
   dock). It must not skip or fail. Unload, and the parcel appears at the dock, not before.
3. Fly to Kestrel Hollow. Hand-over happens there, not before. Sell or drop the parcel on the way: the
   mission waits, it does not complete.
4. Die with the parcel aboard: the mission fails with "The parcel was lost with your ship." and can be
   started again from the beginning.
5. Collect the payment at Meridian Station.

## 2. Radio relay (radio only)
1. Start it, then undock before pressing Continue: the message must still work in flight.
2. Try both answers ("I'll take a look" and "Not now"). Neither may get stuck.

## 3. Ore run (mine N)
1. Mine 1 or 2 Ferrite, dock, quit and reload: progress is kept. Finish, then hand in at the station.

## 4. Ambush run (fail and replay)
1. Fly to Kestrel Hollow. Two raiders must arrive from a distance, never on top of you, and only after
   you are flying there. Pressing Continue on a briefing must never make ships appear.
2. Die during the fight: the mission fails with a message, no raiders remain, and a replay starts clean.

## 5. Two at once
1. Start Parcel run and Border Signal together and do some of each. Neither may disturb the other.

## Also
- Your three known bug cases: undock mid-dialogue, a dialogue button causing a spawn, full hold with a
  dropped mission item (unload at the station: the item must not appear in the hold by itself).
- Load an old save and back up a zip.
