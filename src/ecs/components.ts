export class Position {
  x: number = 0;
  y: number = 0;
}

export class Velocity {
  vx: number = 0;
  vy: number = 0;
}

export class Health {
  hp: number = 0;
  maxHp: number = 0;
  iframes: number = 0;
}

export class Mana {
  mana: number = 0;
  maxMana: number = 0;
  regen: number = 0;
}

export const enum CollisionLayer {
  Player       = 1 << 0,
  Enemy        = 1 << 1,
  PlayerSpell  = 1 << 2,
  EnemyProj    = 1 << 3,
  Pickup       = 1 << 4,
  Pillar       = 1 << 5,
  Zone         = 1 << 6,
}

export class Collider {
  radius: number = 0;
  layer: number = 0;
  mask: number = 0;
}

export const enum RenderShape {
  Circle,
  Rect,
  Beam,
  Text,
  Shockwave,
  Zone,
  AoeMarker,
  Trail,
}

export class Render {
  shape: RenderShape = RenderShape.Circle;
  color: string = '#ffffff';
  size: number = 0;
  alpha: number = 1;
  trailColor: string = '';
}

export class Movement {
  speed: number = 0;
  slowTimer: number = 0;
  stunTimer: number = 0;
}

export class SpellData {
  type: string = '';
  dmg: number = 0;
  homing: number = 0;
  pierce: number = 0;
  pierceLeft: number = 0;
  explode: number = 0;
  burn: number = 0;
  slow: number = 0;
  drain: number = 0;
  stun: number = 0;
  zap: number = 0;
  zapRate: number = 0;
  zapTimer: number = 0;
  clsKey: string = '';
  reversed: boolean = false;
  bounces: number = 0;
}

export class EnemyAIData {
  aiType: string = 'chase';
  enemyType: string = '';
  target: number = 0;
  atkTimer: number = 0;
  atkAnim: number = 0;
  spdMul: number = 1;
  dmgMul: number = 1;
  teleportTimer: number = 0;
  dmgReductionActive: boolean = false;
  dmgReductionTimer: number = 0;
  dmgReductionTriggered: boolean = false;
  elite: boolean = false;
}

export class PlayerInputData {
  angle: number = 0;
  mx: number = 0;
  my: number = 0;
  shoot: boolean = false;
  shoot2: boolean = false;
  ability: boolean = false;
  ult: boolean = false;
  dash: boolean = false;
}

export class Cooldowns {
  cd: number[] = [];
  ultCharge: number = 0;
  ultReady: boolean = false;
}

export class StatusEffects {
  burnTimer: number = 0;
  burnTick: number = 0;
  burnOwner: number = 0;
  slowTimer: number = 0;
  stunTimer: number = 0;
}

export class NetworkSync {
  targetX: number = 0;
  targetY: number = 0;
  prevX: number = 0;
  prevY: number = 0;
  lerpT: number = 0;
  serverVx: number = 0;
  serverVy: number = 0;
}

export class Lifetime {
  age: number = 0;
  maxLife: number = 0;
}

export class Upgrades {
  takenUpgrades: Map<number, number> = new Map();

  vampirism: number = 0;
  pierce: number = 0;
  armor: number = 0;
  critChance: number = 0;
  critMul: number = 1;
  splitShot: number = 0;
  ricochet: number = 0;
  chainHit: number = 0;
  doubleTap: number = 0;
  manaOnKill: number = 0;
  manaOnHit: number = 0;
  lifeSteal: number = 0;
  secondWind: number = 0;
  thorns: number = 0;
  dodgeChance: number = 0;
  hpRegen: number = 0;
  magnetRange: number = 0;
  goldMul: number = 1;
  xpBoost: number = 0;
  damageTakenMul: number = 1;
  selfDmgChance: number = 0;

