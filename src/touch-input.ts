import { GameState } from './state';
import { GamePhase } from './types';
import { openPause, closePause } from './systems/pause';
import { IS_MOBILE } from './mobile';

// ═══════════════════════════════════
//     TOUCH INPUT (mobile port)
// ═══════════════════════════════════
//
// Twin-stick layout: floating joystick on the left half moves, floating
// joystick on the right half aims + fires the primary attack. DOM buttons
// (bottom-right cluster) cover Q / RMB / ULT / DASH and support press-and-hold
// so charged spells keep working. Output is merged into getInput() in
// input.ts — desktop keyboard/mouse behavior is unchanged.

const STICK_RADIUS = 52; // px of thumb travel for full deflection
const MOVE_DEADZONE = 0.12;
const AIM_DEADZONE_PX = 16;
const MOVE_ZONE_FRAC = 0.45; // touches left of this fraction of the screen move

export interface TouchInputState {
  /** Touch is currently the active input source (set on real touches; cleared
   *  again if a physical mouse moves, so hybrid devices behave). */
  usingTouch: boolean;
  mx: number;
  my: number;
  aimAngle: number;
  /** Aim stick deflected past deadzone -> fire primary. */
  aimActive: boolean;
  shoot2: boolean;
  ability: boolean;
  ult: boolean;
  dash: boolean;
}

const touch: TouchInputState = {
  usingTouch: IS_MOBILE,
  mx: 0, my: 0,
  aimAngle: 0, aimActive: false,
  shoot2: false, ability: false, ult: false, dash: false,
};

export function getTouchInput(): TouchInputState {
  return touch;
}

/** Called from input.ts on real mouse movement — hands control back to the
 *  mouse on hybrid devices when no stick is held. */
export function noteMouseActivity(): void {
  if (moveId === null && aimId === null) touch.usingTouch = false;
}

// Bound inside setupTouchControls (needs the GameState closure).
let feedbackTick: (() => void) | null = null;

/** Haptic feedback poll — call once per frame from the main loop. */
export function updateTouchFeedback(): void {
  if (feedbackTick) feedbackTick();
}

// ── Stick trackers ──
let moveId: number | null = null;
let moveBaseX = 0, moveBaseY = 0;
let aimId: number | null = null;
let aimBaseX = 0, aimBaseY = 0;

interface StickEls { base: HTMLDivElement; nub: HTMLDivElement; }
let moveEls: StickEls | null = null;
let aimEls: StickEls | null = null;

function makeStick(container: HTMLElement): StickEls {
  const base = document.createElement('div');
  base.className = 'tc-stick';
  const nub = document.createElement('div');
  nub.className = 'tc-nub';
  base.appendChild(nub);
  container.appendChild(base);
  return { base, nub };
}

function showStick(els: StickEls | null, x: number, y: number): void {
  if (!els) return;
  els.base.style.display = 'block';
  els.base.style.left = `${x}px`;
  els.base.style.top = `${y}px`;
  els.nub.style.transform = 'translate(-50%, -50%)';
}

function setStickBase(els: StickEls | null, x: number, y: number): void {
  if (!els) return;
  els.base.style.left = `${x}px`;
  els.base.style.top = `${y}px`;
}

/** Short vibration pulse (Android; iOS Safari ignores it). */
function buzz(ms: number): void {
  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch (_) { /* ignore */ }
  }
}

// Auto-fullscreen + landscape lock on the first gameplay touch (needs a user
// gesture). Attempted once per session so an intentional exit isn't fought.
let immersiveTried = false;
function tryImmersive(): void {
  if (!IS_MOBILE || immersiveTried) return;
  immersiveTried = true;
  const de = document.documentElement;
  if (!document.fullscreenElement && de.requestFullscreen) {
    de.requestFullscreen().then(() => {
      const so = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      if (so && so.lock) so.lock('landscape').catch(() => { /* unsupported */ });
    }).catch(() => { /* browser said no — fine */ });
  }
}

