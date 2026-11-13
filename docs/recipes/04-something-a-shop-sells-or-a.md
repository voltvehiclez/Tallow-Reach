# Recipe 4: Something a shop sells, or a new trader

> One of the step-by-step recipes indexed in [HOW_TO_ADD.md](../HOW_TO_ADD.md). Read the checklist there first.
> Kind of work: data only.


Shops are data: `src/data/shops.js`. Nothing in the screen or the sim names a row, so a new
line is a new thing for sale. `npm test` (`tests/shops.test.mjs`) checks every row names a real
item and has a price.

**A row at Meridian** — add one line to `SHOPS.meridian.stock`:

```js
{
  id: "power_basic",         // must exist in data/items.js (a module: stats in data/modules.js)
  price: 1,                  // credits for one
  n: "Basic powerplant",     // the row's name on screen
  d: "Power. Standard reactor: 10 MJ/s for the whole ship.",   // the small print
},
```

- The order in the file is the order on screen, and every row appears exactly once. There is no
  second "already owned" list: a part the ship flies with is either on sale or not mentioned.
- `Takes N m³.` and `You own N.` are worked out for you from the catalogue.
- A module has to be fitted before it does anything, so buying one puts it in the station's
  inventory (the Inventory tab moves it to a ship, Outfitting fits it).
- Two shops can price the same part differently: the price is on the row, not the item.

**Make a row run out.** Add `max`, and the screen shows `N left`, greys out at zero, and buying
is refused:

```js
{ id: "core", price: 500, n: "Reactor core", d: "Salvage. Worth a fortune to the right buyer.", max: 3 },
```

How much is left is **session state** (`state.shops`), not saved, and starts again from `max`.
`setShopStock(shopId, itemId, n)` in `sim/economy.js` is the hook a restock timer, a restock
event or a random roll calls later. Restocking itself is deliberately not built yet.

**Hide the "You own N" count** on a part every hull is delivered with: add `own: false`
(the count would include the stock fit of hulls the player has not bought).

**A second trader or station.** Add an entry to `SHOPS` with its own `n`, `d` and `stock`, then
point the counter at it. Today `OUTPOST_SHOP` in `data/shops.js` names Meridian's shop for the
whole outpost, because there is one station; since step 10 a station feature names
its shop and `ui/screens.js` passes that id to `shopList()`. `shopList(id)` and
`buyItem(id, itemId)` already take a shop id, so a trader needs data only.

**What a purchase does** — `buyItem(shopId, itemId, qty = 1)` in `sim/economy.js`: it checks the
shop, the row, the credits, what is left and the station's room, then takes the money and stores
the items through `sim/inventory.js` (one place writes stocks). A module with `ammo` in
`data/modules.js` (the missile pod, `ammo: 8`) tops the ship's rack up to that many, never down.
