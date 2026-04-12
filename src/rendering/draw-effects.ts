import { GameState, rand, toWorld, spawnParticles } from '../state';
import { GamePhase } from '../types';
import { ROOM_WIDTH, ROOM_HEIGHT } from '../constants';

// ═══════════════════════════════════
//       EFFECTS UPDATE
// ═══════════════════════════════════

export function updateFx(state: GameState, dt: number): void {
  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt * 2.2;
    if (p.life <= 0) state.particles.splice(i, 1);
  }

  // Trails
  for (let i = state.trails.length - 1; i >= 0; i--) {
    state.trails[i].life -= dt * 4;
    if (state.trails[i].life <= 0) state.trails.splice(i, 1);
  }

  // Shockwaves
  for (let i = state.shockwaves.length - 1; i >= 0; i--) {
    const s = state.shockwaves[i];
    s.radius += dt * 200;
    s.life -= dt * 2.5;
    if (s.life <= 0) state.shockwaves.splice(i, 1);
  }

  // Floating text
  for (let i = state.texts.length - 1; i >= 0; i--) {
    const t = state.texts[i];
    t.y += t.vy * dt;
    t.life -= dt;
    if (t.life <= 0) state.texts.splice(i, 1);
  }

  // Beams
  for (let i = state.beams.length - 1; i >= 0; i--) {
    state.beams[i].life -= dt;
    if (state.beams[i].life <= 0) state.beams.splice(i, 1);
  }

  // Screen shake
  if (state.shakeIntensity > 0) {
    state.shakeX = (Math.random() - 0.5) * state.shakeIntensity * 2;
    state.shakeY = (Math.random() - 0.5) * state.shakeIntensity * 2;
    state.shakeIntensity *= 0.87;
    if (state.shakeIntensity < 0.3) {
      state.shakeIntensity = 0;
      state.shakeX = 0;
      state.shakeY = 0;
    }
  }

  // Screen flash
  if (state.screenFlash > 0) state.screenFlash -= dt * 3;
}

// ═══════════════════════════════════
//       DRAW EFFECTS
// ═══════════════════════════════════

export function drawBeams(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const b of state.beams) {
    ctx.globalAlpha = b.life / 0.15;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width + 2;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x + Math.cos(b.angle) * b.range, b.y + Math.sin(b.angle) * b.range);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

export function drawZones(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const z of state.zones) {
    ctx.globalAlpha = 0.06 + 0.03 * Math.sin(state.time * 3);
    ctx.fillStyle = z.color;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = z.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Random particle in zone
    if (Math.random() < 0.2) {
      spawnParticles(state, z.x + rand(-z.radius, z.radius), z.y + rand(-z.radius, z.radius), z.color, 1, 0.15);
    }
  }
}

export function drawAoe(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const m of state.aoeMarkers) {
    const pr = m.age / m.delay;
    ctx.globalAlpha = 0.1 + pr * 0.2;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = m.color;
    ctx.globalAlpha *= 0.3;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * pr, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Trails
  for (const t of state.trails) {
    ctx.globalAlpha = t.life * 0.5;
    ctx.fillStyle = t.color;
    ctx.beginPath();
    ctx.arc(t.x, t.y, t.r * t.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Particles
  for (const p of state.particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Shockwaves
  for (const s of state.shockwaves) {
    ctx.globalAlpha = s.life * 0.4;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 2 * s.life;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // Floating text
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = t.color;
    ctx.font = 'bold 12px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
}

export function drawCrosshair(ctx: CanvasRenderingContext2D, state: GameState): void {
  const wp = toWorld(state, state.mouseX, state.mouseY);
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(wp.x - 7, wp.y);
  ctx.lineTo(wp.x + 7, wp.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(wp.x, wp.y - 7);
  ctx.lineTo(wp.x, wp.y + 7);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(wp.x, wp.y, 4, 0, Math.PI * 2);
  ctx.stroke();
}

export function drawCountdown(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (state.gamePhase !== GamePhase.Countdown) return;
  const n = Math.ceil(state.countdownTimer);
  const f = state.countdownTimer - Math.floor(state.countdownTimer);
  const sc = 1 + f * 0.3;
  ctx.fillStyle = `rgba(200,180,255,${0.3 + f * 0.5})`;
  ctx.font = `bold ${Math.floor(60 * sc)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n <= 0 ? 'GO!' : String(n), ROOM_WIDTH / 2, ROOM_HEIGHT / 2);
}
