// Discard: a two-step popover shared by the station panel and the flight card.
//
// Right-click an inventory tile, choose Discard, and step one asks how many to
// throw away — the same number box the Sell popover uses, so the two destructive
// actions feel alike. Step two is the question: "Are you sure you want to
// discard 3 Ferrite?" Nothing leaves the hold until that is confirmed.
//
// The markup classes (`inv-sell-amount`, `inv-sell-error`, `inv-sell-actions`)
// are the sell box's, deliberately: one look for both popovers.

import { itemName } from "../data/items.js";

/** Step one: pick a count. Defaults to the whole stack. */
export function discardAskHtml(id, available, amount = available) {
  return (
    `<strong>Discard ${itemName(id)}</strong>` +
    `<label>Amount <span>(1–${available})</span><input class="inv-sell-amount" type="number" min="1" max="${available}" step="1" value="${amount}"></label>` +
    `<div class="inv-sell-error" aria-live="polite"></div>` +
    `<div class="inv-sell-actions"><button type="button" data-a="discardAsk">Discard</button><button type="button" data-a="discardCancel">Cancel</button></div>`
  );
}

/** The question the pilot must answer before anything is trashed. */
export const discardQuestion = (id, amount) => `Are you sure you want to discard ${amount} ${itemName(id)}?`;

/** Step two: the confirmation. */
export function discardConfirmHtml(id, amount) {
  return (
    `<strong>${discardQuestion(id, amount)}</strong>` +
    `<p class="inv-discard-warn">It cannot be recovered.</p>` +
    `<div class="inv-sell-actions"><button type="button" data-a="discardConfirm">Discard</button><button type="button" data-a="discardCancel">Cancel</button></div>`
  );
}

/**
 * Open the popover inside `host` (the docked panel or the flight card), placed by
 * `anchor` — `{ left, top, width }` in the host's scroll coordinates, as the
 * context menu already measures. `onDiscard(where, id, amount)` runs only after
 * both steps. Returns the popover element.
 */
export function openDiscardPopover({ host, anchor, where, id, count, onDiscard }) {
  if (!host || !(count > 0)) return null;
  host.querySelector(".inv-discard-popover")?.remove();

  const popover = document.createElement("div");
  popover.className = "inv-discard-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", `Discard ${itemName(id)}`);
  popover.dataset.where = where;
  popover.dataset.id = id;
  popover.dataset.available = String(count);
  popover.innerHTML = discardAskHtml(id, count, count);

  const scrollLeft = host.scrollLeft || 0, scrollTop = host.scrollTop || 0;
  const preferredLeft = anchor.left + (anchor.width || 0) + 8;
  const left = preferredLeft + 240 <= (host.clientWidth || 0) + scrollLeft
    ? preferredLeft
    : Math.max(scrollLeft, anchor.left - 240 - 8);
  const maxTop = Math.max(scrollTop, scrollTop + (host.clientHeight || 0) - 190);
  popover.style.left = `${left}px`;
  popover.style.top = `${Math.max(scrollTop, Math.min(anchor.top, maxTop))}px`;

  const input = popover.querySelector(".inv-sell-amount");
  if (input) {
    input.focus?.();
    input.select?.();
  }

  popover.addEventListener("click", event => {
    // Step one swaps this box's innerHTML for the question, which detaches the
    // button from the document before the event finishes bubbling. Stop it here:
    // the host's click handler would otherwise see a detached target, decide the
    // click landed outside the popover, and close the question that just opened.
    event.stopPropagation();
    const button = event.target.closest("button[data-a]");
    if (!button || button.disabled) return;
    const step = button.dataset.a;
    if (step === "discardAsk") {
      const available = Number(popover.dataset.available) || 0;
      const amount = Number(input?.value);
      if (!Number.isInteger(amount) || amount < 1 || amount > available) {
        const error = popover.querySelector(".inv-sell-error");
        if (error) error.textContent = `Enter a whole number from 1 to ${available}.`;
        input?.focus?.();
        return;
      }
      popover.dataset.amount = String(amount);
      popover.innerHTML = discardConfirmHtml(id, amount);
      const primary = popover.querySelector("[data-a='discardConfirm']");
      primary?.focus?.();
      return;
    }
    if (step === "discardConfirm") {
      const amount = Number(popover.dataset.amount) || 0;
      popover.remove();
      onDiscard?.(popover.dataset.where, popover.dataset.id, amount);
      return;
    }
    if (step === "discardCancel") popover.remove();
  });

  popover.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      popover.remove();
      return;
    }
    if (event.key === "Enter") {
      const primary = popover.querySelector("[data-a='discardAsk'], [data-a='discardConfirm']");
      if (primary) {
        event.preventDefault();
        primary.click?.();
      }
    }
  });

  host.append(popover);
  return popover;
}
