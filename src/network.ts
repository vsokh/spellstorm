import Peer, { DataConnection } from 'peerjs';
import { GameState, shake, spawnParticles, spawnText, spawnShockwave } from './state';
import {
  GamePhase,
  NetworkMode,
  NetMessage,
  NetStateMessage,
  PickupType,
  Enemy,
} from './types';
import { UPGRADE_POOL, CLASSES } from './constants';
import { initAudio } from './audio';
import { showUpgradeFromHost, checkBothPicked, finishUpgrade } from './systems/upgrades';

// ═══════════════════════════════════
//       MESSAGE VALIDATION
// ═══════════════════════════════════

const VALID_MSG_TYPES = new Set(['input', 'cls', 'go', 'upgrade', 'host_picked', 'guest_picked', 'resume', 'state']);

function isNetMessage(msg: unknown): msg is NetMessage {
  return typeof msg === 'object' && msg !== null && 'type' in msg &&
    typeof (msg as Record<string, unknown>).type === 'string' &&
    VALID_MSG_TYPES.has((msg as Record<string, unknown>).type as string);
}

const GAME_PHASES = new Set(Object.values(GamePhase));

function isGamePhase(v: unknown): v is GamePhase {
  return typeof v === 'string' && GAME_PHASES.has(v as GamePhase);
}

// ═══════════════════════════════════
//       FRIENDLY ERROR MESSAGES
// ═══════════════════════════════════

function friendlyPeerError(type: string): string {
  switch (type) {
    case 'peer-unavailable': return 'Room not found — check the code and try again';
    case 'network': return 'Network error — check your internet connection';
    case 'server-error': return 'Connection server unavailable — try again later';
    case 'browser-incompatible': return 'Your browser does not support peer connections';
    case 'disconnected': return 'Disconnected from server — try refreshing';
    case 'unavailable-id': return 'Room code already in use — try hosting again';
    default: return 'Connection error: ' + type;
  }
}

// ═══════════════════════════════════
//          NETWORKING
// ═══════════════════════════════════

let peer: Peer | null = null;
let conn: DataConnection | null = null;
let sendFailCount = 0;

// Callbacks set by main.ts to break circular deps
let onShowSelect: (() => void) | null = null;
let onStartWithClasses: ((c1: string, c2: string) => void) | null = null;

export function setNetworkCallbacks(
  showSelect: () => void,
  startWithClasses: (c1: string, c2: string) => void,
): void {
  onShowSelect = showSelect;
  onStartWithClasses = startWithClasses;
}

export function getConnection(): DataConnection | null {
  if (conn && !conn.open) return null;
  return conn;
}

export function sendMessage(state: GameState, msg: NetMessage): void {
  if (!conn || !conn.open) return;
  try {
    conn.send(msg);
    sendFailCount = 0;
  } catch (e) {
    console.warn('sendMessage failed:', e);
    sendFailCount++;
    if (sendFailCount >= 3) {
      const errorMsg = document.getElementById('error-msg');
      if (errorMsg) errorMsg.textContent = 'Connection unstable — messages failing to send';
      sendFailCount = 0;
    }
  }
}

// ═══════════════════════════════════
//       HOST GAME
// ═══════════════════════════════════

