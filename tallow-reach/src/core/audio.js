// Procedural audio. Everything is synthesised with the Web Audio API, so the
// game ships no sound files. Sounds are started by the sim through tone() and
// nz(); the engine and ambience are driven by updateAudio() once per frame.

import { random } from "../util/rng.js";

let ctx = null;
let master, noiseBuf, engineGain, engineFilter, engineOsc, engineOscGain;
let roarRaw, roarMid, roarCrackle, hum, humGain, droneGain, stationGain, ambGain;
let muted = false;
let mechT = 0;   // next time a docking clank may play
let alarmT = 0;  // next time the low-hull alarm may beep

export const isMuted = () => muted;

export function initAudio() {
  if (ctx) {
    ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    return; // no audio support: the game still runs silently
  }
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.5;
  master.connect(ctx.destination);

  // One second of white noise, reused by every noise source.
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = random() * 2 - 1;

  // Thruster hiss: looping noise through a low-pass filter.
  const hiss = ctx.createBufferSource();
  hiss.buffer = noiseBuf;
  hiss.loop = true;
  engineFilter = ctx.createBiquadFilter();
  engineFilter.type = "lowpass";
  engineFilter.frequency.value = 100;
  engineGain = ctx.createGain();
  engineGain.gain.value = 0;
  hiss.connect(engineFilter);
  engineFilter.connect(engineGain);
  engineGain.connect(master);
  hiss.start();

  // Engine growl: distorted sawtooth with a slow wobble on the filter gain.
  engineOsc = ctx.createOscillator();
  engineOsc.type = "sawtooth";
  engineOsc.frequency.value = 40;
  const shaper = ctx.createWaveShaper(), curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) curve[i] = Math.tanh((i / 128 - 1) * 5);
  shaper.curve = curve;
  const growlFilter = ctx.createBiquadFilter(),
    growlAmp = ctx.createGain(),
    wobble = ctx.createOscillator(),
    wobbleGain = ctx.createGain();
  growlFilter.type = "lowpass";
  growlFilter.frequency.value = 220;
  growlAmp.gain.value = 0.7;
  wobble.frequency.value = 17;
  wobbleGain.gain.value = 0.3;
  engineOscGain = ctx.createGain();
  engineOscGain.gain.value = 0;
  engineOsc.connect(shaper);
  shaper.connect(growlFilter);
  growlFilter.connect(growlAmp);
  growlAmp.connect(engineOscGain);
  wobble.connect(wobbleGain);
  wobbleGain.connect(growlAmp.gain);
  engineOsc.start();
  wobble.start();

  // Roar layers: three looping noise voices, each with its own filter.
  const crackleBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate),
    cd = crackleBuf.getChannelData(0);
  for (let i = 0; i < cd.length; i++) cd[i] = random() < 0.0012 ? random() * 2 - 1 : 0;
  const layer = (buf, type, freq, q) => {
    const src = ctx.createBufferSource(),
      filter = ctx.createBiquadFilter(),
      gain = ctx.createGain();
    src.buffer = buf;
    src.loop = true;
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(0, random());
    return { fl: filter, g: gain };
  };
  roarRaw = layer(noiseBuf, "lowpass", 100, 2.5);
  roarMid = layer(noiseBuf, "lowpass", 260, 0.7);
  roarCrackle = layer(crackleBuf, "lowpass", 600, 0.5);

  // Beam hum, pitched by how much ore is left in the rock.
  hum = ctx.createOscillator();
  hum.type = "triangle";
  humGain = ctx.createGain();
  humGain.gain.value = 0;
  hum.connect(humGain);
  humGain.connect(master);
  hum.start();

  // Low drone and the docked ambience (chord pad with a slow LFO).
  droneGain = ctx.createGain();
  droneGain.gain.value = 0.08;
  droneGain.connect(master);
  [55, 55.6, 82.4].forEach(f => {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    o.connect(droneGain);
    o.start();
  });

  stationGain = ctx.createGain();
  stationGain.gain.value = 0;
  [220, 329.6, 493.9, 659.3].forEach((f, i) => {
    const o = ctx.createOscillator(),
      g = ctx.createGain();
    o.frequency.value = f + i * 0.3;
    g.gain.value = 0.5 / (i + 1);
    o.connect(g);
    g.connect(stationGain);
    o.start();
  });
  const lfo = ctx.createOscillator(),
    lfoGain = ctx.createGain();
  lfo.frequency.value = 0.12;
  lfoGain.gain.value = 0.006;
  lfo.connect(lfoGain);
  lfoGain.connect(stationGain.gain);
  lfo.start();

  const amb = ctx.createBufferSource(),
    ambFilter = ctx.createBiquadFilter();
  amb.buffer = noiseBuf;
  amb.loop = true;
  ambFilter.type = "lowpass";
  ambFilter.frequency.value = 160;
  ambGain = ctx.createGain();
  ambGain.gain.value = 0;
  amb.connect(ambFilter);
  ambFilter.connect(ambGain);
  ambGain.connect(master);
  amb.start();
}

