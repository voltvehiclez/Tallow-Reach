# Playtest: the system sky — AUs, 3D pocket positions, and a sky that shows your system

Run `npm run build` and `npm test` (both green), then open `game/tallow-reach.html`. Use a **new**
profile or an existing one — saves are unchanged (**v21**). Ask one question of everything you see:
**would this happen like this in real life?**

What is new: pockets now live in a true **3D AU layout** (1 AU = 150 million km), derived from the same
layout the 2D pocket map draws — nothing is saved, and the map (**M**) stays exactly as it was. The
sky of every ordinary pocket now shows its **system**: the **star** or **black hole** hanging in its
true direction, and every other pocket of the system as a **barely-visible dot**, like a pinprick far
away. The light in the pocket always comes from that same body, and the systems are **different
sizes** — some compact, some vast.

## 1. The star is in the sky — and the light agrees

- [ ] Fly in **Meridian Station**. Look around the sky: somewhere in it hangs a **bright warm-white
      sun** (a glowing sphere). It does not move as you fly — it stays fixed in its direction, the
      way the real sky does.
- [ ] The light in the pocket **comes from the sun's direction** (station, ship and rocks are lit
      from that side). It is not the old fixed light any more.
- [ ] Warp to another pocket in the same system (say the **Trade lane**). The sun hangs in a
      **different direction** — the same true positions, seen from a different pocket — and the
      light has moved with it.
- [ ] The sun looks **smaller or bigger depending on the pocket**: a pocket close to the star sees a
      bigger sun than one at the far side of the system.
- [ ] The **M** map looks exactly as before — same dots, same gates, same names. Only the sky and
      the light changed.

## 2. Pockets as dots

- [ ] In the same sky, look for **very faint pinpricks** — one per sibling pocket in the system.
      They are meant to be barely visible (a mini star), not a menu of waypoints.
- [ ] The pocket you are standing in has **no dot** (you are it).
- [ ] Warp to a gate pocket: the sibling dots have shifted to their true directions from there.

## 3. Black holes

- [ ] About 5% of systems (or an authored `core: { kind: "blackHole" }` override) have a black hole
      as their central body instead of a star. If you find one (`M` shows the black-hole label on the
      system map): the body hangs in the sky **darker, with a slight orange tint**, and the light in
      the pocket is **noticeably dimmer and orange-tinted** — still coming from the body's direction.

## 4. Systems are different sizes

- [ ] Compare sun size across systems (e.g. Meridian vs a far frontier system): compact systems have
      a **bigger, more present sun**; vast systems have a **smaller, distant one**. Each system keeps
      its own size (it is seeded — the same system is the same size every time you visit).

## 5. Wormholes and instances

- [ ] **Warp into a simple wormhole pocket** (the spawned one in the system, if you find one): it
      shows the **dynamic sky like any sibling pocket** — sun/black hole/dots of the system it
      spawned in.
- [ ] **Enter the wormhole** (press R beside the grey sphere): inside the site the dynamic layer is
      **gone** — the far side keeps its own dark-grey panorama, as before.
- [ ] Same for a **rift** anywhere: inside, the rift sky is unchanged; the light is the old default.

## 6. Heights

- [ ] Sun and dots sit at **slightly different heights**, not all on one flat line — some hang a
      little above the horizon, some a little below, stable per pocket. (Heights are deliberately
      tiny — the system is essentially flat for now. A pocket can be given a hand-picked height with
      `mapHeight` in the galaxy overrides later.)

## Things to report

- Any system where you **cannot see a star/black hole** anywhere in the sky (that is the one thing
  that should always work in a system).
- A sun/dot that **moves** as you fly (the whole layer should be camera-fixed).
- A dot that sits in the **wrong place** versus the pocket map (they derive from the same layout —
  report both systems).
- Lighting that comes from a **different direction** than the visible sun/black hole.
- Anything that makes the sky feel **empty of the system** rather than full of it.
