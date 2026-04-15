import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audio before importing combat
vi.mock('../audio', () => ({ sfx: vi.fn() }));

// Mock dungeon to avoid heavy dependencies
vi.mock('../systems/dungeon', () => ({ createFriendlyEnemy: vi.fn() }));

import { damageEnemy, damagePlayer } from '../systems/combat';
import { createTestState, createTestPlayer, createTestEnemy } from './helpers';
import type { GameState } from '../state';
import type { Player, Enemy } from '../types';

let state: GameState;

beforeEach(() => {
  state = createTestState();
  vi.restoreAllMocks();
});

// ═══════════════════════════════════
//       damageEnemy
// ═══════════════════════════════════

describe('damageEnemy()', () => {
  describe('base damage', () => {
    it('reduces enemy HP by raw damage', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 10, maxHp: 10 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      expect(e.hp).toBe(7);
    });

    it('sets iframes on the enemy after hit', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 10, maxHp: 10 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(e.iframes).toBe(0.1);
    });

    it('sets hit flash animation', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 10, maxHp: 10 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(e._hitFlash).toBe(0.12);
    });
  });

  describe('iframes blocking', () => {
    it('does no damage when enemy has iframes', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 10, maxHp: 10, iframes: 0.5 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 5, 0);

      expect(e.hp).toBe(10);
    });
  });

  describe('death timer blocking', () => {
    it('does no damage when enemy is in death animation', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 3, maxHp: 10, _deathTimer: 0.2 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 5, 0);

      expect(e.hp).toBe(3);
    });
  });

  describe('berserker fury', () => {
    it('increases damage by 50% when fury is active', () => {
      const p = createTestPlayer(0, 'berserker');
      p._furyActive = true;
      state.players = [p];
      // Place enemy far from player to avoid proximity bonus
      const e = createTestEnemy({ hp: 20, maxHp: 20, x: 900, y: 100 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 4, 0);

      // 4 * 1.5 = 6
      expect(e.hp).toBe(14);
    });

    it('heals player via fury lifesteal when fury is active', () => {
      const p = createTestPlayer(0, 'berserker');
      p._furyActive = true;
      p.hp = 5;
      p.maxHp = 14;
      state.players = [p];
      const e = createTestEnemy({ hp: 100, maxHp: 100 });
      state.enemies.clear(); state.enemies.push(e);

      // Deal 20 raw damage → fury 1.5x → 30 dmg → 5% lifesteal → floor(1.5) = 1 heal
      damageEnemy(state, e, 20, 0);

      expect(p.hp).toBe(6); // 5 + 1 healed
    });
  });

  describe('blood rage', () => {
    it('multiplies damage by rage damage multiplier', () => {
      const p = createTestPlayer(0, 'berserker');
      p._rageDmgMul = 2;
      state.players = [p];
      // Place enemy far from player to avoid proximity bonus
      const e = createTestEnemy({ hp: 20, maxHp: 20, x: 900, y: 100 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      // 3 * 2 = 6, ceil(6) = 6
      expect(e.hp).toBe(14);
    });
  });

  describe('shop temp damage bonus', () => {
    it('adds shopTempDmg to raw damage', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      state.shopTempDmg = 2;
      const e = createTestEnemy({ hp: 10, maxHp: 10 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      // (3 + 2) = 5 damage
      expect(e.hp).toBe(5);
    });
  });

  describe('ultimate charge', () => {
    it('gains +3 ult charge per hit (with rate 1)', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.ultCharge = 0;
      p.ultChargeRate = 1;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.ultCharge).toBe(3);
    });

    it('caps ult charge at 100 normally', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.ultCharge = 98;
      p.ultChargeRate = 1;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.ultCharge).toBe(100);
      expect(p.ultReady).toBe(true);
    });

    it('caps ult charge at 200 with ultOverflow', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.ultCharge = 198;
      p.ultChargeRate = 1;
      p.ultOverflow = true;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.ultCharge).toBe(200);
      expect(p.ultReady).toBe(true);
    });

    it('scales charge gain with ultChargeRate', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.ultCharge = 0;
      p.ultChargeRate = 2;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.ultCharge).toBe(6);
    });
  });

  describe('stormcaller passive (every 4th hit stuns)', () => {
    it('stuns enemy on every 4th hit', () => {
      const p = createTestPlayer(0, 'stormcaller');
      p.hitCounter = 3; // next hit is 4th
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.hitCounter).toBe(4);
      expect(e.stunTimer).toBeGreaterThan(0);
    });

    it('does not stun on non-4th hit', () => {
      const p = createTestPlayer(0, 'stormcaller');
      p.hitCounter = 1;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.hitCounter).toBe(2);
      expect(e.stunTimer).toBe(0);
    });
  });

  describe('cryomancer passive (+1 dmg if slowed)', () => {
    it('deals +1 extra damage when enemy is slowed', () => {
      const p = createTestPlayer(0, 'cryomancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20, slowTimer: 1 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      // 3 base damage + 1 frostbite = -4 total
      expect(e.hp).toBe(16);
    });

    it('does not deal extra damage if enemy is not slowed', () => {
      const p = createTestPlayer(0, 'cryomancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20, slowTimer: 0 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      expect(e.hp).toBe(17);
    });
  });

  describe('enemy death', () => {
    it('starts death animation when hp drops to 0', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 3, maxHp: 5 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 3, 0);

      expect(e._deathTimer).toBe(0.4);
    });

    it('increments totalKills on enemy death', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 1, maxHp: 5 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(state.totalKills).toBe(1);
    });

    it('increments player killCount on enemy death', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 1, maxHp: 5 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.killCount).toBe(1);
    });

    it('spawns pickups on enemy death', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 1, maxHp: 5 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      // Should spawn XP and potentially gold/health pickups
      expect(state.pickups.length).toBeGreaterThan(0);
    });
  });

  describe('mana on hit', () => {
    it('restores mana on hit', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.mana = 50;
      p.manaOnHit = 3;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(p.mana).toBe(53);
    });
  });

  describe('life steal', () => {
    it('heals player based on damage dealt', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 5;
      p.maxHp = 10;
      p.lifeSteal = 0.5;
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 4, 0);

      // floor(4 * 0.5) = 2 heal
      expect(p.hp).toBe(7);
    });
  });

  describe('particles and effects', () => {
    it('spawns particles on hit', () => {
      const p = createTestPlayer(0, 'pyromancer');
      state.players = [p];
      const e = createTestEnemy({ hp: 20, maxHp: 20 });
      state.enemies.clear(); state.enemies.push(e);

      damageEnemy(state, e, 1, 0);

      expect(state.particles.length).toBeGreaterThan(0);
    });
  });
});

