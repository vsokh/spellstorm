import './style.css';
import {
  GameState,
  createInitialState,
  createPlayer,
  clamp,
  lerp,
} from './state';
import {
  GamePhase,
  NetworkMode,
} from './types';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  COUNTDOWN_DURATION,
  MAX_WAVES,
  WAVE_PHYSICS,
  DEFAULT_LIVES,
  WIZARD_SIZE,
  DEFAULT_MOVE_SPEED,
  WALL_THICKNESS,
  MAX_TRAILS,
} from './constants';
import { sfx } from './audio';
import { SfxName } from './types';
import { setupInput, getInput } from './input';
import { setNetworkCallbacks, sendState, sendInput, flushOutbox, getAdaptiveInterval } from './network';
import { setChestPickupHandler } from './systems/physics';
import { updatePlayers } from './systems/physics';
import { updateEnemies, updateEProj } from './systems/enemies';
import { updateSpells, updateAoe, updateZones } from './systems/waves';
import { generateArena, updateWaves } from './systems/dungeon';
import { showUpgradeScreen } from './systems/upgrades';
import { initShop, openShop } from './systems/shop';
import { applySynergies } from './systems/synergy';

import { updateCamera } from './rendering/renderer';
import { updateFx, drawBeams, drawZones, drawAoe, drawFx, drawCrosshair, drawCountdown, drawSynergyBanner } from './rendering/draw-effects';
import { drawRoom, drawPillars } from './rendering/draw-room';
import { drawWizard, drawEnemies, drawSpells, drawEProj, drawPickups } from './rendering/draw-entities';
import { clearGradCache } from './rendering/gradient-cache';
import { updateHUD } from './rendering/draw-hud';

import { setupLobby } from './ui/lobby';
import { showSelect, setupClassSelect, stopCardAnimation } from './ui/class-select';
import { setupGameOver } from './ui/game-over';

import { SystemRunner } from './ecs';
import { profiler } from './debug/profiler';
import { initPerfOverlay, drawPerfOverlay } from './debug/perf-overlay';

const runner = new SystemRunner();
runner
  .add('updatePlayers', 10, updatePlayers)
  .add('updateSpells', 20, updateSpells)
  .add('updateAoe', 30, updateAoe)
  .add('updateZones', 40, updateZones)
  .add('updateEnemies', 50, updateEnemies)
  .add('updateEProj', 60, updateEProj)
  .add('updateWaves', 70, updateWaves);

// ═══════════════════════════════════
//          INITIALIZATION
// ═══════════════════════════════════

const canvasEl = document.getElementById('c');
if (!(canvasEl instanceof HTMLCanvasElement)) throw new Error('Canvas element #c not found');
const canvas: HTMLCanvasElement = canvasEl;
const ctx2d = canvas.getContext('2d');
if (!ctx2d) throw new Error('Could not get 2d context');
const ctx: CanvasRenderingContext2D = ctx2d;

const state: GameState = createInitialState();