export function hostGame(state: GameState): void {
  initAudio();
  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const hostInfo = document.getElementById('host-info');
  const roomCode = document.getElementById('room-code');
  const hostStatus = document.getElementById('host-status');
  const errorMsg = document.getElementById('error-msg');

  if (hostInfo) hostInfo.style.display = 'block';
  if (roomCode) roomCode.textContent = code;
  if (hostStatus) hostStatus.textContent = 'creating...';

  try {
    peer = new Peer('wcrawl-' + code);
  } catch (_e) {
    if (errorMsg) errorMsg.textContent = 'Failed to create room — check your connection';
    return;
  }

  peer.on('open', () => {
    if (hostStatus) hostStatus.textContent = 'waiting for partner...';
  });

  peer.on('connection', (c: DataConnection) => {
    conn = c;
    conn.on('open', () => {
      state.mode = NetworkMode.Host;
      state.localIdx = 0;
      if (hostStatus) hostStatus.textContent = 'connected!';
      setTimeout(() => { if (onShowSelect) onShowSelect(); }, 400);
    });

    conn.on('data', (msg: unknown) => {
      if (!isNetMessage(msg)) return;
      if (msg.type === 'input') {
        state.remoteInput = {
          angle: msg.angle,
          mx: msg.mx,
          my: msg.my,
          shoot: msg.shoot,
          shoot2: msg.shoot2,
          ability: msg.ability,
          ult: msg.ult,
          dash: msg.dash,
        };
      }
      if (msg.type === 'cls') {
        if (typeof msg.cls !== 'string' || !(msg.cls in CLASSES)) return;
        if (onStartWithClasses && state.hostClassKey) {
          conn!.send({ type: 'go', h: state.hostClassKey, g: msg.cls });
          onStartWithClasses(state.hostClassKey, msg.cls);
        } else {
          state.guestClassKey = msg.cls;
        }
      }
      if (msg.type === 'guest_picked') {
        const idx = msg.idx;
        if (!Number.isInteger(idx) || idx < 0 || idx >= UPGRADE_POOL.length) return;
        const up = UPGRADE_POOL[idx];
        if (up && state.players[1]) {
          const newCount = (state.players[1].takenUpgrades.get(idx) || 0) + 1;
          state.players[1].takenUpgrades.set(idx, newCount);
          up.apply(state.players[1], newCount);
        }
        state.upgradePickedRemote = true;
        checkBothPicked(state);
      }
    });

    conn.on('close', () => {
      if (errorMsg) errorMsg.textContent = 'Partner disconnected';
    });
  });

  peer.on('error', (e: { type: string }) => {
    if (errorMsg) errorMsg.textContent = friendlyPeerError(e.type);
  });
}

// ═══════════════════════════════════
//       JOIN GAME
// ═══════════════════════════════════

export function joinGame(state: GameState): void {
  initAudio();
  const joinCodeEl = document.getElementById('join-code') as HTMLInputElement | null;
  const joinStatus = document.getElementById('join-status');
  const errorMsg = document.getElementById('error-msg');

  const code = joinCodeEl?.value.toUpperCase().trim() || '';
  if (!code) {
    if (errorMsg) errorMsg.textContent = 'Enter code';
    return;
  }

  if (joinStatus) joinStatus.textContent = 'connecting...';

  try {
    peer = new Peer();
  } catch (_e) {
    if (errorMsg) errorMsg.textContent = 'Failed to connect — check your connection';
    return;
  }

  peer.on('open', () => {
    conn = peer!.connect('wcrawl-' + code, { reliable: true });

    conn.on('open', () => {
      state.mode = NetworkMode.Guest;
      state.localIdx = 1;
      if (joinStatus) joinStatus.textContent = 'connected!';
      setTimeout(() => { if (onShowSelect) onShowSelect(); }, 400);
    });

    conn.on('data', (msg: unknown) => {
      if (!isNetMessage(msg)) return;
      if (msg.type === 'state') {
        applyState(state, msg);
      }
      if (msg.type === 'go') {
        if (!(msg.h in CLASSES) || !(msg.g in CLASSES)) return;
        if (onStartWithClasses) onStartWithClasses(msg.h, msg.g);
      }
      if (msg.type === 'upgrade') {
        if (!Array.isArray(msg.indices)) return;
        const valid = msg.indices.filter(i => Number.isInteger(i) && i >= 0 && i < UPGRADE_POOL.length);
        if (valid.length > 0) showUpgradeFromHost(state, valid);
      }
      if (msg.type === 'host_picked') {
        const idx = msg.idx;
        if (!Number.isInteger(idx) || idx < 0 || idx >= UPGRADE_POOL.length) return;
        const up = UPGRADE_POOL[idx];
        if (up && state.players[0]) {
          const newCount = (state.players[0].takenUpgrades.get(idx) || 0) + 1;
          state.players[0].takenUpgrades.set(idx, newCount);
          up.apply(state.players[0], newCount);
        }
      }
      if (msg.type === 'resume') {
        const screen = document.getElementById('upgrade-screen');
        if (screen) screen.style.display = 'none';
        document.body.classList.add('in-game');
        state.gamePhase = GamePhase.Playing;
      }
    });

    conn.on('close', () => {
      if (errorMsg) errorMsg.textContent = 'Host disconnected';
    });
  });

  peer.on('error', (e: { type: string }) => {
    if (errorMsg) errorMsg.textContent = friendlyPeerError(e.type);
  });
}

