// Simulation timing. Keep the old per-frame cap on long stalls: a hidden tab or
// slow frame does not force the game to catch up minutes of missed time.
export const SIM_DT = 1 / 60;
export const MAX_FRAME_DT = 0.05;
