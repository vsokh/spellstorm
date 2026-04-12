import { GameState } from '../state';
import { NetworkMode } from '../types';
import { CLASSES, CLASS_ORDER } from '../constants';
import { sendMessage } from '../network';

// ═══════════════════════════════════
//       CLASS SELECTION SCREEN
// ═══════════════════════════════════

export function showSelect(state: GameState): void {
  const lobby = document.getElementById('lobby');
  const selectScreen = document.getElementById('select-screen');
  if (lobby) lobby.style.display = 'none';
  if (selectScreen) selectScreen.style.display = 'flex';
  buildGrid(state);
}

function buildGrid(state: GameState): void {
  const grid = document.getElementById('class-grid');
  if (!grid) return;
  grid.innerHTML = '';

  CLASS_ORDER.forEach((k, i) => {
    const c = CLASSES[k];
    const card = document.createElement('div');
    card.className = 'class-card' + (i === state.selectedClassIndex ? ' selected' : '');

    const spList = c.spells.map(s =>
      `<span style="color:${s.color || c.color}">${s.key}</span> ${s.name}`
    ).join(' &middot; ');

    card.innerHTML = `<div class="cname" style="color:${c.color}">${c.name}</div>` +
      `<div class="cdesc">${c.desc}</div>` +
      `<div class="cdesc" style="margin-top:3px;color:#554466;font-size:9px">Passive: ${c.passive.desc}</div>` +
      `<div class="cdesc" style="font-size:9px;margin-top:2px">${spList}</div>`;

    card.onclick = () => {
      state.selectedClassIndex = i;
      buildGrid(state);
    };
    grid.appendChild(card);
  });
}

/**
 * Wire up the confirmClass button. The caller provides onBeginGame.
 */
export function setupClassSelect(
  state: GameState,
  onBeginGame: (c1: string, c2: string) => void,
): void {
  (window as unknown as Record<string, unknown>)['confirmClass'] = () => {
    const cls = CLASS_ORDER[state.selectedClassIndex];

    if (state.mode === NetworkMode.Local) {
      onBeginGame(cls, cls);
    } else if (state.mode === NetworkMode.Host) {
      state.hostClassKey = cls;
      const statusEl = document.getElementById('select-status');
      if (statusEl) statusEl.textContent = 'Waiting for partner...';
      if (state.guestClassKey) {
        sendMessage(state, { type: 'go', h: cls, g: state.guestClassKey });
        onBeginGame(cls, state.guestClassKey);
      }
    } else if (state.mode === NetworkMode.Guest) {
      sendMessage(state, { type: 'cls', cls });
      const statusEl = document.getElementById('select-status');
      if (statusEl) statusEl.textContent = 'Waiting for host...';
    }
  };
}
