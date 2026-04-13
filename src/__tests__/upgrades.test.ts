import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

// Mock audio
vi.mock('../audio', () => ({ sfx: vi.fn() }));

// Mock network
vi.mock('../network', () => ({ sendMessage: vi.fn() }));

import { showUpgradeScreen } from '../systems/upgrades';
import { createTestState, createTestPlayer } from './helpers';
import { UPGRADE_POOL } from '../constants';
import { GamePhase, NetworkMode } from '../types';
import type { GameState } from '../state';

let state: GameState;

// Set up minimal DOM stubs
const origDocument = globalThis.document;

beforeEach(() => {
  state = createTestState();

  // Minimal document stub
  (globalThis as any).document = {
    exitPointerLock: vi.fn(),
    pointerLockElement: null,
    getElementById: vi.fn((id: string) => {
      if (id === 'upgrade-screen') {
        return { style: { display: '' }, innerHTML: '' };
      }
      if (id === 'upgrade-grid') {
        return {
          style: { display: '' },
          innerHTML: '',
          appendChild: vi.fn(),
        };
      }
      return null;
    }),
    createElement: vi.fn(() => ({
      className: '',
      innerHTML: '',
      style: { borderColor: '' },
      onclick: null,
      appendChild: vi.fn(),
    })),
    body: {
      classList: {
        remove: vi.fn(),
        add: vi.fn(),
      },
    },
  };
});

afterAll(() => {
  (globalThis as any).document = origDocument;
});

describe('showUpgradeScreen()', () => {
  it('sets gamePhase to Upgrade', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    showUpgradeScreen(state);

    expect(state.gamePhase).toBe(GamePhase.Upgrade);
  });

  it('resets upgrade picked flags', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];
    state.upgradePickedLocal = true;
    state.upgradePickedRemote = true;

    showUpgradeScreen(state);

    expect(state.upgradePickedLocal).toBe(false);
    expect(state.upgradePickedRemote).toBe(false);
  });

  it('populates pendingUpgradeChoices with indices', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    showUpgradeScreen(state);

    expect(state.pendingUpgradeChoices).not.toBeNull();
    expect(state.pendingUpgradeChoices!.length).toBeGreaterThan(0);
    expect(state.pendingUpgradeChoices!.length).toBeLessThanOrEqual(3);
  });

  it('includes class-specific upgrades for the local player class', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    // Run many times to account for randomness
    let foundClassUpgrade = false;
    for (let trial = 0; trial < 50; trial++) {
      state.pendingUpgradeChoices = null;
      showUpgradeScreen(state);
      const choices = state.pendingUpgradeChoices as number[] | null;
      if (choices) {
        for (const idx of choices) {
          const up = UPGRADE_POOL[idx];
          if (up.forClass === 'pyromancer') {
            foundClassUpgrade = true;
            break;
          }
        }
      }
      if (foundClassUpgrade) break;
    }

    expect(foundClassUpgrade).toBe(true);
  });

  it('excludes upgrades for other classes', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    for (let trial = 0; trial < 20; trial++) {
      state.pendingUpgradeChoices = null;
      showUpgradeScreen(state);
      const choices = state.pendingUpgradeChoices as number[] | null;
      if (choices) {
        for (const idx of choices) {
          const up = UPGRADE_POOL[idx];
          if (up.forClass) {
            expect(up.forClass).toBe('pyromancer');
          }
        }
      }
    }
  });

  it('excludes already-taken non-stackable upgrades', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    // Find a non-stackable generic upgrade and mark it as taken
    let takenIdx = -1;
    for (let i = 0; i < UPGRADE_POOL.length; i++) {
      const up = UPGRADE_POOL[i];
      if (!up.forClass && !up.stackable && !up.isEvolution) {
        takenIdx = i;
        break;
      }
    }

    if (takenIdx >= 0) {
      p.takenUpgrades.set(takenIdx, 1);

      for (let trial = 0; trial < 20; trial++) {
        state.pendingUpgradeChoices = null;
        showUpgradeScreen(state);
        if (state.pendingUpgradeChoices) {
          expect(state.pendingUpgradeChoices).not.toContain(takenIdx);
        }
      }
    }
  });

  it('does not include evolution upgrades by default', () => {
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];

    for (let trial = 0; trial < 20; trial++) {
      state.pendingUpgradeChoices = null;
      showUpgradeScreen(state);
      const choices = state.pendingUpgradeChoices as number[] | null;
      if (choices) {
        for (const idx of choices) {
          const up = UPGRADE_POOL[idx];
          // Evolution upgrades should only appear if parent is maxed
          if (up.isEvolution && up.evolvesFrom !== undefined) {
            const parent = UPGRADE_POOL[up.evolvesFrom];
            const parentStacks = p.takenUpgrades.get(up.evolvesFrom) || 0;
            expect(parent.maxStacks).toBeDefined();
            expect(parentStacks).toBeGreaterThanOrEqual(parent.maxStacks!);
          }
        }
      }
    }
  });

  it('sends upgrade message when in host mode', async () => {
    const { sendMessage } = await import('../network') as any;
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];
    state.mode = NetworkMode.Host;

    showUpgradeScreen(state);

    expect(sendMessage).toHaveBeenCalledWith(
      state,
      expect.objectContaining({ type: 'upgrade', indices: expect.any(Array) })
    );
  });

  it('does not send upgrade message in solo mode', async () => {
    const { sendMessage } = await import('../network') as any;
    (sendMessage as ReturnType<typeof vi.fn>).mockClear();
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];
    state.mode = NetworkMode.None;

    showUpgradeScreen(state);

    expect(sendMessage).not.toHaveBeenCalled();
  });
});
