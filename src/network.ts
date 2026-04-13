import Peer, { DataConnection } from 'peerjs';
import { GameState, shake } from './state';
import {
  GamePhase,
  NetworkMode,
  NetMessage,
  NetStateMessage,
  NetInputMessage,
  PickupType,
} from './types';
import { UPGRADE_POOL } from './constants';
import { initAudio } from './audio';
import { showUpgradeFromHost, checkBothPicked, finishUpgrade } from './systems/upgrades';

// ═══════════════════════════════════
//          NETWORKING
// ═══════════════════════════════════

let peer: Peer | null = null;
let conn: DataConnection | null = null;

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
  return conn;
}

export function sendMessage(state: GameState, msg: NetMessage): void {
  if (!conn || !conn.open) return;
  try {
    conn.send(msg);
  } catch (_e) {
    // Silently handle send errors
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
    if (errorMsg) errorMsg.textContent = 'PeerJS error';
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
      const data = msg as NetMessage;
      if (data.type === 'input') {
        const inputMsg = data as NetInputMessage;
        state.remoteInput = {
          angle: inputMsg.angle,
          mx: inputMsg.mx,
          my: inputMsg.my,
          shoot: inputMsg.shoot,
          shoot2: inputMsg.shoot2,
          ability: inputMsg.ability,
          ult: inputMsg.ult,
          dash: inputMsg.dash,
        };
      }
      if (data.type === 'cls') {
        const clsMsg = data as { type: 'cls'; cls: string };
        if (onStartWithClasses && state.hostClassKey) {
          conn!.send({ type: 'go', h: state.hostClassKey, g: clsMsg.cls });
          onStartWithClasses(state.hostClassKey, clsMsg.cls);
        } else {
          state.guestClassKey = clsMsg.cls;
        }
      }
      if (data.type === 'guest_picked') {
        const pickMsg = data as { type: 'guest_picked'; idx: number };
        const up = UPGRADE_POOL[pickMsg.idx];
        if (up && state.players[1]) up.apply(state.players[1]);
        state.upgradePickedRemote = true;
        checkBothPicked(state);
      }
    });

    conn.on('close', () => {
      if (errorMsg) errorMsg.textContent = 'Partner disconnected';
    });
  });

  peer.on('error', (e: { type: string }) => {
    if (errorMsg) errorMsg.textContent = 'Error: ' + e.type;
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
    if (errorMsg) errorMsg.textContent = 'PeerJS error';
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
      const data = msg as NetMessage;
      if (data.type === 'state') {
        applyState(state, data as NetStateMessage);
      }
      if (data.type === 'go') {
        const goMsg = data as { type: 'go'; h: string; g: string };
        if (onStartWithClasses) onStartWithClasses(goMsg.h, goMsg.g);
      }
      if (data.type === 'upgrade') {
        const upMsg = data as { type: 'upgrade'; indices: number[] };
        showUpgradeFromHost(state, upMsg.indices);
      }
      if (data.type === 'host_picked') {
        const pickMsg = data as { type: 'host_picked'; idx: number };
        const up = UPGRADE_POOL[pickMsg.idx];
        if (up && state.players[0]) up.apply(state.players[0]);
      }
      if (data.type === 'resume') {
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
    if (errorMsg) errorMsg.textContent = 'Error: ' + e.type;
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
  };

  try { conn.send(msg); } catch (_e) { /* silently ignore */ }
}

// ═══════════════════════════════════
//       APPLY STATE (guest)
// ═══════════════════════════════════

function applyState(state: GameState, msg: NetStateMessage): void {
  // Players
  if (msg.p) {
    msg.p.forEach((pd, i) => {
      if (!state.players[i]) return;
      state.players[i].x = pd.x;
      state.players[i].y = pd.y;
      state.players[i].angle = pd.a;
      state.players[i].hp = pd.hp;
      state.players[i].maxHp = pd.mhp;
      state.players[i].mana = pd.mn;
      state.players[i].maxMana = pd.mmn;
      state.players[i].alive = pd.al;
      state.players[i].iframes = pd.if ? 0.1 : 0;
      for (let j = 0; j < 3; j++) state.players[i].cd[j] = pd.cd[j] || 0;
    });
  }

  // Enemies - replace entirely
  if (msg.e) {
    state.enemies.length = 0;
    for (const ed of msg.e) {
      state.enemies.push({
        type: ed.t, x: ed.x, y: ed.y, hp: ed.hp, maxHp: ed.mhp, alive: ed.al, target: ed.tgt,
        vx: 0, vy: 0, atkTimer: 1, iframes: 0, slowTimer: 0, stunTimer: 0,
        _burnTimer: 0, _burnTick: 0, _burnOwner: 0, _friendly: false, _owner: 0, _lifespan: 0,
        _spdMul: 1, _dmgMul: 1, _teleportTimer: 0,
      });
    }
  }

  // Spells
  if (msg.sp) {
    state.spells.length = 0;
    for (const sd of msg.sp) {
      state.spells.push({
        x: sd.x, y: sd.y, vx: sd.vx, vy: sd.vy, radius: sd.r, color: sd.c, owner: sd.o,
        trail: sd.c, life: 2, age: 0, speed: 0, dmg: 0, type: '',
        homing: 0, zap: 0, zapRate: 0, slow: 0, drain: 0, explode: 0, burn: 0,
        zapTimer: 0, pierceLeft: 0, stun: 0, clsKey: '',
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
  if (msg.gp) state.gamePhase = msg.gp as GamePhase;
  if (msg.ct !== undefined) state.countdownTimer = msg.ct;
  if (msg.sc > 0) state.screenFlash = Math.max(state.screenFlash, msg.sc);
  if (msg.sk > 0) shake(state, msg.sk);
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
  } catch (_e) { /* silently ignore */ }
}
