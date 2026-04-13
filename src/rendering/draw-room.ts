import { GameState, rand } from '../state';
import {
  ROOM_WIDTH,
  ROOM_HEIGHT,
  WALL_THICKNESS,
} from '../constants';
import { GamePhase } from '../types';

// ═══════════════════════════════════
//       AMBIENT PARTICLES
// ═══════════════════════════════════

interface AmbientMote {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  hue: number; phase: number;
}

const ambientMotes: AmbientMote[] = [];
const MOTE_COUNT = 40;

function ensureMotes(): void {
  while (ambientMotes.length < MOTE_COUNT) {
    ambientMotes.push({
      x: Math.random() * ROOM_WIDTH,
      y: Math.random() * ROOM_HEIGHT,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 6 - 3, // drift upward
      size: 1 + Math.random() * 2.5,
      alpha: 0.05 + Math.random() * 0.15,
      hue: Math.random() > 0.6 ? 270 : (Math.random() > 0.5 ? 220 : 40),
      phase: Math.random() * Math.PI * 2,
    });
  }
}

function updateMotes(dt: number, time: number): void {
  for (let i = ambientMotes.length - 1; i >= 0; i--) {
    const m = ambientMotes[i];
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    m.alpha += Math.sin(time * 2 + m.phase) * dt * 0.02;
    // Wrap
    if (m.y < -10) { m.y = ROOM_HEIGHT + 5; m.x = Math.random() * ROOM_WIDTH; }
    if (m.x < -10 || m.x > ROOM_WIDTH + 10) { m.x = Math.random() * ROOM_WIDTH; m.y = Math.random() * ROOM_HEIGHT; }
  }
}

// ═══════════════════════════════════
//       FLOOR TILE CACHE
// ═══════════════════════════════════

let floorCanvas: OffscreenCanvas | null = null;

