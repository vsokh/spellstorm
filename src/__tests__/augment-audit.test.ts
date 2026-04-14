import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audio and network before any other imports
vi.mock('../audio', () => ({ sfx: vi.fn() }));
vi.mock('../network', () => ({ sendMessage: vi.fn() }));

import { UPGRADE_POOL, flatScaling } from '../constants';
import { createTestPlayer } from './helpers';
import type { Player } from '../types';

// ═══════════════════════════════════════════════════════════════
//  AUGMENT AUDIT TEST
//  Verifies every upgrade in UPGRADE_POOL has a working apply()
// ═══════════════════════════════════════════════════════════════

/** Helper: pick the correct class for a given augment, defaulting to pyromancer */
function classForAugment(idx: number): string {
  const aug = UPGRADE_POOL[idx];
  return aug.forClass || 'pyromancer';
}

/** Helper: create a fresh player for the given augment index */
function freshPlayer(idx: number): Player {
  return createTestPlayer(0, classForAugment(idx));
}

/** Helper: snapshot numeric spell properties before apply */
function snapshotSpells(p: Player) {
  return p.cls.spells.map(s => ({
    dmg: s.dmg,
    cd: s.cd,
    mana: s.mana,
    speed: s.speed,
    radius: s.radius,
    explode: s.explode,
    range: s.range,
    slow: s.slow,
    duration: s.duration,
    homing: s.homing,
    burn: s.burn,
    aoeR: s.aoeR,
    angle: s.angle,
    count: s.count,
    heal: s.heal,
    pierce: s.pierce,
  }));
}

// ═══════════════════════════════════════════════════
//  Section 1: Test every augment's apply() function
// ═══════════════════════════════════════════════════

