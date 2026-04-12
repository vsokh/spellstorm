import { GameState } from '../state';
import { ENEMIES, WIZARD_SIZE } from '../constants';
import { PickupType } from '../types';

// ═══════════════════════════════════
//       DRAW WIZARDS
// ═══════════════════════════════════

export function drawWizard(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.players) {
    if (!p.alive) continue;
    // Iframes flicker
    if (p.iframes > 0 && Math.sin(state.time * 25) > 0) continue;

    const cls = p.cls;

    // Aura glow
    const ag = ctx.createRadialGradient(p.x, p.y, WIZARD_SIZE * 0.5, p.x, p.y, WIZARD_SIZE * 2.5);
    ag.addColorStop(0, cls.glow + '22');
    ag.addColorStop(1, 'transparent');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(p.x, p.y, WIZARD_SIZE * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Body
    const bg = ctx.createRadialGradient(p.x, p.y, WIZARD_SIZE * 0.3, p.x, p.y, WIZARD_SIZE);
    bg.addColorStop(0, cls.color);
    bg.addColorStop(1, cls.glow);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(p.x, p.y, WIZARD_SIZE, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(255,255,255,.15)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, WIZARD_SIZE, 0, Math.PI * 2);
    ctx.stroke();

    // Staff / wand
    const sx = p.x + Math.cos(p.angle) * WIZARD_SIZE * 1.8;
    const sy = p.y + Math.sin(p.angle) * WIZARD_SIZE * 1.8;
    ctx.strokeStyle = cls.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(p.angle) * WIZARD_SIZE * 0.5, p.y + Math.sin(p.angle) * WIZARD_SIZE * 0.5);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    // Tip glow
    const tg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 5);
    tg.addColorStop(0, cls.color);
    tg.addColorStop(1, 'transparent');
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(sx, sy, 5, 0, Math.PI * 2);
    ctx.fill();

    // Slow indicator
    if (p.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(80,180,255,.3)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, WIZARD_SIZE + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Health bar
    const bw = WIZARD_SIZE * 2.5;
    const bh = 3;
    const bx = p.x - bw / 2;
    const by = p.y + WIZARD_SIZE + 6;
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
    const hr = p.hp / p.maxHp;
    ctx.fillStyle = hr > 0.5 ? '#33cc55' : hr > 0.25 ? '#ccaa33' : '#cc3333';
    ctx.fillRect(bx, by, bw * hr, bh);

    // Mana bar
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.fillRect(bx - 1, by + bh + 1, bw + 2, 2);
    ctx.fillStyle = 'rgba(60,120,255,.6)';
    ctx.fillRect(bx, by + bh + 2, bw * (p.mana / p.maxMana), 1);

    // Player label
    ctx.fillStyle = p.idx === 0 ? 'rgba(100,180,255,.5)' : 'rgba(255,140,100,.5)';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`P${p.idx + 1}`, p.x, p.y - WIZARD_SIZE - 5);
  }
}

// ═══════════════════════════════════
//       DRAW ENEMIES
// ═══════════════════════════════════

export function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const et = ENEMIES[e.type];
    // Iframes flicker
    if (e.iframes > 0 && Math.sin(state.time * 30) > 0) continue;

    // Boss aura
    if (et.boss) {
      const bg2 = ctx.createRadialGradient(e.x, e.y, et.size * 0.5, e.x, e.y, et.size * 2);
      bg2.addColorStop(0, 'rgba(200,80,40,.08)');
      bg2.addColorStop(1, 'transparent');
      ctx.fillStyle = bg2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, et.size * 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Body
    ctx.fillStyle = et.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, et.size, 0, Math.PI * 2);
    ctx.fill();

    // Outline
    ctx.strokeStyle = 'rgba(0,0,0,.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(e.x, e.y, et.size, 0, Math.PI * 2);
    ctx.stroke();

    // Eyes
    const target = state.players[e.target];
    const ea = target ? Math.atan2(target.y - e.y, target.x - e.x) : 0;
    const eyeD = et.size * 0.3;
    ctx.fillStyle = 'rgba(255,50,30,.8)';
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(ea - 0.3) * eyeD, e.y + Math.sin(ea - 0.3) * eyeD, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(e.x + Math.cos(ea + 0.3) * eyeD, e.y + Math.sin(ea + 0.3) * eyeD, 1.5, 0, Math.PI * 2);
    ctx.fill();

    // Health bar (only when damaged)
    if (e.hp < e.maxHp) {
      const bw = et.size * 2;
      const bh = 2;
      const bx = e.x - bw / 2;
      const by = e.y - et.size - 4;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(bx, by, bw * (e.hp / e.maxHp), bh);
    }

    // Slow indicator
    if (e.slowTimer > 0) {
      ctx.strokeStyle = 'rgba(80,200,255,.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(e.x, e.y, et.size + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ═══════════════════════════════════
//       DRAW SPELLS / PROJECTILES
// ═══════════════════════════════════

export function drawSpells(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const s of state.spells) {
    const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius * 1.5);
    g.addColorStop(0, s.color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export function drawEProj(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.eProj) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ═══════════════════════════════════
//       DRAW PICKUPS
// ═══════════════════════════════════

export function drawPickups(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const pk of state.pickups) {
    if (pk.collected) continue;
    const pulse = 0.5 + 0.5 * Math.sin(state.time * 3);

    if (pk.type === PickupType.Chest) {
      ctx.fillStyle = `rgba(200,170,50,${0.2 + pulse * 0.15})`;
      ctx.fillRect(pk.x - 12, pk.y - 10, 24, 20);
      ctx.strokeStyle = '#bbaa44';
      ctx.lineWidth = 1;
      ctx.strokeRect(pk.x - 12, pk.y - 10, 24, 20);
      ctx.fillStyle = '#ddcc55';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('?', pk.x, pk.y + 5);
    } else if (pk.type === PickupType.Health) {
      const g = ctx.createRadialGradient(pk.x, pk.y, 3, pk.x, pk.y, 12 + pulse * 4);
      g.addColorStop(0, 'rgba(50,255,120,.3)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, 12 + pulse * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(50,255,120,.7)';
      ctx.font = 'bold 12px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('+', pk.x, pk.y + 5);
    } else if (pk.type === PickupType.Trap) {
      ctx.strokeStyle = `rgba(170,220,85,${0.3 + pulse * 0.2})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(pk.x, pk.y, pk._radius || 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(170,220,85,.5)';
      ctx.font = '9px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText('TRAP', pk.x, pk.y + 3);
    }
  }
}
