import { GameState, lerp, clamp } from '../state';
import { ROOM_WIDTH, ROOM_HEIGHT } from '../constants';

// ═══════════════════════════════════
//       CAMERA UPDATE
// ═══════════════════════════════════

export function updateCamera(state: GameState): void {
  const p = state.players[state.localIdx];
  if (!p || !p.alive) return;

  let tx: number;
  let ty: number;

  if (state.width >= ROOM_WIDTH) {
    tx = (state.width - ROOM_WIDTH) / 2;
  } else {
    tx = clamp(state.width / 2 - p.x, state.width - ROOM_WIDTH - 20, 20);
  }

  // 60px is the HUD height
  if (state.height >= ROOM_HEIGHT + 60) {
    ty = (state.height - 60 - ROOM_HEIGHT) / 2;
  } else {
    ty = clamp(state.height / 2 - p.y, state.height - ROOM_HEIGHT - 60, 20);
  }

  // Snap on first frame, then lerp for smooth following
  if (state.camX === 0 && state.camY === 0) {
    state.camX = tx;
    state.camY = ty;
  } else {
    state.camX = lerp(state.camX, tx, 0.25);
    state.camY = lerp(state.camY, ty, 0.25);
  }
}
