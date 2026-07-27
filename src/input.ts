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
    if (t.aimActive) angle = t.aimAngle;
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