// ═══════════════════════════════════
//       SEND STATE (host only)
// ═══════════════════════════════════

export function sendState(state: GameState): void {
  if (!conn || !conn.open || state.mode !== NetworkMode.Host) return;

  const msg: NetStateMessage = {
    type: 'state',
    p: state.players.map(p => ({
      x: ~~p.x, y: ~~p.y, a: Math.round(p.angle * 100) / 100,
      hp: p.hp, mhp: p.maxHp, mn: ~~p.mana, mmn: p.maxMana,
      al: p.alive, cd: p.cd.map(c => Math.round(c * 10) / 10), if: p.iframes > 0,
    })),
    e: state.enemies.map(e => ({
      t: e.type, x: ~~e.x, y: ~~e.y, hp: e.hp, mhp: e.maxHp, al: e.alive, tgt: e.target,
    })),
    sp: state.spells.map(s => ({
      x: ~~s.x, y: ~~s.y, vx: ~~s.vx, vy: ~~s.vy, r: s.radius, c: s.color, o: s.owner,
      k: s.clsKey, t: s.type, tr: s.trail,
      ex: s.explode, sl: s.slow, ho: s.homing, z: s.zap,
      dr: s.drain, bn: s.burn, st: s.stun,
      l: Math.round(s.life * 100) / 100, ag: Math.round(s.age * 100) / 100,
    })),
    ep: state.eProj.map(p => ({
      x: ~~p.x, y: ~~p.y, r: p.radius, c: p.color,
    })),
    zn: state.zones.map(z => ({
      x: ~~z.x, y: ~~z.y, r: z.radius, c: z.color, age: z.age, dur: z.duration,
    })),
    aoe: state.aoeMarkers.map(m => ({
      x: ~~m.x, y: ~~m.y, r: m.radius, c: m.color, age: m.age, del: m.delay,
    })),
    pk: state.pickups.filter(p => !p.collected).map(p => ({
      x: ~~p.x, y: ~~p.y, t: p.type,
    })),
    pl: state.pillars.map(p => ({
      x: ~~p.x, y: ~~p.y, r: ~~p.radius,
    })),
    w: state.wave,
    wA: state.waveActive,
    wBr: Math.round(state.waveBreakTimer * 10) / 10,
    g: state.gold,
    tk: state.totalKills,
    gp: state.gamePhase,
    ct: state.countdownTimer,
    sc: state.screenFlash > 0 ? state.screenFlash : 0,
    sk: state.shakeIntensity > 0 ? state.shakeIntensity : 0,
    lv: state.lives,
    mlv: state.maxLives,
    fx: state.pendingFx.length > 0 ? state.pendingFx.slice() : undefined,
  };

  // Clear the fx queue after copying into the message
  state.pendingFx.length = 0;

  try {
    conn.send(msg);
    sendFailCount = 0;
  } catch (e) {
    console.warn('sendState failed:', e);
    sendFailCount++;
    if (sendFailCount >= 3) {
      const errorMsg = document.getElementById('error-msg');
      if (errorMsg) errorMsg.textContent = 'Connection unstable — messages failing to send';
      sendFailCount = 0;
    }
  }
}

// ═══════════════════════════════════
//       APPLY STATE (guest)
// ═══════════════════════════════════

