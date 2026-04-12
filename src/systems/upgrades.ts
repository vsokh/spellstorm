import { GameState } from '../state';
import { GamePhase, NetworkMode, SfxName } from '../types';
import { UPGRADE_POOL } from '../constants';
import { sfx } from '../audio';
import { sendMessage } from '../network';

// ═══════════════════════════════════
//       UPGRADE SYSTEM
// ═══════════════════════════════════

export function showUpgradeScreen(state: GameState): void {
  state.gamePhase = GamePhase.Upgrade;
  document.body.classList.remove('in-game');
  if (document.pointerLockElement) document.exitPointerLock();
  state.upgradePickedLocal = false;
  state.upgradePickedRemote = false;

  // Pick 3 random upgrade indices
  const indices: number[] = [];
  const available = Array.from({ length: UPGRADE_POOL.length }, (_, i) => i);
  for (let i = 0; i < 3 && available.length > 0; i++) {
    const pick = Math.floor(Math.random() * available.length);
    indices.push(available.splice(pick, 1)[0]);
  }
  state.pendingUpgradeChoices = indices;

  // Send choices to guest
  if (state.mode === NetworkMode.Host) {
    sendMessage(state, { type: 'upgrade', indices });
  }

  showUpgradeUI(state, indices);
}

export function showUpgradeFromHost(state: GameState, indices: number[]): void {
  state.gamePhase = GamePhase.Upgrade;
  document.body.classList.remove('in-game');
  if (document.pointerLockElement) document.exitPointerLock();
  state.upgradePickedLocal = false;
  state.pendingUpgradeChoices = indices;
  showUpgradeUI(state, indices);
}

function showUpgradeUI(state: GameState, indices: number[]): void {
  const screen = document.getElementById('upgrade-screen');
  const grid = document.getElementById('upgrade-grid');
  if (!screen || !grid) return;
  screen.style.display = 'flex';
  grid.innerHTML = '';

  for (const idx of indices) {
    const up = UPGRADE_POOL[idx];
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    card.innerHTML = `<div class="uname">${up.name}</div><div class="udesc">${up.desc}</div>`;
    card.onclick = () => {
      if (state.upgradePickedLocal) return;
      state.upgradePickedLocal = true;
      // Apply to local player only
      const myPlayer = state.players[state.localIdx];
      if (myPlayer) up.apply(myPlayer);
      sfx(SfxName.Pickup);
      card.style.borderColor = '#44cc44';

      // Tell the other side
      if (state.mode === NetworkMode.Host) {
        sendMessage(state, { type: 'host_picked', idx });
        checkBothPicked(state);
      } else if (state.mode === NetworkMode.Guest) {
        sendMessage(state, { type: 'guest_picked', idx });
        // Guest waits for host to resume
        grid.innerHTML = '<div style="color:#554466;padding:20px">Waiting for host...</div>';
      } else {
        // Local/solo - just continue
        finishUpgrade(state);
      }
    };
    grid.appendChild(card);
  }
}

export function checkBothPicked(state: GameState): void {
  if (state.upgradePickedLocal && state.upgradePickedRemote) {
    finishUpgrade(state);
  } else if (state.upgradePickedLocal) {
    const grid = document.getElementById('upgrade-grid');
    if (grid) grid.innerHTML = '<div style="color:#554466;padding:20px">Waiting for partner...</div>';
  }
}

export function finishUpgrade(state: GameState): void {
  const screen = document.getElementById('upgrade-screen');
  if (screen) screen.style.display = 'none';
  document.body.classList.add('in-game');
  state.gamePhase = GamePhase.Playing;

  // Tell guest to resume
  if (state.mode === NetworkMode.Host) {
    sendMessage(state, { type: 'resume' });
  }
}