function moveStickNub(els: StickEls | null, dx: number, dy: number): void {
  if (!els) return;
  els.nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
}

function hideStick(els: StickEls | null): void {
  if (els) els.base.style.display = 'none';
}

function makeButton(container: HTMLElement, label: string, cls: string,
  onDown: () => void, onUp: () => void): void {
  const btn = document.createElement('button');
  btn.className = `tc-btn ${cls}`;
  btn.textContent = label;
  // A very fast tap can start and end between two game-loop input reads
  // (16.7ms frames, or longer when the 60fps cap skips rAF ticks on 120Hz
  // screens). Hold the logical press for at least MIN_HOLD_MS so every tap
  // is seen by the simulation.
  const MIN_HOLD_MS = 80;
  let downAt = 0;
  btn.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    buzz(8);
    downAt = performance.now();
    onDown();
  }, { passive: false });
  const up = (e: Event): void => {
    e.preventDefault();
    const held = performance.now() - downAt;
    if (held < MIN_HOLD_MS) setTimeout(onUp, MIN_HOLD_MS - held);
    else onUp();
  };
  btn.addEventListener('touchend', up);
  btn.addEventListener('touchcancel', up);
  container.appendChild(btn);
}

function activateTouch(): void {
  touch.usingTouch = true;
  document.body.classList.add('touch-device');
}

