import { GameState } from '../state';
import { NetworkMode } from '../types';
import { initAudio } from '../audio';
import { hostGame, joinGame } from '../network';

// ═══════════════════════════════════
//       LOBBY SCREEN
// ═══════════════════════════════════

/**
 * Wire up lobby button handlers. Returns callbacks for the three lobby actions.
 * The caller (main.ts) provides onShowSelect so we avoid circular deps.
 */
export function setupLobby(
  state: GameState,
  onShowSelect: () => void,
): void {
  // Expose lobby functions to onclick handlers in HTML
  (window as unknown as Record<string, unknown>)['hostGame'] = () => hostGame(state);
  (window as unknown as Record<string, unknown>)['joinGame'] = () => joinGame(state);
  (window as unknown as Record<string, unknown>)['startLocal'] = () => {
    initAudio();
    state.mode = NetworkMode.Local;
    state.localIdx = 0;
    onShowSelect();
  };
}
