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

  // Pick 3 upgrades: filter already-taken, guarantee 1 class-specific
  const localPlayer = state.players[state.localIdx];
  const clsKey = localPlayer?.clsKey || '';
  const taken = localPlayer?.takenUpgrades || new Map<number, number>();

  // Filter: skip other classes, skip already-taken non-stackable
  const genericIndices: number[] = [];
  const classIndices: number[] = [];
  for (let i = 0; i < UPGRADE_POOL.length; i++) {
    const up = UPGRADE_POOL[i];
    // Skip if already taken and not stackable
    if (taken.has(i) && !up.stackable) continue;
    // Skip if stackable but at max stacks
    if (up.stackable && up.maxStacks && (taken.get(i) || 0) >= up.maxStacks) continue;
    // Skip if for another class
    if (up.forClass && up.forClass !== clsKey) continue;

    if (up.forClass === clsKey) classIndices.push(i);
    else genericIndices.push(i);
  }

  const indices: number[] = [];

  // 1 guaranteed class-specific (if available)
  if (classIndices.length > 0) {
    const pick = Math.floor(Math.random() * classIndices.length);
    indices.push(classIndices.splice(pick, 1)[0]);
  }

  // Fill remaining with mix of generic + class-specific
  const remaining = [...genericIndices, ...classIndices];
  while (indices.length < 3 && remaining.length > 0) {
    const pick = Math.floor(Math.random() * remaining.length);
    const idx = remaining.splice(pick, 1)[0];
    if (!indices.includes(idx)) indices.push(idx);
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
  const taken = state.players[state.localIdx]?.takenUpgrades || new Map<number, number>();
  const screen = document.getElementById('upgrade-screen');
  const grid = document.getElementById('upgrade-grid');
  if (!screen || !grid) return;
  screen.style.display = 'flex';
  grid.innerHTML = '';

  for (const idx of indices) {
    const up = UPGRADE_POOL[idx];
    const card = document.createElement('div');
    card.className = 'upgrade-card';
    const isClassSpecific = !!up.forClass;
    const nameColor = up.color || (isClassSpecific ? '#ffcc44' : '#ddcc66');
    const classTag = isClassSpecific ? `<span style="font-size:8px;color:${up.color || '#888'};opacity:.7"> ★ CLASS</span>` : '';
    const count = taken.get(idx) || 0;
    const stackCount = count > 0 ? ` <span style="font-size:9px;color:#88aa66">${count}/${up.maxStacks || '∞'}</span>` : '';
    const stackTag = up.stackable ? `<span style="font-size:8px;color:#556644;opacity:.6"> ×${up.maxStacks || '∞'}</span>` : '';
    card.innerHTML = `<div class="uname" style="color:${nameColor}">${up.name}${classTag}${stackTag}${stackCount}</div><div class="udesc">${up.desc}</div>`;
    if (isClassSpecific) card.style.borderColor = (up.color || '#ffcc44') + '44';
    card.onclick = () => {
      if (state.upgradePickedLocal) return;
      state.upgradePickedLocal = true;
      // Apply to local player only
      const myPlayer = state.players[state.localIdx];
      if (myPlayer) { up.apply(myPlayer); myPlayer.takenUpgrades.set(idx, (myPlayer.takenUpgrades.get(idx) || 0) + 1); }
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
