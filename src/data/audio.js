// Scheduled mechanical latch impacts, hydraulic vent and low release thump.
export const UNDOCK_SOUND = [
  { delay: 0, duration: 0.12, noise: 1600, gain: 0.13 },
  { delay: 0, duration: 0.16, frequency: 105, gain: 0.09, type: 'triangle' },
  { delay: 0.16, duration: 0.1, noise: 2400, gain: 0.1 },
  { delay: 0.26, duration: 0.48, noise: 850, gain: 0.07 },
  { delay: 0.64, duration: 0.18, noise: 420, gain: 0.12 },
  { delay: 0.64, duration: 0.24, frequency: 65, gain: 0.11, type: 'sine' },
];
