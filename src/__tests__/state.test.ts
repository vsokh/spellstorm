import { describe, it, expect } from 'vitest';
import { dist, lerp, clamp, wrapAngle, toWorld, shake, spawnParticles, spawnText } from '../state';
import { createTestState } from './helpers';

describe('dist()', () => {
  it('returns 0 for same point', () => {
    expect(dist(0, 0, 0, 0)).toBe(0);
  });

  it('calculates horizontal distance', () => {
    expect(dist(0, 0, 3, 0)).toBe(3);
  });

  it('calculates vertical distance', () => {
    expect(dist(0, 0, 0, 4)).toBe(4);
  });

  it('calculates 3-4-5 triangle', () => {
    expect(dist(0, 0, 3, 4)).toBe(5);
  });

  it('handles negative coordinates', () => {
    expect(dist(-3, -4, 0, 0)).toBe(5);
  });
});

describe('lerp()', () => {
  it('returns a when t=0', () => {
    expect(lerp(10, 20, 0)).toBe(10);
  });

  it('returns b when t=1', () => {
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('returns midpoint when t=0.5', () => {
    expect(lerp(10, 20, 0.5)).toBe(15);
  });

  it('extrapolates beyond 0-1 range', () => {
    expect(lerp(0, 10, 2)).toBe(20);
  });
});

describe('clamp()', () => {
  it('returns value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to min', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to max', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('works when value equals min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('works when value equals max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe('wrapAngle()', () => {
  it('returns 0 for 0', () => {
    expect(wrapAngle(0)).toBe(0);
  });

  it('wraps angle > PI to negative', () => {
    const result = wrapAngle(Math.PI + 0.5);
    expect(result).toBeCloseTo(-Math.PI + 0.5);
  });

  it('wraps angle < -PI to positive', () => {
    const result = wrapAngle(-Math.PI - 0.5);
    expect(result).toBeCloseTo(Math.PI - 0.5);
  });

  it('leaves angle within range unchanged', () => {
    expect(wrapAngle(1)).toBe(1);
    expect(wrapAngle(-1)).toBe(-1);
  });

  it('wraps large positive angles', () => {
    const result = wrapAngle(Math.PI * 5);
    expect(result).toBeCloseTo(Math.PI);
  });
});

describe('toWorld()', () => {
  it('converts screen coords to world coords with zero camera offset', () => {
    const state = createTestState();
    state.camX = 0;
    state.camY = 0;
    expect(toWorld(state, 100, 200)).toEqual({ x: 100, y: 200 });
  });

  it('subtracts camera offset', () => {
    const state = createTestState();
    state.camX = 50;
    state.camY = 30;
    expect(toWorld(state, 100, 200)).toEqual({ x: 50, y: 170 });
  });

  it('handles negative camera offset', () => {
    const state = createTestState();
    state.camX = -50;
    state.camY = -30;
    expect(toWorld(state, 100, 200)).toEqual({ x: 150, y: 230 });
  });
});

describe('shake()', () => {
  it('sets shakeIntensity to the given value', () => {
    const state = createTestState();
    shake(state, 5);
    expect(state.shakeIntensity).toBe(5);
  });

  it('takes the max of current and new intensity', () => {
    const state = createTestState();
    shake(state, 10);
    shake(state, 5);
    expect(state.shakeIntensity).toBe(10);
  });

  it('replaces lower intensity', () => {
    const state = createTestState();
    shake(state, 3);
    shake(state, 8);
    expect(state.shakeIntensity).toBe(8);
  });
});

describe('spawnParticles()', () => {
  it('adds particles to state', () => {
    const state = createTestState();
    spawnParticles(state, 100, 200, '#ff0000', 5);
    expect(state.particles).toHaveLength(5);
  });

  it('sets correct position for all particles', () => {
    const state = createTestState();
    spawnParticles(state, 100, 200, '#ff0000', 3);
    for (const p of state.particles) {
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
      expect(p.color).toBe('#ff0000');
    }
  });

  it('creates particles with life = 1', () => {
    const state = createTestState();
    spawnParticles(state, 0, 0, '#fff', 2);
    for (const p of state.particles) {
      expect(p.life).toBe(1);
    }
  });

  it('spawns zero particles when n=0', () => {
    const state = createTestState();
    spawnParticles(state, 0, 0, '#fff', 0);
    expect(state.particles).toHaveLength(0);
  });
});

describe('spawnText()', () => {
  it('adds floating text to state', () => {
    const state = createTestState();
    spawnText(state, 100, 200, 'hello', '#fff');
    expect(state.texts).toHaveLength(1);
    expect(state.texts.get(0)).toEqual({
      x: 100,
      y: 200,
      text: 'hello',
      color: '#fff',
      life: 1.5,
      vy: -35,
    });
  });

  it('accumulates multiple texts', () => {
    const state = createTestState();
    spawnText(state, 0, 0, 'a', '#fff');
    spawnText(state, 0, 0, 'b', '#fff');
    expect(state.texts).toHaveLength(2);
  });
});