describe('Augment apply() audit — all augments', () => {
  it(`sanity: UPGRADE_POOL has the expected augment count`, () => {
    // 65 generic + 42 class-specific + 10 evolution + 5 cursed = 122
    expect(UPGRADE_POOL.length).toBe(122);
  });

  // ── DAMAGE (idx 0-5) ──

  describe('[0] Spell Power', () => {
    it('adds +1 damage to all spells', () => {
      const p = freshPlayer(0);
      const before = snapshotSpells(p);
      UPGRADE_POOL[0].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].dmg).toBeGreaterThan(before[i].dmg);
      }
    });
  });

  describe('[1] Primary Boost', () => {
    it('adds +2 damage to primary spell', () => {
      const p = freshPlayer(1);
      const before = p.cls.spells[0].dmg;
      UPGRADE_POOL[1].apply(p, 1);
      expect(p.cls.spells[0].dmg).toBe(before + flatScaling(2, 1));
    });
  });

  describe('[2] Ultimate Power', () => {
    it('adds +3 damage to ultimate spell if it has dmg', () => {
      // Use pyromancer whose Q (spell[2]) has dmg: 4
      const p = createTestPlayer(0, 'pyromancer');
      const before = p.cls.spells[2].dmg;
      UPGRADE_POOL[2].apply(p, 1);
      if (before > 0) {
        expect(p.cls.spells[2].dmg).toBe(before + 3);
      }
    });
  });

  describe('[3] Glass Cannon', () => {
    it('adds +3 dmg to all spells and reduces maxHp by 2', () => {
      const p = freshPlayer(3);
      const beforeHp = p.maxHp;
      const beforeDmg = p.cls.spells.map(s => s.dmg);
      UPGRADE_POOL[3].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].dmg).toBe(beforeDmg[i] + 3);
      }
      expect(p.maxHp).toBe(Math.max(1, beforeHp - 2));
    });
  });

  describe('[4] Critical Strike', () => {
    it('sets critChance > 0', () => {
      const p = freshPlayer(4);
      expect(p.critChance).toBe(0);
      UPGRADE_POOL[4].apply(p, 1);
      expect(p.critChance).toBeGreaterThan(0);
    });
  });

  describe('[5] Overkill', () => {
    it('sets overkill to true', () => {
      const p = freshPlayer(5);
      UPGRADE_POOL[5].apply(p, 1);
      expect(p.overkill).toBe(true);
    });
  });

  // ── PROJECTILE MODIFIERS (idx 6-13) ──

  describe('[6] Piercing', () => {
    it('increases pierce count', () => {
      const p = freshPlayer(6);
      const before = p.pierce;
      UPGRADE_POOL[6].apply(p, 1);
      expect(p.pierce).toBeGreaterThan(before);
    });
  });

  describe('[7] Split Shot', () => {
    it('adds +2 splitShot', () => {
      const p = freshPlayer(7);
      UPGRADE_POOL[7].apply(p, 1);
      expect(p.splitShot).toBe(2);
    });
  });

  describe('[8] Ricochet', () => {
    it('adds +1 ricochet', () => {
      const p = freshPlayer(8);
      UPGRADE_POOL[8].apply(p, 1);
      expect(p.ricochet).toBe(1);
    });
  });

  describe('[9] Velocity', () => {
    it('increases spell speeds by 40%', () => {
      const p = freshPlayer(9);
      const before = snapshotSpells(p);
      UPGRADE_POOL[9].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (before[i].speed > 0) {
          expect(p.cls.spells[i].speed).toBeCloseTo(before[i].speed * 1.4, 1);
        }
      }
    });
  });

  describe('[10] Chain Hit', () => {
    it('increases chainHit count', () => {
      const p = freshPlayer(10);
      const before = p.chainHit;
      UPGRADE_POOL[10].apply(p, 1);
      expect(p.chainHit).toBeGreaterThan(before);
    });
  });

  describe('[11] Homing Bolts', () => {
    it('adds homing to primary spell', () => {
      const p = freshPlayer(11);
      const before = p.cls.spells[0].homing;
      UPGRADE_POOL[11].apply(p, 1);
      expect(p.cls.spells[0].homing).toBe(before + 1.5);
    });
  });

  describe('[12] Big Spells', () => {
    it('increases spell radii by 30%', () => {
      const p = freshPlayer(12);
      const before = snapshotSpells(p);
      UPGRADE_POOL[12].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (before[i].radius > 0) {
          expect(p.cls.spells[i].radius).toBeCloseTo(before[i].radius * 1.3, 1);
        }
      }
    });
  });

  describe('[13] Blast Radius', () => {
    it('increases explosion size by 50%', () => {
      const p = freshPlayer(13);
      const before = snapshotSpells(p);
      UPGRADE_POOL[13].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (before[i].explode > 0) {
          expect(p.cls.spells[i].explode).toBeCloseTo(before[i].explode * 1.5, 1);
        }
      }
    });
  });

  // ── FIRE RATE / COOLDOWN (idx 14-17) ──

  describe('[14] Swift Cast', () => {
    it('reduces all cooldowns by 20%', () => {
      const p = freshPlayer(14);
      const before = snapshotSpells(p);
      UPGRADE_POOL[14].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].cd).toBeCloseTo(before[i].cd * 0.8, 5);
      }
    });
  });

  describe('[15] Rapid Fire', () => {
    it('reduces primary cooldown by 40%', () => {
      const p = freshPlayer(15);
      const before = p.cls.spells[0].cd;
      UPGRADE_POOL[15].apply(p, 1);
      expect(p.cls.spells[0].cd).toBeCloseTo(before * 0.6, 5);
    });
  });

  describe('[16] Double Tap', () => {
    it('sets doubleTap to 1', () => {
      const p = freshPlayer(16);
      UPGRADE_POOL[16].apply(p, 1);
      expect(p.doubleTap).toBe(1);
    });
  });

  describe('[17] Trigger Happy', () => {
    it('sets killResetCD to true', () => {
      const p = freshPlayer(17);
      UPGRADE_POOL[17].apply(p, 1);
      expect(p.killResetCD).toBe(true);
    });
  });

  // ── MANA (idx 18-22) ──

  describe('[18] Efficiency', () => {
    it('reduces mana costs by 25%', () => {
      const p = freshPlayer(18);
      const before = snapshotSpells(p);
      UPGRADE_POOL[18].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].mana).toBeCloseTo(before[i].mana * 0.75, 5);
      }
    });
  });

  describe('[19] Mana Flow', () => {
    it('increases mana regen by 50%', () => {
      const p = freshPlayer(19);
      const before = p.manaRegen;
      UPGRADE_POOL[19].apply(p, 1);
      expect(p.manaRegen).toBeCloseTo(before * 1.5, 5);
    });
  });

  describe('[20] Max Mana +30', () => {
    it('increases maxMana and mana by 30', () => {
      const p = freshPlayer(20);
      const beforeMax = p.maxMana;
      const beforeCur = p.mana;
      UPGRADE_POOL[20].apply(p, 1);
      expect(p.maxMana).toBe(beforeMax + 30);
      expect(p.mana).toBe(beforeCur + 30);
    });
  });

  describe('[21] Mana on Kill', () => {
    it('sets manaOnKill to 8', () => {
      const p = freshPlayer(21);
      UPGRADE_POOL[21].apply(p, 1);
      expect(p.manaOnKill).toBe(8);
    });
  });

  describe('[22] Spell Thief', () => {
    it('sets manaOnHit to 2', () => {
      const p = freshPlayer(22);
      UPGRADE_POOL[22].apply(p, 1);
      expect(p.manaOnHit).toBe(2);
    });
  });

  // ── SURVIVABILITY (idx 23-29) ──

  describe('[23] Vitality', () => {
    it('increases maxHp by 2 and heals to full', () => {
      const p = freshPlayer(23);
      const before = p.maxHp;
      p.hp = 1; // damage the player
      UPGRADE_POOL[23].apply(p, 1);
      expect(p.maxHp).toBe(before + flatScaling(2, 1));
      expect(p.hp).toBe(p.maxHp);
    });
  });

  describe('[24] Armor', () => {
    it('increases armor by 1', () => {
      const p = freshPlayer(24);
      const before = p.armor;
      UPGRADE_POOL[24].apply(p, 1);
      expect(p.armor).toBe(before + flatScaling(1, 1));
    });
  });

  describe('[25] Vampirism', () => {
    it('sets vampirism to 1 and vampKillReq to 4', () => {
      const p = freshPlayer(25);
      UPGRADE_POOL[25].apply(p, 1);
      expect(p.vampirism).toBe(1);
      expect(p.vampKillReq).toBe(4);
    });
  });

  describe('[26] Life Steal', () => {
    it('sets lifeSteal > 0', () => {
      const p = freshPlayer(26);
      UPGRADE_POOL[26].apply(p, 1);
      expect(p.lifeSteal).toBeGreaterThan(0);
    });
  });

  describe('[27] Second Wind', () => {
    it('sets secondWind to 1', () => {
      const p = freshPlayer(27);
      UPGRADE_POOL[27].apply(p, 1);
      expect(p.secondWind).toBe(1);
    });
  });

  describe('[28] Thorns', () => {
    it('sets thorns to 1', () => {
      const p = freshPlayer(28);
      UPGRADE_POOL[28].apply(p, 1);
      expect(p.thorns).toBe(1);
    });
  });

  describe('[29] Dodge', () => {
    it('sets dodgeChance > 0', () => {
      const p = freshPlayer(29);
      UPGRADE_POOL[29].apply(p, 1);
      expect(p.dodgeChance).toBeGreaterThan(0);
    });
  });

  // ── MOBILITY (idx 30-32) ──

  describe('[30] Quick Step', () => {
    it('increases moveSpeed by 25%', () => {
      const p = freshPlayer(30);
      const before = p.moveSpeed;
      UPGRADE_POOL[30].apply(p, 1);
      expect(p.moveSpeed).toBeCloseTo(before * 1.25, 1);
    });
  });

  describe('[31] Dash', () => {
    it('sets hasDash to true', () => {
      const p = freshPlayer(31);
      UPGRADE_POOL[31].apply(p, 1);
      expect(p.hasDash).toBe(true);
      expect(p.dashCd).toBe(0);
    });
  });

  describe('[32] Momentum', () => {
    it('sets momentum to true', () => {
      const p = freshPlayer(32);
      UPGRADE_POOL[32].apply(p, 1);
      expect(p.momentum).toBe(true);
    });
  });

  // ── AREA / ZONE (idx 33-35) ──

  describe('[33] Lingering', () => {
    it('increases spell durations by 50%', () => {
      const p = freshPlayer(33);
      const before = snapshotSpells(p);
      UPGRADE_POOL[33].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (before[i].duration > 0) {
          expect(p.cls.spells[i].duration).toBeCloseTo(before[i].duration * 1.5, 5);
        }
      }
    });
  });

  describe('[34] Deep Freeze', () => {
    it('doubles slow effects', () => {
      const p = freshPlayer(34);
      const before = snapshotSpells(p);
      UPGRADE_POOL[34].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (before[i].slow > 0) {
          expect(p.cls.spells[i].slow).toBeCloseTo(before[i].slow * 2, 5);
        }
      }
    });
  });

  describe('[35] Aftershock', () => {
    it('sets aftershock to true', () => {
      const p = freshPlayer(35);
      UPGRADE_POOL[35].apply(p, 1);
      expect(p.aftershock).toBe(true);
    });
  });

  // ── SECONDARY (RMB) UPGRADES (idx 36-41) ──

  describe('[36] Secondary Mastery', () => {
    it('reduces RMB cooldown by 40%', () => {
      const p = freshPlayer(36);
      const before = p.cls.spells[1]?.cd;
      UPGRADE_POOL[36].apply(p, 1);
      if (before !== undefined) {
        expect(p.cls.spells[1].cd).toBeCloseTo(before * 0.6, 5);
      }
    });
  });

  describe('[37] Double Secondary', () => {
    it('sets doubleSecondary to 1', () => {
      const p = freshPlayer(37);
      UPGRADE_POOL[37].apply(p, 1);
      expect(p.doubleSecondary).toBe(1);
    });
  });

  describe('[38] Secondary Power', () => {
    it('adds +3 damage to RMB spell', () => {
      const p = freshPlayer(38);
      const before = p.cls.spells[1]?.dmg ?? 0;
      UPGRADE_POOL[38].apply(p, 1);
      expect(p.cls.spells[1].dmg).toBe(before + 3);
    });
  });

  describe('[39] Free Cast', () => {
    it('sets RMB mana to 0 and adds 2s cooldown', () => {
      const p = freshPlayer(39);
      const beforeCd = p.cls.spells[1]?.cd;
      UPGRADE_POOL[39].apply(p, 1);
      expect(p.cls.spells[1].mana).toBe(0);
      if (beforeCd !== undefined) {
        expect(p.cls.spells[1].cd).toBeCloseTo(beforeCd + 2, 5);
      }
    });
  });

  describe('[40] Combo', () => {
    it('sets comboBonus to true', () => {
      const p = freshPlayer(40);
      UPGRADE_POOL[40].apply(p, 1);
      expect(p.comboBonus).toBe(true);
    });
  });

  describe('[41] Area Secondary', () => {
    it('increases RMB range/radius by 50%', () => {
      const p = freshPlayer(41);
      const before = snapshotSpells(p);
      UPGRADE_POOL[41].apply(p, 1);
      const s = p.cls.spells[1];
      if (s) {
        if (before[1].range > 0) expect(s.range).toBeCloseTo(before[1].range * 1.5, 1);
        if (before[1].radius > 0) expect(s.radius).toBeCloseTo(before[1].radius * 1.5, 1);
      }
    });
  });

  // ── ULTIMATE (R) UPGRADES (idx 42-46) ──

  describe('[42] Quick Charge', () => {
    it('sets ultChargeRate to 1.5', () => {
      const p = freshPlayer(42);
      UPGRADE_POOL[42].apply(p, 1);
      expect(p.ultChargeRate).toBeCloseTo(1.5, 5);
    });
  });

  describe('[43] Ult Mastery', () => {
    it('doubles ultPower', () => {
      const p = freshPlayer(43);
      UPGRADE_POOL[43].apply(p, 1);
      expect(p.ultPower).toBe(2);
    });
  });

  describe('[44] Overflow', () => {
    it('sets ultOverflow to true', () => {
      const p = freshPlayer(44);
      UPGRADE_POOL[44].apply(p, 1);
      expect(p.ultOverflow).toBe(true);
    });
  });

  describe('[45] Ult Echo', () => {
    it('sets ultEcho to 5', () => {
      const p = freshPlayer(45);
      UPGRADE_POOL[45].apply(p, 1);
      expect(p.ultEcho).toBe(5);
    });
  });

  describe('[46] Ult Regen', () => {
    it('sets ultHeal to true', () => {
      const p = freshPlayer(46);
      UPGRADE_POOL[46].apply(p, 1);
      expect(p.ultHeal).toBe(true);
    });
  });

  // ── CROSS-SPELL SYNERGIES (idx 47-51) ──

  describe('[47] Spell Weaving', () => {
    it('sets spellWeaving to true', () => {
      const p = freshPlayer(47);
      UPGRADE_POOL[47].apply(p, 1);
      expect(p.spellWeaving).toBe(true);
    });
  });

  describe('[48] Cooldown Cascade', () => {
    it('sets cdCascade to true', () => {
      const p = freshPlayer(48);
      UPGRADE_POOL[48].apply(p, 1);
      expect(p.cdCascade).toBe(true);
    });
  });

  describe('[49] Full Rotation', () => {
    it('sets fullRotation to true', () => {
      const p = freshPlayer(49);
      UPGRADE_POOL[49].apply(p, 1);
      expect(p.fullRotation).toBe(true);
    });
  });

  describe('[50] Q Mastery', () => {
    it('reduces Q cooldown by 35% and adds +2 damage', () => {
      const p = freshPlayer(50);
      const before = snapshotSpells(p);
      UPGRADE_POOL[50].apply(p, 1);
      if (p.cls.spells[2]) {
        expect(p.cls.spells[2].cd).toBeCloseTo(before[2].cd * 0.65, 5);
        expect(p.cls.spells[2].dmg).toBe(before[2].dmg + 2);
      }
    });
  });

  describe('[51] Skill Reset', () => {
    it('sets ultResetCDs to true', () => {
      const p = freshPlayer(51);
      UPGRADE_POOL[51].apply(p, 1);
      expect(p.ultResetCDs).toBe(true);
    });
  });

  // ── WILD / FUN (idx 52-56) ──

  describe('[52] Chaos Bolts', () => {
    it('sets chaosDmg to true', () => {
      const p = freshPlayer(52);
      UPGRADE_POOL[52].apply(p, 1);
      expect(p.chaosDmg).toBe(true);
    });
  });

  describe('[53] Magnet', () => {
    it('increases magnetRange by 60', () => {
      const p = freshPlayer(53);
      const before = p.magnetRange;
      UPGRADE_POOL[53].apply(p, 1);
      expect(p.magnetRange).toBe(before + 60);
    });
  });

  describe('[54] Gold Rush', () => {
    it('doubles goldMul', () => {
      const p = freshPlayer(54);
      UPGRADE_POOL[54].apply(p, 1);
      expect(p.goldMul).toBe(2);
    });
  });

  describe('[55] XP Boost', () => {
    it('sets xpBoost > 0', () => {
      const p = freshPlayer(55);
      UPGRADE_POOL[55].apply(p, 1);
      expect(p.xpBoost).toBeGreaterThan(0);
    });
  });

  describe('[56] Friendly Fire', () => {
    it('adds +2 dmg to all spells and sets selfDmg', () => {
      const p = freshPlayer(56);
      const beforeDmg = p.cls.spells.map(s => s.dmg);
      UPGRADE_POOL[56].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].dmg).toBe(beforeDmg[i] + 2);
      }
      expect(p.selfDmg).toBe(true);
    });
  });

  // ── QUALITATIVE / BEHAVIOR-CHANGING (idx 57-64) ──

  describe('[57] Boomerang', () => {
    it('sets boomerang to true', () => {
      const p = freshPlayer(57);
      UPGRADE_POOL[57].apply(p, 1);
      expect(p.boomerang).toBe(true);
    });
  });

  describe('[58] Volatile', () => {
    it('sets volatile to true', () => {
      const p = freshPlayer(58);
      UPGRADE_POOL[58].apply(p, 1);
      expect(p.volatile).toBe(true);
    });
  });

  describe('[59] Fork', () => {
    it('sets forkOnKill to true', () => {
      const p = freshPlayer(59);
      UPGRADE_POOL[59].apply(p, 1);
      expect(p.forkOnKill).toBe(true);
    });
  });

  describe('[60] Gravity Pull', () => {
    it('sets gravityWell to true', () => {
      const p = freshPlayer(60);
      UPGRADE_POOL[60].apply(p, 1);
      expect(p.gravityWell).toBe(true);
    });
  });

  describe('[61] Spectral', () => {
    it('sets spectral to true', () => {
      const p = freshPlayer(61);
      UPGRADE_POOL[61].apply(p, 1);
      expect(p.spectral).toBe(true);
    });
  });

  describe('[62] Frozen Touch', () => {
    it('sets frozenTouch to true', () => {
      const p = freshPlayer(62);
      UPGRADE_POOL[62].apply(p, 1);
      expect(p.frozenTouch).toBe(true);
    });
  });

  describe('[63] Seeker Mines', () => {
    it('sets seekerMines to true', () => {
      const p = freshPlayer(63);
      UPGRADE_POOL[63].apply(p, 1);
      expect(p.seekerMines).toBe(true);
    });
  });

  describe('[64] Barrage Mode', () => {
    it('sets burstFire and adjusts primary dmg/cd', () => {
      const p = freshPlayer(64);
      const beforeDmg = p.cls.spells[0].dmg;
      const beforeCd = p.cls.spells[0].cd;
      UPGRADE_POOL[64].apply(p, 1);
      expect(p.burstFire).toBe(true);
      expect(p.cls.spells[0].dmg).toBe(Math.max(1, Math.ceil(beforeDmg * 0.4)));
      expect(p.cls.spells[0].cd).toBeCloseTo(beforeCd * 1.5, 5);
    });
  });

  // ══════════════════════════════════════
  //     CLASS-SPECIFIC UPGRADES
  // ══════════════════════════════════════

  // ── Pyromancer (idx 65-67) ──

  describe('[65] Wildfire (pyromancer)', () => {
    it('sets burnSpread to true', () => {
      const p = createTestPlayer(0, 'pyromancer');
      UPGRADE_POOL[65].apply(p, 1);
      expect(p.burnSpread).toBe(true);
    });
  });

  describe('[66] Magma Armor (pyromancer)', () => {
    it('sets magmaArmor to true', () => {
      const p = createTestPlayer(0, 'pyromancer');
      UPGRADE_POOL[66].apply(p, 1);
      expect(p.magmaArmor).toBe(true);
    });
  });

  describe('[67] Pyroclasm (pyromancer)', () => {
    it('doubles explode radius and sets fireZoneOnExplode', () => {
      const p = createTestPlayer(0, 'pyromancer');
      const beforeExplode = p.cls.spells[0].explode;
      UPGRADE_POOL[67].apply(p, 1);
      if (beforeExplode > 0) {
        expect(p.cls.spells[0].explode).toBe(beforeExplode * 2);
      }
      expect(p.fireZoneOnExplode).toBe(true);
    });
  });

  // ── Cryomancer (idx 68-70) ──

  describe('[68] Shatter (cryomancer)', () => {
    it('sets shatter to true', () => {
      const p = createTestPlayer(0, 'cryomancer');
      UPGRADE_POOL[68].apply(p, 1);
      expect(p.shatter).toBe(true);
    });
  });

  describe('[69] Permafrost (cryomancer)', () => {
    it('sets permafrost to true', () => {
      const p = createTestPlayer(0, 'cryomancer');
      UPGRADE_POOL[69].apply(p, 1);
      expect(p.permafrost).toBe(true);
    });
  });

  describe('[70] Ice Armor (cryomancer)', () => {
    it('adds +3 armor and sets iceArmor', () => {
      const p = createTestPlayer(0, 'cryomancer');
      const beforeArmor = p.armor;
      UPGRADE_POOL[70].apply(p, 1);
      expect(p.armor).toBe(beforeArmor + 3);
      expect(p.iceArmor).toBe(true);
    });
  });

  // ── Stormcaller (idx 71-73) ──

  describe('[71] Chain Lightning (stormcaller)', () => {
    it('increases chainLightning count', () => {
      const p = createTestPlayer(0, 'stormcaller');
      const before = p.chainLightning;
      UPGRADE_POOL[71].apply(p, 1);
      expect(p.chainLightning).toBeGreaterThan(before);
    });
  });

  describe('[72] Overcharge (stormcaller)', () => {
    it('sets overcharge to true', () => {
      const p = createTestPlayer(0, 'stormcaller');
      UPGRADE_POOL[72].apply(p, 1);
      expect(p.overcharge).toBe(true);
    });
  });

  describe('[73] Storm Shield (stormcaller)', () => {
    it('sets stormShield to true', () => {
      const p = createTestPlayer(0, 'stormcaller');
      UPGRADE_POOL[73].apply(p, 1);
      expect(p.stormShield).toBe(true);
    });
  });

  // ── Arcanist (idx 74-76) ──

  describe('[74] Arcane Amplifier (arcanist)', () => {
    it('triples homing and increases primary speed', () => {
      const p = createTestPlayer(0, 'arcanist');
      const beforeHoming = p.cls.spells[0].homing;
      const beforeSpeed = p.cls.spells[0].speed;
      UPGRADE_POOL[74].apply(p, 1);
      expect(p.cls.spells[0].homing).toBe(beforeHoming * 3);
      if (beforeSpeed > 0) {
        expect(p.cls.spells[0].speed).toBeCloseTo(beforeSpeed * 1.5, 1);
      }
    });
  });

  describe('[75] Phase Shift (arcanist)', () => {
    it('sets blinkExplode to true', () => {
      const p = createTestPlayer(0, 'arcanist');
      UPGRADE_POOL[75].apply(p, 1);
      expect(p.blinkExplode).toBe(true);
    });
  });

  describe('[76] Spell Mirror (arcanist)', () => {
    it('sets spellMirror > 0', () => {
      const p = createTestPlayer(0, 'arcanist');
      UPGRADE_POOL[76].apply(p, 1);
      expect(p.spellMirror).toBeGreaterThan(0);
    });
  });

  // ── Necromancer (idx 77-79) ──

  describe('[77] Raise Dead (necromancer)', () => {
    it('sets raiseDead > 0', () => {
      const p = createTestPlayer(0, 'necromancer');
      UPGRADE_POOL[77].apply(p, 1);
      expect(p.raiseDead).toBeGreaterThan(0);
    });
  });

  describe('[78] Death Mark (necromancer)', () => {
    it('sets deathMark to true', () => {
      const p = createTestPlayer(0, 'necromancer');
      UPGRADE_POOL[78].apply(p, 1);
      expect(p.deathMark).toBe(true);
    });
  });

  describe('[79] Soul Well (necromancer)', () => {
    it('sets soulWell to true', () => {
      const p = createTestPlayer(0, 'necromancer');
      UPGRADE_POOL[79].apply(p, 1);
      expect(p.soulWell).toBe(true);
    });
  });

  // ── Chronomancer (idx 80-82) ──

  describe('[80] Time Loop (chronomancer)', () => {
    it('sets timeLoop to 1', () => {
      const p = createTestPlayer(0, 'chronomancer');
      UPGRADE_POOL[80].apply(p, 1);
      expect(p.timeLoop).toBe(1);
    });
  });

  describe('[81] Haste Zone (chronomancer)', () => {
    it('sets hasteZone to true', () => {
      const p = createTestPlayer(0, 'chronomancer');
      UPGRADE_POOL[81].apply(p, 1);
      expect(p.hasteZone).toBe(true);
    });
  });

  describe('[82] Temporal Echo (chronomancer)', () => {
    it('sets temporalEcho to true', () => {
      const p = createTestPlayer(0, 'chronomancer');
      UPGRADE_POOL[82].apply(p, 1);
      expect(p.temporalEcho).toBe(true);
    });
  });

  // ── Knight (idx 83-85) ──

  describe('[83] Shield Mastery (knight)', () => {
    it('sets shieldBounce to 3', () => {
      const p = createTestPlayer(0, 'knight');
      UPGRADE_POOL[83].apply(p, 1);
      expect(p.shieldBounce).toBe(3);
    });
  });

  describe('[84] Fortify (knight)', () => {
    it('adds +5 HP, +2 armor, reduces move speed', () => {
      const p = createTestPlayer(0, 'knight');
      const beforeHp = p.maxHp;
      const beforeArmor = p.armor;
      const beforeSpeed = p.moveSpeed;
      UPGRADE_POOL[84].apply(p, 1);
      expect(p.maxHp).toBe(beforeHp + 5);
      expect(p.armor).toBe(beforeArmor + 2);
      expect(p.moveSpeed).toBeCloseTo(beforeSpeed * 0.85, 1);
    });
  });

  describe('[85] Taunt Aura (knight)', () => {
    it('sets tauntAura to true', () => {
      const p = createTestPlayer(0, 'knight');
      UPGRADE_POOL[85].apply(p, 1);
      expect(p.tauntAura).toBe(true);
    });
  });

  // ── Berserker (idx 86-88) ──

  describe('[86] Bloodlust (berserker)', () => {
    it('sets bloodlust to true', () => {
      const p = createTestPlayer(0, 'berserker');
      UPGRADE_POOL[86].apply(p, 1);
      expect(p.bloodlust).toBe(true);
    });
  });

  describe('[87] Undying Rage (berserker)', () => {
    it('sets undyingRage to 1', () => {
      const p = createTestPlayer(0, 'berserker');
      UPGRADE_POOL[87].apply(p, 1);
      expect(p.undyingRage).toBe(1);
    });
  });

  describe('[88] Cleave (berserker)', () => {
    it('sets primary angle to full circle and +2 dmg', () => {
      const p = createTestPlayer(0, 'berserker');
      const beforeDmg = p.cls.spells[0].dmg;
      UPGRADE_POOL[88].apply(p, 1);
      expect(p.cls.spells[0].angle).toBeCloseTo(Math.PI * 2, 3);
      expect(p.cls.spells[0].dmg).toBe(beforeDmg + 2);
    });
  });

  // ── Paladin (idx 89-91) ──

  describe('[89] Blessed Weapons (paladin)', () => {
    it('adds +2 damage to all spells', () => {
      const p = createTestPlayer(0, 'paladin');
      const beforeDmg = p.cls.spells.map(s => s.dmg);
      UPGRADE_POOL[89].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].dmg).toBe(beforeDmg[i] + 2);
      }
    });
  });

  describe('[90] Divine Shield (paladin)', () => {
    it('sets Holy Shield duration to 5 and reflectShield', () => {
      const p = createTestPlayer(0, 'paladin');
      UPGRADE_POOL[90].apply(p, 1);
      if (p.cls.spells[1]) {
        expect(p.cls.spells[1].duration).toBe(5);
      }
      expect(p.reflectShield).toBe(true);
    });
  });

  describe('[91] Resurrection (paladin)', () => {
    it('sets resurrection to true', () => {
      const p = createTestPlayer(0, 'paladin');
      UPGRADE_POOL[91].apply(p, 1);
      expect(p.resurrection).toBe(true);
    });
  });

  // ── Ranger (idx 92-94) ──

  describe('[92] Multishot (ranger)', () => {
    it('adds +1 splitShot', () => {
      const p = createTestPlayer(0, 'ranger');
      UPGRADE_POOL[92].apply(p, 1);
      expect(p.splitShot).toBe(1);
    });
  });

  describe('[93] Poison Arrows (ranger)', () => {
    it('sets primary burn to 2', () => {
      const p = createTestPlayer(0, 'ranger');
      UPGRADE_POOL[93].apply(p, 1);
      expect(p.cls.spells[0].burn).toBe(2);
    });
  });

  describe('[94] Trap Master (ranger)', () => {
    it('doubles trap damage and sets count to 5', () => {
      const p = createTestPlayer(0, 'ranger');
      const beforeDmg = p.cls.spells[2]?.dmg ?? 0;
      UPGRADE_POOL[94].apply(p, 1);
      if (p.cls.spells[2]) {
        expect(p.cls.spells[2].dmg).toBe(beforeDmg * 2);
        expect(p.cls.spells[2].count).toBe(5);
      }
    });
  });

  // ── Druid (idx 95-97) ──

  describe('[95] Pack Leader (druid)', () => {
    it('sets packLeader to true', () => {
      const p = createTestPlayer(0, 'druid');
      UPGRADE_POOL[95].apply(p, 1);
      expect(p.packLeader).toBe(true);
    });
  });

  describe('[96] Overgrowth (druid)', () => {
    it('doubles Entangle radius and sets overgrowthHeal', () => {
      const p = createTestPlayer(0, 'druid');
      const beforeRadius = p.cls.spells[1]?.radius ?? 0;
      UPGRADE_POOL[96].apply(p, 1);
      if (p.cls.spells[1]) {
        expect(p.cls.spells[1].radius).toBe(beforeRadius * 2);
      }
      expect(p.overgrowthHeal).toBe(true);
    });
  });

  describe('[97] Bark Skin (druid)', () => {
    it('adds +3 armor and sets barkSkinRegen', () => {
      const p = createTestPlayer(0, 'druid');
      const beforeArmor = p.armor;
      UPGRADE_POOL[97].apply(p, 1);
      expect(p.armor).toBe(beforeArmor + 3);
      expect(p.barkSkinRegen).toBe(true);
    });
  });

  // ── Warlock (idx 98-100) ──

  describe('[98] Soul Siphon (warlock)', () => {
    it('sets soulSiphon to true', () => {
      const p = createTestPlayer(0, 'warlock');
      UPGRADE_POOL[98].apply(p, 1);
      expect(p.soulSiphon).toBe(true);
    });
  });

  describe('[99] Demonic Pact (warlock)', () => {
    it('sets demonicPact to true', () => {
      const p = createTestPlayer(0, 'warlock');
      UPGRADE_POOL[99].apply(p, 1);
      expect(p.demonicPact).toBe(true);
    });
  });

  describe('[100] Hex (warlock)', () => {
    it('sets hexChain to 3', () => {
      const p = createTestPlayer(0, 'warlock');
      UPGRADE_POOL[100].apply(p, 1);
      expect(p.hexChain).toBe(3);
    });
  });

  // ── Monk (idx 101-103) ──

  describe('[101] Way of the Fist (monk)', () => {
    it('adds +2 splitShot', () => {
      const p = createTestPlayer(0, 'monk');
      UPGRADE_POOL[101].apply(p, 1);
      expect(p.splitShot).toBe(2);
    });
  });

  describe('[102] Iron Skin (monk)', () => {
    it('increases dodgeChance and adds +1 armor', () => {
      const p = createTestPlayer(0, 'monk');
      const beforeDodge = p.dodgeChance;
      const beforeArmor = p.armor;
      UPGRADE_POOL[102].apply(p, 1);
      expect(p.dodgeChance).toBeGreaterThan(beforeDodge);
      expect(p.armor).toBe(beforeArmor + 1);
    });
  });

  describe('[103] Zen Master (monk)', () => {
    it('triples Meditation heal and sets zenMana', () => {
      const p = createTestPlayer(0, 'monk');
      const beforeHeal = p.cls.spells[2]?.heal ?? 0;
      UPGRADE_POOL[103].apply(p, 1);
      if (p.cls.spells[2]) {
        expect(p.cls.spells[2].heal).toBe((beforeHeal || 1) * 3);
      }
      expect(p.zenMana).toBe(true);
    });
  });

  // ── Engineer (idx 104-106) ──

  describe('[104] Turret Army (engineer)', () => {
    it('sets turretArmy and turret duration to 25', () => {
      const p = createTestPlayer(0, 'engineer');
      UPGRADE_POOL[104].apply(p, 1);
      expect(p.turretArmy).toBe(true);
      if (p.cls.spells[1]) {
        expect(p.cls.spells[1].duration).toBe(25);
      }
    });
  });

  describe('[105] Laser Turret (engineer)', () => {
    it('sets laserTurret to true', () => {
      const p = createTestPlayer(0, 'engineer');
      UPGRADE_POOL[105].apply(p, 1);
      expect(p.laserTurret).toBe(true);
    });
  });

  describe('[106] Self-Destruct (engineer)', () => {
    it('sets turretExplode to true', () => {
      const p = createTestPlayer(0, 'engineer');
      UPGRADE_POOL[106].apply(p, 1);
      expect(p.turretExplode).toBe(true);
    });
  });

  // ══════════════════════════════════════
  //     EVOLUTION UPGRADES (idx 107-116)
  // ══════════════════════════════════════

  describe('[107] Spell Mastery (evo of Spell Power)', () => {
    it('caps damage and reduces cooldowns', () => {
      const p = freshPlayer(107);
      // Simulate parent maxed
      p.takenUpgrades.set(0, 5);
      const beforeCd = p.cls.spells.map(s => s.cd);
      UPGRADE_POOL[107].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].cd).toBeCloseTo(beforeCd[i] * 0.7, 5);
      }
    });
  });

  describe('[108] Primary Overload (evo of Primary Boost)', () => {
    it('caps primary bonus and adds explosion', () => {
      const p = freshPlayer(108);
      p.takenUpgrades.set(1, 4);
      UPGRADE_POOL[108].apply(p, 1);
      expect(p.cls.spells[0].explode).toBeGreaterThan(0);
    });
  });

  describe('[109] Lethal Precision (evo of Critical Strike)', () => {
    it('adds +25% crit and sets critMul to 2.5', () => {
      const p = freshPlayer(109);
      p.takenUpgrades.set(4, 3);
      const beforeCrit = p.critChance;
      UPGRADE_POOL[109].apply(p, 1);
      expect(p.critChance).toBe(beforeCrit + 0.25);
      expect(p.critMul).toBe(2.5);
    });
  });

  describe('[110] Void Lance (evo of Piercing)', () => {
    it('adds massive pierce and +3 primary dmg', () => {
      const p = freshPlayer(110);
      p.takenUpgrades.set(6, 4);
      const beforeDmg = p.cls.spells[0].dmg;
      UPGRADE_POOL[110].apply(p, 1);
      expect(p.pierce).toBeGreaterThanOrEqual(99);
      expect(p.cls.spells[0].dmg).toBe(beforeDmg + 3);
    });
  });

  describe('[111] Chain Annihilation (evo of Chain Hit)', () => {
    it('adds +3 chain jumps and sets chainFullDmg', () => {
      const p = freshPlayer(111);
      p.takenUpgrades.set(10, 3);
      const beforeChain = p.chainHit;
      UPGRADE_POOL[111].apply(p, 1);
      expect(p.chainHit).toBe(beforeChain + 3);
      expect(p.chainFullDmg).toBe(true);
    });
  });

  describe('[112] Regeneration (evo of Vitality)', () => {
    it('adds +5 maxHp, heals, and sets hpRegen', () => {
      const p = freshPlayer(112);
      p.takenUpgrades.set(23, 5);
      const beforeHp = p.maxHp;
      UPGRADE_POOL[112].apply(p, 1);
      expect(p.maxHp).toBe(beforeHp + 5);
      expect(p.hp).toBe(p.maxHp);
      expect(p.hpRegen).toBeGreaterThan(0);
    });
  });

  describe('[113] Fortress (evo of Armor)', () => {
    it('adds +3 armor and +3 thorns', () => {
      const p = freshPlayer(113);
      p.takenUpgrades.set(24, 4);
      const beforeArmor = p.armor;
      const beforeThorns = p.thorns;
      UPGRADE_POOL[113].apply(p, 1);
      expect(p.armor).toBe(beforeArmor + 3);
      expect(p.thorns).toBe(beforeThorns + 3);
    });
  });

  describe('[114] Shadow Step (evo of Dodge)', () => {
    it('adds +30% dodge and +25% move speed', () => {
      const p = freshPlayer(114);
      p.takenUpgrades.set(29, 3);
      const beforeDodge = p.dodgeChance;
      const beforeSpeed = p.moveSpeed;
      UPGRADE_POOL[114].apply(p, 1);
      expect(p.dodgeChance).toBe(beforeDodge + 0.30);
      expect(p.moveSpeed).toBeCloseTo(beforeSpeed * 1.25, 1);
    });
  });

  describe('[115] Storm Lord (evo of Chain Lightning, stormcaller)', () => {
    it('adds +5 chainLightning and +2 primary dmg', () => {
      const p = createTestPlayer(0, 'stormcaller');
      p.takenUpgrades.set(71, 3);
      const beforeChain = p.chainLightning;
      const beforeDmg = p.cls.spells[0].dmg;
      UPGRADE_POOL[115].apply(p, 1);
      expect(p.chainLightning).toBe(beforeChain + 5);
      expect(p.cls.spells[0].dmg).toBe(beforeDmg + 2);
    });
  });

  describe('[116] Lich King (evo of Raise Dead, necromancer)', () => {
    it('adds +50% raiseDead chance', () => {
      const p = createTestPlayer(0, 'necromancer');
      p.takenUpgrades.set(77, 3);
      const beforeRaise = p.raiseDead;
      UPGRADE_POOL[116].apply(p, 1);
      expect(p.raiseDead).toBe(beforeRaise + 0.50);
    });
  });

  // ══════════════════════════════════════
  //     CURSED UPGRADES (idx 117-121)
  // ══════════════════════════════════════

  describe('[117] Reckless Haste (cursed)', () => {
    it('reduces CDs by 40% AND increases damageTakenMul by 50%', () => {
      const p = freshPlayer(117);
      const beforeCd = p.cls.spells.map(s => s.cd);
      const beforeMul = p.damageTakenMul;
      UPGRADE_POOL[117].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].cd).toBeCloseTo(beforeCd[i] * 0.6, 5);
      }
      expect(p.damageTakenMul).toBeCloseTo(beforeMul * 1.5, 5);
    });
  });

  describe('[118] Blood Pact (cursed)', () => {
    it('adds lifeSteal AND reduces maxHp by 3', () => {
      const p = freshPlayer(118);
      const beforeHp = p.maxHp;
      UPGRADE_POOL[118].apply(p, 1);
      expect(p.lifeSteal).toBeGreaterThan(0);
      expect(p.maxHp).toBe(Math.max(1, beforeHp - 3));
    });
  });

  describe('[119] Unstable Power (cursed)', () => {
    it('adds +8 primary dmg AND sets selfDmgChance', () => {
      const p = freshPlayer(119);
      const beforeDmg = p.cls.spells[0].dmg;
      UPGRADE_POOL[119].apply(p, 1);
      expect(p.cls.spells[0].dmg).toBe(beforeDmg + 8);
      expect(p.selfDmgChance).toBe(0.05);
    });
  });

  describe('[120] Berserker Pact (cursed)', () => {
    it('adds critChance AND reduces armor by 2', () => {
      const p = freshPlayer(120);
      const beforeArmor = p.armor;
      UPGRADE_POOL[120].apply(p, 1);
      expect(p.critChance).toBeGreaterThan(0);
      expect(p.armor).toBe(beforeArmor - 2);
    });
  });

  describe('[121] Soul Bargain (cursed)', () => {
    it('adds mana regen + reduces costs AND reduces maxHp by 4', () => {
      const p = freshPlayer(121);
      const beforeRegen = p.manaRegen;
      const beforeMana = p.cls.spells.map(s => s.mana);
      const beforeHp = p.maxHp;
      UPGRADE_POOL[121].apply(p, 1);
      expect(p.manaRegen).toBeCloseTo(beforeRegen * 1.6, 5);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].mana).toBeCloseTo(beforeMana[i] * 0.5, 5);
      }
      expect(p.maxHp).toBe(Math.max(1, beforeHp - 4));
    });
  });

  // ── Catch-all: every augment apply() does not throw ──

  it('every augment apply() completes without throwing', () => {
    for (let i = 0; i < UPGRADE_POOL.length; i++) {
      const aug = UPGRADE_POOL[i];
      const cls = aug.forClass || 'pyromancer';
      const p = createTestPlayer(0, cls);
      // For evolutions, set up parent prerequisite
      if (aug.isEvolution && aug.evolvesFrom !== undefined) {
        const parent = UPGRADE_POOL[aug.evolvesFrom];
        p.takenUpgrades.set(aug.evolvesFrom, parent.maxStacks || 1);
      }
      expect(() => aug.apply(p, 1)).not.toThrow();
    }
  });
});

