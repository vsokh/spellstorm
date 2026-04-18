import { GameState, rand, toWorld, spawnParticles } from '../state';
import { GamePhase, Trail, Particle, Shockwave } from '../types';
import { ROOM_WIDTH, ROOM_HEIGHT } from '../constants';
import { drawTurret } from './draw-entities';
import { rgba } from './rgba-cache';

// ═══════════════════════════════════
//       EFFECTS UPDATE
// ═══════════════════════════════════

export function updateFx(state: GameState, dt: number): void {
  // Particles
  for (let i = state.particles.count - 1; i >= 0; i--) {
    const p = state.particles.get(i);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.94;
    p.vy *= 0.94;
    p.life -= dt * 2.2;
    if (p.life <= 0) {
      state.particles.release(i);
    }
  }

  // Trails
  for (let i = state.trails.count - 1; i >= 0; i--) {
    const t = state.trails.get(i);
    t.life -= dt * 4;
    if (t.life <= 0) {
      state.trails.release(i);
    }
  }

  // Shockwaves — speed scales with maxR so large rings reach their target
  // size within the fixed 0.4s lifetime (baseline 200 for small effects).
  for (let i = state.shockwaves.count - 1; i >= 0; i--) {
    const s = state.shockwaves.get(i);
    const speed = Math.max(200, s.maxR * 2.5);
    s.radius += dt * speed;
    s.life -= dt * 2.5;
    if (s.life <= 0) {
      state.shockwaves.release(i);
    }
  }

  // Floating text
  for (let i = state.texts.count - 1; i >= 0; i--) {
    const t = state.texts.get(i);
    t.y += t.vy * dt;
    t.life -= dt;
    if (t.life <= 0) {
      state.texts.release(i);
    }
  }

  // Beams
  for (let i = state.beams.count - 1; i >= 0; i--) {
    const b = state.beams.get(i);
    b.life -= dt;
    if (b.life <= 0) {
      state.beams.release(i);
    }
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
  if (state.beams.count === 0) return;

  // Pre-compute beam endpoints
  const beamData: Array<{ b: { x: number; y: number; angle: number; range: number; width: number; color: string; life: number }; life: number; ex: number; ey: number }> = [];
  for (let i = 0; i < state.beams.count; i++) {
    const b = state.beams.get(i);
    const life = b.life / 0.15;
    const ex = b.x + Math.cos(b.angle) * b.range;
    const ey = b.y + Math.sin(b.angle) * b.range;
    beamData.push({ b, life, ex, ey });
  }

  // Pass 1: outer glow (all beams)
  for (const { b, life, ex, ey } of beamData) {
    ctx.globalAlpha = life * 0.3;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width + 8;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Pass 2: mid beam (all beams)
  for (const { b, life, ex, ey } of beamData) {
    ctx.globalAlpha = life * 0.6;
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width + 3;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Pass 3: bright core (all beams, white)
  ctx.strokeStyle = '#ffffff';
  for (const { b, life, ex, ey } of beamData) {
    ctx.globalAlpha = life * 0.8;
    ctx.lineWidth = b.width * 0.5;
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.globalAlpha = 1;
}

export function drawTethers(ctx: CanvasRenderingContext2D, state: GameState): void {
  const t = state.time;
  for (const p of state.players) {
    if (!p.alive || p._tetherTarget < 0) continue;
    const target = state.enemies.at(p._tetherTarget);
    if (!target || !target.alive) continue;

    const def = p.cls.spells[p._tetherSpellIdx];
    if (!def) continue;

    const tetherRange = def.tetherRange || 200;
    const dx = target.x - p.x;
    const dy = target.y - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Opacity decreases as distance approaches break range
    const rangeFrac = dist / tetherRange;
    const baseAlpha = Math.max(0.2, 1.0 - rangeFrac * 0.7);

    // Pulse effect
    const pulse = 0.85 + 0.15 * Math.sin(t * 8);

    // Color based on tether type
    const hasDmg = (def.tetherDmg || 0) > 0;
    const hasHeal = (def.tetherHeal || 0) > 0;
    let color = def.color;
    let coreColor = '#ffffff';
    if (hasDmg && hasHeal) {
      // Drain tether — green
      color = '#44ff88';
      coreColor = '#ccffcc';
    } else if (hasDmg) {
      // Damage tether — red-ish (use spell color)
      coreColor = '#ffcccc';
    } else {
      // CC/utility tether — blue-ish
      color = '#4488ff';
      coreColor = '#ccccff';
    }

    // Pass 1: outer glow
    ctx.globalAlpha = baseAlpha * pulse * 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    // Pass 2: mid beam
    ctx.globalAlpha = baseAlpha * pulse * 0.5;
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    // Pass 3: core
    ctx.globalAlpha = baseAlpha * pulse * 0.8;
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(target.x, target.y);
    ctx.stroke();

    // Animated energy dots along the tether
    const dotCount = 4;
    for (let i = 0; i < dotCount; i++) {
      const frac = ((i / dotCount) + t * 1.5) % 1.0;
      const dotX = p.x + dx * frac;
      const dotY = p.y + dy * frac;
      ctx.globalAlpha = baseAlpha * pulse * 0.9;
      ctx.fillStyle = coreColor;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // End-point glows
    ctx.globalAlpha = baseAlpha * pulse * 0.4;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(target.x, target.y, 8, 0, Math.PI * 2);
    ctx.fill();

    // Necromancer Drain Tether: secondary life-flow links to owned skeletons.
    if ((p as any).clsKey === 'necromancer' && (def.tetherHeal || 0) > 0) {
      for (const ally of state.enemies) {
        if (!ally.alive || !ally._friendly || ally._owner !== (p as any).idx) continue;
        if (ally.type !== '_skeleton') continue;
        const adx = ally.x - p.x;
        const ady = ally.y - p.y;
        const ad = Math.sqrt(adx * adx + ady * ady);
        if (ad > 200) continue;
        // Soft outer line
        ctx.globalAlpha = 0.18 * pulse;
        ctx.strokeStyle = '#77ffaa';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ally.x, ally.y); ctx.stroke();
        // Core line
        ctx.globalAlpha = 0.45 * pulse;
        ctx.strokeStyle = '#ccffdd';
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ally.x, ally.y); ctx.stroke();
        // Travelling life dot (player → ally flow)
        const frac = (t * 0.8) % 1.0;
        const dotX = p.x + adx * frac;
        const dotY = p.y + ady * frac;
        ctx.globalAlpha = 0.9 * pulse;
        ctx.fillStyle = '#ccffdd';
        ctx.beginPath(); ctx.arc(dotX, dotY, 2, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

export function drawZones(ctx: CanvasRenderingContext2D, state: GameState): void {
  const t = state.time;
  for (const z of state.zones) {
    const isIce = z.color.includes('22') || z.color.includes('bb');
    const isFire = z.color.includes('ff44') || z.color.includes('ff22') || z.color.includes('7722');
    const isHeal = z.color.includes('ffcc') || z.color.includes('ffee');

    if (z._turret && z._megaTurret) {
      // ── MEGA TURRET ZONE: enhanced visuals ──

      // Outer range fill (brighter, more saturated)
      ctx.globalAlpha = 0.1 + 0.05 * Math.sin(t * 2);
      ctx.fillStyle = '#dd8822';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();

      // Inner ring fill (double-ring effect)
      ctx.globalAlpha = 0.12 + 0.04 * Math.sin(t * 2.5);
      ctx.fillStyle = '#ffaa33';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius * 0.55, 0, Math.PI * 2); ctx.fill();

      // Energy crackle: 3 short jagged line segments
      ctx.strokeStyle = '#ffdd66';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 1; i++) {
        // Deterministic pseudo-random flicker using sin
        const flicker = Math.sin(t * 7.3 + i * 17.1);
        if (flicker > 0.2) {
          ctx.globalAlpha = 0.3 + 0.2 * flicker;
          const baseAngle = Math.sin(t * 1.1 + i * 4.7) * Math.PI * 2;
          const dist = z.radius * (0.25 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 3.3)));
          const cx = z.x + Math.cos(baseAngle) * dist;
          const cy = z.y + Math.sin(baseAngle) * dist;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(baseAngle + 0.5) * 8, cy + Math.sin(baseAngle + 0.5) * 8);
          ctx.lineTo(cx + Math.cos(baseAngle - 0.3) * 14, cy + Math.sin(baseAngle - 0.3) * 14);
          ctx.stroke();
        }
      }

      // Pulsing power ring at ~70% radius
      const breathe = 0.7 + 0.05 * Math.sin(t * 3);
      ctx.globalAlpha = 0.2 + 0.1 * Math.sin(t * 3);
      ctx.strokeStyle = '#ffcc44';
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius * breathe, 0, Math.PI * 2); ctx.stroke();

      // Brighter dashed outline with wider dashes
      ctx.strokeStyle = '#ffaa33';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.25;
      const dashOffset = t * 15;
      ctx.setLineDash([10, 6]);
      ctx.lineDashOffset = dashOffset;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;

      // Draw mega turret at center (size 18, isMega=true)
      drawTurret(ctx, z.x, z.y, 18, t, true, z.age > 0);

      // Occasional bright spark particles
      if (Math.sin(t * 11.7) > 0.85) {
        spawnParticles(state, z.x + Math.sin(t * 3.1) * z.radius * 0.5, z.y + Math.cos(t * 2.7) * z.radius * 0.5, '#ffdd44', 1, 0.3);
      }

    } else if (z._turret) {
      // ── REGULAR TURRET ZONE: turret visual + subtle range indicator ──

      // Subtle range fill
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(t * 2);
      ctx.fillStyle = '#cc7722';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();

      // Slowly rotating radar sweep arc
      const sweepAngle = t * 1.2;
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#dd9933';
      ctx.beginPath();
      ctx.moveTo(z.x, z.y);
      ctx.arc(z.x, z.y, z.radius, sweepAngle, sweepAngle + Math.PI * 0.4);
      ctx.closePath();
      ctx.fill();

      // Rotating spark dots orbiting at ~60% radius
      for (let i = 0; i < 2; i++) {
        const sparkAngle = t * 1.5 + (i / 4) * Math.PI * 2;
        const sparkDist = z.radius * 0.6;
        const sx = z.x + Math.cos(sparkAngle) * sparkDist;
        const sy = z.y + Math.sin(sparkAngle) * sparkDist;
        ctx.globalAlpha = 0.4 + 0.2 * Math.sin(t * 4 + i * 1.5);
        ctx.fillStyle = '#ffcc44';
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      }

      // Rotating dashed outline
      ctx.strokeStyle = '#dd8833';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.15;
      const regularDashOffset = t * 10;
      ctx.setLineDash([6, 8]);
      ctx.lineDashOffset = regularDashOffset;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
      ctx.globalAlpha = 1;

      // Draw turret in center
      drawTurret(ctx, z.x, z.y, 14, t, false, z.age > 0);
    } else if (isIce) {
      // ── ICE ZONE: snowflake pattern + frost ring ──
      ctx.globalAlpha = 0.08 + 0.04 * Math.sin(t * 2);
      ctx.fillStyle = '#88ccff';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
      // Frost ring
      ctx.strokeStyle = '#aaeeff';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.3;
      ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // Ice crystal particles
      ctx.fillStyle = '#cceeFF';
      ctx.globalAlpha = 0.5;
      for (let i = 0; i < 2; i++) {
        const a = t * 0.5 + (i / 6) * Math.PI * 2;
        const d = z.radius * (0.3 + 0.2 * Math.sin(t + i));
        ctx.beginPath();
        ctx.moveTo(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d - 3);
        ctx.lineTo(z.x + Math.cos(a) * d + 2, z.y + Math.sin(a) * d + 2);
        ctx.lineTo(z.x + Math.cos(a) * d - 2, z.y + Math.sin(a) * d + 2);
        ctx.closePath(); ctx.fill();
      }
    } else if (isFire) {
      // ── FIRE ZONE: flickering embers ──
      ctx.globalAlpha = 0.06 + 0.04 * Math.sin(t * 4);
      ctx.fillStyle = '#ff4400';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ff6622';
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
      // Rising embers
      if (Math.random() < 0.08) {
        spawnParticles(state, z.x + rand(-z.radius * 0.8, z.radius * 0.8), z.y + rand(-z.radius * 0.8, z.radius * 0.8), '#ff8833', 1, 0.2);
      }
    } else if (isHeal) {
      // ── HEAL ZONE: golden sparkles ──
      ctx.globalAlpha = 0.05 + 0.03 * Math.sin(t * 3);
      ctx.fillStyle = '#ffeeaa';
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#ffdd66';
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.2;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
      // Rising + sparkles
      ctx.fillStyle = '#ffffcc';
      ctx.globalAlpha = 0.6;
      for (let i = 0; i < 1; i++) {
        const sx = z.x + Math.sin(t * 2 + i * 2.1) * z.radius * 0.5;
        const sy = z.y - (t * 20 + i * 30) % z.radius;
        ctx.beginPath(); ctx.arc(sx, sy, 1.5, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      // ── DEFAULT ZONE ──
      ctx.globalAlpha = 0.06 + 0.03 * Math.sin(t * 3);
      ctx.fillStyle = z.color;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = z.color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.radius, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    if (Math.random() < 0.025) {
      spawnParticles(state, z.x + rand(-z.radius, z.radius), z.y + rand(-z.radius, z.radius), z.color, 1, 0.15);
    }
  }
}

export function drawAoe(ctx: CanvasRenderingContext2D, state: GameState): void {
  const t = state.time;
  for (const m of state.aoeMarkers) {
    const pr = m.age / m.delay;
    const isFire = m.color.includes('ff22');
    const isLightning = m.color.includes('ffcc');

    // Warning ring
    ctx.globalAlpha = 0.15 + pr * 0.25;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 2 + pr * 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Filling danger zone
    ctx.fillStyle = m.color;
    ctx.globalAlpha = pr * 0.15;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.radius * pr, 0, Math.PI * 2);
    ctx.fill();

    if (isFire) {
      // Meteor: falling shadow that grows
      ctx.fillStyle = 'rgba(0,0,0,.15)';
      ctx.beginPath();
      ctx.ellipse(m.x, m.y, m.radius * 0.4 * pr, m.radius * 0.25 * pr, 0, 0, Math.PI * 2);
      ctx.fill();
      // Meteor body approaching
      if (pr > 0.3) {
        const mSize = 8 + pr * 10;
        const mY = m.y - 100 * (1 - pr);
        ctx.fillStyle = '#ff4400';
        ctx.beginPath(); ctx.arc(m.x + 2, mY, mSize, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ffaa33';
        ctx.beginPath(); ctx.arc(m.x + 2, mY, mSize * 0.5, 0, Math.PI * 2); ctx.fill();
        // Fire trail
        ctx.strokeStyle = '#ff6633';
        ctx.lineWidth = 3;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(m.x + 2, mY - mSize);
        ctx.lineTo(m.x + 5, mY - mSize * 3);
        ctx.stroke();
      }
    } else if (isLightning) {
      // Thunder: lightning flicker from sky
      if (pr > 0.5 && Math.random() < 0.3) {
        ctx.strokeStyle = '#ffee88';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5;
        const lx = m.x + (Math.random() - 0.5) * m.radius * 0.6;
        ctx.beginPath();
        ctx.moveTo(lx, m.y - 80);
        ctx.lineTo(lx + (Math.random() - 0.5) * 20, m.y - 40);
        ctx.lineTo(lx + (Math.random() - 0.5) * 15, m.y);
        ctx.stroke();
      }
      // Ground crackle
      ctx.strokeStyle = rgba(255, 220, 100, pr * 0.3);
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const a = t * 3 + (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(a) * m.radius * pr * 0.8, m.y + Math.sin(a) * m.radius * pr * 0.8);
        ctx.stroke();
      }
    }

    ctx.globalAlpha = 1;
  }
}

export function drawFx(ctx: CanvasRenderingContext2D, state: GameState): void {
  // Trails - batch by color
  const trailsByColor = new Map<string, Trail[]>();
  for (const t of state.trails) {
    const group = trailsByColor.get(t.color);
    if (group) group.push(t);
    else trailsByColor.set(t.color, [t]);
  }
  for (const [color, trails] of trailsByColor) {
    ctx.fillStyle = color;
    for (const t of trails) {
      ctx.globalAlpha = t.life * t.life * 0.6;
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r * t.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Particles - batch by color
  const particlesByColor = new Map<string, Particle[]>();
  for (const p of state.particles) {
    const group = particlesByColor.get(p.color);
    if (group) group.push(p);
    else particlesByColor.set(p.color, [p]);
  }
  for (const [color, particles] of particlesByColor) {
    ctx.fillStyle = color;
    for (const p of particles) {
      ctx.globalAlpha = p.life;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  // Shockwaves - batch by color
  const shocksByColor = new Map<string, Shockwave[]>();
  for (const s of state.shockwaves) {
    const group = shocksByColor.get(s.color);
    if (group) group.push(s);
    else shocksByColor.set(s.color, [s]);
  }
  for (const [color, shocks] of shocksByColor) {
    ctx.strokeStyle = color;
    for (const s of shocks) {
      ctx.lineWidth = 3 * s.life;
      ctx.globalAlpha = s.life * 0.4;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = s.life * 0.2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius * 0.7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  // Floating text with damage-scaled sizing
  for (const t of state.texts) {
    ctx.globalAlpha = Math.min(1, t.life);
    ctx.fillStyle = t.color;
    // Scale font for damage numbers
    let fontSize = 12;
    const numMatch = t.text.match(/^-?(\d+)$/);
    if (numMatch) {
      const val = parseInt(numMatch[1]);
      if (val >= 12) { fontSize = 22; ctx.fillStyle = '#ffdd44'; }
      else if (val >= 8) fontSize = 18;
      else if (val >= 5) fontSize = 16;
    }
    ctx.font = `bold ${fontSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;

  // Combo counter display
  if (state.comboCount >= 3) {
    const comboSize = 16 + Math.min(state.comboCount, 20);
    const comboPulse = 0.7 + 0.3 * Math.sin(state.time * 6);
    // Color shifts: white -> yellow -> orange -> red
    let comboColor: string;
    if (state.comboCount >= 50) comboColor = '#ffdd44';
    else if (state.comboCount >= 20) comboColor = '#ff4444';
    else if (state.comboCount >= 10) comboColor = '#ff8833';
    else comboColor = '#ffcc44';
    ctx.globalAlpha = comboPulse;
    ctx.fillStyle = comboColor;
    ctx.font = `bold ${comboSize}px Courier New`;
    ctx.textAlign = 'center';
    ctx.fillText(`${state.comboCount}x COMBO`, ROOM_WIDTH / 2, 40);
    ctx.globalAlpha = 1;
  }
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
  ctx.fillStyle = rgba(200, 180, 255, 0.3 + f * 0.5);
  ctx.font = `bold ${Math.floor(60 * sc)}px Courier New`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(n <= 0 ? 'GO!' : String(n), ROOM_WIDTH / 2, ROOM_HEIGHT / 2);
}

/** Draw synergy banner at top center for the duration of the banner timer */
export function drawSynergyBanner(ctx: CanvasRenderingContext2D, state: GameState): void {
  if (!state.activeSynergy) return;
  if (state.synergyBannerTimer <= 0) return;

  const syn = state.activeSynergy;
  const t = state.synergyBannerTimer; // counts down from 4

  // Fade-in during first 0.3s (timer 4.0 -> 3.7), fade-out during last 1s (timer 1.0 -> 0)
  let alpha: number;
  if (t > 3.7) {
    alpha = (4 - t) / 0.3;
  } else if (t < 1) {
    alpha = t;
  } else {
    alpha = 1;
  }
  alpha = Math.max(0, Math.min(1, alpha));
  if (alpha <= 0) return;

  ctx.save();
  ctx.globalAlpha = alpha;

  const cx = state.width / 2;
  const bannerY = 40;
  const bannerW = 380;
  const bannerH = 70;

  // Glow layer — slightly larger rect with low-alpha synergy color
  ctx.fillStyle = syn.color;
  ctx.globalAlpha = alpha * 0.15;
  ctx.beginPath();
  ctx.roundRect(cx - bannerW / 2 - 6, bannerY - 6, bannerW + 12, bannerH + 12, 12);
  ctx.fill();
  ctx.globalAlpha = alpha;

  // Dark background with synergy color border
  ctx.fillStyle = 'rgba(10, 6, 20, 0.85)';
  ctx.strokeStyle = syn.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(cx - bannerW / 2, bannerY, bannerW, bannerH, 8);
  ctx.fill();
  ctx.stroke();

  // "SYNERGY ACTIVE" header
  ctx.fillStyle = syn.color;
  ctx.font = 'bold 11px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('SYNERGY ACTIVE', cx, bannerY + 10);

  // Synergy name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 16px Courier New';
  ctx.fillText(syn.name, cx, bannerY + 25);

  // Description
  ctx.fillStyle = 'rgba(200, 190, 220, 0.9)';
  ctx.font = '10px Courier New';
  ctx.fillText(syn.desc, cx, bannerY + 48);

  ctx.restore();
}