function generateFloorTexture(): OffscreenCanvas {
  const c = new OffscreenCanvas(ROOM_WIDTH, ROOM_HEIGHT);
  const ctx = c.getContext('2d')!;

  // Base dark floor
  ctx.fillStyle = '#0c0916';
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

  // Stone tile pattern (irregular)
  const TILE = 48;
  for (let ty = 0; ty < ROOM_HEIGHT; ty += TILE) {
    for (let tx = 0; tx < ROOM_WIDTH; tx += TILE) {
      const offset = (Math.floor(ty / TILE) % 2) * TILE * 0.5;
      const x = tx + offset;
      const brightness = 8 + Math.floor(Math.random() * 6);
      const hue = 260 + Math.floor(Math.random() * 20);
      ctx.fillStyle = `hsl(${hue}, 15%, ${brightness}%)`;
      ctx.fillRect(x + 1, ty + 1, TILE - 2, TILE - 2);

      // Branching crack networks
      if (Math.random() > 0.65) {
        ctx.strokeStyle = `rgba(40, 25, 60, ${0.1 + Math.random() * 0.1})`;
        ctx.lineWidth = 0.5;
        let crackX = x + Math.random() * TILE;
        let crackY = ty + Math.random() * TILE;
        const segments = 2 + Math.floor(Math.random() * 3);
        ctx.beginPath();
        ctx.moveTo(crackX, crackY);
        for (let s = 0; s < segments; s++) {
          const angle = Math.random() * Math.PI * 2;
          const len = 8 + Math.random() * 14;
          crackX += Math.cos(angle) * len;
          crackY += Math.sin(angle) * len;
          ctx.lineTo(crackX, crackY);
          // Branch off occasionally
          if (Math.random() > 0.5) {
            const bAngle = angle + (Math.random() - 0.5) * 1.5;
            const bLen = 5 + Math.random() * 10;
            ctx.moveTo(crackX, crackY);
            ctx.lineTo(crackX + Math.cos(bAngle) * bLen, crackY + Math.sin(bAngle) * bLen);
            ctx.moveTo(crackX, crackY);
          }
        }
        ctx.stroke();
      }
    }
  }

  // Grout lines (darker)
  ctx.strokeStyle = 'rgba(5, 3, 10, 0.4)';
  ctx.lineWidth = 1;
  for (let ty = 0; ty <= ROOM_HEIGHT; ty += TILE) {
    ctx.beginPath(); ctx.moveTo(0, ty); ctx.lineTo(ROOM_WIDTH, ty); ctx.stroke();
  }
  for (let tx = 0; tx <= ROOM_WIDTH; tx += TILE) {
    ctx.beginPath(); ctx.moveTo(tx, 0); ctx.lineTo(tx, ROOM_HEIGHT); ctx.stroke();
  }

  // Moss/lichen patches near grout intersections
  for (let i = 0; i < 15; i++) {
    const mx = Math.round(Math.random() * (ROOM_WIDTH / TILE)) * TILE + (Math.random() - 0.5) * 12;
    const my = Math.round(Math.random() * (ROOM_HEIGHT / TILE)) * TILE + (Math.random() - 0.5) * 12;
    const mossR = 4 + Math.random() * 8;
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, mossR);
    const lightness = 6 + Math.random() * 2;
    grad.addColorStop(0, `hsla(140, 20%, ${lightness}%, 0.15)`);
    grad.addColorStop(1, `hsla(140, 20%, ${lightness}%, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(mx - mossR, my - mossR, mossR * 2, mossR * 2);
  }

  // Worn/scuffed areas near center
  const floorCx = ROOM_WIDTH / 2, floorCy = ROOM_HEIGHT / 2;
  for (let i = 0; i < 5; i++) {
    const wx = floorCx + (Math.random() - 0.5) * 200;
    const wy = floorCy + (Math.random() - 0.5) * 140;
    const wr = 20 + Math.random() * 30;
    const wGrad = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wGrad.addColorStop(0, 'rgba(40, 30, 55, 0.06)');
    wGrad.addColorStop(1, 'rgba(40, 30, 55, 0)');
    ctx.fillStyle = wGrad;
    ctx.fillRect(wx - wr, wy - wr, wr * 2, wr * 2);
  }

  // Subtle color pooling
  const poolColors = [
    'rgba(50, 30, 70, 0.03)',
    'rgba(30, 25, 60, 0.03)',
    'rgba(60, 35, 50, 0.025)',
    'rgba(35, 30, 65, 0.03)',
  ];
  for (let i = 0; i < 4; i++) {
    const px = 100 + Math.random() * (ROOM_WIDTH - 200);
    const py = 80 + Math.random() * (ROOM_HEIGHT - 160);
    const pr = 60 + Math.random() * 80;
    const pGrad = ctx.createRadialGradient(px, py, 0, px, py, pr);
    pGrad.addColorStop(0, poolColors[i]);
    pGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pGrad;
    ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
  }

  // Central magical rune circle
  const cx = ROOM_WIDTH / 2, cy = ROOM_HEIGHT / 2;

  // Inner hexagram (6-pointed star) at 90px
  ctx.strokeStyle = 'rgba(80, 50, 120, 0.07)';
  ctx.lineWidth = 1;
  for (let tri = 0; tri < 2; tri++) {
    ctx.beginPath();
    const rotOff = tri * (Math.PI / 6);
    for (let i = 0; i <= 3; i++) {
      const a = rotOff + (i / 3) * Math.PI * 2;
      const hx = cx + Math.cos(a) * 90;
      const hy = cy + Math.sin(a) * 90;
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // Inner ring
  ctx.strokeStyle = 'rgba(80, 50, 120, 0.08)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 120, 0, Math.PI * 2); ctx.stroke();

  // Outer ring
  ctx.beginPath(); ctx.arc(cx, cy, 180, 0, Math.PI * 2); ctx.stroke();

  // Outermost ring (dashed, faint)
  ctx.strokeStyle = 'rgba(80, 50, 120, 0.04)';
  ctx.lineWidth = 1;
  ctx.setLineDash([8, 12]);
  ctx.beginPath(); ctx.arc(cx, cy, 220, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);

  // Connecting radial lines through each rune position
  ctx.strokeStyle = 'rgba(80, 50, 120, 0.05)';
  ctx.lineWidth = 0.8;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 90, cy + Math.sin(a) * 90);
    ctx.lineTo(cx + Math.cos(a) * 220, cy + Math.sin(a) * 220);
    ctx.stroke();
  }

  // Elaborate rune glyphs at 8 positions
  ctx.strokeStyle = 'rgba(80, 50, 120, 0.07)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rx = cx + Math.cos(a) * 150;
    const ry = cy + Math.sin(a) * 150;
    const glyphType = i % 3;
    if (glyphType === 0) {
      // Circle with vertical line
      ctx.beginPath(); ctx.arc(rx, ry, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx, ry - 9); ctx.lineTo(rx, ry + 9); ctx.stroke();
    } else if (glyphType === 1) {
      // Triangle with center dot
      ctx.beginPath();
      for (let j = 0; j <= 3; j++) {
        const ta = a + (j / 3) * Math.PI * 2 - Math.PI / 2;
        const tx = rx + Math.cos(ta) * 7;
        const ty = ry + Math.sin(ta) * 7;
        if (j === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(80, 50, 120, 0.07)';
      ctx.beginPath(); ctx.arc(rx, ry, 1.5, 0, Math.PI * 2); ctx.fill();
    } else {
      // Diamond with cross
      ctx.beginPath();
      ctx.moveTo(rx, ry - 7); ctx.lineTo(rx + 5, ry); ctx.lineTo(rx, ry + 7); ctx.lineTo(rx - 5, ry);
      ctx.closePath(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx - 3, ry - 3); ctx.lineTo(rx + 3, ry + 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(rx + 3, ry - 3); ctx.lineTo(rx - 3, ry + 3); ctx.stroke();
    }
  }

  // Static rune glow (strengthened)
  const glowGrad = ctx.createRadialGradient(cx, cy, 80, cx, cy, 230);
  glowGrad.addColorStop(0, 'rgba(100, 60, 180, 0.06)');
  glowGrad.addColorStop(0.5, 'rgba(80, 50, 140, 0.04)');
  glowGrad.addColorStop(1, 'rgba(60, 30, 120, 0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath(); ctx.arc(cx, cy, 230, 0, Math.PI * 2); ctx.fill();

  // ── Walls: stone block pattern ──
  ctx.fillStyle = '#1a1428';
  ctx.fillRect(0, 0, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, ROOM_HEIGHT - WALL_THICKNESS, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, 0, WALL_THICKNESS, ROOM_HEIGHT);
  ctx.fillRect(ROOM_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, ROOM_HEIGHT);

  // Stone block lines on walls
  ctx.strokeStyle = 'rgba(30, 22, 48, 0.6)';
  ctx.lineWidth = 0.5;
  // Top/bottom walls: vertical lines for blocks
  for (let bx = 20; bx < ROOM_WIDTH; bx += 20 + Math.random() * 10) {
    ctx.beginPath(); ctx.moveTo(bx, 0); ctx.lineTo(bx, WALL_THICKNESS); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx, ROOM_HEIGHT - WALL_THICKNESS); ctx.lineTo(bx, ROOM_HEIGHT); ctx.stroke();
  }
  // Left/right walls: horizontal lines for blocks
  for (let by = 20; by < ROOM_HEIGHT; by += 16 + Math.random() * 8) {
    ctx.beginPath(); ctx.moveTo(0, by); ctx.lineTo(WALL_THICKNESS, by); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ROOM_WIDTH - WALL_THICKNESS, by); ctx.lineTo(ROOM_WIDTH, by); ctx.stroke();
  }

  // Moss patches at wall base (inner edge)
  for (let i = 0; i < 12; i++) {
    const side = Math.floor(Math.random() * 4);
    let mx: number, my: number;
    if (side === 0) { mx = Math.random() * ROOM_WIDTH; my = WALL_THICKNESS + Math.random() * 4; }
    else if (side === 1) { mx = Math.random() * ROOM_WIDTH; my = ROOM_HEIGHT - WALL_THICKNESS - Math.random() * 4; }
    else if (side === 2) { mx = WALL_THICKNESS + Math.random() * 4; my = Math.random() * ROOM_HEIGHT; }
    else { mx = ROOM_WIDTH - WALL_THICKNESS - Math.random() * 4; my = Math.random() * ROOM_HEIGHT; }
    const mr = 3 + Math.random() * 5;
    const mGrad = ctx.createRadialGradient(mx, my, 0, mx, my, mr);
    mGrad.addColorStop(0, 'hsla(140, 18%, 8%, 0.12)');
    mGrad.addColorStop(1, 'hsla(140, 18%, 8%, 0)');
    ctx.fillStyle = mGrad;
    ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
  }

  // ── Corner decorative brackets ──
  const cornerDist = 60;
  const corners: [number, number, number, number][] = [
    [cornerDist, cornerDist, 1, 1],
    [ROOM_WIDTH - cornerDist, cornerDist, -1, 1],
    [cornerDist, ROOM_HEIGHT - cornerDist, 1, -1],
    [ROOM_WIDTH - cornerDist, ROOM_HEIGHT - cornerDist, -1, -1],
  ];
  ctx.strokeStyle = 'rgba(60, 40, 90, 0.08)';
  ctx.lineWidth = 1.5;
  for (const [ccx, ccy, dx, dy] of corners) {
    // L-shaped bracket
    const armLen = 20;
    const endTick = 4;
    ctx.beginPath();
    ctx.moveTo(ccx - dx * armLen, ccy);
    ctx.lineTo(ccx, ccy);
    ctx.lineTo(ccx, ccy - dy * armLen);
    ctx.stroke();
    // Decorative end ticks
    ctx.beginPath();
    ctx.moveTo(ccx - dx * armLen, ccy - endTick);
    ctx.lineTo(ccx - dx * armLen, ccy + endTick);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ccx - endTick, ccy - dy * armLen);
    ctx.lineTo(ccx + endTick, ccy - dy * armLen);
    ctx.stroke();
    // Diamond at corner point
    const ds = 4;
    ctx.fillStyle = 'rgba(60, 40, 90, 0.06)';
    ctx.beginPath();
    ctx.moveTo(ccx, ccy - ds); ctx.lineTo(ccx + ds, ccy);
    ctx.lineTo(ccx, ccy + ds); ctx.lineTo(ccx - ds, ccy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Connecting lines toward nearest wall
    ctx.strokeStyle = 'rgba(60, 40, 90, 0.04)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath();
    ctx.moveTo(ccx - dx * armLen, ccy);
    ctx.lineTo(ccx - dx * (cornerDist - WALL_THICKNESS), ccy);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ccx, ccy - dy * armLen);
    ctx.lineTo(ccx, ccy - dy * (cornerDist - WALL_THICKNESS));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(60, 40, 90, 0.08)';
    ctx.lineWidth = 1.5;
  }

  // Vignette darkening at edges
  const vigGrad = ctx.createRadialGradient(cx, cy, Math.min(ROOM_WIDTH, ROOM_HEIGHT) * 0.3, cx, cy, Math.max(ROOM_WIDTH, ROOM_HEIGHT) * 0.6);
  vigGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vigGrad.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = vigGrad;
  ctx.fillRect(0, 0, ROOM_WIDTH, ROOM_HEIGHT);

  return c;
}

// ═══════════════════════════════════
//       TORCH POSITIONS
// ═══════════════════════════════════

interface Torch {
  x: number; y: number;
  side: 'top' | 'bottom' | 'left' | 'right';
  phase: number;
}

const torches: Torch[] = [
  // Top wall
  { x: ROOM_WIDTH * 0.3, y: WALL_THICKNESS, side: 'top', phase: 0 },
  { x: ROOM_WIDTH * 0.7, y: WALL_THICKNESS, side: 'top', phase: 1.7 },
  // Bottom wall
  { x: ROOM_WIDTH * 0.3, y: ROOM_HEIGHT - WALL_THICKNESS, side: 'bottom', phase: 0.9 },
  { x: ROOM_WIDTH * 0.7, y: ROOM_HEIGHT - WALL_THICKNESS, side: 'bottom', phase: 2.5 },
  // Left wall
  { x: WALL_THICKNESS, y: ROOM_HEIGHT * 0.5, side: 'left', phase: 1.3 },
  // Right wall
  { x: ROOM_WIDTH - WALL_THICKNESS, y: ROOM_HEIGHT * 0.5, side: 'right', phase: 2.1 },
];

// ═══════════════════════════════════
//       FOG PATCHES
// ═══════════════════════════════════

interface FogPatch {
  baseX: number; baseY: number;
  radius: number;
  alpha: number;
  hue: number;
  speedX: number; speedY: number;
  phaseX: number; phaseY: number;
}

const fogPatches: FogPatch[] = [
  { baseX: ROOM_WIDTH * 0.25, baseY: ROOM_HEIGHT * 0.3, radius: 120, alpha: 0.025, hue: 270, speedX: 0.15, speedY: 0.1, phaseX: 0, phaseY: 0 },
  { baseX: ROOM_WIDTH * 0.7, baseY: ROOM_HEIGHT * 0.6, radius: 140, alpha: 0.03, hue: 220, speedX: 0.12, speedY: 0.08, phaseX: 1.5, phaseY: 2.0 },
  { baseX: ROOM_WIDTH * 0.5, baseY: ROOM_HEIGHT * 0.8, radius: 100, alpha: 0.02, hue: 260, speedX: 0.18, speedY: 0.12, phaseX: 3.0, phaseY: 1.0 },
  { baseX: ROOM_WIDTH * 0.8, baseY: ROOM_HEIGHT * 0.25, radius: 110, alpha: 0.025, hue: 250, speedX: 0.1, speedY: 0.15, phaseX: 4.5, phaseY: 3.5 },
];

// ═══════════════════════════════════
//       DRAW ROOM
// ═══════════════════════════════════

export function drawRoom(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Generate floor texture once
  if (!floorCanvas) {
    floorCanvas = generateFloorTexture();
  }

  // Draw cached floor
  ctx.drawImage(floorCanvas, 0, 0);

  const t = state.time;
  const cx = ROOM_WIDTH / 2, cy = ROOM_HEIGHT / 2;

  // ── Animated rune glow ──

  // Soft radial gradient glow beneath rings (pulsing fill)
  const pulseAlpha = 0.03 + 0.02 * Math.sin(t * 0.6);
  const runeGlowGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, 200);
  runeGlowGrad.addColorStop(0, `rgba(100, 60, 180, ${pulseAlpha})`);
  runeGlowGrad.addColorStop(0.6, `rgba(80, 50, 160, ${pulseAlpha * 0.5})`);
  runeGlowGrad.addColorStop(1, 'rgba(60, 30, 120, 0)');
  ctx.fillStyle = runeGlowGrad;
  ctx.beginPath(); ctx.arc(cx, cy, 200, 0, Math.PI * 2); ctx.fill();

  // Animated ring strokes
  const runeAlpha = 0.025 + 0.02 * Math.sin(t * 0.8);
  ctx.strokeStyle = `rgba(120, 80, 200, ${runeAlpha})`;
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 120 + Math.sin(t * 0.5) * 3, t * 0.1, t * 0.1 + Math.PI * 1.8); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, 180 + Math.sin(t * 0.3) * 4, -t * 0.07, -t * 0.07 + Math.PI * 1.6); ctx.stroke();

  // Slowly rotating individual rune symbol glows
  ctx.fillStyle = `rgba(130, 90, 220, ${0.04 + 0.025 * Math.sin(t * 0.9)})`;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 0.05;
    const rx = cx + Math.cos(a) * 150;
    const ry = cy + Math.sin(a) * 150;
    const glowR = 8 + 3 * Math.sin(t * 1.2 + i * 0.8);
    const symGlow = ctx.createRadialGradient(rx, ry, 0, rx, ry, glowR);
    symGlow.addColorStop(0, `rgba(130, 90, 220, ${0.06 + 0.03 * Math.sin(t * 1.5 + i)})`);
    symGlow.addColorStop(1, 'rgba(130, 90, 220, 0)');
    ctx.fillStyle = symGlow;
    ctx.beginPath(); ctx.arc(rx, ry, glowR, 0, Math.PI * 2); ctx.fill();
  }

  // Spark effect along rings
  const sparkCount = 3;
  for (let i = 0; i < sparkCount; i++) {
    const sparkPhase = t * 0.7 + i * 2.09;
    const sparkAngle = sparkPhase % (Math.PI * 2);
    const ringChoice = (Math.floor(sparkPhase * 0.5 + i) % 2 === 0) ? 120 : 180;
    const sparkAlpha = 0.15 * Math.max(0, Math.sin(sparkPhase * 3));
    if (sparkAlpha > 0.01) {
      const sx = cx + Math.cos(sparkAngle) * ringChoice;
      const sy = cy + Math.sin(sparkAngle) * ringChoice;
      ctx.fillStyle = `rgba(200, 170, 255, ${sparkAlpha})`;
      ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  // ── Atmospheric fog patches ──
  for (const fog of fogPatches) {
    const fx = fog.baseX + Math.sin(t * fog.speedX + fog.phaseX) * 80;
    const fy = fog.baseY + Math.cos(t * fog.speedY + fog.phaseY) * 60;
    const fogGrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, fog.radius);
    fogGrad.addColorStop(0, `hsla(${fog.hue}, 30%, 12%, ${fog.alpha})`);
    fogGrad.addColorStop(1, `hsla(${fog.hue}, 30%, 12%, 0)`);
    ctx.fillStyle = fogGrad;
    ctx.fillRect(fx - fog.radius, fy - fog.radius, fog.radius * 2, fog.radius * 2);
  }

  // ── Wall torches ──
  for (const torch of torches) {
    // Torch light pool on floor
    let lightX = torch.x, lightY = torch.y;
    if (torch.side === 'top') lightY += 30;
    else if (torch.side === 'bottom') lightY -= 30;
    else if (torch.side === 'left') lightX += 30;
    else lightX -= 30;
    const lightAlpha = 0.03 + 0.015 * Math.sin(t * 3.5 + torch.phase);
    const lightGrad = ctx.createRadialGradient(lightX, lightY, 0, lightX, lightY, 60);
    lightGrad.addColorStop(0, `rgba(200, 150, 60, ${lightAlpha})`);
    lightGrad.addColorStop(1, 'rgba(200, 150, 60, 0)');
    ctx.fillStyle = lightGrad;
    ctx.beginPath(); ctx.arc(lightX, lightY, 60, 0, Math.PI * 2); ctx.fill();

    // Bracket shape
    ctx.strokeStyle = 'rgba(80, 60, 40, 0.4)';
    ctx.lineWidth = 1.5;
    let bx = torch.x, by = torch.y;
    if (torch.side === 'top') {
      ctx.beginPath(); ctx.moveTo(bx - 3, by - 2); ctx.lineTo(bx - 3, by + 5); ctx.lineTo(bx + 3, by + 5); ctx.lineTo(bx + 3, by - 2); ctx.stroke();
    } else if (torch.side === 'bottom') {
      ctx.beginPath(); ctx.moveTo(bx - 3, by + 2); ctx.lineTo(bx - 3, by - 5); ctx.lineTo(bx + 3, by - 5); ctx.lineTo(bx + 3, by + 2); ctx.stroke();
    } else if (torch.side === 'left') {
      ctx.beginPath(); ctx.moveTo(bx - 2, by - 3); ctx.lineTo(bx + 5, by - 3); ctx.lineTo(bx + 5, by + 3); ctx.lineTo(bx - 2, by + 3); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(bx + 2, by - 3); ctx.lineTo(bx - 5, by - 3); ctx.lineTo(bx - 5, by + 3); ctx.lineTo(bx + 2, by + 3); ctx.stroke();
    }

    // Flame (overlapping circles with flicker)
    let flameX = bx, flameY = by;
    if (torch.side === 'top') flameY += 6;
    else if (torch.side === 'bottom') flameY -= 6;
    else if (torch.side === 'left') flameX += 6;
    else flameX -= 6;
    const f1 = Math.sin(t * 8 + torch.phase) * 0.8;
    const f2 = Math.sin(t * 11 + torch.phase * 1.3) * 0.5;
    // Outer glow
    ctx.globalAlpha = 0.15 + 0.05 * Math.sin(t * 6 + torch.phase);
    ctx.fillStyle = '#c06020';
    ctx.beginPath(); ctx.arc(flameX + f1, flameY + f2 * 0.5, 4, 0, Math.PI * 2); ctx.fill();
    // Mid flame
    ctx.globalAlpha = 0.25 + 0.08 * Math.sin(t * 9 + torch.phase);
    ctx.fillStyle = '#d89030';
    ctx.beginPath(); ctx.arc(flameX + f2, flameY - f1 * 0.3, 2.8, 0, Math.PI * 2); ctx.fill();
    // Inner bright
    ctx.globalAlpha = 0.35 + 0.1 * Math.sin(t * 7 + torch.phase * 0.7);
    ctx.fillStyle = '#f0c050';
    ctx.beginPath(); ctx.arc(flameX, flameY, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Ambient floating motes
  ensureMotes();
  updateMotes(0.016, t);
  for (const m of ambientMotes) {
    const flicker = m.alpha + Math.sin(t * 1.5 + m.phase) * 0.03;
    if (flicker <= 0) continue;
    ctx.globalAlpha = Math.max(0, Math.min(0.25, flicker));
    ctx.fillStyle = `hsl(${m.hue}, 40%, 70%)`;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Walls — over everything else
  ctx.fillStyle = '#1a1428';
  ctx.fillRect(0, 0, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, ROOM_HEIGHT - WALL_THICKNESS, ROOM_WIDTH, WALL_THICKNESS);
  ctx.fillRect(0, 0, WALL_THICKNESS, ROOM_HEIGHT);
  ctx.fillRect(ROOM_WIDTH - WALL_THICKNESS, 0, WALL_THICKNESS, ROOM_HEIGHT);

  // Inner wall glow (pulsing purple edge light)
  ctx.strokeStyle = `rgba(100, 60, 160, ${0.1 + 0.05 * Math.sin(t * 1.2)})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(WALL_THICKNESS, WALL_THICKNESS, ROOM_WIDTH - WALL_THICKNESS * 2, ROOM_HEIGHT - WALL_THICKNESS * 2);

  // Wave indicator
  if (!state.waveActive && state.waveBreakTimer > 0 && state.gamePhase === GamePhase.Playing) {
    const waveAlpha = 0.2 + 0.1 * Math.sin(t * 3);
    ctx.fillStyle = `rgba(200, 170, 80, ${waveAlpha})`;
    ctx.font = 'bold 28px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(200, 170, 80, 0.3)';
    ctx.shadowBlur = 15;
    ctx.fillText(`NEXT WAVE IN ${Math.ceil(state.waveBreakTimer)}`, ROOM_WIDTH / 2, ROOM_HEIGHT / 2 - 20);
    ctx.shadowBlur = 0;
  }

  // Enemy count
  if (state.waveActive) {
    const alive = state.enemies.filter(e => e.alive && !e._friendly && e._deathTimer < 0).length;
    ctx.fillStyle = 'rgba(180,80,80,.15)';
    ctx.font = '11px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`${alive} enemies remaining`, ROOM_WIDTH / 2, ROOM_HEIGHT - 14);
  }
}

// ═══════════════════════════════════
//       DRAW PILLARS
// ═══════════════════════════════════

export function drawPillars(ctx: CanvasRenderingContext2D, state: GameState): void {
  const t = state.time;
  for (const p of state.pillars) {
    const r = p.radius;

    // Gradient ellipse shadow (wider spread)
    const shadowGrad = ctx.createRadialGradient(p.x + 2, p.y + r * 0.6, 0, p.x + 2, p.y + r * 0.6, r * 1.3);
    shadowGrad.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
    shadowGrad.addColorStop(0.6, 'rgba(0, 0, 0, 0.1)');
    shadowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.ellipse(p.x + 2, p.y + r * 0.6, r * 1.2, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();

    // Faint glow ring around pillar base
    ctx.strokeStyle = `rgba(80, 50, 140, ${0.04 + 0.02 * Math.sin(t * 0.8 + p.x)})`;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(p.x, p.y, r + 3, 0, Math.PI * 2); ctx.stroke();

    // Pillar body — stone gradient
    const g = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.3, r * 0.1, p.x, p.y, r);
    g.addColorStop(0, '#302840');
    g.addColorStop(0.6, '#1e1530');
    g.addColorStop(1, '#120e1c');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Stone edge highlight
    ctx.strokeStyle = 'rgba(120, 90, 160, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, -0.8, 0.8);
    ctx.stroke();

    // Rune carvings on ALL pillars: small arc segments at varying radii
    const etchAlpha = 0.04 + 0.02 * Math.sin(t * 1.5 + p.x);
    ctx.strokeStyle = `rgba(100, 70, 160, ${etchAlpha})`;
    ctx.lineWidth = 0.8;
    const arcCount = r > 22 ? 3 : 2;
    for (let i = 0; i < arcCount; i++) {
      const arcRadius = r * (0.35 + i * 0.2);
      const startAngle = t * 0.2 + p.y + i * 1.2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, arcRadius, startAngle, startAngle + Math.PI * 0.7);
      ctx.stroke();
    }

    // Debris/rubble dots near pillar base
    ctx.fillStyle = 'rgba(15, 10, 25, 0.35)';
    const debrisSeed = p.x * 100 + p.y;
    for (let d = 0; d < 3; d++) {
      const da = (debrisSeed + d * 2.4) % (Math.PI * 2);
      const dd = r + 3 + ((debrisSeed * (d + 1)) % 6);
      const dx = p.x + Math.cos(da) * dd;
      const dy = p.y + Math.sin(da) * dd;
      const dr = 0.8 + ((debrisSeed + d) % 3) * 0.4;
      ctx.beginPath(); ctx.arc(dx, dy, dr, 0, Math.PI * 2); ctx.fill();
    }
  }
}