/** Toggle mute. Returns the new muted state. */
export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

export function setAudioSuspended(v) {
  if (!ctx) return;
  if (v) ctx.suspend();
  else ctx.resume();
}

/** Short pitch-swept blip. */
export function tone(f1, f2, dur, vol, type) {
  if (!ctx || muted) return;
  const t = ctx.currentTime,
    osc = ctx.createOscillator(),
    g = ctx.createGain();
  osc.type = type || "sine";
  osc.frequency.setValueAtTime(f1, t);
  osc.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur);
}

/** Filtered noise burst. */
export function nz(dur, freq, vol) {
  if (!ctx || muted) return;
  const t = ctx.currentTime,
    src = ctx.createBufferSource(),
    filter = ctx.createBiquadFilter(),
    g = ctx.createGain();
  src.buffer = noiseBuf;
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(freq, t);
  filter.frequency.exponentialRampToValueAtTime(60, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
  src.stop(t + dur);
}

function clank() {
  const r = random();
  if (r < 0.35) {
    nz(0.12, 600, 0.07);
    tone(150, 70, 0.22, 0.035);
  } else if (r < 0.6) {
    nz(0.9, 800, 0.03);
  } else if (r < 0.8) {
    tone(80, 120, 0.7, 0.025, "triangle");
  } else {
    for (let i = 0; i < 5; i++) setTimeout(() => tone(230, 160, 0.04, 0.018), i * 110);
  }
}

/** UI click feedback. `kind` is "go", "confirm", or anything else for a plain click. */
export function uiSound(kind) {
  if (kind === "go") {
    tone(200, 420, 0.25, 0.08, "triangle");
    nz(0.2, 1800, 0.12);
  } else if (kind === "confirm") {
    tone(660, 990, 0.08, 0.06, "triangle");
    setTimeout(() => tone(990, 1320, 0.1, 0.05, "triangle"), 70);
  } else {
    tone(900, 600, 0.045, 0.07);
    tone(450, 300, 0.05, 0.04);
  }
}

export function hoverSound() {
  tone(900, 900, 0.03, 0.015);
}

/**
 * Per-frame update for engine, beam and ambience. Call only while the game
 * is not paused.
 * @param {{time:number, docked:boolean, thr:number, boost:boolean,
 *          hullFrac:number, beamOn:boolean, mineFrac:number}} s
 */
export function updateAudio(s) {
  if (!ctx) return;
  if (s.docked && s.time > mechT) {
    mechT = s.time + 2.5 + random() * 3.5;
    clank();
  }
  const now = ctx.currentTime,
    flying = !s.docked,
    t = s.thr,
    b = s.boost ? 1 : 0,
    ramp = (param, value, tc) => param.setTargetAtTime(value, now, tc);

  ramp(engineGain.gain, flying ? 0.02 + t * 0.08 + (s.boost ? 0.06 : 0) : 0, 0.1);
  ramp(engineFilter.frequency, 70 + t * 180 + (s.boost ? 220 : 0), 0.1);

  ramp(roarRaw.g.gain, flying ? 0.2 + t * 0.55 + b * 0.25 : 0, 0.12);
  ramp(roarRaw.fl.frequency, 95 + t * 55 + b * 45, 0.12);
  ramp(roarMid.g.gain, flying ? 0.01 + t * 0.06 + b * 0.06 : 0, 0.1);
  ramp(roarMid.fl.frequency, 180 + t * 140 + b * 100, 0.1);
  ramp(roarCrackle.g.gain, flying ? 0.04 + t * 0.15 + b * 0.12 : 0, 0.1);

  ramp(humGain.gain, flying && s.beamOn ? 0.05 : 0, 0.08);
  ramp(hum.frequency, 60 + s.mineFrac * 60, 0.1);
  ramp(droneGain.gain, flying ? 0.05 : 0, 0.8);
  ramp(ambGain.gain, s.docked ? 0.05 * (0.55 + 0.45 * Math.sin(s.time * 0.3)) : 0, 1.5);

  if (flying && s.hullFrac < 0.3 && s.time > alarmT) {
    alarmT = s.time + 1.1;
    tone(520, 520, 0.18, 0.08, "square");
  }
}
