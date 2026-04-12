import './style.css';
import {
  GameState,
  createInitialState,
  createPlayer,
  clamp,
} from './state';
import {
  GamePhase,
  NetworkMode,
} from './types';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  COUNTDOWN_DURATION,
  NET_SEND_INTERVAL,
} from './constants';
import { sfx } from './audio';
import { SfxName } from './types';
import { setupInput, getInput } from './input';
import { setNetworkCallbacks, sendState, sendInput } from './network';
import { setChestPickupHandler } from './systems/physics';
import { updatePlayers } from './systems/physics';
import { updateEnemies, updateEProj } from './systems/enemies';
import { updateSpells, updateAoe, updateZones } from './systems/waves';
import { generateArena, updateWaves } from './systems/dungeon';
import { showUpgradeScreen } from './systems/upgrades';

import { updateCamera } from './rendering/renderer';
import { updateFx, drawBeams, drawZones, drawAoe, drawFx, drawCrosshair, drawCountdown } from './rendering/draw-effects';
import { drawRoom, drawPillars } from './rendering/draw-room';
import { drawWizard, drawEnemies, drawSpells, drawEProj, drawPickups } from './rendering/draw-entities';
import { updateHUD } from './rendering/draw-hud';

import { setupLobby } from './ui/lobby';
import { showSelect, setupClassSelect } from './ui/class-select';

// ═══════════════════════════════════
//          INITIALIZATION
// ═══════════════════════════════════

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const state: GameState = createInitialState();

function resize(): void {
  state.width = canvas.width = window.innerWidth;
  state.height = canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// Setup input handlers
setupInput(state, canvas);

// Wire chest pickup handler to break circular dependency physics -> upgrades
setChestPickupHandler((s: GameState) => showUpgradeScreen(s));

// ═══════════════════════════════════
//       GAME START
// ═══════════════════════════════════

function beginGame(c1: string, c2: string): void {
  const selectScreen = document.getElementById('select-screen');
  const hud = document.getElementById('hud');
  const floorDisplay = document.getElementById('floor-display');
  const goldDisplay = document.getElementById('gold-display');

  if (selectScreen) selectScreen.style.display = 'none';
  if (hud) hud.style.display = 'flex';
  if (floorDisplay) floorDisplay.style.display = 'block';
  if (goldDisplay) goldDisplay.style.display = 'block';
  document.body.classList.add('in-game');

  state.wave = 1;
  state.waveActive = false;
  state.waveBreakTimer = 0;
  state.waveEnemiesTotal = 0;
  state.totalKills = 0;
  state.gold = 0;

  // Spawn players
  state.players = [];
  const clsKeys = [c1, c2 || c1];
  const playerCount = state.mode === NetworkMode.Local ? 1 : 2;
  for (let i = 0; i < playerCount; i++) {
    state.players.push(createPlayer(i, clsKeys[i]));
  }

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

// Wire up lobby and class select
setupLobby(state, () => showSelect(state));
setupClassSelect(state, beginGame);

// ═══════════════════════════════════
//       MAIN LOOP
// ═══════════════════════════════════

let lastTime = performance.now();

function loop(now: number): void {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  state.time += dt;

  // Skip non-gameplay phases
  if (
    state.gamePhase === GamePhase.Lobby ||
    state.gamePhase === GamePhase.Select ||
    state.gamePhase === GamePhase.Upgrade ||
    state.gamePhase === GamePhase.GameOver
  ) {
    requestAnimationFrame(loop);
    return;
  }

  // Countdown
  if (state.gamePhase === GamePhase.Countdown) {
    state.countdownTimer -= dt;
    if (state.countdownTimer <= 0) state.gamePhase = GamePhase.Playing;
  }

  // Game logic (host/local only)
  if (state.mode !== NetworkMode.Guest) {
    updatePlayers(state, dt);
    updateSpells(state, dt);
    updateAoe(state, dt);
    updateZones(state, dt);
    updateEnemies(state, dt);
    updateEProj(state, dt);
    updateWaves(state, dt);
    state.netTimer -= dt;
    if (state.netTimer <= 0) {
      state.netTimer = NET_SEND_INTERVAL;
      sendState(state);
    }
  }

  // Guest: send input every frame
  if (state.mode === NetworkMode.Guest) {
    const inp = getInput(state, state.localIdx);
    sendInput(state, inp);
  }

  // Shared: camera, effects, HUD
  updateCamera(state);
  updateFx(state, dt);
  updateHUD(state);

  // ── DRAW ──
  ctx.fillStyle = '#04030a';
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.save();
  ctx.translate(state.camX + state.shakeX, state.camY + state.shakeY);

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
    ctx.fillStyle = `rgba(255,255,255,${state.screenFlash * 0.25})`;
    ctx.fillRect(0, 0, state.width, state.height);
  }

  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
