import { GameState } from '../state';
import { GamePhase, NetworkMode, SfxName } from '../types';
import { UPGRADE_POOL, upgradeChoiceCount, CLASSES } from '../constants';
import { sfx } from '../audio';
import { sendMessage } from '../network';

// ═══════════════════════════════════
//       UPGRADE SYSTEM
// ═══════════════════════════════════

/** Generate upgrade indices filtered by class and already-taken upgrades. */
export function generateUpgradeIndices(clsKey: string, taken: Map<number, number>, wave?: number): number[] {
  // Filter: skip other classes, skip already-taken non-stackable, handle evolutions
  const genericIndices: number[] = [];
  const classIndices: number[] = [];

  for (let i = 0; i < UPGRADE_POOL.length; i++) {
    const up = UPGRADE_POOL[i];
    // Skip evolution upgrades in normal selection — they're injected below
    if (up.isEvolution) continue;
    // Cursed upgrades handled separately
    if (up.isCursed) continue;
    // Skip if already taken and not stackable
    if (taken.has(i) && !up.stackable) continue;
    // Skip if stackable but at max stacks
    if (up.stackable && up.maxStacks && (taken.get(i) || 0) >= up.maxStacks) continue;
    // Skip if for another class
    if (up.forClass && up.forClass !== clsKey) continue;
    // Skip if offer condition not met (e.g. positional bonus upgrades only for matching passives)
    if (up.offerCondition && CLASSES[clsKey] && !up.offerCondition(CLASSES[clsKey].passive)) continue;

    if (up.forClass === clsKey) classIndices.push(i);
    else genericIndices.push(i);
  }

  // Inject evolution upgrades whose parent is maxed and not already taken
  for (let i = 0; i < UPGRADE_POOL.length; i++) {
    const up = UPGRADE_POOL[i];
    if (!up.isEvolution || up.evolvesFrom === undefined) continue;
    if (taken.has(i)) continue; // already taken this evolution
    if (up.forClass && up.forClass !== clsKey) continue;
    const parentStacks = taken.get(up.evolvesFrom) || 0;
    const parent = UPGRADE_POOL[up.evolvesFrom];
    if (parent.maxStacks && parentStacks >= parent.maxStacks) {
      if (up.forClass === clsKey) classIndices.push(i);
      else genericIndices.push(i);
    }
  }

  const indices: number[] = [];

  // 1 guaranteed class-specific (if available)
  if (classIndices.length > 0) {
    const pick = Math.floor(Math.random() * classIndices.length);
    indices.push(classIndices.splice(pick, 1)[0]);
  }

  // Fill remaining with mix of generic + class-specific
  const remaining = [...genericIndices, ...classIndices];
  const numChoices = upgradeChoiceCount(wave || 1);
  while (indices.length < numChoices && remaining.length > 0) {
    const pick = Math.floor(Math.random() * remaining.length);
    const idx = remaining.splice(pick, 1)[0];
    if (!indices.includes(idx)) indices.push(idx);
  }

  // Inject 1 cursed upgrade as extra choice from wave 16+
  if (wave && wave >= 16) {
    const cursedPool: number[] = [];
    for (let i = 0; i < UPGRADE_POOL.length; i++) {
      const up = UPGRADE_POOL[i];
      if (!up.isCursed) continue;
      if (taken.has(i) && !up.stackable) continue;
      cursedPool.push(i);
    }
    if (cursedPool.length > 0) {
      const pick = Math.floor(Math.random() * cursedPool.length);
      indices.push(cursedPool[pick]);
    }
  }

  return indices;
}

export function showUpgradeScreen(state: GameState): void {
  state.gamePhase = GamePhase.Upgrade;
  document.body.classList.remove('in-game');
  if (document.pointerLockElement) document.exitPointerLock();
  state.upgradePickedLocal = false;
  state.upgradePickedRemote = false;

  // Pick upgrades filtered by the local player's class and taken upgrades
  const localPlayer = state.players[state.localIdx];
  const clsKey = localPlayer?.clsKey || '';
  const taken = localPlayer?.takenUpgrades || new Map<number, number>();
  const indices = generateUpgradeIndices(clsKey, taken, state.wave);
  state.pendingUpgradeChoices = indices;

  // Signal upgrade phase to guest (indices are host-specific; guest generates its own)
  if (state.mode === NetworkMode.Host) {
    sendMessage(state, { type: 'upgrade', indices });
  }

  showUpgradeUI(state, indices);
}

export function showUpgradeFromHost(state: GameState, _indices: number[]): void {
  state.gamePhase = GamePhase.Upgrade;
  document.body.classList.remove('in-game');
  if (document.pointerLockElement) document.exitPointerLock();
  state.upgradePickedLocal = false;

  // Generate the guest's OWN upgrade choices based on their class and taken upgrades
  const localPlayer = state.players[state.localIdx];
  const clsKey = localPlayer?.clsKey || '';
  const taken = localPlayer?.takenUpgrades || new Map<number, number>();
  const guestIndices = generateUpgradeIndices(clsKey, taken, state.wave);
  state.pendingUpgradeChoices = guestIndices;
  showUpgradeUI(state, guestIndices);
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
    const isEvo = !!up.isEvolution;
    const nameColor = isEvo ? '#ffaa00' : up.color || (isClassSpecific ? '#ffcc44' : '#ddcc66');
    const classTag = isClassSpecific && !isEvo ? `<span style="font-size:8px;color:${up.color || '#888'};opacity:.7"> ★ CLASS</span>` : '';
    const evoTag = isEvo ? `<span style="font-size:8px;color:#ffaa00;opacity:.9"> ⚡ EVOLUTION</span>` : '';
    const isCursed = !!up.isCursed;
    const cursedTag = isCursed ? '<span style="font-size:8px;color:#cc3333;opacity:.9"> ☠ CURSED</span>' : '';
    const count = taken.get(idx) || 0;
    const stackInfo = up.stackable && up.maxStacks
      ? ` <span style="font-size:9px;color:#88aa66">${count}/${up.maxStacks}</span>`
      : up.stackable ? ` <span style="font-size:8px;color:#556644;opacity:.6"> ×${up.maxStacks || '∞'}</span>` : '';
    card.innerHTML = `<div class="uname" style="color:${nameColor}">${up.name}${classTag}${evoTag}${cursedTag}${stackInfo}</div><div class="udesc">${up.desc}</div>`;
    if (isClassSpecific && !isEvo) card.style.borderColor = (up.color || '#ffcc44') + '44';
    if (isEvo) card.style.borderColor = '#ffaa0066';
    if (isCursed) { card.style.borderColor = '#cc333388'; card.classList.add('cursed'); }
    card.onclick = () => {
      if (state.upgradePickedLocal) return;
      state.upgradePickedLocal = true;
      // Apply to local player only
      const myPlayer = state.players[state.localIdx];
      if (myPlayer) {
        const newCount = (myPlayer.takenUpgrades.get(idx) || 0) + 1;
        myPlayer.takenUpgrades.set(idx, newCount);
        up.apply(myPlayer, newCount);
      }
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