export function setupTouchControls(state: GameState, canvas: HTMLCanvasElement): void {
  if (IS_MOBILE) document.body.classList.add('touch-device');

  // ── Overlay DOM (visible only on body.touch-device.in-game via CSS) ──
  const wrap = document.createElement('div');
  wrap.id = 'touch-controls';
  moveEls = makeStick(wrap);
  aimEls = makeStick(wrap);
  makeButton(wrap, 'DASH', 'tc-dash',
    () => { touch.dash = true; }, () => { touch.dash = false; });
  makeButton(wrap, 'Q', 'tc-q',
    () => { touch.ability = true; }, () => { touch.ability = false; });
  makeButton(wrap, 'RMB', 'tc-rmb',
    () => { touch.shoot2 = true; }, () => { touch.shoot2 = false; });
  makeButton(wrap, 'ULT', 'tc-ult',
    () => { touch.ult = true; }, () => { touch.ult = false; });
  document.body.appendChild(wrap);

  const pauseBtn = document.createElement('button');
  pauseBtn.id = 'touch-pause';
  pauseBtn.textContent = '❚❚';
  pauseBtn.addEventListener('touchend', (e: TouchEvent) => {
    e.preventDefault();
    if (state.gamePhase === GamePhase.Playing && !state.shopOpen) openPause(state);
  });
  document.body.appendChild(pauseBtn);

  // Tap anywhere on the pause overlay to resume (ESC still works).
  const pauseScreen = document.getElementById('pause-screen');
  if (pauseScreen) {
    const resume = (): void => {
      if (state.gamePhase === GamePhase.Paused) closePause(state);
    };
    pauseScreen.addEventListener('click', resume);
    pauseScreen.addEventListener('touchend', (e: TouchEvent) => {
      e.preventDefault();
      resume();
    });
  }

  if (IS_MOBILE) {
    const shopHint = document.querySelector('.shop-hint');
    if (shopHint) shopHint.textContent = 'Tap an item to buy';
    const pauseHint = document.querySelector('.pause-hint');
    if (pauseHint) pauseHint.textContent = 'Tap anywhere to resume';
  }

  // ── Canvas stick handling ──
  // Long-press on controls must never open the browser context menu
  wrap.addEventListener('contextmenu', (e: Event) => e.preventDefault());

  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (!document.body.classList.contains('in-game')) return;
    e.preventDefault(); // also suppresses synthesized mouse events
    activateTouch();
    tryImmersive();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      const moveZone = t.clientX < window.innerWidth * MOVE_ZONE_FRAC;
      if (moveZone && moveId === null) {
        moveId = t.identifier;
        moveBaseX = t.clientX;
        moveBaseY = t.clientY;
        showStick(moveEls, moveBaseX, moveBaseY);
      } else if (!moveZone && aimId === null) {
        aimId = t.identifier;
        aimBaseX = t.clientX;
        aimBaseY = t.clientY;
        showStick(aimEls, aimBaseX, aimBaseY);
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e: TouchEvent) => {
    if (!document.body.classList.contains('in-game')) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveId) {
        let dx = t.clientX - moveBaseX;
        let dy = t.clientY - moveBaseY;
        let dist = Math.hypot(dx, dy);
        // Leash: the base follows an overshooting thumb, so direction changes
        // always register instead of pinning to the original anchor.
        if (dist > STICK_RADIUS) {
          const excess = (dist - STICK_RADIUS) / dist;
          moveBaseX += dx * excess;
          moveBaseY += dy * excess;
          setStickBase(moveEls, moveBaseX, moveBaseY);
          dx = t.clientX - moveBaseX;
          dy = t.clientY - moveBaseY;
          dist = STICK_RADIUS;
        }
        moveStickNub(moveEls, dx, dy);
        const mag = Math.min(1, dist / STICK_RADIUS);
        if (mag < MOVE_DEADZONE) {
          touch.mx = 0;
          touch.my = 0;
        } else {
          const scaled = (mag - MOVE_DEADZONE) / (1 - MOVE_DEADZONE);
          const a = Math.atan2(dy, dx);
          touch.mx = Math.cos(a) * scaled;
          touch.my = Math.sin(a) * scaled;
        }
      } else if (t.identifier === aimId) {
        let dx = t.clientX - aimBaseX;
        let dy = t.clientY - aimBaseY;
        let dist = Math.hypot(dx, dy);
        if (dist > STICK_RADIUS) {
          const excess = (dist - STICK_RADIUS) / dist;
          aimBaseX += dx * excess;
          aimBaseY += dy * excess;
          setStickBase(aimEls, aimBaseX, aimBaseY);
          dx = t.clientX - aimBaseX;
          dy = t.clientY - aimBaseY;
          dist = STICK_RADIUS;
        }
        moveStickNub(aimEls, dx, dy);
        if (dist >= AIM_DEADZONE_PX) {
          touch.aimAngle = Math.atan2(dy, dx);
          touch.aimActive = true;
        } else {
          touch.aimActive = false;
        }
      }
    }
  }, { passive: false });

  // ── Haptic pulses on gameplay events (Android) ──
  // Polled from the main loop; compares against previous values so it needs
  // no hooks into the combat pipeline.
  let prevHp = Infinity;
  let prevLives = Infinity;
  let prevUltReady = false;
  let lastHitBuzz = 0;
  feedbackTick = (): void => {
    if (!IS_MOBILE) return;
    const p = state.players[state.localIdx];
    if (!p) { prevHp = Infinity; prevLives = Infinity; prevUltReady = false; return; }
    const now = performance.now();
    if (p.hp < prevHp && now - lastHitBuzz > 200) {
      buzz(25);
      lastHitBuzz = now;
    }
    prevHp = p.hp;
    if (state.lives < prevLives && prevLives !== Infinity) buzz(90);
    prevLives = state.lives;
    const ultReady = p.ultCharge >= 100;
    if (ultReady && !prevUltReady) buzz(35);
    prevUltReady = ultReady;
  };

  const endTouch = (e: TouchEvent): void => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveId) {
        moveId = null;
        touch.mx = 0;
        touch.my = 0;
        hideStick(moveEls);
      } else if (t.identifier === aimId) {
        aimId = null;
        touch.aimActive = false; // aimAngle persists as "last aim direction"
        hideStick(aimEls);
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}