// ═══════════════════════════════════════════════════════
//  Section 2: Stackable augments with diminishing returns
// ═══════════════════════════════════════════════════════

describe('Stackable augments — diminishing returns', () => {
  // Augments that use flatScaling:
  // 0: Spell Power (base 1, max 5)
  // 1: Primary Boost (base 2, max 4)
  // 6: Piercing (base 1, max 4)
  // 10: Chain Hit (base 1, max 3)
  // 23: Vitality (base 2, max 5)
  // 24: Armor (base 1, max 4)
  // 71: Chain Lightning (base 2, max 3)

  // Augments that use hyperStack:
  // 4: Critical Strike (base 0.15, max 3)
  // 29: Dodge (base 0.15, max 3)
  // 77: Raise Dead (base 0.25, max 3)

  const flatStackables = [
    { idx: 0, name: 'Spell Power', max: 5, prop: 'spellDmg' as const },
    { idx: 1, name: 'Primary Boost', max: 4, prop: 'primaryDmg' as const },
    { idx: 6, name: 'Piercing', max: 4, prop: 'pierce' as const },
    { idx: 10, name: 'Chain Hit', max: 3, prop: 'chainHit' as const },
    { idx: 23, name: 'Vitality', max: 5, prop: 'maxHp' as const },
    { idx: 24, name: 'Armor', max: 4, prop: 'armor' as const },
    { idx: 71, name: 'Chain Lightning', max: 3, prop: 'chainLightning' as const },
  ];

  for (const { idx, name, max, prop } of flatStackables) {
    describe(`[${idx}] ${name} (flatScaling, max ${max})`, () => {
      it('each stack adds value, with diminishing returns at stack 4+', () => {
        const increments: number[] = [];

        for (let stack = 1; stack <= max; stack++) {
          const cls = UPGRADE_POOL[idx].forClass || 'pyromancer';
          const p = createTestPlayer(0, cls);
          const pPrev = createTestPlayer(0, cls);

          // Apply up to 'stack'
          for (let s = 1; s <= stack; s++) {
            UPGRADE_POOL[idx].apply(p, s);
          }
          // Apply up to 'stack - 1'
          for (let s = 1; s < stack; s++) {
            UPGRADE_POOL[idx].apply(pPrev, s);
          }

          let value: number;
          let prevValue: number;
          if (prop === 'spellDmg') {
            value = p.cls.spells[0].dmg;
            prevValue = pPrev.cls.spells[0].dmg;
          } else if (prop === 'primaryDmg') {
            value = p.cls.spells[0].dmg;
            prevValue = pPrev.cls.spells[0].dmg;
          } else {
            value = (p as any)[prop];
            prevValue = (pPrev as any)[prop];
          }

          const increment = value - prevValue;
          increments.push(increment);
          expect(increment).toBeGreaterThan(0);
        }

        // Stacks 4+ should give less than stack 1 (flatScaling diminishing returns kick in at stack 4)
        if (max >= 4) {
          expect(increments[3]).toBeLessThan(increments[0]);
        }
      });
    });
  }

  const hyperStackables = [
    { idx: 4, name: 'Critical Strike', max: 3, prop: 'critChance' as const },
    { idx: 29, name: 'Dodge', max: 3, prop: 'dodgeChance' as const },
    { idx: 77, name: 'Raise Dead', max: 3, prop: 'raiseDead' as const, cls: 'necromancer' },
  ];

  for (const { idx, name, max, prop, cls: augCls } of hyperStackables) {
    describe(`[${idx}] ${name} (hyperStack, max ${max})`, () => {
      it('each additional application adds less than the previous', () => {
        const cls = augCls || UPGRADE_POOL[idx].forClass || 'pyromancer';
        const increments: number[] = [];

        for (let stack = 1; stack <= max; stack++) {
          const p = createTestPlayer(0, cls);

          // Apply 'stack' times (hyperStack accumulates on the player)
          for (let s = 1; s <= stack; s++) {
            UPGRADE_POOL[idx].apply(p, s);
          }

          const pPrev = createTestPlayer(0, cls);
          for (let s = 1; s < stack; s++) {
            UPGRADE_POOL[idx].apply(pPrev, s);
          }

          const increment = (p as any)[prop] - (pPrev as any)[prop];
          increments.push(increment);
          expect(increment).toBeGreaterThan(0);
        }

        // Each increment should be less than the previous (diminishing returns)
        for (let i = 1; i < increments.length; i++) {
          expect(increments[i]).toBeLessThan(increments[i - 1]);
        }
      });

      it('value never reaches 1.0 (hyperbolic cap)', () => {
        const cls = augCls || UPGRADE_POOL[idx].forClass || 'pyromancer';
        const p = createTestPlayer(0, cls);
        for (let s = 1; s <= max; s++) {
          UPGRADE_POOL[idx].apply(p, s);
        }
        expect((p as any)[prop]).toBeLessThan(1.0);
      });
    });
  }
});

