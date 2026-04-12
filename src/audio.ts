import { SfxName } from './types';

// ═══════════════════════════════════
//          SOUND SYSTEM
// ═══════════════════════════════════

let audioCtx: AudioContext | null = null;

export function initAudio(): void {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
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
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 0.5);
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
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
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.5);
    }
    const s = ctx.createBufferSource();
    s.buffer = buf;
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

export function sfx(type: SfxName): void {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  const g = audioCtx.createGain();
  g.connect(audioCtx.destination);
  const factory = SFX_PRESETS[type];
  if (factory) {
    factory(audioCtx, t, g);
  }
}
