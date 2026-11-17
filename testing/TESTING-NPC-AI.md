# NPC fighter AI preview

Run `npm run build` and `npm test`, then open `game/tallow-reach.html` or the live preview.
Use your normal ship/loadout for the difficulty comparison, not the Test Ship.

1. Fight two or more Newbie Raiders in a belt. Watch for independent strafe directions,
   heights and approach/breakaway timing. They should not track identical paths or
   stay merged. Existing collision separation is still active.
2. Lead them past a large asteroid and around a station. They should begin steering
   before contact; note any repeated rock crashes, stuck orbiting or wall jitter.
3. Fire bursts at an approaching fighter. Some should dodge after a delay, not all,
   not instantly, and not continuously. Behind-the-ship shots are not sensed.
4. Fight Guardians in a rift/hive. Expect more committed close attacks and shorter
   breaks, not extra damage, fire rate or hit points. Smugglers favour wider strafes;
   freighters remain slow and less evasive.
5. Check that rocks/stations and other enemies block firing lanes. NPCs should not
   lead moving targets perfectly; they have modest angular error and still need to
   face you before firing.
6. Compare time-to-kill and damage taken with the previous version. Report if the
   fight feels significantly harder, too easy, or enemies disengage too often.
7. Check frame rate in a populated belt and after repeated waves. Report crowd size
   and place if performance drops.

Known limits: steering is local, not a global pathfinder through arbitrary caves.
Scenery probes depend on registered rendered collider meshes. Collision fallback
still applies; this change does not make enemies immune to environmental damage.
Save stays v21; no save reset required. Existing NPCs are transient.
