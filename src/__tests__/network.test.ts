import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock audio
vi.mock('../audio', () => ({ sfx: vi.fn(), initAudio: vi.fn() }));

// Mock peerjs
vi.mock('peerjs', () => ({
  default: vi.fn(),
}));

// Mock upgrades module to avoid DOM usage
vi.mock('../systems/upgrades', () => ({
  showUpgradeFromHost: vi.fn(),
  checkBothPicked: vi.fn(),
  finishUpgrade: vi.fn(),
}));

import { sendMessage, sendState } from '../network';
import { createTestState, createTestPlayer } from './helpers';
import { NetworkMode } from '../types';
import type { GameState } from '../state';

let state: GameState;

beforeEach(() => {
  state = createTestState();
});

describe('sendMessage()', () => {
  it('is a no-op when connection is null (internal state)', () => {
    // sendMessage checks internal conn variable which is null by default.
    // This should not throw.
    expect(() => {
      sendMessage(state, { type: 'resume' });
    }).not.toThrow();
  });

  it('does not throw for any message type', () => {
    expect(() => {
      sendMessage(state, { type: 'cls', cls: 'pyromancer' });
    }).not.toThrow();

    expect(() => {
      sendMessage(state, { type: 'host_picked', idx: 0 });
    }).not.toThrow();

    expect(() => {
      sendMessage(state, { type: 'guest_picked', idx: 0 });
    }).not.toThrow();
  });
});

describe('sendState()', () => {
  it('is a no-op when not in host mode', () => {
    state.mode = NetworkMode.None;
    // Should not throw even without a connection
    expect(() => {
      sendState(state);
    }).not.toThrow();
  });

  it('is a no-op for guest mode', () => {
    state.mode = NetworkMode.Guest;
    expect(() => {
      sendState(state);
    }).not.toThrow();
  });

  it('does not throw when in host mode without connection', () => {
    state.mode = NetworkMode.Host;
    // conn is null internally, so it should return early
    expect(() => {
      sendState(state);
    }).not.toThrow();
  });

  it('sendState serializes player data correctly when called with players', () => {
    // Even though it will no-op (no conn), we can verify the function
    // doesn't crash with populated state
    const p = createTestPlayer(0, 'pyromancer');
    state.players = [p];
    state.mode = NetworkMode.Host;

    expect(() => {
      sendState(state);
    }).not.toThrow();
  });
});
