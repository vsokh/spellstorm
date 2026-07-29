import { GameState, toWorld, clamp } from './state';
import { PlayerInput, NetworkMode } from './types';
import { getTouchInput, noteMouseActivity } from './touch-input';
import { getRenderZoom } from './mobile';

// ═══════════════════════════════════
//          INPUT HANDLING
// ═══════════════════════════════════

const PREVENTED_KEYS = ['Space', 'Tab', 'KeyQ', 'KeyE'];

export function setupInput(state: GameState, canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    state.keys[e.code] = true;
    if (PREVENTED_KEYS.includes(e.code)) e.preventDefault();
  });

  window.addEventListener('keyup', (e: KeyboardEvent) => {
    state.keys[e.code] = false;
  });

  canvas.addEventListener('mousemove', (e: MouseEvent) => {
    noteMouseActivity();
    // Mouse coords are CSS px; canvas may render zoomed-out on mobile.
    const z = getRenderZoom();
    if (document.pointerLockElement === canvas) {
      // Pointer locked: accumulate movement
      state.mouseX = clamp(state.mouseX + (e.movementX || 0) * z, 0, state.width);
      state.mouseY = clamp(state.mouseY + (e.movementY || 0) * z, 0, state.height);
    } else {
      state.mouseX = e.clientX * z;
      state.mouseY = e.clientY * z;
    }
  });

  canvas.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button === 0) state.mouseDown = true;
    if (e.button === 2) state.rightDown = true;
    e.preventDefault();
    // Request pointer lock on first click during gameplay
    if (document.body.classList.contains('in-game') && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch (_) { /* iframe may block pointer lock */ }
    }
  });

  canvas.addEventListener('mouseup', (e: MouseEvent) => {
    if (e.button === 0) state.mouseDown = false;
    if (e.button === 2) state.rightDown = false;
  });

  canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  // Release pointer lock when leaving gameplay
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) {
      state.mouseDown = false;
      state.rightDown = false;
    }
  });
}

export function getInput(state: GameState, playerIdx: number): PlayerInput {
  const p = state.players[playerIdx];
  if (!p) {
    return { angle: 0, mx: 0, my: 0, shoot: false, shoot2: false, ability: false, ult: false, dash: false };
  }

  // Remote player: use remote input
  if (playerIdx !== state.localIdx && state.mode !== NetworkMode.Local) {
    return state.remoteInput;
  }

  const wp = toWorld(state, state.mouseX, state.mouseY);
  let angle = Math.atan2(wp.y - p.y, wp.x - p.x);
  let mx = state.keys['KeyA'] ? -1 : (state.keys['KeyD'] ? 1 : 0);
  let my = state.keys['KeyW'] ? -1 : (state.keys['KeyS'] ? 1 : 0);
  let shoot = state.mouseDown;
  let shoot2 = state.rightDown;
  let ability = !!state.keys['KeyQ'];
  let ult = !!state.keys['Space'];
  let dash = !!(state.keys['ShiftLeft'] || state.keys['ShiftRight']);

  // Merge touch controls (mobile). Keyboard/mouse still works alongside.
  const t = getTouchInput();
  if (t.usingTouch) {
    if (t.mx !== 0 || t.my !== 0) { mx = t.mx; my = t.my; }
    if (t.aimActive) angle = assistAim(state, p, t.aimAngle);
    else if (t.mx !== 0 || t.my !== 0) angle = Math.atan2(t.my, t.mx);
    else angle = t.aimAngle; // last aim direction
    shoot = shoot || t.aimActive;
    shoot2 = shoot2 || t.shoot2;
    ability = ability || t.ability;
    ult = ult || t.ult;
    dash = dash || t.dash;
  }

  return { angle, mx, my, shoot, shoot2, ability, ult, dash };
}

// ── Touch aim assist ──
// Thumb-aiming at small sprites is the hardest part of twin-stick play on a
// phone. Snap the stick angle to the best enemy inside a narrow cone: close
// enough to feel magnetic, narrow enough to preserve intent. Dash is immune
// (it uses movement direction), and mouse aim never goes through this path.
const ASSIST_CONE = 0.35;   // ~±20°
const ASSIST_RANGE = 640;   // world px
const ASSIST_RANGE_SQ = ASSIST_RANGE * ASSIST_RANGE;

function assistAim(state: GameState, p: { x: number; y: number }, raw: number): number {
  let best = raw;
  let bestScore = Infinity;
  for (const e of state.enemies) {
    if (!e.alive || e._friendly || e._deathTimer >= 0) continue;
    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > ASSIST_RANGE_SQ || d2 < 1) continue;
    let delta = Math.atan2(dy, dx) - raw;
    if (delta > Math.PI) delta -= Math.PI * 2;
    else if (delta < -Math.PI) delta += Math.PI * 2;
    const ad = Math.abs(delta);
    if (ad > ASSIST_CONE) continue;
    // Prefer angular closeness; break near-ties toward closer enemies.
    const score = ad + Math.sqrt(d2) * 0.0004;
    if (score < bestScore) {
      bestScore = score;
      best = raw + delta;
    }
  }
  return best;
}
