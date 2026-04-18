import { EnemyAI, EnemyDef } from '../types';

export const ENEMIES: Record<string, EnemyDef> = {
  slime: { name: 'Slime', hp: 2, speed: 55, size: 11, color: '#44cc44', dmg: 1, xp: 3, gold: 1, ai: EnemyAI.Chase, atkR: 20, atkCd: 1 },
  bat: { name: 'Bat', hp: 1, speed: 120, size: 8, color: '#8866aa', dmg: 1, xp: 3, gold: 1, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.7 },
  skeleton: { name: 'Skeleton', hp: 3, speed: 70, size: 11, color: '#ccbb88', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Ranged, atkR: 220, atkCd: 1.4, projSpd: 280, projCol: '#ddcc99' },
  wraith: { name: 'Wraith', hp: 3, speed: 130, size: 10, color: '#8855cc', dmg: 2, xp: 8, gold: 3, ai: EnemyAI.Chase, atkR: 18, atkCd: 0.8, phase: true },
  golem: { name: 'Golem', hp: 20, speed: 35, size: 24, color: '#886644', dmg: 3, xp: 20, gold: 10, ai: EnemyAI.Chase, atkR: 32, atkCd: 2, boss: true },
  demon: { name: 'Demon', hp: 25, speed: 50, size: 22, color: '#cc3333', dmg: 3, xp: 25, gold: 12, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.2, projSpd: 350, projCol: '#ff4422', boss: true },
  spider: { name: 'Spider', hp: 3, speed: 100, size: 9, color: '#665544', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Chase, atkR: 16, atkCd: 0.6 },
  spiderling: { name: 'Spiderling', hp: 1, speed: 110, size: 6, color: '#887766', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.5 },
  necro: { name: 'Necro', hp: 5, speed: 50, size: 12, color: '#55aa77', dmg: 1, xp: 8, gold: 3, ai: EnemyAI.Ranged, atkR: 250, atkCd: 1.6, projSpd: 250, projCol: '#77cc99' },
  shieldbearer: { name: 'Shield Bearer', hp: 8, speed: 40, size: 14, color: '#7788aa', dmg: 2, xp: 10, gold: 4, ai: EnemyAI.Chase, atkR: 24, atkCd: 1.5 },
  assassin: { name: 'Assassin', hp: 2, speed: 160, size: 8, color: '#334455', dmg: 3, xp: 8, gold: 3, ai: EnemyAI.Chase, atkR: 16, atkCd: 1.2 },
  swarm_bat: { name: 'Swarm Bat', hp: 1, speed: 140, size: 6, color: '#9977bb', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.6 },
  archlord: { name: 'Archlord', hp: 125, speed: 45, size: 28, color: '#ffaa00', dmg: 3, xp: 50, gold: 25, ai: EnemyAI.Ranged, atkR: 280, atkCd: 1.5, projSpd: 350, projCol: '#ffcc44', boss: true },
  _ally: { name: 'Skeleton', hp: 4, speed: 80, size: 9, color: '#55cc55', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.8 },
  _wolf: { name: 'Wolf', hp: 8, speed: 120, size: 10, color: '#88aa66', dmg: 2, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 20, atkCd: 0.6 },
  _imp: { name: 'Imp', hp: 5, speed: 90, size: 8, color: '#cc4466', dmg: 1, xp: 0, gold: 0, ai: EnemyAI.Ranged, atkR: 150, atkCd: 1.0, projSpd: 300, projCol: '#ff5577' },
  _skeleton: { name: 'Bone Warrior', hp: 6, speed: 95, size: 10, color: '#ddccaa', dmg: 3, xp: 0, gold: 0, ai: EnemyAI.Chase, atkR: 22, atkCd: 0.7 },
  bomber: { name: 'Bomber', hp: 4, speed: 45, size: 12, color: '#cc6622', dmg: 1, xp: 7, gold: 2, ai: EnemyAI.Chase, atkR: 20, atkCd: 1.2, explodeOnDeath: 60 },
  teleporter: { name: 'Teleporter', hp: 3, speed: 70, size: 9, color: '#aa33cc', dmg: 2, xp: 10, gold: 3, ai: EnemyAI.Chase, atkR: 18, atkCd: 0.9, teleport: true },
  splitter: { name: 'Splitter', hp: 5, speed: 60, size: 13, color: '#448844', dmg: 1, xp: 5, gold: 2, ai: EnemyAI.Chase, atkR: 22, atkCd: 1.0, splitInto: 'splitling' },
  splitling: { name: 'Splitling', hp: 1, speed: 110, size: 7, color: '#66aa66', dmg: 1, xp: 2, gold: 0, ai: EnemyAI.Chase, atkR: 14, atkCd: 0.5 },
  berserker: { name: 'Berserker', hp: 6, speed: 50, size: 11, color: '#cc2222', dmg: 3, xp: 10, gold: 4, ai: EnemyAI.Chase, atkR: 22, atkCd: 1.0, enrage: true },
};

export const BOSS_HP_EXPONENT = 1.6;
export const BOSS_HP_EXPONENT_DIVISOR = 5;
export const TIME_SCALING_FACTOR = 0.12;
export const ENEMY_HP_WAVE_MULT = 0.03;
export const CO_OP_HP_MULTIPLIER = 1.5;