function resize(): void {
  state.width = canvas.width = window.innerWidth;
  state.height = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Setup input handlers
setupInput(state, canvas);

// Setup performance overlay (F3 to toggle)
initPerfOverlay(canvas);

// Wire chest pickup handler to break circular dependency physics -> upgrades
setChestPickupHandler((s: GameState) => showUpgradeScreen(s));

// Initialize shop event listeners
initShop(state);

// Wire up shop button
const shopBtn = document.getElementById('shop-btn');
if (shopBtn) {
  shopBtn.addEventListener('click', () => {
    if (!state.waveActive && state.wave < MAX_WAVES && !state.shopOpen) {
      openShop(state);
    }
  });
}

// ═══════════════════════════════════
//       GAME START
// ═══════════════════════════════════

function beginGame(c1: string, c2: string): void {
  const selectScreen = document.getElementById('select-screen');
  const hud = document.getElementById('hud');
  const floorDisplay = document.getElementById('floor-display');
  const goldDisplay = document.getElementById('gold-display');
  const skillBar = document.getElementById('skill-bar');

  stopCardAnimation();
  if (selectScreen) selectScreen.style.display = 'none';
  if (hud) hud.style.display = 'flex';
  if (skillBar) skillBar.style.display = 'flex';
  if (floorDisplay) floorDisplay.style.display = 'block';
  if (goldDisplay) goldDisplay.style.display = 'block';
  const shopBtnEl = document.getElementById('shop-btn');
  if (shopBtnEl) shopBtnEl.style.display = 'block';
  document.body.classList.add('in-game');

  state.wave = 1;
  state.waveActive = false;
  state.waveBreakTimer = 0;
  state.waveEnemiesTotal = 0;
  state.totalKills = 0;
  state.gold = 0;
  state.waveSpawnQueue = 0;
  state.waveSpawnTimer = 0;
  state.comboCount = 0;
  state.comboTimer = 0;
  state.hitStop = 0;
  state.shopOpen = false;
  state.shopPurchases = {};
  state.shopTempDmg = 0;
  state.shopShieldHits = 0;
  state.activeSynergy = null;
  state.synergyBannerTimer = 0;
  // Initialize lives (shared pool for both single-player and co-op)
  state.lives = DEFAULT_LIVES;
  state.maxLives = DEFAULT_LIVES;

  // Spawn players
  state.players = [];
  const clsKeys = [c1, c2 || c1];
  const playerCount = state.mode === NetworkMode.Local ? 1 : 2;
  for (let i = 0; i < playerCount; i++) {
    state.players.push(createPlayer(i, clsKeys[i]));
  }

  // Apply class synergies for multiplayer teams
  applySynergies(state);

  if (state.mode !== NetworkMode.Guest) {
    // Host/local: generate arena and set up first wave timer
    generateArena(state);
    state.waveBreakTimer = 3; // first wave starts after countdown
  }

  state.gamePhase = GamePhase.Countdown;
  state.countdownTimer = COUNTDOWN_DURATION;
  sfx(SfxName.Door);

  // Snap camera to center immediately
  if (state.width >= ROOM_WIDTH) {
    state.camX = (state.width - ROOM_WIDTH) / 2;
  } else {
    state.camX = 20;
  }
  if (state.height >= ROOM_HEIGHT + 60) {
    state.camY = (state.height - 60 - ROOM_HEIGHT) / 2;
  } else {
    state.camY = 20;
  }
}

// Wire up network callbacks
setNetworkCallbacks(
  () => showSelect(state),
  (c1: string, c2: string) => beginGame(c1, c2),
);

// Wire up lobby, class select, and game over
setupLobby(state, () => showSelect(state));
setupClassSelect(state, beginGame);
setupGameOver();

// ═══════════════════════════════════
//       MAIN LOOP
// ═══════════════════════════════════

let lastTime = performance.now();

function loop(now: number): void {
  profiler.frameStart();
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  state.time += dt;

  // Skip non-gameplay phases
  if (
    state.gamePhase === GamePhase.Lobby ||
    state.gamePhase === GamePhase.Select ||
    state.gamePhase === GamePhase.Upgrade ||
    state.gamePhase === GamePhase.GameOver ||
    state.gamePhase === GamePhase.Victory
  ) {
    requestAnimationFrame(loop);
    return;
  }

  // Countdown
  if (state.gamePhase === GamePhase.Countdown) {
    state.countdownTimer -= dt;
    if (state.countdownTimer <= 0) state.gamePhase = GamePhase.Playing;
  }

  // Synergy banner timer
  if (state.synergyBannerTimer > 0) state.synergyBannerTimer -= dt;

  // Game logic (host/local only)
  if (state.mode !== NetworkMode.Guest) {
    // Hitstop: near-freeze on kills for game feel
    let gameDt = dt;
    if (state.hitStop > 0) {
      gameDt = dt * 0.05;
      state.hitStop -= dt;
      if (state.hitStop < 0) state.hitStop = 0;
    }

    runner.update(state, gameDt);

    // Combo timer decay
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.comboCount = 0;
    }

    state.netTimer -= dt;
    if (state.netTimer <= 0) {
      state.netTimer = getAdaptiveInterval();
      sendState(state);
    }
  }

  // Guest: send input, predict local movement, interpolate entities
  if (state.mode === NetworkMode.Guest) {
    const inp = getInput(state, state.localIdx);
    sendInput(state, inp);

    // Client-side prediction: move local player immediately using same logic as host
    const lp = state.players[state.localIdx];
    if (lp && lp.alive && lp.stunTimer <= 0) {
      const slow = lp.slowTimer > 0 ? WAVE_PHYSICS.SLOW_MOVE_MULT : 1;
      const ms = (lp.moveSpeed || DEFAULT_MOVE_SPEED) * slow;
      let mvx = (inp.mx || 0) * ms;
      let mvy = (inp.my || 0) * ms;
      const mvLen = Math.sqrt(mvx * mvx + mvy * mvy);
      if (mvLen > ms) { mvx *= ms / mvLen; mvy *= ms / mvLen; }
      lp.x += mvx * dt;
      lp.y += mvy * dt;
      lp.x = clamp(lp.x, WIZARD_SIZE, ROOM_WIDTH - WIZARD_SIZE);
      lp.y = clamp(lp.y, WIZARD_SIZE, ROOM_HEIGHT - WIZARD_SIZE);
      if (!isNaN(inp.angle)) lp.angle = inp.angle;
      lp._animMoving = (Math.abs(mvx) > 1 || Math.abs(mvy) > 1);
    }

    // Adaptive interpolation: use measured packet interval instead of fixed constant.
    // This smooths motion under network jitter — lerp duration matches actual packet cadence.
    const lerpSpeed = 1 / state._netInterval;

    // Interpolate all players except local (local uses prediction above)
    for (let i = 0; i < state.players.length; i++) {
      if (i === state.localIdx) {
        // Local player: smooth reconciliation for client prediction
        const p = state.players[i];
        if (p._targetX !== undefined && p._targetY !== undefined) {
          const errX = p._targetX - p.x;
          const errY = p._targetY - p.y;
          const errDist = Math.sqrt(errX * errX + errY * errY);
          if (errDist > 4) {
            // Exponential blend: converge toward server position smoothly
            // Higher error = faster correction rate, but always smooth (never snap)
            const rate = Math.min(15, 3 + errDist * 0.1);
            const t = Math.min(1, rate * dt);
            p.x += errX * t;
            p.y += errY * t;
          }
          // Small error (<= 4px): trust prediction, no correction
        }
        continue;
      }
      const p = state.players[i];
      if (p._targetX !== undefined && p._targetY !== undefined) {
        p._lerpT = (p._lerpT || 0) + dt * lerpSpeed; // don't clamp — track total elapsed time
        const lerpParam = Math.min(1, p._lerpT);      // clamp for lerp only
        let ix = lerp(p._prevX ?? p.x, p._targetX, lerpParam);
        let iy = lerp(p._prevY ?? p.y, p._targetY, lerpParam);
        // Extrapolate past target using server velocity to reduce stutter between updates
        if (p._lerpT > 1 && (p._serverVx || p._serverVy)) {
          const overTime = (p._lerpT - 1) * getAdaptiveInterval();
          ix += (p._serverVx || 0) * overTime;
          iy += (p._serverVy || 0) * overTime;
        }
        p.x = ix;
        p.y = iy;
      }
    }

    // Interpolate enemies
    for (const e of state.enemies) {
      if (e._targetX !== undefined && e._targetY !== undefined) {
        e._lerpT = Math.min(1, (e._lerpT || 0) + dt * lerpSpeed);
        e.x = lerp(e._prevX ?? e.x, e._targetX, e._lerpT);
        e.y = lerp(e._prevY ?? e.y, e._targetY, e._lerpT);
      }
      // Decay visual timers on guest (host no longer does this for guest)
      if (e._hitFlash > 0) e._hitFlash -= dt;
      if (e._deathTimer > 0) e._deathTimer -= dt;
      if (e._atkAnim > 0) e._atkAnim -= dt;
    }

    // Extrapolate spell positions with wall bounce (matches host logic)
    for (const s of state.spells) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      // Wall bounce — mirror host logic from waves.ts
      const wL = WALL_THICKNESS;
      const wR = ROOM_WIDTH - WALL_THICKNESS;
      const wT = WALL_THICKNESS;
      const wB = ROOM_HEIGHT - WALL_THICKNESS;
      if (s.x < wL) { s.x = wL + (wL - s.x); s.vx = Math.abs(s.vx); }
      if (s.x > wR) { s.x = wR - (s.x - wR); s.vx = -Math.abs(s.vx); }
      if (s.y < wT) { s.y = wT + (wT - s.y); s.vy = Math.abs(s.vy); }
      if (s.y > wB) { s.y = wB - (s.y - wB); s.vy = -Math.abs(s.vy); }
    }

    // Guest: generate spell trails locally for visual parity
    for (const s of state.spells) {
      if (state.trails.length >= MAX_TRAILS) break;
      state.trails.push({
        x: s.x + (Math.random() - 0.5) * 6,
        y: s.y + (Math.random() - 0.5) * 6,
        life: 1,
        r: s.radius * WAVE_PHYSICS.TRAIL_PARTICLE_SCALE,
        color: s.trail,
      });
    }
  }

  // Shared: camera, effects, HUD
  profiler.begin('camera');
  updateCamera(state);
  profiler.end('camera');
  profiler.begin('effects');
  updateFx(state, dt);
  profiler.end('effects');
  profiler.begin('hud');
  updateHUD(state);
  profiler.end('hud');

  // ── DRAW ──
  profiler.begin('render');
  ctx.fillStyle = '#04030a';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.save();
  ctx.translate(state.camX + state.shakeX, state.camY + state.shakeY);

  clearGradCache();
  drawRoom(ctx, state);
  drawZones(ctx, state);
  drawAoe(ctx, state);
  drawPillars(ctx, state);
  drawPickups(ctx, state);
  drawEProj(ctx, state);
  drawSpells(ctx, state);
  drawBeams(ctx, state);
  drawEnemies(ctx, state);
  drawWizard(ctx, state);
  drawFx(ctx, state);
  drawCrosshair(ctx, state);
  drawCountdown(ctx, state);

  ctx.restore();

  // Screen flash overlay
  if (state.screenFlash > 0) {
    ctx.fillStyle = `rgba(${state.screenFlashColor},${state.screenFlash * 0.25})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  // Synergy banner (screen-space, drawn after restore)
  drawSynergyBanner(ctx, state);
  profiler.end('render');

  // Performance overlay (drawn in screen space, after all game rendering)
  drawPerfOverlay(ctx);

  // Flush all queued network messages as a single batched packet
  flushOutbox();

  profiler.countEntities(state);
  profiler.frameEnd();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