// ═══════════════════════════════════
//       damagePlayer
// ═══════════════════════════════════

describe('damagePlayer()', () => {
  // Stub document methods that damagePlayer may call on death
  const origDocument = globalThis.document;

  beforeEach(() => {
    // Minimal document stub for death handling
    (globalThis as any).document = {
      exitPointerLock: vi.fn(),
      pointerLockElement: null,
      getElementById: vi.fn(() => null),
      body: { classList: { remove: vi.fn(), add: vi.fn() } },
    };
  });

  // Restore after tests
  afterAll(() => {
    (globalThis as any).document = origDocument;
  });

  describe('base damage', () => {
    it('reduces player HP by damage minus armor', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.armor = 0;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 3);

      expect(p.hp).toBe(5);
    });

    it('sets iframes after taking damage', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 1);

      expect(p.iframes).toBe(0.4);
    });
  });

  describe('iframes blocking', () => {
    it('blocks damage when player has iframes', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0.5;
      state.players = [p];

      damagePlayer(state, p, 5);

      expect(p.hp).toBe(8);
    });
  });

  describe('armor reduction', () => {
    it('reduces damage by armor (minimum 1)', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.armor = 2;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 3);

      // max(1, 3 - 2) = 1
      expect(p.hp).toBe(7);
    });

    it('always deals at least 1 damage even with high armor', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.armor = 100;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 1);

      expect(p.hp).toBe(7);
    });
  });

  describe('dodge chance', () => {
    it('dodges damage when random rolls under dodge chance', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.dodgeChance = 1.0; // 100% dodge
      p.iframes = 0;
      state.players = [p];

      vi.spyOn(Math, 'random').mockReturnValue(0.5);

      damagePlayer(state, p, 5);

      expect(p.hp).toBe(8); // no damage taken
    });

    it('takes damage when random rolls above dodge chance', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.dodgeChance = 0.1;
      p.iframes = 0;
      state.players = [p];

      vi.spyOn(Math, 'random').mockReturnValue(0.9);

      damagePlayer(state, p, 2);

      expect(p.hp).toBe(6);
    });
  });

  describe('knight bulwark passive', () => {
    it('reduces damage by 25% for knight', () => {
      const p = createTestPlayer(0, 'knight');
      p.hp = 8;
      p.armor = 0;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 4);

      // ceil(4 * 0.75) = 3, max(1, 3 - 0) = 3
      expect(p.hp).toBe(5);
    });
  });

  describe('ward stone shield', () => {
    it('blocks hit entirely when shop shield hits remain', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0;
      state.players = [p];
      state.shopShieldHits = 2;

      damagePlayer(state, p, 5);

      expect(p.hp).toBe(8);
      expect(state.shopShieldHits).toBe(1);
    });
  });

  describe('death handling', () => {
    it('sets alive = false when hp drops to 0', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 2;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 5);

      expect(p.alive).toBe(false);
    });

    it('triggers second wind instead of dying if available', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 2;
      p.iframes = 0;
      p.secondWind = 1;
      state.players = [p];

      damagePlayer(state, p, 5);

      expect(p.alive).toBe(true);
      expect(p.hp).toBe(Math.floor(p.maxHp / 2));
      expect(p.secondWind).toBe(0);
    });

    it('sets game over when all players die', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 1;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 5);

      expect(p.alive).toBe(false);
      expect(state.gamePhase).toBe('gameover');
    });
  });

  describe('blood rage doubles incoming damage', () => {
    it('doubles damage taken when player has rage', () => {
      const p = createTestPlayer(0, 'berserker');
      p.hp = 20;
      p.armor = 0;
      p.iframes = 0;
      p._rage = 1;
      state.players = [p];

      damagePlayer(state, p, 3);

      // ceil(3 * 2) = 6, max(1, 6 - 0) = 6
      expect(p.hp).toBe(14);
    });
  });

  describe('shake and particles on hit', () => {
    it('triggers screen shake on damage', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 1);

      expect(state.shakeIntensity).toBe(3);
    });

    it('spawns particles on damage', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 1);

      expect(state.particles.length).toBeGreaterThan(0);
    });

    it('spawns damage text on hit', () => {
      const p = createTestPlayer(0, 'pyromancer');
      p.hp = 8;
      p.iframes = 0;
      state.players = [p];

      damagePlayer(state, p, 2);

      const dmgText = state.texts.find(t => t.text === '-2');
      expect(dmgText).toBeDefined();
    });
  });
});

// Import afterAll for cleanup
import { afterAll } from 'vitest';