// ═══════════════════════════════════════════════════════
//  Section 3: Evolution upgrade prerequisites
// ═══════════════════════════════════════════════════════

describe('Evolution upgrade prerequisites', () => {
  const evolutions = UPGRADE_POOL
    .map((aug, idx) => ({ aug, idx }))
    .filter(({ aug }) => aug.isEvolution);

  for (const { aug, idx } of evolutions) {
    describe(`[${idx}] ${aug.name}`, () => {
      it('evolvesFrom points to a valid parent augment', () => {
        expect(aug.evolvesFrom).toBeDefined();
        expect(aug.evolvesFrom).toBeGreaterThanOrEqual(0);
        expect(aug.evolvesFrom!).toBeLessThan(UPGRADE_POOL.length);
      });

      it('parent augment is stackable with maxStacks defined', () => {
        const parent = UPGRADE_POOL[aug.evolvesFrom!];
        expect(parent.stackable).toBe(true);
        expect(parent.maxStacks).toBeDefined();
        expect(parent.maxStacks!).toBeGreaterThan(0);
      });

      it('evolution class matches parent class (if class-specific)', () => {
        const parent = UPGRADE_POOL[aug.evolvesFrom!];
        if (aug.forClass) {
          // If the evolution is class-specific, the parent should be for the same class
          expect(parent.forClass).toBe(aug.forClass);
        }
      });

      it('apply works when parent is maxed', () => {
        const parent = UPGRADE_POOL[aug.evolvesFrom!];
        const cls = aug.forClass || 'pyromancer';
        const p = createTestPlayer(0, cls);
        p.takenUpgrades.set(aug.evolvesFrom!, parent.maxStacks!);
        expect(() => aug.apply(p, 1)).not.toThrow();
      });
    });
  }
});

