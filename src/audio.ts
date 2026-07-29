import { SfxName } from './types';

// ═══════════════════════════════════
//          SOUND SYSTEM
// ═══════════════════════════════════

let audioCtx: AudioContext | null = null;

export function initAudio(): void {
  if (!audioCtx) {
    try {
      audioCtx = new AudioContext();
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    } catch (_) {
      // AudioContext blocked (e.g. iframe restrictions) — game runs without sound
    }
  }
}

// ── Shared noise buffers ──
// Generating noise per playback allocated a fresh AudioBuffer (~76KB for
// Boom) and ran one Math.pow per sample (19k for Boom) on the main thread —
// a measurable hitch on every explosion. AudioBuffers are reusable across
// BufferSources, so render each noise shape once and share it.
let boomNoise: AudioBuffer | null = null;
let zapNoise: AudioBuffer | null = null;

function getBoomNoise(ctx: AudioContext): AudioBuffer {
  if (!boomNoise) {
    boomNoise = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = boomNoise.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
    }
  }
  return boomNoise;
}

function getZapNoise(ctx: AudioContext): AudioBuffer {
  if (!zapNoise) {
    zapNoise = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = zapNoise.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.5);
    }
  }
  return zapNoise;
}

/** Sound preset factory map: each key returns a function that builds an audio graph */
type SfxFactory = (ctx: AudioContext, t: number, gain: GainNode) => void;

const SFX_PRESETS: Record<SfxName, SfxFactory> = {
  [SfxName.Fire]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, t);
    o.frequency.exponentialRampToValueAtTime(150, t + 0.12);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.08, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.12);
  },

  [SfxName.Ice]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1200, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.08);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.06, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.08);
  },

  [SfxName.Zap]: (ctx, t, g) => {
    const s = ctx.createBufferSource();
    s.buffer = getZapNoise(ctx);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.1, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    s.connect(n);
    n.connect(g);
    s.start(t);
  },

  [SfxName.Arcane]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(800, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.06);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.06, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.1);
  },

  [SfxName.Hit]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.07, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.08);
  },

  [SfxName.Boom]: (ctx, t, g) => {
    const s = ctx.createBufferSource();
    s.buffer = getBoomNoise(ctx);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.15, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    s.connect(f);
    f.connect(n);
    n.connect(g);
    s.start(t);
  },

  [SfxName.Kill]: (ctx, t, g) => {
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const tt = t + i * 0.06;
      o.frequency.setValueAtTime(400 + i * 200, tt);
      const n = ctx.createGain();
      n.gain.setValueAtTime(0.04, tt);
      n.gain.exponentialRampToValueAtTime(0.001, tt + 0.08);
      o.connect(n);
      n.connect(g);
      o.start(tt);
      o.stop(tt + 0.08);
    }
  },

  [SfxName.Blink]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(400, t);
    o.frequency.exponentialRampToValueAtTime(1600, t + 0.15);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.07, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.18);
  },

  [SfxName.Door]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(300, t);
    o.frequency.setValueAtTime(500, t + 0.15);
    o.frequency.setValueAtTime(700, t + 0.3);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.06, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.4);
  },

  [SfxName.Pickup]: (ctx, t, g) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.setValueAtTime(900, t + 0.1);
    const n = ctx.createGain();
    n.gain.setValueAtTime(0.06, t);
    n.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    o.connect(n);
    n.connect(g);
    o.start(t);
    o.stop(t + 0.15);
  },
};

// Retrigger cap per sound type: an AoE kill of 8 enemies used to build 8
// simultaneous audio graphs in one frame — louder, clippier, and 8x the node
// churn. One trigger per ~45ms per type is inaudibly different.
const lastPlayed: Partial<Record<SfxName, number>> = {};
const MIN_RETRIGGER_MS = 45;

export function sfx(type: SfxName): void {
  if (!audioCtx) return;
  const now = performance.now();
  if (now - (lastPlayed[type] || 0) < MIN_RETRIGGER_MS) return;
  lastPlayed[type] = now;
  const t = audioCtx.currentTime;
  const g = audioCtx.createGain();
  g.connect(audioCtx.destination);
  const factory = SFX_PRESETS[type];
  if (factory) {
    factory(audioCtx, t, g);
  }
}