  overkill: boolean = false;
  killResetCD: boolean = false;
  chainFullDmg: boolean = false;
  hasDash: boolean = false;
  momentum: boolean = false;
  aftershock: boolean = false;
  chaosDmg: boolean = false;
  selfDmg: boolean = false;
  boomerang: boolean = false;
  volatile: boolean = false;
  forkOnKill: boolean = false;
  gravityWell: boolean = false;
  spectral: boolean = false;
  frozenTouch: boolean = false;
  seekerMines: boolean = false;
  burstFire: boolean = false;

  burnSpread: boolean = false;
  magmaArmor: boolean = false;
  fireZoneOnExplode: boolean = false;
  shatter: boolean = false;
  permafrost: boolean = false;
  iceArmor: boolean = false;
  chainLightning: number = 0;
  overcharge: boolean = false;
  stormShield: boolean = false;
  _thunderGod: number = 0;
  _channelDetStacks: number = 0;
  blinkExplode: boolean = false;
  spellMirror: number = 0;
  raiseDead: number = 0;
  deathMark: boolean = false;
  soulWell: boolean = false;
  timeLoop: number = 0;
  hasteZone: boolean = false;
  temporalEcho: boolean = false;
  _timeLoopUsed: boolean = false;
  _hasteTimer: number = 0;
  shieldBounce: number = 0;
  tauntAura: boolean = false;
  bloodlust: boolean = false;
  undyingRage: number = 0;
  reflectShield: boolean = false;
  resurrection: boolean = false;
  packLeader: boolean = false;
  overgrowthHeal: boolean = false;
  barkSkinRegen: boolean = false;
  soulSiphon: boolean = false;
  demonicPact: boolean = false;
  hexChain: number = 0;
  zenMana: boolean = false;
  turretArmy: boolean = false;
  laserTurret: boolean = false;
  turretExplode: boolean = false;

  _hyperAcc: Record<string, number> = {};
  _baseSpellDmg: number[] = [];
}

export class Animation {
  castFlash: number = 0;
  hitFlash: number = 0;
  deathTimer: number = -1;
  moving: boolean = false;
  ultTimer: number = 0;
  respawnTimer: number = 0;
}

export class TeamTag {
  owner: number = 0;
  friendly: boolean = true;
}

export class PlayerIdentity {
  idx: number = 0;
  clsKey: string = '';
  cls: any = null;
  hitCounter: number = 0;
  killCount: number = 0;
  xp: number = 0;
  xpToNext: number = 0;
  level: number = 0;
}

export class ClassAbilities {
  snapTimer: number = 0;
  rewindSnap: { hp: number; mana: number } | null = null;
  hasteBonus: boolean = false;
  furyActive: boolean = false;
  auraTick: number = 0;
  timeStopTimer: number = 0;
  rage: number = 0;
  rageDmgMul: number = 1;
  shieldWall: number = 0;
  holyShield: number = 0;
  stormTimer: number = 0;
  bloodlustStacks: number = 0;
  dashCd: number = 0;
}

export class SecondaryUpgrades {
  doubleQ: number = 0;
  doubleSecondary: number = 0;
  comboBonus: boolean = false;
  ultChargeRate: number = 1;
  ultPower: number = 1;
  ultOverflow: boolean = false;
  ultEcho: number = 0;
  ultEchoLeft: number = 0;
  ultHeal: boolean = false;
  ultResetCDs: boolean = false;
  spellWeaving: boolean = false;
  spellWeaveStack: number = 0;
  lastSpellSlot: number = -1;
  cdCascade: boolean = false;
  fullRotation: boolean = false;
  fullRotationTimer: number = 0;
  fullRotationSpells: number = 0;
  fullRotationBuff: number = 0;
}

export class ZoneData {
  dmg: number = 0;
  slow: number = 0;
  tickRate: number = 0;
  tickTimer: number = 0;
  drain: number = 0;
  heal: number = 0;
  pull: number = 0;
  freezeAfter: number = 0;
  isTurret: boolean = false;
  isMegaTurret: boolean = false;
}

export class AoeData {
  dmg: number = 0;
  delay: number = 0;
  stun: number = 0;
}