// ═══════════════════════════════════════════════════════
//  Section 4: Cursed upgrade drawbacks
// ═══════════════════════════════════════════════════════

describe('Cursed upgrade drawbacks', () => {
  describe('[117] Reckless Haste — benefit + drawback', () => {
    it('BENEFIT: cooldowns are reduced', () => {
      const p = freshPlayer(117);
      const beforeCd = p.cls.spells.map(s => s.cd);
      UPGRADE_POOL[117].apply(p, 1);
      for (let i = 0; i < p.cls.spells.length; i++) {
        if (beforeCd[i] > 0) {
          expect(p.cls.spells[i].cd).toBeLessThan(beforeCd[i]);
        } else {
          // Ultimates have cd: 0, multiplying by 0.6 still gives 0
          expect(p.cls.spells[i].cd).toBe(0);
        }
      }
    });

    it('DRAWBACK: damageTakenMul is increased', () => {
      const p = freshPlayer(117);
      UPGRADE_POOL[117].apply(p, 1);
      expect(p.damageTakenMul).toBeGreaterThan(1);
    });
  });

  describe('[118] Blood Pact — benefit + drawback', () => {
    it('BENEFIT: lifeSteal is increased', () => {
      const p = freshPlayer(118);
      UPGRADE_POOL[118].apply(p, 1);
      expect(p.lifeSteal).toBeGreaterThan(0);
    });

    it('DRAWBACK: maxHp is reduced by 3', () => {
      const p = freshPlayer(118);
      const beforeHp = p.maxHp;
      UPGRADE_POOL[118].apply(p, 1);
      expect(p.maxHp).toBe(Math.max(1, beforeHp - 3));
      expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    });
  });

  describe('[119] Unstable Power — benefit + drawback', () => {
    it('BENEFIT: primary damage is increased by 8', () => {
      const p = freshPlayer(119);
      const beforeDmg = p.cls.spells[0].dmg;
      UPGRADE_POOL[119].apply(p, 1);
      expect(p.cls.spells[0].dmg).toBe(beforeDmg + 8);
    });

    it('DRAWBACK: selfDmgChance is set', () => {
      const p = freshPlayer(119);
      UPGRADE_POOL[119].apply(p, 1);
      expect(p.selfDmgChance).toBeGreaterThan(0);
    });
  });

  describe('[120] Berserker Pact — benefit + drawback', () => {
    it('BENEFIT: critChance is increased', () => {
      const p = freshPlayer(120);
      UPGRADE_POOL[120].apply(p, 1);
      expect(p.critChance).toBeGreaterThan(0);
    });

    it('DRAWBACK: armor is reduced by 2', () => {
      const p = freshPlayer(120);
      const beforeArmor = p.armor;
      UPGRADE_POOL[120].apply(p, 1);
      expect(p.armor).toBe(beforeArmor - 2);
    });
  });

  describe('[121] Soul Bargain — benefit + drawback', () => {
    it('BENEFIT: mana regen increased and costs halved', () => {
      const p = freshPlayer(121);
      const beforeRegen = p.manaRegen;
      const beforeMana = p.cls.spells.map(s => s.mana);
      UPGRADE_POOL[121].apply(p, 1);
      expect(p.manaRegen).toBeGreaterThan(beforeRegen);
      for (let i = 0; i < p.cls.spells.length; i++) {
        expect(p.cls.spells[i].mana).toBeLessThanOrEqual(beforeMana[i]);
      }
    });

    it('DRAWBACK: maxHp is reduced by 4', () => {
      const p = freshPlayer(121);
      const beforeHp = p.maxHp;
      UPGRADE_POOL[121].apply(p, 1);
      expect(p.maxHp).toBe(Math.max(1, beforeHp - 4));
      expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    });
  });
});

