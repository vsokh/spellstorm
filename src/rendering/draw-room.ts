import { GameState } from '../state';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  GRID_SPACING,
  WALL_THICKNESS,
} from '../constants';
import { GamePhase } from '../types';

// ═══════════════════════════════════
//       DRAW ROOM
// ═══════════════════════════════════

export function drawRoom(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Floor
  ctx.fillStyle = '#0d0a14';
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

  // Grid
  ctx.strokeStyle = 'rgba(60,40,80,.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < ROOM_WIDTH; x += GRID_SPACING) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, ROOM_HEIGHT);
    ctx.stroke();
  }
  for (let y = 0; y < ROOM_HEIGHT; y += GRID_SPACING) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(ROOM_WIDTH, y);
    ctx.stroke();
  }

  // Walls
  ctx.fillStyle = '#1a1428';
  ctx.fillRect(0, 0, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, ROOM_HEIGHT - WALL_THICKNESS, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, 0, WALL_THICKNESS, ROOM_HEIGHT);
  ctx.fillRect(ROOM_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, ROOM_HEIGHT);

  // Wave indicator in arena — "NEXT WAVE IN X"
  if (!state.waveActive && state.waveBreakTimer > 0 && state.gamePhase === GamePhase.Playing) {
    ctx.fillStyle = 'rgba(180,150,60,.3)';
    ctx.font = 'bold 24px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`NEXT WAVE IN ${Math.ceil(state.waveBreakTimer)}`, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 20);
  }

  // Enemy count during wave
  if (state.waveActive) {
    const alive = state.enemies.filter(e => e.alive && !e._friendly).length;
    ctx.fillStyle = 'rgba(150,80,80,.2)';
    ctx.font = '12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`${alive} enemies remaining`, ROOM_WIDTH / 2, ROOM_HEIGHT - 16);
  }
}

export function drawPillars(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.pillars) {
    const g = ctx.createRadialGradient(p.x - p.radius * 0.2, p.y - p.radius * 0.2, p.radius * 0.1, p.x, p.y, p.radius);
    g.addColorStop(0, '#2a2235');
    g.addColorStop(1, '#151020');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(100,70,140,.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
}
