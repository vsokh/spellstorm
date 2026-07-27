import { GameState } from './state';
import { GamePhase } from './types';
import { openPause, closePause } from './systems/pause';

// ═══════════════════════════════════
//     TOUCH INPUT (mobile port)
// ═══════════════════════════════════
//
// Twin-stick layout: floating joystick on the left half moves, floating
// joystick on the right half aims + fires the primary attack. DOM buttons
// (bottom-right cluster) cover Q / RMB / ULT / DASH and support press-and-hold
// so charged spells keep working. Output is merged into getInput() in
// input.ts — desktop keyboard/mouse behavior is unchanged.

/** True phones/tablets. Touch-screen laptops keep the desktop experience
 *  (the sticks still activate if the screen is actually touched). */
export const IS_MOBILE: boolean =
  typeof window !== 'undefined' &&
  window.matchMedia('(pointer: coarse) and (hover: none)').matches;

/** Phones render a slightly zoomed-out view so more of the arena is visible.
 *  Rendering-only: gameplay never reads canvas dimensions. */
const MOBILE_ZOOM = 1.3;
export function getRenderZoom(): number {
  return IS_MOBILE ? MOBILE_ZOOM : 1;
}

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
  btn.addEventListener('touchstart', (e: TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onDown();
  }, { passive: false });
  const up = (e: Event): void => { e.preventDefault(); onUp(); };
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
  canvas.addEventListener('touchstart', (e: TouchEvent) => {
    if (!document.body.classList.contains('in-game')) return;
    e.preventDefault(); // also suppresses synthesized mouse events
    activateTouch();
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
        const dist = Math.hypot(dx, dy);
        if (dist > STICK_RADIUS) {
          dx *= STICK_RADIUS / dist;
          dy *= STICK_RADIUS / dist;
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
        const dist = Math.hypot(dx, dy);
        if (dist > STICK_RADIUS) {
          dx *= STICK_RADIUS / dist;
          dy *= STICK_RADIUS / dist;
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
