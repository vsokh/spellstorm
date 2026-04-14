# New Wizard Class Designs

> 10 new wizard classes for Spellstorm, designed from LoL archetype research and refined into concrete, implementable designs using the existing SpellType system. Each class targets a distinct playstyle that breaks the circle-kiting meta.

---

## Table of Contents

1. [Graviturge](#1-graviturge) — Battle Mage / Juggernaut
2. [Bladecaller](#2-bladecaller) — Skirmisher / Assassin
3. [Architect](#3-architect) — Zone Controller
4. [Hexblade](#4-hexblade) — Mark-and-Execute Caster
5. [Warden](#5-warden) — Directional Tank / Protector
6. [Cannoneer](#6-cannoneer) — Artillery / Marksman
7. [Soulbinder](#7-soulbinder) — Catcher / Enchanter
8. [Invoker](#8-invoker) — Adaptive / Elemental
9. [Tidecaller](#9-tidecaller) — Summoner / Controller
10. [Voidweaver](#10-voidweaver) — Trapper / Debuffer

---

## Design Principles

- **Every class uses exactly 4 spells:** LMB, RMB, Q, Space (Ultimate).
- **All classes use existing SpellTypes only.** Where the full fantasy requires new mechanics, the closest existing SpellType is used and the "Future Mechanics" section notes what would need to be coded.
- **Balance targets:** LMB damage 1-3 (cd 0.15-0.5, mana 2-10), RMB damage 1-4 (mana 12-28, cd 1-5), Q damage 1-4 (mana 15-45, cd 4-12).
- **Passives are descriptive only** — behavior must be coded separately in game systems.
- **Each class must feel distinct** from all 14 existing classes AND from each other.

---

## 1. Graviturge

**Archetype:** Battle Mage / Juggernaut
**Color:** #6644aa / Glow: #4422aa
**Fantasy:** A gravity wizard who warps space around themselves, pulling enemies closer and growing stronger the more surrounded they are. The anti-kiter — they want to be in the thick of it.

### Playstyle

Graviturge is the opposite of circle-kiting. Their damage aura and sustain scale with proximity to enemies. The optimal play pattern is to pull enemies toward you with Gravity Bolt, stand inside the Nova range, and sustain through the passive while dealing constant AOE. When overwhelmed, Singularity Zone provides breathing room via slow, and Collapse is the panic button that also serves as the setup for maximum aura damage.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Gravity Bolt | Projectile | 1.5 dmg, speed 280, radius 10, mana 6, cd 0.32, life 0.8, slow 0.5 |
| RMB | Singularity | Zone | 1.5 dmg, mana 22, cd 5, radius 80, duration 4, tickRate 0.6, slow 0.8 |
| Q | Collapse | Nova | 3 dmg, mana 35, cd 8, range 120, stun 1.0 |
| Space | Gravitational Ruin | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Gravity Bolt:** Short-range, slow projectile that applies a heavy slow on hit. The short range (life 0.8 at speed 280 = ~224 units max range) forces the Graviturge to stay close to targets. The slow pulls the kiting meta inward — enemies that are slowed cluster around you.

**RMB — Singularity:** A damaging slow zone placed at the Graviturge's feet (or cursor). Enemies inside take tick damage and are slowed, keeping them in range of the passive aura. The zone is the Graviturge's "home base" — they fight inside it.

**Q — Collapse:** A point-blank Nova burst that stuns everything nearby. Used both offensively (stun a cluster for free damage) and defensively (stun to escape when HP gets low). The long cooldown means it must be timed carefully.

**Ultimate — Gravitational Ruin:** Massive pull + damage. All enemies in a large radius are yanked toward the Graviturge and take heavy damage. The Graviturge gains temporary damage reduction. This is the "come to me" ultimate — the ultimate anti-kite ability.

### Passive — Gravity Well

Enemies within close range (80 units) take 0.5 damage per second from the passive gravity field. Each enemy within range increases the Graviturge's mana regeneration by 1/s. This rewards standing in the middle of packs and makes the class stronger when surrounded.

### How It Breaks Circle-Kiting

The Graviturge's entire kit rewards proximity. Their damage (passive aura + short-range LMB), sustain (mana regen from nearby enemies), and control (Singularity slow zone) all require being close to enemies. Running away makes them weaker, not safer.

### Future Mechanics Needed

- Passive proximity damage aura (per-frame AOE damage around player)
- Mana regen scaling with nearby enemy count
- Ultimate pull effect (teleport enemies toward player position)

---

## 2. Bladecaller

**Archetype:** Skirmisher / Assassin
**Color:** #cc3355 / Glow: #aa2244
**Fantasy:** A blade-dancing assassin who chains kills with resets, dashing through enemy waves like a blender. High risk, high reward melee that moves through enemies, not around them.

### Playstyle

Bladecaller plays like a fighting game character in a roguelike. The core loop is: dash into enemies with Shadow Step, cleave with the cone LMB, and if you get a kill, your dash resets so you can chain through the wave. Blade Toss provides ranged poke and a secondary engage tool. When the chain breaks (you dash in and fail to kill), you are stranded with no escape. The ultimate is the "I'm surrounded and I love it" button.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Blade Slash | Cone | 2.5 dmg, range 55, mana 3, cd 0.3, angle 1.2 |
| RMB | Shadow Step | Leap | 2 dmg, range 140, mana 12, cd 2.5, aoeR 45 |
| Q | Blade Toss | Barrage | 1.5 dmg, speed 450, radius 6, mana 20, cd 6, count 5, spread 0.5, life 0.8 |
| Space | Thousand Cuts | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Blade Slash:** Wide melee cone attack with fast fire rate. Higher damage than most LMBs to compensate for the melee range requirement. The wide angle (1.2 rad) allows hitting multiple enemies per swing.

**RMB — Shadow Step:** A short dash-leap that deals AOE damage on arrival. The key mechanic is the passive's kill-reset — if anything dies within 1.5s of using Shadow Step, it comes off cooldown. This creates the chain-dash fantasy.

**Q — Blade Toss:** A fan of 5 blade projectiles for ranged poke and wave clearing. Used when the Bladecaller needs to soften targets before diving, or when diving isn't safe. Also useful for finishing low-HP stragglers at range.

**Ultimate — Thousand Cuts:** A massive melee burst — the Bladecaller becomes a whirlwind of blades, dealing heavy damage in a large area around them. Used when surrounded by a dense pack to turn certain death into a kill chain.

### Passive — Kill Rush

When the Bladecaller kills an enemy within 1.5 seconds of using Shadow Step (RMB), Shadow Step's cooldown resets immediately. Additionally, each kill grants +10% movement speed for 3 seconds (stacks up to 3 times). This creates the chain-dashing assassin fantasy where momentum builds with each kill.

### How It Breaks Circle-Kiting

Bladecaller moves THROUGH enemies, not around them. Their mobility (Shadow Step) requires a target direction through the pack, not away from it. The kill-reset mechanic means staying aggressive is safer than retreating — a retreating Bladecaller has no dash and no speed boost. The movement pattern is a zigzag through the wave, not a circle around it.

### Future Mechanics Needed

- Kill-reset for RMB cooldown (conditional cooldown reset on kill)
- Temporary movement speed buff on kill (stacking)
- Ultimate whirlwind animation (rapid multi-hit Nova-like effect)

---

## 3. Architect

**Archetype:** Zone Controller
**Color:** #44aacc / Glow: #228899
**Fantasy:** A tactical wizard who deploys constructs and zones to control the battlefield, then fights from within their fortifications. Their power is tied to location, not mobility.

### Playstyle

The Architect sets up a "fortress" of zones and fights within it. Deploy a turret with RMB, scatter mines with Q, and fire homing wrenches from behind your defenses. The playstyle is about choosing WHERE to make a stand, setting up, and holding that position. When enemies overrun a position, the Architect relocates and rebuilds. The ultimate turret provides a massive anchor point.

Note: The Architect is distinguished from the existing Engineer by emphasizing zone stacking and defensive fortification rather than the Engineer's more offensive turret placement. The Architect's turret is shorter-lived but combined with mines and the homing LMB creates layered defense zones.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Arcane Bolt | Homing | 1.5 dmg, speed 320, radius 7, mana 5, cd 0.28, life 1.5, homing 2.0 |
| RMB | Deploy Construct | Zone | 1 dmg, mana 24, cd 6, radius 100, duration 12, tickRate 0.9, slow 0.3 |
| Q | Scatter Mines | Trap | 3 dmg, mana 25, cd 7, radius 40, count 4, spread 1.0, slow 1.5 |
| Space | Mega Construct | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Arcane Bolt:** Homing projectiles that auto-seek enemies. Lower damage than direct-aim projectiles, but the homing lets the Architect focus on positioning and zone management rather than precise aiming.

**RMB — Deploy Construct:** Places a damaging zone that functions like a turret area. Enemies within the zone take tick damage and are slowed. The Architect's main defensive tool — place it in chokepoints or on your position.

**Q — Scatter Mines:** Drops 4 mines in a spread pattern. Mines detonate when enemies walk over them, dealing burst damage and applying a heavy slow. Excellent for controlling approaches and creating kill zones.

**Ultimate — Mega Construct:** Deploys an empowered construct with larger radius, higher damage, and longer duration. The anchor point for an extended defense.

### Passive — Fortification

While standing within the radius of one of the Architect's own zones or near a triggered trap, the Architect takes 20% less damage and regenerates 1 mana per second faster. This rewards staying near your constructs rather than kiting away from them.

### How It Breaks Circle-Kiting

The Architect's power is location-bound. Their zones and mines create a "home base" that they must stay near to benefit from (passive damage reduction). Kiting away from your constructs means abandoning your damage and defense. The optimal play is to hold a chokepoint, not to run.

### Future Mechanics Needed

- Passive damage reduction when near own zones
- Bonus mana regen when near own zones
- Mega Construct ultimate with enhanced zone properties

---

## 4. Hexblade

**Archetype:** Mark-and-Execute Caster
**Color:** #7755cc / Glow: #5533aa
**Fantasy:** A curse specialist who marks enemies for doom, then detonates the marks with followup attacks. Two-step gameplay: apply hex, then execute. Ranged-focused with burst windows on marked targets.

### Playstyle

Since true stance-switching requires new mechanics beyond the 4-spell system, the Hexblade is redesigned as a mark-and-execute caster. The loop is: fire Hex Bolt (LMB) to apply curse marks, use Doom Mark (RMB) for a powerful single-target mark on priority targets, then detonate all marks with Hex Blast (Q) for massive AOE. The ultimate spreads marks to everything nearby and then detonates them all. The Hexblade is a setup/payoff class — patient marking followed by explosive detonation.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Hex Bolt | Projectile | 1.5 dmg, speed 380, radius 8, mana 7, cd 0.3, life 1.2, slow 0.3 |
| RMB | Doom Mark | Homing | 2 dmg, speed 250, radius 12, mana 20, cd 3, life 2.5, homing 3.0 |
| Q | Hex Blast | AoeDelayed | 3 dmg, mana 30, cd 7, delay 0.6, radius 85, stun 0.8 |
| Space | Hexstorm | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Hex Bolt:** Standard ranged projectile with a light slow. Applies a "hex mark" on hit (passive behavior). Hex marks stack up to 3 times per enemy. The slow helps keep marked enemies in range for detonation.

**RMB — Doom Mark:** A homing projectile that seeks out targets. Deals moderate damage and applies a strong hex mark (counts as 2 stacks). The homing ensures it lands on priority targets even in chaotic fights.

**Q — Hex Blast:** Delayed AOE that detonates all hex marks in the area. Base damage plus bonus damage per mark stack on each enemy. The delay gives enemies a chance to scatter, rewarding the Hexblade for having already slowed them with Hex Bolt.

**Ultimate — Hexstorm:** Massive AOE that applies marks to all nearby enemies and then detonates them. The ultimate for dense waves where manual marking would take too long.

### Passive — Hex Mastery

Enemies with hex marks take 25% increased damage from all sources (including ally attacks). Hex marks last 5 seconds and stack up to 3 times. At 3 stacks, the marked enemy is also slowed by 30%. This creates a co-op synergy where the Hexblade marks targets for the ally to burst down.

### How It Breaks Circle-Kiting

The Hexblade must commit to a two-step process: mark, then detonate. Simply spamming LMB while kiting wastes the marks — the Hexblade needs to stop and cast Q to detonate. The delayed AOE on Q also rewards pre-positioning rather than reactive kiting. The mark system creates a rhythm of "apply, apply, apply, DETONATE" that interrupts mindless circle patterns.

### Future Mechanics Needed

- Hex mark system (stacking marks on enemies)
- Mark detonation bonus damage on Q
- Mark amplification (25% increased damage from all sources)
- Ultimate mass-mark-and-detonate effect

---

## 5. Warden

**Archetype:** Directional Tank / Protector
**Color:** #5588aa / Glow: #336688
**Fantasy:** A shield-bearing protector who body-blocks for allies, absorbs damage from the front, and punishes enemies who try to pass. The "stand between danger and your friend" class.

### Playstyle

The Warden positions themselves between enemies and the ally, facing incoming threats. Their LMB is a heavy melee strike that marks enemies for bonus damage. Their RMB is a defensive zone that absorbs damage. Q shields the ally directly. The ultimate creates an invulnerability dome. The Warden's movement is about interposing — getting between threats and the squishy ally — not about creating distance.

Distinguished from the Knight by emphasis on protection over engagement. The Knight charges in; the Warden holds the line.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Guardian Strike | Cone | 2.5 dmg, range 60, mana 4, cd 0.4, angle 1.0 |
| RMB | Bastion | Zone | 0 dmg, mana 20, cd 5, radius 70, duration 3.5, tickRate 0.5, slow 0.5 |
| Q | Aegis Link | AllyShield | mana 25, cd 8, duration 4 |
| Space | Unbreakable | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Guardian Strike:** Heavy melee cone attack. Slower than Berserker's Axe Swing but with good damage. Marks struck enemies so allies deal bonus damage to them (passive behavior).

**RMB — Bastion:** Creates a protective zone at the Warden's position. Allies inside take reduced damage (behavior coded in passive/systems). Enemies inside are slowed. The Warden fights inside this zone, making it a "safe area" they anchor to.

**Q — Aegis Link:** Shields the ally player, absorbing damage for a duration. The Warden's core co-op ability. In solo play, self-casts for personal defense.

**Ultimate — Unbreakable:** Creates a massive shield dome. All allies inside are protected from damage for a short duration. Enemies inside are slowed. The Warden is rooted during the dome, committing fully to the defensive position.

### Passive — Sentinel

The Warden takes 20% less damage from enemies they are facing (within a 90-degree forward arc). Additionally, enemies that attack the Warden within melee range are marked — allies deal +1 bonus damage to marked enemies. This rewards facing threats head-on rather than turning to run.

### How It Breaks Circle-Kiting

The Warden's passive rewards facing enemies, which means moving toward threats, not away. Their protection abilities (Bastion zone, Aegis Link, Unbreakable) all anchor them to a position. The Warden's optimal play is to plant themselves in a doorway or chokepoint, face the wave, and let the ally deal damage from behind them. This is body-blocking, not kiting.

### Future Mechanics Needed

- Directional damage reduction (check player facing vs damage source angle)
- Mark system for Guardian Strike (marked enemies take bonus damage from allies)
- Bastion zone damage reduction for allies inside
- Ultimate invulnerability dome with player root

---

## 6. Cannoneer

**Archetype:** Artillery / Marksman
**Color:** #aa7733 / Glow: #885522
**Fantasy:** A siege wizard with massive, slow power shots and long-range bombardment. Every shot counts. Methodical and deliberate — the sniper of Spellstorm.

### Playstyle

The Cannoneer fires slow, powerful projectiles that reward accuracy over spam. Their LMB is a heavy shot with high damage but slow fire rate. RMB is an explosive blast for self-peel and area denial. Q drops caltrops for zone control while repositioning. The ultimate roots the Cannoneer for a devastating long-range barrage. The playstyle is "set up, fire, relocate" — a siege rhythm rather than constant-motion kiting.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Power Shot | Projectile | 3 dmg, speed 500, radius 11, mana 10, cd 0.5, life 1.5, explode 40, pierce 1 |
| RMB | Concussive Shell | AoeDelayed | 2 dmg, mana 18, cd 3.5, delay 0.4, radius 60, stun 0.8 |
| Q | Caltrops | Trap | 2 dmg, mana 15, cd 5, radius 55, slow 2.5, count 2, spread 0.6 |
| Space | Artillery Barrage | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Power Shot:** High-damage, slow-firing projectile that explodes on impact and pierces one enemy. Each shot is meaningful — missing hurts because of the long cooldown and high mana cost. The explosion radius means clumped enemies are ideal targets.

**RMB — Concussive Shell:** A delayed AOE blast that stuns enemies caught in the radius. Used for self-peel (drop it at your feet when enemies close in) or for setting up a Power Shot on stunned targets.

**Q — Caltrops:** Drops traps that damage and heavily slow enemies walking over them. Creates safe corridors for the Cannoneer to retreat through, or deny approaches to force enemies through killzones.

**Ultimate — Artillery Barrage:** The Cannoneer calls down a devastating barrage at the target area. Massive damage, large radius, punishes clumped enemies. The ultimate reward for careful positioning and wave reading.

### Passive — Heavy Caliber

Every 4th LMB shot deals double damage and has double explosion radius. The Cannoneer's shots have 20% larger base explosion radius. This creates a "count your shots" rhythm — the 4th shot is the big payoff, so the Cannoneer wants to land it on the most valuable target.

### How It Breaks Circle-Kiting

The Cannoneer's slow fire rate (0.5s cd) and high mana cost per shot (10 mana) means they cannot spam while kiting. Every shot must count. The high projectile damage rewards stopping to aim carefully rather than firing in the general direction of enemies. The caltrops create safe zones that encourage holding ground, and the ultimate's massive power requires pre-positioning.

### Future Mechanics Needed

- 4th-shot empowerment counter system
- Enhanced explosion radius passive
- Ultimate barrage effect (multiple delayed AOEs in target area)

---

## 7. Soulbinder

**Archetype:** Catcher / Enchanter
**Color:** #55aa88 / Glow: #338866
**Fantasy:** A spirit mage who binds souls together — tethering enemies in place and empowering allies with soul energy. The bridge between offense and support.

### Playstyle

The Soulbinder plays at medium range, applying soul marks with their beam LMB and locking down priority targets with the homing Spirit Chain. They empower allies with Soul Surge, making the partner's attacks detonate marks for bonus damage. The ultimate tethers everything nearby for a massive stun payoff if the Soulbinder can hold position. The class excels in co-op, where mark-and-detonate synergy with the ally creates burst windows.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Soul Lash | Beam | 1.5 dmg, range 220, mana 6, cd 0.28, width 3 |
| RMB | Spirit Chain | Homing | 2 dmg, speed 260, radius 10, mana 18, cd 3.5, life 2.5, homing 3.5, slow 1.2 |
| Q | Soul Surge | Zone | 0 dmg, mana 30, cd 8, radius 80, duration 4, tickRate 0.8, heal 1.5 |
| Space | Soul Storm | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Soul Lash:** Instant-hit beam that applies soul marks. The beam's instant nature means the Soulbinder doesn't need to lead targets, freeing mental bandwidth for positioning and mark management.

**RMB — Spirit Chain:** A homing projectile that seeks enemies and applies a heavy slow. Represents the "chain" tether fantasy — the homing ensures it connects, and the slow holds the target in place.

**Q — Soul Surge:** A healing zone that empowers allies within it. Placed at the ally's position to boost their effectiveness. The heal keeps the partner alive while the soul marks amplify their damage.

**Ultimate — Soul Storm:** Massive AOE that damages and stuns all enemies nearby. The "soul tether" payoff — represents all soul connections detonating at once.

### Passive — Soul Bond

Enemies hit by Soul Lash (LMB) are marked with Soul Mark for 4 seconds. Allies dealing damage to soul-marked enemies deal +1 bonus damage per hit and heal 0.5 HP per mark detonation. In solo play, the Soulbinder's own RMB and Q damage detonates marks for the bonus. This creates a mark-and-detonate co-op synergy.

### How It Breaks Circle-Kiting

The Soulbinder's beam LMB has fixed range (220 units), requiring them to maintain a specific distance — not too far (out of range) and not too close (in danger). The mark-and-detonate system requires coordination and timing rather than mindless kiting. Soul Surge placement requires reading the battlefield to position the healing zone where the ally needs it, not where the kiting path leads.

### Future Mechanics Needed

- Soul Mark system (applied by LMB, detonated by ally attacks)
- Mark detonation bonus damage and healing
- Ultimate AOE stun effect

---

## 8. Invoker

**Archetype:** Adaptive / Elemental
**Color:** #cc8844 / Glow: #aa6622
**Fantasy:** A master of all elements who weaves fire, ice, lightning, and arcane into a constantly shifting assault. No two rotations are the same.

### Playstyle

The Invoker fires elemental projectiles with varying effects — their LMB applies burn, their RMB applies slow, creating a natural "burn, then slow, then burst" rhythm. The Q provides a powerful delayed AOE for area denial. The ultimate is a massive barrage of mixed-element projectiles. The class plays like a well-rounded caster with more effect variety than any other class, rewarding players who adapt their ability usage to the situation.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Flame Bolt | Projectile | 2 dmg, speed 400, radius 8, mana 7, cd 0.3, life 1.1, burn 2 |
| RMB | Frost Spike | Projectile | 1.5 dmg, speed 480, radius 7, mana 16, cd 2, life 1.0, slow 1.5, pierce 1 |
| Q | Storm Strike | AoeDelayed | 3.5 dmg, mana 35, cd 9, delay 0.7, radius 70, stun 0.8 |
| Space | Elemental Convergence | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Flame Bolt:** Fire-element projectile that burns enemies. The burn DOT provides sustained damage over time, rewarding consistent application.

**RMB — Frost Spike:** Ice-element projectile that slows and pierces. Used to lock down priority targets or slow approaching packs. The pierce allows hitting multiple enemies in a line.

**Q — Storm Strike:** Lightning-element delayed AOE that stuns on detonation. The delayed nature rewards pre-positioning — drop it where enemies will be, not where they are.

**Ultimate — Elemental Convergence:** The Invoker unleashes all elements at once in a massive burst. The ultimate fantasy of elemental mastery — fire, ice, and lightning converging on the target area.

### Passive — Elemental Attunement

Each element applied to an enemy interacts with other elements already on that target. Burning enemies that are slowed take +1 damage per tick (thermal shock). Stunned enemies that are burning take double burn damage (superheated). This creates a combo system where applying elements in the right order maximizes damage: slow (RMB) then burn (LMB) then stun (Q) for maximum effect.

### How It Breaks Circle-Kiting

The Invoker must apply elements in a specific order for maximum damage, which requires deliberate ability sequencing rather than LMB spam. The element interaction system rewards paying attention to enemy debuff states — which enemies are burning, which are slowed, which are stunned — rather than mindlessly kiting. Each ability serves a different purpose in the combo chain, forcing varied engagement patterns.

### Future Mechanics Needed

- Element interaction system (bonus damage when multiple elements are on the same target)
- Burn + slow interaction (thermal shock bonus)
- Stun + burn interaction (superheated bonus)
- Ultimate multi-element burst effect

---

## 9. Tidecaller

**Archetype:** Summoner / Controller
**Color:** #3388bb / Glow: #226699
**Fantasy:** A water/tide wizard who summons crashing waves and water elementals to overwhelm enemies. Manages a small army while controlling the flow of battle.

### Playstyle

The Tidecaller summons water elementals with Q (using the existing summon/Ultimate SpellType pattern from Druid's Spirit Wolf) and supports them with a slowing wave zone (RMB) while poking with homing LMB. The class excels at creating a "high-tide" state where multiple elementals are active and the battlefield is covered in slowing water zones. The ultimate summons a massive tidal wave that sweeps across the field.

Distinguished from the Necromancer by theme (water vs death), by the LMB being homing (Necro has drain projectile), and by the Tidecaller's zones providing slow rather than drain. The Druid's Spirit Wolf is a single Q summon; the Tidecaller makes summoning a core identity.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Water Bolt | Homing | 1.5 dmg, speed 340, radius 7, mana 6, cd 0.28, life 1.8, homing 2.5 |
| RMB | Tidal Wave | Cone | 2 dmg, range 130, mana 22, cd 3, angle 0.9, slow 1.5 |
| Q | Summon Elemental | Ultimate | ultCharge 0, mana 35, cd 10 |
| Space | Tsunami | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Water Bolt:** Homing water projectiles that seek enemies. The homing allows the Tidecaller to focus on managing summons and zone placement rather than precise aiming.

**RMB — Tidal Wave:** A cone of rushing water that deals damage and heavily slows enemies caught in it. Used to protect summons by slowing advancing enemies, or to create choke points.

**Q — Summon Elemental:** Summons a water elemental ally (using the existing summon mechanic from Druid/Warlock). The elemental fights autonomously, chasing and attacking nearby enemies. Multiple casts stack elementals up to a passive-defined cap.

**Ultimate — Tsunami:** A devastating wave that crashes across the battlefield. Massive damage, wide coverage, and knockback. The ultimate "flood" that turns the tide of battle.

### Passive — Rising Tide

Each active summon increases the Tidecaller's ability damage by 10% (up to 3 summons = +30%). Additionally, Water Bolt applies a 0.3s slow, enhanced to 0.6s when 2+ summons are active. This creates a feedback loop: more summons = more damage = faster kills = more opportunities to summon.

### How It Breaks Circle-Kiting

The Tidecaller must manage summon positioning and lifespan, which requires spatial awareness beyond "run in circles." Summons fight at their own pace, and the Tidecaller needs to support them with Tidal Wave slows and Water Bolt damage. The class plays more like a commander than a gunner — reading the battlefield to deploy resources where they are needed.

### Future Mechanics Needed

- Summon damage scaling (passive: summon count boosts ability damage)
- Enhanced slow when summons are active
- Summon cap tracking
- Ultimate wave sweep effect

---

## 10. Voidweaver

**Archetype:** Trapper / Debuffer
**Color:** #aa44cc / Glow: #882299
**Fantasy:** A void corruption specialist who fills the battlefield with hazards, traps, and debilitating zones. Enemies don't die to direct damage — they die to the accumulated horror of walking through a poisoned, trapped wasteland.

### Playstyle

The Voidweaver is the ultimate zone-denial class. LMB fires a slow, damaging projectile that leaves a brief trail of corruption. RMB creates a large debuff zone that weakens enemies inside. Q scatters void traps across the battlefield. The class plays like a spider spinning a web — laying down layers of hazards and then watching enemies walk through them. Direct combat ability is low; area denial is unmatched.

Distinguished from the Ranger (who has one trap on Q) by making traps and zones the ENTIRE identity. Distinguished from the Engineer (turrets/gadgets) by focusing on debuffs and DOT rather than direct turret fire.

### Ability Kit

| Slot | Name | SpellType | Key Stats |
|------|------|-----------|-----------|
| LMB | Void Bolt | Projectile | 1.5 dmg, speed 320, radius 9, mana 6, cd 0.32, life 1.2, burn 3, slow 0.4 |
| RMB | Corruption Zone | Zone | 1 dmg, mana 22, cd 4, radius 90, duration 5, tickRate 0.6, slow 1.0 |
| Q | Void Traps | Trap | 3 dmg, mana 25, cd 6, radius 50, count 3, spread 0.9, slow 2.0 |
| Space | Void Rift | Ultimate | ultCharge 100, mana 0, cd 0 |

**LMB — Void Bolt:** Projectile that applies both burn (DOT) and slow. The dual debuff means every hit starts degrading the enemy — slowed and burning. Moderate damage because the DOT does the real work.

**RMB — Corruption Zone:** A large persistent zone that damages and slows enemies inside. Covers a wide area (90 radius) to deny large sections of the room. Enemies walking through take continuous tick damage and are slowed, making them easy targets.

**Q — Void Traps:** Scatters 3 traps in a spread pattern. Each trap detonates for burst damage and applies a very heavy slow (2.0). Used to mine approaches, doorways, and predicted enemy paths.

**Ultimate — Void Rift:** Opens a massive void rift that corrupts a huge area. Extreme damage, huge radius, and lingering effects. The ultimate "you walked into my web" payoff.

### Passive — Entropic Decay

Enemies affected by any Voidweaver debuff (burn, slow, or zone damage) take 15% increased damage from ALL sources for the duration of the debuff. When an enemy dies while affected by a Voidweaver debuff, they explode for 1 damage to nearby enemies, spreading corruption. This creates chain reactions in dense packs.

### How It Breaks Circle-Kiting

The Voidweaver doesn't need to kite at all — they need to PREPARE. The optimal play pattern is to mine the room before enemies arrive (between waves), place zones at chokepoints, and then watch from a safe position as enemies walk through layers of traps and zones. During combat, the Voidweaver adds more traps and zones where enemies are clustering. It is a proactive, predictive playstyle rather than reactive kiting.

### Future Mechanics Needed

- Passive damage amplification on debuffed enemies
- Death explosion for debuffed enemies (corruption spread)
- Ultimate massive zone with lingering effects

---

## Summary: Class Differentiation Matrix

| Class | Range | Mobility | Damage Pattern | Defensive Tool | Co-op Role |
|-------|-------|----------|----------------|----------------|------------|
| Graviturge | Short | Low | Sustained AOE aura | Self-sustain from proximity | Frontline tank/DPS |
| Bladecaller | Melee | Very High (kill-reset) | Burst melee combo | Kill-chain mobility | Assassin/cleaner |
| Architect | Medium | Low | Zone/turret sustained | Fortification zones | Area denial |
| Hexblade | Medium-Long | Low | Mark-detonate burst | Slow from marks | Debuffer/burst |
| Warden | Melee | Low | Melee + mark for ally | Directional shield, ally shield | Protector/tank |
| Cannoneer | Long | Low | Heavy single shots | Caltrops, stun shell | Artillery DPS |
| Soulbinder | Medium | Low | Beam + mark system | Healing zone | Support/debuffer |
| Invoker | Medium | Low | Multi-element DOT/CC | Element combo flexibility | Versatile DPS |
| Tidecaller | Medium | Low | Summon + homing | Summon army tanking | Summoner/controller |
| Voidweaver | Medium | Low | Trap/zone DOT | Zone denial | Area denial/debuffer |

## Comparison with Existing Classes

Each new class fills a niche not covered by the existing 14:

- **Graviturge** — No existing class rewards being surrounded. Berserker is melee but kites between leaps.
- **Bladecaller** — No existing class has kill-reset mobility chains. Monk is fast melee but lacks the chain-dash.
- **Architect** — Engineer has turrets, but Architect adds layered zone defense and fortification identity.
- **Hexblade** — No existing class has mark-and-detonate burst. Arcanist has homing but no mark system.
- **Warden** — Knight is a tank but engages; Warden holds ground and protects directionally.
- **Cannoneer** — Ranger is ranged DPS but fast/light; Cannoneer is slow/heavy with deliberate shots.
- **Soulbinder** — Paladin supports with heals; Soulbinder supports with marks and beam-based debuffs.
- **Invoker** — No existing class has multi-element interactions or ordered combos.
- **Tidecaller** — Necromancer summons undead via ultimate; Tidecaller makes summoning the core Q ability.
- **Voidweaver** — No existing class makes traps and zone DOT the entire identity.
