# Playtest 25 — one pointer, and a lead pip for anything you can lock

**Build `2026-11-25i`.** Hard-reload on **both** machines before testing anything: the build string
on the **Connection details** card must read `2026-11-25i` (if you are only playing alone, the title
screen's version line will do).

**How to be sure it is this build:** while you are connected, the chat box's empty line says
*Press Enter to chat. **Build 2026-11-25h***. If it does not show a build at all, the page is an older
download or a cached copy — hard-reload (Ctrl+Shift+R) and look again. In the previous round both
machines ran an older bundle and neither fix could possibly have appeared.

Two reports, both from the same flight of the playtest-24 build. They are unrelated to each other, so
test them in either order.

---

## 1. One pointer at a time

**Before:** pins the chat, then hovers the pinned box while flying — a white Windows arrow appears
inside the orange circle.

**Rule now:** while you are steering the ship, the **orange circle** is the only pointer. Nothing
under the mouse may show the system arrow — not the pinned chat, not the route list, not a marker. A
surface that *takes the steering away* (chat typing, the hold, the chart, the cache, the multiplayer
screen, the N list, pause, docked at a station) shows the system cursor as it always has, and the
orange circle is hidden there — one pointer, never two.

1. Launch and fly. **Left Alt** (free camera): the orange circle **stays** — you are still flying,
   just from another viewpoint.
2. Open the chat with **Enter**, pin it (**Pin**), press **Enter** again to close the field. Fly with
   the mouse and sweep the pointer across the pinned box: **no white cursor anywhere**, and the
   ship keeps answering the stick while the pointer is over the box.
3. Press **Enter** to type. Now the **white cursor** is back and the orange circle is **gone** — and
   the arrow moves **freely over the whole screen**, exactly as it does with the N list open, not
   only while it is over the chat box.
4. Close it (**Escape**). The orange circle comes back the moment the box closes.
5. Sanity: **I** (hold), **M** (chart), **N** (list), **Escape** (pause), and dock at a station — each
   of those shows the white cursor, and each returns to the orange circle when it closes.

One more surface is *not* in that list, on purpose: a story **dialogue card** during a mission does
not take the steering away (you keep flying while a line is up), so the orange circle stays the
pointer over it too.

**If something is wrong:** say *which surface* still showed the wrong pointer (and in which
direction — white where the circle should be, or both at once).

---

## 2. The lead pip for anything you lock

**Before:** as a host, press **F** on a visiting friend — the ship is selected and named, but the white
lead circle never appears. The instrument only ever drew for hostiles.

**Rule now:** the lead pip follows **whatever F has locked, as long as it is moving** — hostiles,
visiting pilots (host or guest), and anything else with a velocity. The weapon side is unchanged: it
is drawn for the **selected primary bay** only, so a fitted cannon leads and an empty bay or the
mining beam does not.

1. With a friend in your world, select them with **F**. The white lead circle appears **ahead of the
   hull** along its direction of travel — the faster the friend flies across your view, the further
   ahead it sits. It follows them as they turn and holds when they fly straight at you.
2. Fire at the pip with the trigger held and watch hits land on a crossing friend (cannons only —
   the trigger, not the launcher).
3. **Guns:** a hostile still leads exactly as before. A rock, a crate at rest, a station or a rift
   door gets **no** pip (nothing to lead — the pip would sit on the marker already there).
4. Select the **mining beam** bay (keys 1–5): the pip disappears, as it always has — a beam is
   hitscan. Select the cannon bay again: it comes back.
5. Guest's side: if you are the visitor, lock the host's hull with **F** and check the pip leads it
   the same way.

**If something is wrong:** say which target kind got no pip (or a pip in the wrong place), whether
you were host or guest, and which primary bay was selected.

---

## What to report

- Which of the two sections, the **number** of the step that misbehaved, and what you saw instead.
- Whether the **Connection details** card read `2026-11-25i` on **both** machines (a stale bundle on
  one side makes the whole test lie).
- One oddity is expected and harmless: while the mouse pushes into a full-screen chart or the hold,
  the ship is deliberately not steering — that is what those surfaces are for.