// ═══════════════════════════════════════════════════════
//  Section 5: Augment gameplay integration audit
//  Documents which augment properties are set in apply()
//  but never consumed in actual game systems.
// ═══════════════════════════════════════════════════════

describe('Augment gameplay integration audit', () => {
  /**
   * The following 35 augment properties are SET by apply() functions
   * but are NOT currently READ/consumed by any gameplay system code.
   * This means the augment's effect is defined but has no actual gameplay impact.
   *
   * This list serves as a backlog of augment effects that need implementation
   * in the combat, movement, or other gameplay systems.
   */
  const unimplementedProperties = [
    // Cross-spell synergies (set in apply, not consumed in combat)
    'aftershock',       // [35] AoE spells leave a damage zone — not consumed
    'comboBonus',       // [40] RMB deals +50% if target hit by LMB — not consumed
    'spellWeaving',     // [47] Alternating LMB/RMB +25% dmg — not consumed
    'cdCascade',        // [48] LMB kills reduce RMB cooldown — not consumed
    'fullRotation',     // [49] Use all 3 spells in 5s: 3x speed — not consumed
    'selfDmg',          // [56] Friendly Fire — spells can hurt you — not consumed

    // Pyromancer class-specific
    'burnSpread',       // [65] Wildfire — burn spreads to nearby enemies
    'magmaArmor',       // [66] Magma Armor — melee attackers catch fire
    'fireZoneOnExplode',// [67] Pyroclasm — explosions leave fire zones

    // Cryomancer class-specific
    'shatter',          // [68] Shatter — frozen enemies explode on death
    'permafrost',       // [69] Permafrost — slow effects never expire
    'iceArmor',         // [70] Ice Armor — melee attackers get frozen

    // Stormcaller class-specific
    'overcharge',       // [72] Overcharge — every 3rd spell deals 3x

    // Arcanist class-specific
    'blinkExplode',     // [75] Phase Shift — blink leaves explosion
    'spellMirror',      // [76] Spell Mirror — 30% chance to copy spell

    // Necromancer class-specific
    'deathMark',        // [78] Death Mark — below 20% HP take 3x
    'soulWell',         // [79] Soul Well — kills create healing zone

    // Chronomancer class-specific
    'timeLoop',         // [80] Time Loop — rewind on death
    'hasteZone',        // [81] Haste Zone — Time Warp also boosts ally speed
    'temporalEcho',     // [82] Temporal Echo — spells fire delayed copy

    // Knight class-specific
    'shieldBounce',     // [83] Shield Mastery — shield bounces between enemies
    'tauntAura',        // [85] Taunt Aura — enemies target you

    // Berserker class-specific
    'undyingRage',      // [87] Undying Rage — cannot die for 3s at 1 HP

    // Druid class-specific
    'packLeader',       // [95] Pack Leader — wolf 2x stronger, 2 wolves
    'overgrowthHeal',   // [96] Overgrowth — entangle heals allies
    'barkSkinRegen',    // [97] Bark Skin — regen 1 HP every 5s

    // Monk class-specific
    'zenMana',          // [103] Zen Master — meditation restores mana

    // Engineer class-specific
    'turretArmy',       // [104] Turret Army — 3 turrets at once
    'laserTurret',      // [105] Laser Turret — turrets fire beams
    'turretExplode',    // [106] Self-Destruct — turrets explode on expire
  ];

  it('documents all 30 unimplemented augment properties', () => {
    expect(unimplementedProperties.length).toBe(30);
  });

  it('all unimplemented properties exist on the Player type', () => {
    // Verify that these are real player properties that get set by apply()
    const p = createTestPlayer(0, 'pyromancer');
    for (const prop of unimplementedProperties) {
      expect(prop in p).toBe(true);
    }
  });

  it('all unimplemented properties have default values (not undefined)', () => {
    const p = createTestPlayer(0, 'pyromancer');
    for (const prop of unimplementedProperties) {
      expect((p as any)[prop]).not.toBeUndefined();
    }
  });

  // List each unimplemented property with a descriptive test name for visibility
  for (const prop of unimplementedProperties) {
    it(`UNIMPLEMENTED: "${prop}" is set by apply() but not consumed in gameplay`, () => {
      // This test is documentation — it verifies the property exists but
      // serves as a reminder that it has no gameplay effect yet.
      const p = createTestPlayer(0, 'pyromancer');
      expect(prop in p).toBe(true);
    });
  }
});
