import { describe, it, expect } from 'vitest';
import { healthPickupAmount, scaledHealthDropChance, getXpStep } from '../constants';

describe('healthPickupAmount()', () => {
  it('returns 2 for early waves (1-7)', () => {
    expect(healthPickupAmount(1)).toBe(2);
    expect(healthPickupAmount(4)).toBe(2);
    expect(healthPickupAmount(7)).toBe(2);
  });

  it('returns 3 for mid waves (8-14)', () => {
    expect(healthPickupAmount(8)).toBe(3);
    expect(healthPickupAmount(10)).toBe(3);
    expect(healthPickupAmount(14)).toBe(3);
  });

  it('returns 4 for late waves (15+)', () => {
    expect(healthPickupAmount(15)).toBe(4);
    expect(healthPickupAmount(20)).toBe(4);
  });
});

describe('scaledHealthDropChance()', () => {
  it('returns base 0.18 for waves 1-10', () => {
    expect(scaledHealthDropChance(1)).toBe(0.18);
    expect(scaledHealthDropChance(5)).toBe(0.18);
    expect(scaledHealthDropChance(10)).toBe(0.18);
  });

  it('scales up by 0.01 per wave after 10', () => {
    expect(scaledHealthDropChance(11)).toBeCloseTo(0.19);
    expect(scaledHealthDropChance(15)).toBeCloseTo(0.23);
    expect(scaledHealthDropChance(20)).toBeCloseTo(0.28);
  });
});

describe('getXpStep()', () => {
  it('returns 22 for levels 1-5', () => {
    expect(getXpStep(1)).toBe(22);
    expect(getXpStep(3)).toBe(22);
    expect(getXpStep(5)).toBe(22);
  });

  it('returns 28 for levels 6-10', () => {
    expect(getXpStep(6)).toBe(28);
    expect(getXpStep(8)).toBe(28);
    expect(getXpStep(10)).toBe(28);
  });

  it('returns 38 for levels 11-15', () => {
    expect(getXpStep(11)).toBe(38);
    expect(getXpStep(15)).toBe(38);
  });

  it('returns 50 for levels 16+', () => {
    expect(getXpStep(16)).toBe(50);
    expect(getXpStep(100)).toBe(50);
  });
});
