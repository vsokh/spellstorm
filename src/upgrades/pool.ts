import { Player, SpellType, UpgradeDef } from '../types';
import { flatScaling } from '../constants/combat';

/** Hyperbolic stacking: diminishing returns that never reach 100%.
 *  Formula: 1 - 1/(1 + acc), where acc is the raw sum of base increments. */
function hyperStack(p: Player, key: string, base: number): number {
  const acc = (p._hyperAcc[key] = (p._hyperAcc[key] || 0) + base);
  return 1 - 1 / (1 + acc);
}

export const UPGRADE_POOL: UpgradeDef[] = [
  // -- DAMAGE --
  { name: 'Spell Power', desc: 'All spells deal +1 damage', stackable: true, maxStacks: 5,
    apply: (p, stacks) => { const v = flatScaling(1, stacks); for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + v; } },
  { name: 'Primary Boost', desc: 'Primary spell +2 damage', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.cls.spells[0].dmg += flatScaling(2, stacks); } },
  { name: 'Ultimate Power', desc: 'Ultimate spell +3 damage', apply: (p: Player) => { if (p.cls.spells[3].dmg) p.cls.spells[3].dmg += 3; } },
  { name: 'Glass Cannon', desc: '+3 spell damage, -2 max HP', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 3; p.maxHp = Math.max(1, p.maxHp - 2); p.hp = Math.min(p.hp, p.maxHp); } },
  { name: 'Critical Strike', desc: '15% chance to deal 2x damage', stackable: true, maxStacks: 3, apply: (p: Player) => { p.critChance = hyperStack(p, 'critChance', 0.15); } },
  { name: 'Overkill', desc: 'Leftover damage from a kill splashes to a nearby enemy', apply: (p: Player) => { p.overkill = true; } },

  // -- PROJECTILE MODIFIERS --
  { name: 'Piercing', desc: 'Primary passes through +1 enemy', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.pierce = (p.pierce || 0) + flatScaling(1, stacks); } },
  { name: 'Split Shot', desc: 'Primary fires 2 extra bolts at +/-15 deg', apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 2; } },
  { name: 'Ricochet', desc: 'Projectiles bounce off walls once', apply: (p: Player) => { p.ricochet = (p.ricochet || 0) + 1; } },
  { name: 'Velocity', desc: 'Projectile speed +40%', apply: (p: Player) => { for (const s of p.cls.spells) if (s.speed) s.speed *= 1.4; } },
  { name: 'Chain Hit', desc: 'Hits jump to 1 nearby enemy for 50% dmg', stackable: true, maxStacks: 3,
    apply: (p, stacks) => { p.chainHit = (p.chainHit || 0) + flatScaling(1, stacks); } },
  { name: 'Homing Bolts', desc: 'Primary gently curves toward nearby enemies', apply: (p: Player) => { const s = p.cls.spells[0]; s.homing = (s.homing || 0) + 1.5; } },
  { name: 'Big Spells', desc: 'Projectile size +30%', apply: (p: Player) => { for (const s of p.cls.spells) if (s.radius) s.radius *= 1.3; } },
  { name: 'Blast Radius', desc: 'Explosions +50% area', apply: (p: Player) => { for (const s of p.cls.spells) { if (s.explode) s.explode *= 1.5; if (s.radius && s.type === SpellType.AoeDelayed) s.radius *= 1.5; } } },

  // -- FIRE RATE / COOLDOWN --
  { name: 'Swift Cast', desc: 'All cooldowns -20%', apply: (p: Player) => { for (const s of p.cls.spells) s.cd *= 0.8; } },
  { name: 'Rapid Fire', desc: 'Primary fires 40% faster', apply: (p: Player) => { p.cls.spells[0].cd *= 0.6; } },
  { name: 'Double Tap', desc: 'Primary fires 2 shots per cast', apply: (p: Player) => { p.doubleTap = (p.doubleTap || 0) + 1; } },
  { name: 'Trigger Happy', desc: 'Kills reset primary cooldown', apply: (p: Player) => { p.killResetCD = true; } },

  // -- MANA --
  { name: 'Efficiency', desc: 'Mana costs -25%', apply: (p: Player) => { for (const s of p.cls.spells) s.mana *= 0.75; } },
  { name: 'Mana Flow', desc: 'Mana regen +50%', apply: (p: Player) => { p.manaRegen *= 1.5; } },
  { name: 'Max Mana +30', desc: '+30 max mana, immediately restored', apply: (p: Player) => { p.maxMana += 30; p.mana += 30; } },
  { name: 'Mana on Kill', desc: 'Restore 8 mana per kill', apply: (p: Player) => { p.manaOnKill = (p.manaOnKill || 0) + 8; } },
  { name: 'Spell Thief', desc: 'Hits restore 2 mana', apply: (p: Player) => { p.manaOnHit = (p.manaOnHit || 0) + 2; } },

  // -- SURVIVABILITY --
  { name: 'Vitality', desc: 'Max HP +2, heal to full', stackable: true, maxStacks: 5,
    apply: (p, stacks) => { p.maxHp += flatScaling(2, stacks); p.hp = p.maxHp; } },
  { name: 'Armor', desc: 'Reduce all damage taken by 1 (you always take at least 1)', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { p.armor = (p.armor || 0) + flatScaling(1, stacks); } },
  { name: 'Vampirism', desc: 'Heal 1 HP per 4 kills', apply: (p: Player) => { p.vampirism = (p.vampirism || 0) + 1; p.vampKillReq = 4; } },
  { name: 'Life Steal', desc: '5% of damage dealt heals you', apply: (p: Player) => { p.lifeSteal = hyperStack(p, 'lifeSteal', 0.05); } },
  { name: 'Second Wind', desc: 'Revive once per floor with 50% HP', apply: (p: Player) => { p.secondWind = (p.secondWind || 0) + 1; } },
  { name: 'Thorns', desc: 'Enemies take 1 damage when they hit you', apply: (p: Player) => { p.thorns = (p.thorns || 0) + 1; } },
  { name: 'Dodge', desc: '15% chance to avoid damage entirely', stackable: true, maxStacks: 3, apply: (p: Player) => { p.dodgeChance = hyperStack(p, 'dodgeChance', 0.15); } },

  // -- MOBILITY --
  { name: 'Quick Step', desc: 'Move speed +25%', apply: (p: Player) => { p.moveSpeed *= 1.25; } },
  { name: 'Dash', desc: 'Press SHIFT to dash. 2s cooldown.', apply: (p: Player) => { p.hasDash = true; p.dashCd = 0; } },
  { name: 'Momentum', desc: 'Moving increases damage by up to 20%', apply: (p: Player) => { p.momentum = true; } },

  // -- AREA / ZONE --
  { name: 'Lingering', desc: 'Zones last 50% longer', apply: (p: Player) => { for (const s of p.cls.spells) if (s.duration) s.duration *= 1.5; } },
  { name: 'Deep Freeze', desc: 'Slow effects 2x stronger', apply: (p: Player) => { for (const s of p.cls.spells) if (s.slow) s.slow *= 2; } },
  { name: 'Aftershock', desc: 'AoE spells leave a damage zone for 2s', apply: (p: Player) => { p.aftershock = true; } },

  // -- SECONDARY (RMB) UPGRADES --
  { name: 'Secondary Mastery', desc: 'Secondary spell cooldown -40%', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].cd *= 0.6; } },
  { name: 'Double Secondary', desc: 'Secondary spell triggers twice per cast', apply: (p: Player) => { p.doubleSecondary = (p.doubleSecondary || 0) + 1; } },
  { name: 'Secondary Power', desc: 'Secondary spell +3 damage', apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].dmg = (p.cls.spells[1].dmg || 0) + 3; } },
  { name: 'Free Cast', desc: 'Secondary spell costs no mana (+2s cooldown)', apply: (p: Player) => { if (p.cls.spells[1]) { p.cls.spells[1].mana = 0; p.cls.spells[1].cd += 2; } } },
  { name: 'Combo', desc: 'Secondary deals +50% damage to targets hit by primary recently', apply: (p: Player) => { p.comboBonus = true; } },
  { name: 'Area Secondary', desc: 'Secondary spell range and radius +50%', apply: (p: Player) => { const s = p.cls.spells[1]; if (s) { if (s.range) s.range *= 1.5; if (s.radius) s.radius *= 1.5; if (s.aoeR) s.aoeR *= 1.5; } } },

  // -- Q ABILITY (Q) UPGRADES --
  { name: 'Q Power', desc: 'Q ability +2 damage', stackable: true, maxStacks: 4,
    apply: (p, stacks) => { if (p.cls.spells[2]) p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) + flatScaling(2, stacks); } },
  { name: 'Q Rapid Cooldown', desc: 'Q ability cooldown -40%', apply: (p: Player) => { if (p.cls.spells[2]) p.cls.spells[2].cd *= 0.6; } },
  { name: 'Double Q', desc: 'Q ability triggers twice per cast', apply: (p: Player) => { p.doubleQ = (p.doubleQ || 0) + 1; } },
  { name: 'Q Efficiency', desc: 'Q ability costs no mana (+3s cooldown)', apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].mana = 0; p.cls.spells[2].cd += 3; } } },
  { name: 'Q Area', desc: 'Q ability range and radius +50%', apply: (p: Player) => { const s = p.cls.spells[2]; if (s) { if (s.range) s.range *= 1.5; if (s.radius) s.radius *= 1.5; if (s.aoeR) s.aoeR *= 1.5; } } },

  // -- ULTIMATE (R) UPGRADES --
  { name: 'Quick Charge', desc: 'Ultimate charges 50% faster', apply: (p: Player) => { p.ultChargeRate = (p.ultChargeRate || 1) * 1.5; } },
  { name: 'Ult Mastery', desc: 'Ultimate deals 2x damage/effect', apply: (p: Player) => { p.ultPower = (p.ultPower || 1) * 2; } },
  { name: 'Overflow', desc: 'Ult charges to 200% for double cast', apply: (p: Player) => { p.ultOverflow = true; } },
  { name: 'Ult Echo', desc: 'After using ultimate, your next 5 primary shots deal double damage', apply: (p: Player) => { p.ultEcho = (p.ultEcho || 0) + 5; } },
  { name: 'Ult Regen', desc: 'Using ult restores 50% HP', apply: (p: Player) => { p.ultHeal = true; } },

  // -- CROSS-SPELL SYNERGIES --
  { name: 'Spell Weaving', desc: 'Switching between primary and secondary grants +25% damage (up to 3 stacks)', apply: (p: Player) => { p.spellWeaving = true; } },
  { name: 'Cooldown Cascade', desc: 'Primary kills reduce secondary cooldown by 1s', apply: (p: Player) => { p.cdCascade = true; } },
  { name: 'Full Rotation', desc: 'Cast all 3 spells within 5s to gain 3x attack speed for 3s', apply: (p: Player) => { p.fullRotation = true; } },
  { name: 'Q Mastery', desc: 'Q skill cooldown -35%, +2 damage', apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].cd *= 0.65; p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) + 2; } } },
  { name: 'Skill Reset', desc: 'Using ultimate resets Q and secondary cooldowns', apply: (p: Player) => { p.ultResetCDs = true; } },

  // -- WILD / FUN --
  { name: 'Chaos Bolts', desc: 'Primary damage randomized between 1 and 4 per hit', apply: (p: Player) => { p.chaosDmg = true; } },
  { name: 'Magnet', desc: '+60 pickup range', apply: (p: Player) => { p.magnetRange = (p.magnetRange || 30) + 60; } },
  { name: 'Gold Rush', desc: 'Enemies drop 2x gold', apply: (p: Player) => { p.goldMul = (p.goldMul || 1) * 2; } },
  { name: 'XP Boost', desc: 'Gain upgrades 30% more often', apply: (p: Player) => { p.xpBoost = hyperStack(p, 'xpBoost', 0.3); } },
  { name: 'Friendly Fire', desc: '+2 dmg but your spells can hurt you', apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 2; p.selfDmg = true; } },

  // -- QUALITATIVE (behavior-changing) --
  { name: 'Boomerang', desc: 'Projectiles return to you at half range, hitting enemies twice', apply: (p: Player) => { p.boomerang = true; } },
  { name: 'Volatile', desc: 'Projectiles explode when they expire (2 dmg, small radius)', apply: (p: Player) => { p.volatile = true; } },
  { name: 'Fork', desc: 'Kills spawn 2 mini-projectiles from the corpse', apply: (p: Player) => { p.forkOnKill = true; } },
  { name: 'Gravity Pull', desc: 'Projectiles pull nearby enemies toward their path', apply: (p: Player) => { p.gravityWell = true; } },
  { name: 'Spectral', desc: 'Projectiles pass through walls and pillars', apply: (p: Player) => { p.spectral = true; } },
  { name: 'Frozen Touch', desc: '25% chance any attack freezes enemies for 1s', apply: (p: Player) => { p.frozenTouch = true; } },
  { name: 'Seeker Mines', desc: 'Kills drop proximity mines with a small blast radius (3 dmg each)', apply: (p: Player) => { p.seekerMines = true; } },
  { name: 'Barrage Mode', desc: 'Primary fires a 3-shot burst (40% damage each, slower fire rate)', apply: (p: Player) => { p.burstFire = true; const s = p.cls.spells[0]; s.dmg = Math.max(1, Math.ceil(s.dmg * 0.4)); s.cd *= 1.5; } },

  // ══════════════════════════════════════
  //     CLASS-SPECIFIC UPGRADES (3 each)
  // ══════════════════════════════════════

  // ── Pyromancer ──
  { name: 'Wildfire', desc: 'Burn spreads to nearby enemies', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { p.burnSpread = true; } },
  { name: 'Magma Armor', desc: 'Enemies that hit you catch fire (3 dmg)', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { p.magmaArmor = true; } },
  { name: 'Pyroclasm', desc: 'Fireball explosions are 2x bigger and leave fire zones', forClass: 'pyromancer', color: '#ff6633',
    apply: (p: Player) => { const s = p.cls.spells[0]; if (s.explode) s.explode *= 2; p.fireZoneOnExplode = true; } },

  // ── Cryomancer ──
  { name: 'Shatter', desc: 'Frozen enemies explode on death, dealing 3 AoE dmg', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.shatter = true; } },
  { name: 'Permafrost', desc: 'Slow effects never expire (permanent until enemy dies)', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.permafrost = true; } },
  { name: 'Ice Armor', desc: '+3 armor. Melee attackers get frozen 1s', forClass: 'cryomancer', color: '#44bbff',
    apply: (p: Player) => { p.armor = (p.armor || 0) + 3; p.iceArmor = true; } },

  // ── Stormcaller ──
  { name: 'Chain Lightning', desc: 'Lightning beam arcs to +2 nearby enemies each tick', forClass: 'stormcaller', color: '#bb66ff', stackable: true, maxStacks: 3,
    apply: (p, stacks) => { p.chainLightning = (p.chainLightning || 0) + flatScaling(2, stacks); } },
  { name: 'Overcharge', desc: 'Lightning channel builds up to 4x damage (from 2.5x)', forClass: 'stormcaller', color: '#bb66ff',
    apply: (p: Player) => { p.overcharge = true; const s = p.cls.spells[0]; if (s.channelScale !== undefined) s.channelScale = 4; } },
  { name: 'Storm Shield', desc: 'Lightning randomly strikes enemies at close range (1 dmg/s)', forClass: 'stormcaller', color: '#bb66ff',
    apply: (p: Player) => { p.stormShield = true; } },

  // ── Arcanist ──
  { name: 'Arcane Amplifier', desc: 'Homing gets 3x stronger, projectiles are 50% faster', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { const s = p.cls.spells[0]; s.homing = (s.homing || 0) * 3; if (s.speed) s.speed *= 1.5; } },
  { name: 'Phase Shift', desc: 'Blink leaves behind a small explosion (4 dmg)', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { p.blinkExplode = true; } },
  { name: 'Spell Mirror', desc: '30% chance to copy any spell you cast for free', forClass: 'arcanist', color: '#ff55aa',
    apply: (p: Player) => { p.spellMirror = hyperStack(p, 'spellMirror', 0.3); } },

  // ── Necromancer ──
  { name: 'Raise Dead', desc: 'Killed enemies have 25% chance to fight for you (5s)', forClass: 'necromancer', color: '#55cc55', stackable: true, maxStacks: 3,
    apply: (p: Player) => { p.raiseDead = hyperStack(p, 'raiseDead', 0.25); } },
  { name: 'Death Mark', desc: 'Enemies below 20% HP take 3x damage', forClass: 'necromancer', color: '#55cc55',
    apply: (p: Player) => { p.deathMark = true; } },
  { name: 'Soul Well', desc: 'Kills create a medium healing zone (2 HP/s for 3s)', forClass: 'necromancer', color: '#55cc55',
    apply: (p: Player) => { p.soulWell = true; } },

  // ── Chronomancer ──
  { name: 'Time Loop', desc: 'When you die, rewind 5s instead (once per wave)', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.timeLoop = (p.timeLoop || 0) + 1; } },
  { name: 'Haste Zone', desc: 'Time Warp now also boosts ally speed 2x for 3s', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.hasteZone = true; } },
  { name: 'Temporal Echo', desc: 'Spells fire a delayed copy 0.5s later at 50% damage', forClass: 'chronomancer', color: '#ffcc44',
    apply: (p: Player) => { p.temporalEcho = true; } },

  // ── Knight ──
  { name: 'Shield Mastery', desc: 'Shield Throw bounces between 3 enemies', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.shieldBounce = (p.shieldBounce || 0) + 3; } },
  { name: 'Fortify', desc: '+5 max HP, +2 armor, move 15% slower', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.maxHp += 5; p.hp += 5; p.armor = (p.armor || 0) + 2; p.moveSpeed *= 0.85; } },
  { name: 'Taunt Aura', desc: 'Enemies within close range target you instead of your ally', forClass: 'knight', color: '#aabbcc',
    apply: (p: Player) => { p.tauntAura = true; } },

  // ── Berserker ──
  { name: 'Bloodlust', desc: 'Each kill: +5% attack speed (cap +100%). After cap: +1% crit (cap +15%)', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.bloodlust = true; } },
  { name: 'Undying Rage', desc: 'Cannot die for 3s after reaching 1 HP (once per wave)', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.undyingRage = (p.undyingRage || 0) + 1; } },
  { name: 'Cleave', desc: 'Axe Swing hits 360° around you and +2 damage', forClass: 'berserker', color: '#ff4444',
    apply: (p: Player) => { p.cls.spells[0].angle = Math.PI * 2; p.cls.spells[0].dmg += 2; } },

  // ── Paladin ──
  { name: 'Blessed Weapons', desc: 'Both players deal +2 damage', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { for (const s of p.cls.spells) s.dmg = (s.dmg || 0) + 2; } },
  { name: 'Divine Shield', desc: 'Holy Shield lasts 5s and reflects projectiles', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { if (p.cls.spells[1]) p.cls.spells[1].duration = 5; p.reflectShield = true; } },
  { name: 'Resurrection', desc: 'If your ally dies, auto-revive them at 50% HP (45s cd)', forClass: 'paladin', color: '#ffddaa',
    apply: (p: Player) => { p.resurrection = true; } },

  // ── Ranger ──
  { name: 'Multishot', desc: 'Arrows fire in a 2-arrow spread', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 1; } },
  { name: 'Poison Arrows', desc: 'All arrows poison (2 dmg over 2s)', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { p.cls.spells[0].burn = 2; } },
  { name: 'Volley Master', desc: 'Volley fires 6 arrows instead of 4 and deals 2x damage', forClass: 'ranger', color: '#88cc44',
    apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].dmg = (p.cls.spells[2].dmg || 0) * 2; p.cls.spells[2].count = 6; } } },

  // ── Druid ──
  { name: 'Pack Leader', desc: 'Spirit Wolf is 2x stronger and you can have 2 wolves', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { p.packLeader = true; } },
  { name: 'Overgrowth', desc: 'Entangle radius 2x, also heals allies inside for 2 HP/s', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { if (p.cls.spells[1]) { p.cls.spells[1].radius = (p.cls.spells[1].radius || 60) * 2; } p.overgrowthHeal = true; } },
  { name: 'Bark Skin', desc: '+3 armor, regen 1 HP every 5s (stacks with passive)', forClass: 'druid', color: '#44aa33',
    apply: (p: Player) => { p.armor = (p.armor || 0) + 3; p.barkSkinRegen = true; p.hpRegen = (p.hpRegen || 0) + 0.2; } },

  // ── Warlock ──
  { name: 'Soul Siphon', desc: 'Dark Pact HP cost becomes healing instead (pay mana, gain HP)', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.soulSiphon = true; } },
  { name: 'Demonic Pact', desc: 'Imps are permanent and you can have 3 at once', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.demonicPact = true; } },
  { name: 'Hex', desc: 'Drain Life chains to 3 targets', forClass: 'warlock', color: '#6622aa',
    apply: (p: Player) => { p.hexChain = (p.hexChain || 0) + 3; } },

  // ── Monk ──
  { name: 'Way of the Fist', desc: 'Chi Blast fires 3 projectiles in a fan', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { p.splitShot = (p.splitShot || 0) + 2; } },
  { name: 'Iron Skin', desc: 'Dodge chance +25%, take -1 damage from all sources', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { p.dodgeChance = hyperStack(p, 'dodgeChance', 0.25); p.armor = (p.armor || 0) + 1; } },
  { name: 'Zen Master', desc: 'Meditation heals 3x faster and also restores mana', forClass: 'monk', color: '#eedd88',
    apply: (p: Player) => { if (p.cls.spells[2]) { p.cls.spells[2].heal = (p.cls.spells[2].heal || 1) * 3; } p.zenMana = true; } },

  // ── Engineer ──
  { name: 'Turret Army', desc: 'Can have 3 turrets at once, each lasts 25s', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.turretArmy = true; if (p.cls.spells[1]) p.cls.spells[1].duration = 25; } },
  { name: 'Laser Turret', desc: 'Turrets fire beams instead of shots (2x damage, hits instantly)', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.laserTurret = true; } },
  { name: 'Self-Destruct', desc: 'Turrets explode when they expire (6 dmg, medium radius)', forClass: 'engineer', color: '#dd8833',
    apply: (p: Player) => { p.turretExplode = true; } },

  // ── Positional Bonus Upgrades ──
  { name: "Assassin's Mark", desc: 'Backstab bonus +0.3x per stack (max 3)', forClass: undefined, maxStacks: 3, stackable: true, color: '#aa2244',
    offerCondition: (passive) => !!passive.backstab,
    apply: (p: Player) => { p.assassinMark = (p.assassinMark || 0) + 1; } },
  { name: 'Close Quarters', desc: 'Proximity range +20, +1 armor while in range (max 3)', forClass: undefined, maxStacks: 3, stackable: true, color: '#ff6644',
    offerCondition: (passive) => !!passive.proximityBonus,
    apply: (p: Player) => { p.closeQuarters = (p.closeQuarters || 0) + 1; p.armor = (p.armor || 0) + 1; } },

  // ══════════════════════════════════════
  //     EVOLUTION UPGRADES
  // ══════════════════════════════════════

  { name: 'Spell Mastery', desc: 'Caps total spell damage bonus at +7 and reduces all cooldowns by 30%', isEvolution: true, evolvesFrom: 0, color: '#ffaa00',
    apply: (p: Player, _s: number) => {
      const parentStacks = p.takenUpgrades.get(0) || 0;
      let parentTotal = 0;
      for (let i = 1; i <= parentStacks; i++) parentTotal += flatScaling(1, i);
      const bonus = Math.max(0, 7 - parentTotal);
      for (const s of p.cls.spells) { s.dmg = (s.dmg || 0) + bonus; s.cd *= 0.7; }
    } },

  { name: 'Primary Overload', desc: 'Caps primary damage bonus at +10 and adds a 3-damage explosion on hit', isEvolution: true, evolvesFrom: 1, color: '#ffaa00',
    apply: (p: Player, _s: number) => {
      const parentStacks = p.takenUpgrades.get(1) || 0;
      let parentTotal = 0;
      for (let i = 1; i <= parentStacks; i++) parentTotal += flatScaling(2, i);
      p.cls.spells[0].dmg += Math.max(0, 10 - parentTotal);
      p.cls.spells[0].explode = (p.cls.spells[0].explode || 0) + 40;
    } },

  { name: 'Lethal Precision', desc: 'Crits deal 2.5x damage and +25% crit chance', isEvolution: true, evolvesFrom: 4, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.critChance = (p.critChance || 0) + 0.25; p.critMul = 2.5; } },

  { name: 'Void Lance', desc: 'Primary pierces all enemies and gains +3 damage', isEvolution: true, evolvesFrom: 6, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.pierce = (p.pierce || 0) + 99; p.cls.spells[0].dmg += 3; } },

  { name: 'Chain Annihilation', desc: 'Chain hits deal full damage and +3 extra jumps', isEvolution: true, evolvesFrom: 10, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.chainHit = (p.chainHit || 0) + 3; p.chainFullDmg = true; } },

  { name: 'Regeneration', desc: '+5 max HP, regenerate 1 HP every 3 seconds', isEvolution: true, evolvesFrom: 23, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.maxHp += 5; p.hp = p.maxHp; p.hpRegen = (p.hpRegen || 0) + 0.333; } },

  { name: 'Fortress', desc: '+3 armor and enemies take 3 damage when hitting you', isEvolution: true, evolvesFrom: 24, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.armor = (p.armor || 0) + 3; p.thorns = (p.thorns || 0) + 3; } },

  { name: 'Shadow Step', desc: '+30% dodge chance and +25% move speed', isEvolution: true, evolvesFrom: 29, color: '#ffaa00',
    apply: (p: Player, _s: number) => { p.dodgeChance = (p.dodgeChance || 0) + 0.30; p.moveSpeed *= 1.25; } },

  { name: 'Storm Lord', desc: 'Lightning chains to +5 enemies and primary +2 damage', isEvolution: true, evolvesFrom: 76, color: '#ffaa00', forClass: 'stormcaller',
    apply: (p: Player, _s: number) => { p.chainLightning = (p.chainLightning || 0) + 5; p.cls.spells[0].dmg += 2; } },

  { name: 'Lich King', desc: 'Raise dead chance +50% — nearly every kill raises a minion', isEvolution: true, evolvesFrom: 82, color: '#ffaa00', forClass: 'necromancer',
    apply: (p: Player, _s: number) => { p.raiseDead = (p.raiseDead || 0) + 0.50; } },

  // ══════════════════════════════════════
  //     CURSED UPGRADES (wave 16+)
  // ══════════════════════════════════════

  { name: 'Reckless Haste', desc: 'All cooldowns -40%, but take +50% more damage',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { for (const s of p.cls.spells) s.cd *= 0.6; p.damageTakenMul = (p.damageTakenMul || 1) * 1.5; } },

  { name: 'Blood Pact', desc: '+20% life steal, but -3 max HP',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.lifeSteal = hyperStack(p, 'lifeSteal', 0.2); p.maxHp = Math.max(1, p.maxHp - 3); p.hp = Math.min(p.hp, p.maxHp); } },

  { name: 'Unstable Power', desc: 'Primary +8 damage, but 5% chance to hurt yourself when casting',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.cls.spells[0].dmg += 8; p.selfDmgChance = Math.min(1, (p.selfDmgChance || 0) + 0.05); } },

  { name: 'Berserker Pact', desc: '+50% crit chance, but -2 armor',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.critChance = hyperStack(p, 'critChance', 0.5); p.armor = (p.armor || 0) - 2; } },

  { name: 'Soul Bargain', desc: '+60% mana regen and -50% mana costs, but -4 max HP',
    isCursed: true, color: '#cc3333',
    apply: (p: Player) => { p.manaRegen *= 1.6; for (const s of p.cls.spells) s.mana *= 0.5; p.maxHp = Math.max(1, p.maxHp - 4); p.hp = Math.min(p.hp, p.maxHp); } },

  // ── Tether upgrades ──
  { name: 'Iron Tether', desc: 'Tether range +30', stackable: true, maxStacks: 3, color: '#aaaacc',
    apply: (p: Player, stacks: number) => { for (const s of p.cls.spells) { if (s.tetherRange) s.tetherRange += 30 * stacks; } } },
  { name: 'Leech', desc: 'Tether healing +0.5/tick', stackable: true, maxStacks: 3, color: '#44ff88',
    apply: (p: Player, stacks: number) => { for (const s of p.cls.spells) { if (s.tetherHeal !== undefined) s.tetherHeal += 0.5 * stacks; } } },
];
