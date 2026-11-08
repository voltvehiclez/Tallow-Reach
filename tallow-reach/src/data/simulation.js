// Simulation timing. Keep the old per-frame cap on long stalls: a hidden tab or
// slow frame does not force the game to catch up minutes of missed time.
export const SIM_DT = 1 / 60;
export const MAX_FRAME_DT = 0.05;

/** How often the resume point is written while playing (seconds). The game also
 *  saves when the tab is hidden or closed, so this only bounds what a crash or a
 *  force-quit can lose. */
export const AUTOSAVE_SECONDS = 15;
