import { GameState } from '../state';
import { NetworkMode } from '../types';
import { initAudio } from '../audio';
import { hostGame, joinGame } from '../network';

export function setupLobby(
  state: GameState,
  onShowSelect: () => void,
): void {
  const btnHost = document.getElementById('btn-host');
  const btnJoin = document.getElementById('btn-join');
  const btnSolo = document.getElementById('btn-solo');

  if (btnHost) {
    btnHost.addEventListener('click', () => hostGame(state));
  }
  if (btnJoin) {
    btnJoin.addEventListener('click', () => joinGame(state));
  }
  if (btnSolo) {
    btnSolo.addEventListener('click', () => {
      initAudio();
      state.mode = NetworkMode.Local;
      state.localIdx = 0;
      onShowSelect();
    });
  }
}