function applyState(state: GameState, msg: NetStateMessage): void {
  // Players — set interpolation targets instead of snapping
  if (msg.p) {
    msg.p.forEach((pd, i) => {
      if (!state.players[i]) return;
      const p = state.players[i];
      const isLocal = (i === state.localIdx);

      if (isLocal) {
        // Local player: blend toward authoritative position (client-side prediction correction)
        // Store the host's authoritative position as target, keep current predicted pos as prev
        p._prevX = p.x;
        p._prevY = p.y;
        p._targetX = pd.x;
        p._targetY = pd.y;
        p._lerpT = 0;
      } else {
        // Remote player: standard interpolation from current to new target
        p._prevX = p.x;
        p._prevY = p.y;
        p._targetX = pd.x;
        p._targetY = pd.y;
        p._lerpT = 0;
      }

      p.angle = pd.a;
      p.hp = pd.hp;
      p.maxHp = pd.mhp;
      p.mana = pd.mn;
      p.maxMana = pd.mmn;
      p.alive = pd.al;
      p.iframes = pd.if ? 0.1 : 0;
      for (let j = 0; j < 3; j++) p.cd[j] = pd.cd[j] || 0;
    });
  }

  // Enemies — match existing enemies to preserve visual state, then interpolate
  if (msg.e) {
    const oldEnemies = state.enemies.slice(); // snapshot of current enemies
    state.enemies.length = 0;

    for (const ed of msg.e) {
      // Try to find a matching old enemy: same type, closest distance within 50px
      let bestMatch: Enemy | null = null;
      let bestDist = 50; // max matching distance
      let bestIdx = -1;
      for (let j = 0; j < oldEnemies.length; j++) {
        const old = oldEnemies[j];
        if (old.type !== ed.t) continue;
        const dx = old.x - ed.x;
        const dy = old.y - ed.y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) {
          bestDist = d;
          bestMatch = old;
          bestIdx = j;
        }
      }
      // Remove the matched enemy from candidates so it can't match again
      if (bestIdx >= 0) oldEnemies.splice(bestIdx, 1);

      if (bestMatch) {
        // Reuse matched enemy: set interpolation targets, preserve visual timers
        bestMatch._prevX = bestMatch.x;
        bestMatch._prevY = bestMatch.y;
        bestMatch._targetX = ed.x;
        bestMatch._targetY = ed.y;
        bestMatch._lerpT = 0;
        bestMatch.hp = ed.hp;
        bestMatch.maxHp = ed.mhp;
        bestMatch.alive = ed.al;
        bestMatch.target = ed.tgt;
        // Visual timers (_hitFlash, _deathTimer, _atkAnim) are preserved from match
        state.enemies.push(bestMatch);
      } else {
        // New enemy — no interpolation, snap to position
        const newEnemy: Enemy = {
          type: ed.t, x: ed.x, y: ed.y, hp: ed.hp, maxHp: ed.mhp, alive: ed.al, target: ed.tgt,
          vx: 0, vy: 0, atkTimer: 1, iframes: 0, slowTimer: 0, stunTimer: 0,
          _burnTimer: 0, _burnTick: 0, _burnOwner: 0, _friendly: false, _owner: 0, _lifespan: 0,
          _spdMul: 1, _dmgMul: 1, _teleportTimer: 0,
          _hitFlash: 0, _deathTimer: -1, _atkAnim: 0,
          _dmgReductionActive: false, _dmgReductionTimer: 0, _dmgReductionTriggered: false,
        };
        newEnemy._prevX = ed.x;
        newEnemy._prevY = ed.y;
        newEnemy._targetX = ed.x;
        newEnemy._targetY = ed.y;
        newEnemy._lerpT = 1;
        state.enemies.push(newEnemy);
      }
    }
  }

  // Spells — use velocity extrapolation between updates (snap position, keep vx/vy for local extrapolation)
  if (msg.sp) {
    state.spells.length = 0;
    for (const sd of msg.sp) {
      state.spells.push({
        x: sd.x, y: sd.y, vx: sd.vx, vy: sd.vy, radius: sd.r, color: sd.c, owner: sd.o,
        clsKey: sd.k || '', type: sd.t || '', trail: sd.tr || sd.c,
        life: sd.l || 2, age: sd.ag || 0, speed: 0, dmg: 0,
        homing: sd.ho || 0, zap: sd.z || 0, zapRate: 0, slow: sd.sl || 0,
        drain: sd.dr || 0, explode: sd.ex || 0, burn: sd.bn || 0,
        zapTimer: 0, pierceLeft: 0, stun: sd.st || 0,
        _reversed: false, _bounces: 0,
      });
    }
  }

  // Enemy projectiles
  if (msg.ep) {
    state.eProj.length = 0;
    for (const pd of msg.ep) {
      state.eProj.push({ x: pd.x, y: pd.y, vx: 0, vy: 0, radius: pd.r, color: pd.c, life: 1, dmg: 0 });
    }
  }

  // Zones
  if (msg.zn) {
    state.zones.length = 0;
    for (const zd of msg.zn) {
      state.zones.push({
        x: zd.x, y: zd.y, radius: zd.r, color: zd.c, age: zd.age, duration: zd.dur,
        tickTimer: 1, tickRate: 1, dmg: 0, owner: 0, slow: 0, drain: 0, heal: 0, pull: 0, freezeAfter: 0,
      });
    }
  }

  // AOE markers
  if (msg.aoe) {
    state.aoeMarkers.length = 0;
    for (const ad of msg.aoe) {
      state.aoeMarkers.push({
        x: ad.x, y: ad.y, radius: ad.r, color: ad.c, age: ad.age, delay: ad.del,
        dmg: 0, owner: 0, stun: 0,
      });
    }
  }

  // Pickups
  if (msg.pk) {
    state.pickups.length = 0;
    for (const pd of msg.pk) {
      state.pickups.push({
        x: pd.x, y: pd.y, type: pd.t, collected: false,
        value: 0, _owner: 0, _dmg: 0, _radius: 0, _slow: 0, _color: '',
      });
    }
  }

  // Pillars
  if (msg.pl) {
    state.pillars.length = 0;
    for (const pd of msg.pl) {
      state.pillars.push({ x: pd.x, y: pd.y, radius: pd.r });
    }
  }

  // Wave state
  if (msg.w) {
    state.wave = msg.w;
    const el = document.getElementById('wave-num');
    if (el) el.textContent = String(state.wave);
  }
  if (msg.wA !== undefined) state.waveActive = msg.wA;
  if (msg.wBr !== undefined) state.waveBreakTimer = msg.wBr;

  // Globals
  if (msg.g !== undefined) state.gold = msg.g;
  if (msg.tk !== undefined) state.totalKills = msg.tk;
  if (isGamePhase(msg.gp)) state.gamePhase = msg.gp;
  if (msg.ct !== undefined) state.countdownTimer = msg.ct;
  if (msg.sc > 0) state.screenFlash = Math.max(state.screenFlash, msg.sc);
  if (msg.sk > 0) shake(state, msg.sk);
  if (msg.lv !== undefined) state.lives = msg.lv;
  if (msg.mlv !== undefined) state.maxLives = msg.mlv;

  // Replay visual effects from host
  if (msg.fx) {
    for (const ev of msg.fx) {
      switch (ev.t) {
        case 'p':
          spawnParticles(state, ev.x, ev.y, ev.c, ev.n || 5, ev.s || 1);
          break;
        case 't':
          spawnText(state, ev.x, ev.y, ev.tx || '', ev.c);
          break;
        case 'sw':
          spawnShockwave(state, ev.x, ev.y, ev.mr || 60, ev.c);
          break;
      }
    }
  }
}

// ═══════════════════════════════════
//       SEND INPUT (guest)
// ═══════════════════════════════════

export function sendInput(state: GameState, input: {
  angle: number; mx: number; my: number;
  shoot: boolean; shoot2: boolean; ability: boolean; ult: boolean; dash: boolean;
}): void {
  if (!conn || !conn.open || state.mode !== NetworkMode.Guest) return;
  try {
    conn.send({ type: 'input', ...input });
    sendFailCount = 0;
  } catch (e) {
    console.warn('sendInput failed:', e);
    sendFailCount++;
    if (sendFailCount >= 3) {
      const errorMsg = document.getElementById('error-msg');
      if (errorMsg) errorMsg.textContent = 'Connection unstable — messages failing to send';
      sendFailCount = 0;
    }
  }
}
