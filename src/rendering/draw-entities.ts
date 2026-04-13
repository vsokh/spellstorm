import { GameState } from '../state';
import { ENEMIES, WIZARD_SIZE } from '../constants';
import { PickupType } from '../types';

// ═══════════════════════════════════
//       GRADIENT & EFFECT CACHES
// ═══════════════════════════════════

// Pre-built simple noise table for organic animation (avoids per-frame random calls)
const NOISE_TABLE: number[] = [];
for (let i = 0; i < 256; i++) NOISE_TABLE[i] = Math.sin(i * 0.3927) * 0.5 + Math.cos(i * 0.7854) * 0.5;
function noise(i: number): number { return NOISE_TABLE[((i | 0) & 255 + 256) & 255]; }

// Pseudo-random seeded by index (deterministic shimmer per entity)
function hash(n: number): number { return ((Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1 + 1) % 1; }

// ═══════════════════════════════════
//       DRAW WIZARDS
// ═══════════════════════════════════

// ── Size multiplier per class for visual variation ──
const CLASS_SCALE: Record<string, number> = {
  pyromancer: 1.0, cryomancer: 1.0, stormcaller: 0.95, arcanist: 0.9,
  necromancer: 1.0, chronomancer: 0.95, knight: 1.2, berserker: 1.25,
  paladin: 1.15, ranger: 0.85, druid: 0.95, warlock: 1.0, monk: 0.88, engineer: 1.0,
};

// ── Class-specific silhouette drawing ──
function drawClassBody(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, clsKey: string, color: string, glow: string, time: number, player?: { hp: number; maxHp: number; _furyActive: boolean }): void {
  const scale = CLASS_SCALE[clsKey] || 1.0;
  const S = WIZARD_SIZE * scale;

  if (clsKey === 'pyromancer') {
    // ── PYROMANCER: organic dancing flames with white-hot core ──
    // Radial gradient body for depth
    const bodyG = ctx.createRadialGradient(x - S * 0.2, y - S * 0.2, S * 0.15, x, y, S);
    bodyG.addColorStop(0, '#ffffcc');
    bodyG.addColorStop(0.3, '#ff8833');
    bodyG.addColorStop(0.7, '#cc3300');
    bodyG.addColorStop(1, '#881100');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();

    // Organic flame crown (5 points with perlin-like wobble)
    for (let i = 0; i < 5; i++) {
      const baseA = -Math.PI / 2 + (i - 2) * 0.4;
      const wobbleX = noise(time * 8 + i * 37) * 3;
      const wobbleY = noise(time * 9 + i * 53) * 2;
      const flicker = Math.sin(time * 12 + i * 1.7) * 2 + noise(time * 15 + i * 71) * 2;
      const h = S * 1.6 + flicker;

      // Outer flame
      ctx.fillStyle = i === 2 ? '#ff5500' : `rgba(255,${80 + i * 20},0,0.8)`;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(baseA - 0.25) * S * 0.5 + wobbleX, y + Math.sin(baseA - 0.25) * S * 0.5);
      ctx.quadraticCurveTo(
        x + Math.cos(baseA) * h * 0.7 + wobbleX * 1.5,
        y + Math.sin(baseA) * h * 0.7 + wobbleY,
        x + Math.cos(baseA) * h + wobbleX, y + Math.sin(baseA) * h + wobbleY
      );
      ctx.quadraticCurveTo(
        x + Math.cos(baseA) * h * 0.7 - wobbleX * 0.5,
        y + Math.sin(baseA) * h * 0.7 - wobbleY,
        x + Math.cos(baseA + 0.25) * S * 0.5 - wobbleX, y + Math.sin(baseA + 0.25) * S * 0.5
      );
      ctx.closePath(); ctx.fill();
    }

    // White-hot inner core
    const coreG = ctx.createRadialGradient(x, y, 0, x, y, S * 0.5);
    coreG.addColorStop(0, 'rgba(255,255,240,0.9)');
    coreG.addColorStop(0.5, 'rgba(255,200,100,0.4)');
    coreG.addColorStop(1, 'transparent');
    ctx.fillStyle = coreG;
    ctx.beginPath(); ctx.arc(x, y, S * 0.5, 0, Math.PI * 2); ctx.fill();

    // Outline glow
    ctx.shadowColor = glow; ctx.shadowBlur = 8;
    ctx.strokeStyle = `rgba(255,100,0,0.4)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'cryomancer') {
    // ── CRYOMANCER: crystal with refraction lines and frost particles ──
    // Crystal body with gradient
    const iceG = ctx.createLinearGradient(x - S * 0.8, y - S * 1.2, x + S * 0.8, y + S * 1.2);
    iceG.addColorStop(0, '#cceeFF');
    iceG.addColorStop(0.3, '#66bbee');
    iceG.addColorStop(0.6, '#44aadd');
    iceG.addColorStop(1, '#2288bb');
    ctx.fillStyle = iceG;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.2); ctx.lineTo(x + S * 0.8, y);
    ctx.lineTo(x, y + S * 1.2); ctx.lineTo(x - S * 0.8, y);
    ctx.closePath(); ctx.fill();

    // Refraction lines inside crystal
    ctx.strokeStyle = 'rgba(200,240,255,0.5)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(x - S * 0.3, y - S * 0.7); ctx.lineTo(x + S * 0.4, y + S * 0.1);
    ctx.moveTo(x + S * 0.2, y - S * 0.5); ctx.lineTo(x - S * 0.3, y + S * 0.4);
    ctx.moveTo(x, y - S * 0.4); ctx.lineTo(x + S * 0.5, y + S * 0.3);
    ctx.stroke();

    // Inner crystal highlight
    ctx.fillStyle = 'rgba(200,240,255,0.3)';
    ctx.beginPath();
    ctx.moveTo(x, y - S * 0.6); ctx.lineTo(x + S * 0.35, y - S * 0.1);
    ctx.lineTo(x + S * 0.1, y + S * 0.3); ctx.lineTo(x - S * 0.25, y);
    ctx.closePath(); ctx.fill();

    // Orbiting frost particles
    for (let i = 0; i < 6; i++) {
      const a = time * 1.5 + (i / 6) * Math.PI * 2;
      const dist = S * 1.5 + Math.sin(time * 3 + i * 2) * 3;
      const px = x + Math.cos(a) * dist;
      const py = y + Math.sin(a) * dist;
      const sz = 1.2 + Math.sin(time * 5 + i) * 0.5;
      ctx.fillStyle = `rgba(180,230,255,${0.3 + Math.sin(time * 4 + i) * 0.2})`;
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
    }

    // Crystal edge glow
    ctx.shadowColor = '#44bbff'; ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(100,200,255,0.6)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.2); ctx.lineTo(x + S * 0.8, y);
    ctx.lineTo(x, y + S * 1.2); ctx.lineTo(x - S * 0.8, y);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'stormcaller') {
    // ── STORMCALLER: pulsing orb with jittery lightning ──
    const pulse = 0.85 + 0.15 * Math.sin(time * 6);
    // Inner orb gradient
    const orbG = ctx.createRadialGradient(x, y, 0, x, y, S * pulse);
    orbG.addColorStop(0, '#eeddff');
    orbG.addColorStop(0.4, '#bb77ee');
    orbG.addColorStop(0.8, '#8844cc');
    orbG.addColorStop(1, '#553399');
    ctx.fillStyle = orbG;
    ctx.beginPath(); ctx.arc(x, y, S * 0.9 * pulse, 0, Math.PI * 2); ctx.fill();

    // Jittery lightning bolts (randomized endpoints each frame via noise)
    for (let i = 0; i < 5; i++) {
      const baseA = time * 3 + (i / 5) * Math.PI * 2;
      const jitterA = baseA + noise(time * 20 + i * 17) * 0.4;
      ctx.strokeStyle = `rgba(200,160,255,${0.4 + 0.3 * noise(time * 12 + i * 31)})`;
      ctx.lineWidth = 1 + noise(time * 15 + i * 7) * 0.8;
      ctx.beginPath();
      const sx = x + Math.cos(jitterA) * S * 0.6;
      const sy = y + Math.sin(jitterA) * S * 0.6;
      ctx.moveTo(sx, sy);
      // Mid-point with jitter
      const jx = noise(time * 25 + i * 43) * S * 0.5;
      const jy = noise(time * 22 + i * 61) * S * 0.5;
      const mx = x + Math.cos(jitterA + 0.15) * S * 1.2 + jx;
      const my = y + Math.sin(jitterA + 0.15) * S * 1.2 + jy;
      ctx.lineTo(mx, my);
      // End with extra jitter
      const ex = x + Math.cos(jitterA - 0.1) * S * 1.7 + noise(time * 30 + i * 53) * S * 0.3;
      const ey = y + Math.sin(jitterA - 0.1) * S * 1.7 + noise(time * 28 + i * 67) * S * 0.3;
      ctx.lineTo(ex, ey);
      ctx.stroke();
    }

    // Outline glow
    ctx.shadowColor = '#bb66ff'; ctx.shadowBlur = 8;
    ctx.strokeStyle = 'rgba(170,100,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, S * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'arcanist') {
    // ── ARCANIST: floating orb with rune ring and trailing particles ──
    const bodyG = ctx.createRadialGradient(x - S * 0.15, y - S * 0.15, S * 0.1, x, y, S * 0.8);
    bodyG.addColorStop(0, '#ffaadd');
    bodyG.addColorStop(0.5, '#ee55aa');
    bodyG.addColorStop(1, '#aa2277');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(x, y, S * 0.8, 0, Math.PI * 2); ctx.fill();

    // Rune ring with actual "rune" marks
    const runeRot = time * 0.8;
    ctx.strokeStyle = `rgba(255,100,180,${0.3 + 0.15 * Math.sin(time * 4)})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(x, y, S * 1.3, runeRot, runeRot + Math.PI * 1.5); ctx.stroke();
    // Rune tick marks along the ring
    for (let i = 0; i < 8; i++) {
      const ra = runeRot + (i / 8) * Math.PI * 1.5;
      if (ra > runeRot + Math.PI * 1.5) break;
      const innerR = S * 1.2;
      const outerR = S * 1.4;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(ra) * innerR, y + Math.sin(ra) * innerR);
      ctx.lineTo(x + Math.cos(ra) * outerR, y + Math.sin(ra) * outerR);
      ctx.stroke();
    }

    // Orbiting particles with trails
    for (let i = 0; i < 4; i++) {
      const a = time * 2.2 + (i / 4) * Math.PI * 2;
      const dist = S * 1.5 + Math.sin(time * 3 + i) * 2;
      const ox = x + Math.cos(a) * dist;
      const oy = y + Math.sin(a) * dist;
      // Trail (3 fading positions)
      for (let t = 1; t <= 3; t++) {
        const ta = a - t * 0.15;
        const tx = x + Math.cos(ta) * dist;
        const ty = y + Math.sin(ta) * dist;
        ctx.fillStyle = `rgba(255,136,204,${0.3 - t * 0.08})`;
        ctx.beginPath(); ctx.arc(tx, ty, 2.5 - t * 0.5, 0, Math.PI * 2); ctx.fill();
      }
      // Main particle
      ctx.fillStyle = '#ff88cc';
      ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Outline glow
    ctx.shadowColor = glow; ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(255,80,160,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, S * 0.8, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'necromancer') {
    // ── NECROMANCER: skull with green flame eyes and bobbing jaw ──
    // Skull with gradient
    const skullG = ctx.createRadialGradient(x, y - S * 0.1, S * 0.2, x, y - S * 0.1, S * 0.9);
    skullG.addColorStop(0, '#66cc66');
    skullG.addColorStop(0.6, '#44aa44');
    skullG.addColorStop(1, '#227722');
    ctx.fillStyle = skullG;
    ctx.beginPath(); ctx.arc(x, y - S * 0.1, S * 0.9, 0, Math.PI * 2); ctx.fill();

    // Bobbing jaw
    const jawBob = Math.sin(time * 2.5) * S * 0.06;
    ctx.fillStyle = '#3d993d';
    ctx.beginPath(); ctx.arc(x, y + S * 0.3 + jawBob, S * 0.6, 0, Math.PI); ctx.fill();
    // Teeth on jaw
    ctx.fillStyle = '#aaddaa';
    for (let i = -2; i <= 2; i++) {
      ctx.fillRect(x + i * S * 0.15 - 1, y + S * 0.23 + jawBob, 2, S * 0.12);
    }

    // Eye sockets (dark)
    ctx.fillStyle = '#0a330a';
    ctx.beginPath(); ctx.arc(x - S * 0.3, y - S * 0.15, S * 0.24, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + S * 0.3, y - S * 0.15, S * 0.24, 0, Math.PI * 2); ctx.fill();

    // Green flame in eye sockets
    for (const side of [-1, 1]) {
      const ex = x + side * S * 0.3;
      const ey = y - S * 0.15;
      const flameH = S * 0.35 + Math.sin(time * 10 + side * 2) * S * 0.08;
      // Flame body
      const fG = ctx.createRadialGradient(ex, ey, 0, ex, ey - flameH * 0.3, S * 0.2);
      fG.addColorStop(0, '#aaffaa');
      fG.addColorStop(0.5, '#44ff44');
      fG.addColorStop(1, 'transparent');
      ctx.fillStyle = fG;
      ctx.beginPath();
      ctx.moveTo(ex - S * 0.12, ey + S * 0.05);
      ctx.quadraticCurveTo(ex + noise(time * 12 + side * 30) * 2, ey - flameH, ex + S * 0.12, ey + S * 0.05);
      ctx.fill();
      // Bright core
      ctx.fillStyle = '#ccffcc';
      ctx.beginPath(); ctx.arc(ex, ey, S * 0.08, 0, Math.PI * 2); ctx.fill();
    }

    // Outline glow
    ctx.shadowColor = '#22ff22'; ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(50,200,50,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y - S * 0.1, S * 0.9, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'chronomancer') {
    // ── CHRONOMANCER: clock with tick marks and smoothly sweeping hands ──
    // Clock face gradient
    const clockG = ctx.createRadialGradient(x, y, S * 0.1, x, y, S);
    clockG.addColorStop(0, '#fff5d4');
    clockG.addColorStop(0.7, '#ddbb55');
    clockG.addColorStop(1, '#aa8822');
    ctx.fillStyle = clockG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();

    // Tick marks around edge (12 total)
    ctx.strokeStyle = '#ffffaa'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const inner = i % 3 === 0 ? S * 0.7 : S * 0.8;
      const w = i % 3 === 0 ? 1.5 : 0.8;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      ctx.lineTo(x + Math.cos(a) * S * 0.9, y + Math.sin(a) * S * 0.9);
      ctx.stroke();
    }

    // Outer ring
    ctx.strokeStyle = '#ffdd66'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, S * 0.92, 0, Math.PI * 2); ctx.stroke();

    // Smooth sweeping hands
    ctx.strokeStyle = '#ffffcc'; ctx.lineWidth = 2;
    const hourA = time * 0.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(hourA) * S * 0.45, y + Math.sin(hourA) * S * 0.45); ctx.stroke();
    ctx.lineWidth = 1;
    const minA = time * 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(minA) * S * 0.7, y + Math.sin(minA) * S * 0.7); ctx.stroke();
    // Second hand (thin, fast)
    ctx.strokeStyle = 'rgba(255,100,100,0.6)'; ctx.lineWidth = 0.5;
    const secA = time * 12;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(secA) * S * 0.75, y + Math.sin(secA) * S * 0.75); ctx.stroke();

    // Center pin
    ctx.fillStyle = '#ffffdd';
    ctx.beginPath(); ctx.arc(x, y, S * 0.08, 0, Math.PI * 2); ctx.fill();

    // Outline glow
    ctx.shadowColor = '#ffcc44'; ctx.shadowBlur = 5;
    ctx.strokeStyle = 'rgba(255,200,60,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'knight') {
    // ── KNIGHT: bulky shield with metallic sheen and glowing cross ──
    // Shield body with metallic gradient
    const shieldG = ctx.createLinearGradient(x - S * 0.9, y - S * 1.1, x + S * 0.9, y + S * 1.1);
    shieldG.addColorStop(0, '#d0dde8');
    shieldG.addColorStop(0.3, '#a0b5c8');
    shieldG.addColorStop(0.5, '#c8d5e0');
    shieldG.addColorStop(0.7, '#8899aa');
    shieldG.addColorStop(1, '#667788');
    ctx.fillStyle = shieldG;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.1);
    ctx.lineTo(x + S * 0.9, y - S * 0.3);
    ctx.lineTo(x + S * 0.7, y + S * 0.8);
    ctx.lineTo(x, y + S * 1.1);
    ctx.lineTo(x - S * 0.7, y + S * 0.8);
    ctx.lineTo(x - S * 0.9, y - S * 0.3);
    ctx.closePath(); ctx.fill();

    // Shield border highlight
    ctx.strokeStyle = '#ddeeff'; ctx.lineWidth = 2;
    ctx.stroke();

    // Glowing cross emblem
    ctx.shadowColor = '#aaccff'; ctx.shadowBlur = 4;
    ctx.fillStyle = '#ddeeff';
    ctx.fillRect(x - 2, y - S * 0.5, 4, S);
    ctx.fillRect(x - S * 0.35, y - 2, S * 0.7, 4);
    ctx.shadowBlur = 0;

    // Metallic highlight streak
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(x - S * 0.3, y - S * 1.0);
    ctx.lineTo(x + S * 0.1, y - S * 1.0);
    ctx.lineTo(x + S * 0.4, y + S * 0.5);
    ctx.lineTo(x, y + S * 0.5);
    ctx.closePath(); ctx.fill();

    // Outline glow
    ctx.shadowColor = '#778899'; ctx.shadowBlur = 5;
    ctx.strokeStyle = 'rgba(150,180,210,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.1);
    ctx.lineTo(x + S * 0.9, y - S * 0.3);
    ctx.lineTo(x + S * 0.7, y + S * 0.8);
    ctx.lineTo(x, y + S * 1.1);
    ctx.lineTo(x - S * 0.7, y + S * 0.8);
    ctx.lineTo(x - S * 0.9, y - S * 0.3);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'berserker') {
    // ── BERSERKER: jagged bulky body with pulsing spikes ──
    const hpRatio = player ? player.hp / player.maxHp : 1;
    const furyActive = player ? player._furyActive : false;
    const throb = furyActive ? (0.8 + 0.2 * Math.sin(time * 8)) : 1.0;
    const spikePulse = furyActive ? (1.0 + 0.15 * Math.sin(time * 6)) : 1.0;

    // Body gradient (redder at low HP)
    const redMix = furyActive ? 0.8 : Math.max(0, 1 - hpRatio);
    const bodyG = ctx.createRadialGradient(x, y, S * 0.2, x, y, S * 1.2 * throb);
    bodyG.addColorStop(0, `rgb(${255}, ${Math.floor(80 - redMix * 40)}, ${Math.floor(80 - redMix * 40)})`);
    bodyG.addColorStop(0.6, '#cc2222');
    bodyG.addColorStop(1, '#771111');
    ctx.fillStyle = bodyG;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? S * 1.2 * spikePulse : S * 0.85;
      i === 0 ? ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
              : ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();

    // Spike tips glow when fury active
    if (furyActive) {
      for (let i = 0; i < 4; i++) {
        const a = (i * 2 / 8) * Math.PI * 2;
        const tipX = x + Math.cos(a) * S * 1.2 * spikePulse;
        const tipY = y + Math.sin(a) * S * 1.2 * spikePulse;
        const tG = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, 4);
        tG.addColorStop(0, 'rgba(255,200,50,0.8)');
        tG.addColorStop(1, 'transparent');
        ctx.fillStyle = tG;
        ctx.beginPath(); ctx.arc(tipX, tipY, 4, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Angry eyes (brighter when fury)
    const eyeColor = furyActive ? '#ffcc00' : '#ff3300';
    ctx.fillStyle = eyeColor;
    ctx.fillRect(x - S * 0.4, y - S * 0.2, S * 0.3, S * 0.18);
    ctx.fillRect(x + S * 0.1, y - S * 0.2, S * 0.3, S * 0.18);
    // Eye slit pupils
    ctx.fillStyle = '#220000';
    ctx.fillRect(x - S * 0.3, y - S * 0.15, S * 0.12, S * 0.08);
    ctx.fillRect(x + S * 0.2, y - S * 0.15, S * 0.12, S * 0.08);

    // Outline glow (red/orange)
    ctx.shadowColor = furyActive ? '#ff4400' : '#cc2222'; ctx.shadowBlur = furyActive ? 10 : 4;
    ctx.strokeStyle = `rgba(255,${furyActive ? 100 : 50},${furyActive ? 50 : 30},0.4)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 === 0 ? S * 1.2 * spikePulse : S * 0.85;
      i === 0 ? ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
              : ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'paladin') {
    // ── PALADIN: warm glowing body with halo light rays ──
    // Body with warm light gradient
    const bodyG = ctx.createRadialGradient(x, y, S * 0.1, x, y, S);
    bodyG.addColorStop(0, '#fffff0');
    bodyG.addColorStop(0.4, '#ffeecc');
    bodyG.addColorStop(0.8, '#ddbb88');
    bodyG.addColorStop(1, '#bb9955');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();

    // Warm light emission
    const warmG = ctx.createRadialGradient(x, y, S * 0.5, x, y, S * 2.0);
    warmG.addColorStop(0, 'rgba(255,230,180,0.1)');
    warmG.addColorStop(1, 'transparent');
    ctx.fillStyle = warmG;
    ctx.beginPath(); ctx.arc(x, y, S * 2.0, 0, Math.PI * 2); ctx.fill();

    // Halo with light rays
    const haloAlpha = 0.4 + 0.2 * Math.sin(time * 3);
    ctx.strokeStyle = `rgba(255,255,180,${haloAlpha})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y - S * 1.0, S * 0.8, S * 0.25, 0, 0, Math.PI * 2);
    ctx.stroke();
    // Light rays emanating from halo
    for (let i = 0; i < 8; i++) {
      const ra = (i / 8) * Math.PI * 2;
      const rayLen = S * 0.3 + Math.sin(time * 4 + i * 1.5) * S * 0.1;
      const hx = x + Math.cos(ra) * S * 0.8;
      const hy = y - S * 1.0 + Math.sin(ra) * S * 0.25;
      ctx.strokeStyle = `rgba(255,255,200,${0.15 + Math.sin(time * 5 + i) * 0.1})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx + Math.cos(ra) * rayLen, hy - rayLen * 0.5);
      ctx.stroke();
    }

    // Holy cross
    ctx.shadowColor = '#ffffcc'; ctx.shadowBlur = 3;
    ctx.strokeStyle = '#ffffcc'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y - S * 0.5); ctx.lineTo(x, y + S * 0.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - S * 0.35, y - S * 0.1); ctx.lineTo(x + S * 0.35, y - S * 0.1); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'ranger') {
    // ── RANGER: hooded figure with depth shading and quiver ──
    // Hood with depth gradient
    const hoodG = ctx.createLinearGradient(x - S * 0.9, y - S * 1.2, x + S * 0.9, y + S * 0.8);
    hoodG.addColorStop(0, '#88aa44');
    hoodG.addColorStop(0.4, '#668833');
    hoodG.addColorStop(1, '#445522');
    ctx.fillStyle = hoodG;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.2);
    ctx.lineTo(x + S * 0.9, y + S * 0.8);
    ctx.lineTo(x - S * 0.9, y + S * 0.8);
    ctx.closePath(); ctx.fill();

    // Face with gradient
    const faceG = ctx.createRadialGradient(x - S * 0.1, y, S * 0.15, x, y + S * 0.1, S * 0.5);
    faceG.addColorStop(0, '#aadd66');
    faceG.addColorStop(1, '#77aa33');
    ctx.fillStyle = faceG;
    ctx.beginPath(); ctx.arc(x, y + S * 0.1, S * 0.5, 0, Math.PI * 2); ctx.fill();

    // Shadow under hood
    ctx.fillStyle = 'rgba(30,50,10,0.3)';
    ctx.beginPath();
    ctx.moveTo(x - S * 0.6, y - S * 0.3);
    ctx.quadraticCurveTo(x, y - S * 0.15, x + S * 0.6, y - S * 0.3);
    ctx.quadraticCurveTo(x, y + S * 0.1, x - S * 0.6, y - S * 0.3);
    ctx.fill();

    // Eyes (keen, bright)
    ctx.fillStyle = '#ddff88';
    ctx.beginPath(); ctx.arc(x - S * 0.15, y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + S * 0.15, y, 1.5, 0, Math.PI * 2); ctx.fill();

    // Quiver on back (slight offset)
    ctx.fillStyle = '#6b5533';
    ctx.fillRect(x + S * 0.4, y - S * 0.6, S * 0.2, S * 1.0);
    // Arrow tips in quiver
    ctx.fillStyle = '#aabb55';
    for (let i = 0; i < 3; i++) {
      const ay = y - S * 0.7 - i * 2;
      ctx.beginPath();
      ctx.moveTo(x + S * 0.5, ay);
      ctx.lineTo(x + S * 0.45, ay + 3);
      ctx.lineTo(x + S * 0.55, ay + 3);
      ctx.closePath(); ctx.fill();
    }

    // Outline glow
    ctx.shadowColor = glow; ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(100,150,50,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.2);
    ctx.lineTo(x + S * 0.9, y + S * 0.8);
    ctx.lineTo(x - S * 0.9, y + S * 0.8);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'druid') {
    // ── DRUID: multi-layered swaying leaves with parallax ──
    // Back leaf layer (darker, slight offset for parallax)
    const sway1 = Math.sin(time * 1.5) * S * 0.08;
    const sway2 = Math.sin(time * 2.0 + 0.5) * S * 0.06;

    ctx.fillStyle = '#2d7722';
    ctx.beginPath();
    ctx.moveTo(x + sway1 * 0.5, y - S * 1.1);
    ctx.quadraticCurveTo(x + S * 1.1 + sway1, y - S * 0.2, x + S * 0.25 + sway1 * 0.3, y + S * 0.9);
    ctx.quadraticCurveTo(x + sway1 * 0.2, y + S * 0.5, x - S * 0.25 - sway1 * 0.3, y + S * 0.9);
    ctx.quadraticCurveTo(x - S * 1.1 - sway1, y - S * 0.2, x + sway1 * 0.5, y - S * 1.1);
    ctx.closePath(); ctx.fill();

    // Front leaf layer with gradient
    const leafG = ctx.createRadialGradient(x + sway2, y - S * 0.2, S * 0.2, x, y, S * 1.0);
    leafG.addColorStop(0, '#66dd44');
    leafG.addColorStop(0.6, '#44aa33');
    leafG.addColorStop(1, '#337722');
    ctx.fillStyle = leafG;
    ctx.beginPath();
    ctx.moveTo(x + sway2, y - S * 1.2);
    ctx.quadraticCurveTo(x + S * 1.2 + sway2, y - S * 0.3, x + S * 0.3 + sway2 * 0.5, y + S * 1.0);
    ctx.quadraticCurveTo(x + sway2 * 0.3, y + S * 0.6, x - S * 0.3 - sway2 * 0.5, y + S * 1.0);
    ctx.quadraticCurveTo(x - S * 1.2 - sway2, y - S * 0.3, x + sway2, y - S * 1.2);
    ctx.closePath(); ctx.fill();

    // Leaf veins
    ctx.strokeStyle = '#77dd55'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + sway2, y - S * 0.8);
    ctx.lineTo(x + sway2 * 0.5, y + S * 0.6);
    ctx.stroke();
    // Side veins
    ctx.beginPath();
    ctx.moveTo(x + sway2 * 0.7, y - S * 0.3);
    ctx.lineTo(x + S * 0.4 + sway2, y - S * 0.1);
    ctx.moveTo(x + sway2 * 0.7, y - S * 0.3);
    ctx.lineTo(x - S * 0.4 - sway2, y - S * 0.1);
    ctx.moveTo(x + sway2 * 0.5, y + S * 0.1);
    ctx.lineTo(x + S * 0.3, y + S * 0.3);
    ctx.moveTo(x + sway2 * 0.5, y + S * 0.1);
    ctx.lineTo(x - S * 0.3, y + S * 0.3);
    ctx.stroke();

    // Floating spores
    for (let i = 0; i < 3; i++) {
      const sa = time * 0.8 + (i / 3) * Math.PI * 2;
      const sd = S * 1.6 + Math.sin(time * 2 + i) * 3;
      ctx.fillStyle = `rgba(150,255,100,${0.2 + Math.sin(time * 3 + i * 2) * 0.1})`;
      ctx.beginPath(); ctx.arc(x + Math.cos(sa) * sd, y + Math.sin(sa) * sd, 1.5, 0, Math.PI * 2); ctx.fill();
    }

    // Outline glow
    ctx.shadowColor = '#44dd22'; ctx.shadowBlur = 5;
    ctx.strokeStyle = 'rgba(60,180,30,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + sway2, y - S * 1.2);
    ctx.quadraticCurveTo(x + S * 1.2 + sway2, y - S * 0.3, x + S * 0.3 + sway2 * 0.5, y + S * 1.0);
    ctx.quadraticCurveTo(x + sway2 * 0.3, y + S * 0.6, x - S * 0.3 - sway2 * 0.5, y + S * 1.0);
    ctx.quadraticCurveTo(x - S * 1.2 - sway2, y - S * 0.3, x + sway2, y - S * 1.2);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'warlock') {
    // ── WARLOCK: dark robe with energy wisps and trailing eyes ──
    // Robe with dark gradient
    const robeG = ctx.createLinearGradient(x, y - S * 1.3, x, y + S * 1.0);
    robeG.addColorStop(0, '#5a1980');
    robeG.addColorStop(0.5, '#3d0d5c');
    robeG.addColorStop(1, '#1a0630');
    ctx.fillStyle = robeG;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.3);
    ctx.lineTo(x + S * 0.7, y - S * 0.2);
    ctx.lineTo(x + S * 0.9, y + S * 1.0);
    ctx.lineTo(x - S * 0.9, y + S * 1.0);
    ctx.lineTo(x - S * 0.7, y - S * 0.2);
    ctx.closePath(); ctx.fill();

    // Dark energy wisps floating around robe
    for (let i = 0; i < 4; i++) {
      const wa = time * 1.5 + (i / 4) * Math.PI * 2;
      const wd = S * 0.9 + Math.sin(time * 2.5 + i * 1.7) * S * 0.3;
      const wx = x + Math.cos(wa) * wd * 0.6;
      const wy = y + Math.sin(wa) * wd * 0.4;
      const wG = ctx.createRadialGradient(wx, wy, 0, wx, wy, S * 0.25);
      wG.addColorStop(0, 'rgba(120,40,180,0.4)');
      wG.addColorStop(1, 'transparent');
      ctx.fillStyle = wG;
      ctx.beginPath(); ctx.arc(wx, wy, S * 0.25, 0, Math.PI * 2); ctx.fill();
    }

    // Glowing eyes with trails
    for (const side of [-1, 1]) {
      const eyeX = x + side * S * 0.2;
      const eyeY = y - S * 0.3;
      // Eye trail (fading afterimages)
      for (let t = 1; t <= 3; t++) {
        const trailX = eyeX - Math.cos(angle) * t * 2;
        const trailY = eyeY - Math.sin(angle) * t * 2;
        ctx.fillStyle = `rgba(170,68,255,${0.3 - t * 0.08})`;
        ctx.beginPath(); ctx.arc(trailX, trailY, 2.5 - t * 0.4, 0, Math.PI * 2); ctx.fill();
      }
      // Main eye
      ctx.fillStyle = '#bb55ff';
      ctx.beginPath(); ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
      // Eye glow
      const eG = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 5);
      eG.addColorStop(0, 'rgba(170,68,255,0.5)');
      eG.addColorStop(1, 'transparent');
      ctx.fillStyle = eG;
      ctx.beginPath(); ctx.arc(eyeX, eyeY, 5, 0, Math.PI * 2); ctx.fill();
    }

    // Outline glow
    ctx.shadowColor = '#8833cc'; ctx.shadowBlur = 6;
    ctx.strokeStyle = 'rgba(120,40,180,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y - S * 1.3);
    ctx.lineTo(x + S * 0.7, y - S * 0.2);
    ctx.lineTo(x + S * 0.9, y + S * 1.0);
    ctx.lineTo(x - S * 0.9, y + S * 1.0);
    ctx.lineTo(x - S * 0.7, y - S * 0.2);
    ctx.closePath(); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'monk') {
    // ── MONK: rotating yin-yang with chi energy ring ──
    const yinRot = time * 0.5; // Slow rotation

    // Outer chi energy ring
    const chiPulse = 0.2 + 0.15 * Math.sin(time * 4);
    ctx.strokeStyle = `rgba(238,221,136,${chiPulse})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, S * 1.4, 0, Math.PI * 2); ctx.stroke();
    // Chi sparks on ring
    for (let i = 0; i < 6; i++) {
      const ca = time * 2 + (i / 6) * Math.PI * 2;
      const cx2 = x + Math.cos(ca) * S * 1.4;
      const cy2 = y + Math.sin(ca) * S * 1.4;
      ctx.fillStyle = `rgba(255,240,150,${0.3 + Math.sin(time * 6 + i * 2) * 0.2})`;
      ctx.beginPath(); ctx.arc(cx2, cy2, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // Body circle with gradient
    const bodyG = ctx.createRadialGradient(x, y, S * 0.1, x, y, S);
    bodyG.addColorStop(0, '#fff5cc');
    bodyG.addColorStop(0.5, '#eedd88');
    bodyG.addColorStop(1, '#ccaa44');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();

    // Rotating yin-yang
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(yinRot);
    // White half
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, 0, S * 0.6, -Math.PI / 2, Math.PI / 2); ctx.fill();
    // Dark half
    ctx.fillStyle = '#332200';
    ctx.beginPath(); ctx.arc(0, 0, S * 0.6, Math.PI / 2, -Math.PI / 2); ctx.fill();
    // Small circles
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(0, S * 0.3, S * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#332200';
    ctx.beginPath(); ctx.arc(0, -S * 0.3, S * 0.12, 0, Math.PI * 2); ctx.fill();
    // S-curve boundary
    ctx.beginPath();
    ctx.arc(0, -S * 0.3, S * 0.3, -Math.PI / 2, Math.PI / 2);
    ctx.arc(0, S * 0.3, S * 0.3, -Math.PI / 2, Math.PI / 2, true);
    ctx.strokeStyle = 'rgba(100,80,30,0.3)'; ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();

    // Outline glow
    ctx.shadowColor = '#ccaa44'; ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(200,170,60,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else if (clsKey === 'engineer') {
    // ── ENGINEER: goggled figure with lens flare and sparking gear ──
    // Body with gradient
    const bodyG = ctx.createRadialGradient(x - S * 0.2, y - S * 0.2, S * 0.1, x, y, S);
    bodyG.addColorStop(0, '#ffaa55');
    bodyG.addColorStop(0.5, '#dd8833');
    bodyG.addColorStop(1, '#aa6622');
    ctx.fillStyle = bodyG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();

    // Goggles with lens flare
    ctx.strokeStyle = '#8b5e22'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - S * 0.3, y - S * 0.1, S * 0.3, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x + S * 0.3, y - S * 0.1, S * 0.3, 0, Math.PI * 2); ctx.stroke();
    // Bridge
    ctx.beginPath(); ctx.moveTo(x - S * 0.05, y - S * 0.1); ctx.lineTo(x + S * 0.05, y - S * 0.1); ctx.stroke();

    // Lens fill
    ctx.fillStyle = '#44ccff';
    ctx.beginPath(); ctx.arc(x - S * 0.3, y - S * 0.1, S * 0.18, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + S * 0.3, y - S * 0.1, S * 0.18, 0, Math.PI * 2); ctx.fill();

    // Lens flare (time-based shimmer)
    const flareAlpha = 0.3 + 0.3 * Math.sin(time * 3);
    ctx.fillStyle = `rgba(200,240,255,${flareAlpha})`;
    ctx.beginPath(); ctx.arc(x - S * 0.35, y - S * 0.2, S * 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + S * 0.25, y - S * 0.2, S * 0.06, 0, Math.PI * 2); ctx.fill();

    // Rotating gear with teeth
    const gearA = time * 1.5;
    const gearY2 = y - S * 0.85;
    ctx.strokeStyle = '#cc7722'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, gearY2, S * 0.3, 0, Math.PI * 2); ctx.stroke();
    // Gear teeth
    for (let i = 0; i < 8; i++) {
      const a = gearA + (i / 8) * Math.PI * 2;
      const innerR = S * 0.3;
      const outerR = S * 0.45;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a - 0.15) * innerR, gearY2 + Math.sin(a - 0.15) * innerR);
      ctx.lineTo(x + Math.cos(a - 0.12) * outerR, gearY2 + Math.sin(a - 0.12) * outerR);
      ctx.lineTo(x + Math.cos(a + 0.12) * outerR, gearY2 + Math.sin(a + 0.12) * outerR);
      ctx.lineTo(x + Math.cos(a + 0.15) * innerR, gearY2 + Math.sin(a + 0.15) * innerR);
      ctx.closePath();
      ctx.fillStyle = '#dd8833';
      ctx.fill();
    }

    // Sparks from gear (2-3 at random positions)
    for (let i = 0; i < 3; i++) {
      const sparkPhase = (time * 8 + i * 2.3) % 1;
      if (sparkPhase < 0.3) {
        const sa = gearA + i * 1.2;
        const sparkX = x + Math.cos(sa) * S * 0.5 + noise(time * 20 + i * 13) * 4;
        const sparkY = gearY2 + Math.sin(sa) * S * 0.5 + noise(time * 18 + i * 19) * 4;
        ctx.fillStyle = `rgba(255,${200 + Math.floor(noise(time * 25 + i) * 55)},50,${0.8 - sparkPhase * 2})`;
        ctx.beginPath(); ctx.arc(sparkX, sparkY, 1, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Outline glow
    ctx.shadowColor = glow; ctx.shadowBlur = 4;
    ctx.strokeStyle = 'rgba(200,120,30,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;

  } else {
    // Default fallback (gradient body)
    const defG = ctx.createRadialGradient(x - S * 0.2, y - S * 0.2, S * 0.1, x, y, S);
    defG.addColorStop(0, '#ffffff33');
    defG.addColorStop(0.3, color);
    defG.addColorStop(1, glow);
    ctx.fillStyle = defG;
    ctx.beginPath(); ctx.arc(x, y, S, 0, Math.PI * 2); ctx.fill();
  }
}

// ── Class-specific weapon/staff drawing ──
function drawWeapon(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, clsKey: string, color: string, S: number): void {
  const staffStart = S * 0.5;
  const staffEnd = S * 1.8;

  if (clsKey === 'knight') {
    // Sword shape
    const sx = x + Math.cos(angle) * staffStart;
    const sy = y + Math.sin(angle) * staffStart;
    const ex = x + Math.cos(angle) * staffEnd;
    const ey = y + Math.sin(angle) * staffEnd;
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    // Blade
    ctx.fillStyle = '#ddeeff';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(sx + perpX * 2, sy + perpY * 2);
    ctx.lineTo(sx - perpX * 2, sy - perpY * 2);
    ctx.closePath(); ctx.fill();
    // Guard
    const gx = x + Math.cos(angle) * (staffStart + 2);
    const gy = y + Math.sin(angle) * (staffStart + 2);
    ctx.strokeStyle = '#aabbcc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx + perpX * 5, gy + perpY * 5);
    ctx.lineTo(gx - perpX * 5, gy - perpY * 5);
    ctx.stroke();

  } else if (clsKey === 'berserker') {
    // Axe shape
    const sx = x + Math.cos(angle) * staffStart;
    const sy = y + Math.sin(angle) * staffStart;
    const ex = x + Math.cos(angle) * staffEnd;
    const ey = y + Math.sin(angle) * staffEnd;
    // Handle
    ctx.strokeStyle = '#884422';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    // Axe head
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    ctx.fillStyle = '#cc4444';
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.quadraticCurveTo(ex + perpX * 6, ey + perpY * 6, ex - Math.cos(angle) * 6 + perpX * 4, ey - Math.sin(angle) * 6 + perpY * 4);
    ctx.lineTo(ex - Math.cos(angle) * 6, ey - Math.sin(angle) * 6);
    ctx.closePath(); ctx.fill();
    // Metallic glint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.beginPath(); ctx.arc(ex + perpX * 2, ey + perpY * 2, 2, 0, Math.PI * 2); ctx.fill();

  } else if (clsKey === 'ranger') {
    // Bow shape
    const bx = x + Math.cos(angle) * (staffStart + 3);
    const by = y + Math.sin(angle) * (staffStart + 3);
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    // Bow arc
    ctx.strokeStyle = '#886633';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx + perpX * S * 0.8, by + perpY * S * 0.8);
    ctx.quadraticCurveTo(
      bx + Math.cos(angle) * S * 0.8,
      by + Math.sin(angle) * S * 0.8,
      bx - perpX * S * 0.8, by - perpY * S * 0.8
    );
    ctx.stroke();
    // String
    ctx.strokeStyle = 'rgba(200,200,200,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(bx + perpX * S * 0.8, by + perpY * S * 0.8);
    ctx.lineTo(bx - perpX * S * 0.8, by - perpY * S * 0.8);
    ctx.stroke();

  } else if (clsKey === 'monk') {
    // Chi glow on fists (no weapon)
    for (const side of [-1, 1]) {
      const perpX = Math.cos(angle + Math.PI / 2) * side;
      const perpY = Math.sin(angle + Math.PI / 2) * side;
      const fx = x + Math.cos(angle) * S * 0.8 + perpX * S * 0.5;
      const fy = y + Math.sin(angle) * S * 0.8 + perpY * S * 0.5;
      const chiG = ctx.createRadialGradient(fx, fy, 0, fx, fy, 5);
      chiG.addColorStop(0, 'rgba(255,240,150,0.6)');
      chiG.addColorStop(1, 'transparent');
      ctx.fillStyle = chiG;
      ctx.beginPath(); ctx.arc(fx, fy, 5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eedd88';
      ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
    }
    return; // No staff line needed

  } else if (clsKey === 'engineer') {
    // Wrench shape
    const sx = x + Math.cos(angle) * staffStart;
    const sy = y + Math.sin(angle) * staffStart;
    const ex = x + Math.cos(angle) * staffEnd;
    const ey = y + Math.sin(angle) * staffEnd;
    // Handle
    ctx.strokeStyle = '#bb7733';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    // Wrench head (U shape)
    const perpX = Math.cos(angle + Math.PI / 2);
    const perpY = Math.sin(angle + Math.PI / 2);
    ctx.strokeStyle = '#ddaa44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ex + perpX * 3, ey + perpY * 3);
    ctx.lineTo(ex + Math.cos(angle) * 4 + perpX * 3, ey + Math.sin(angle) * 4 + perpY * 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(ex - perpX * 3, ey - perpY * 3);
    ctx.lineTo(ex + Math.cos(angle) * 4 - perpX * 3, ey + Math.sin(angle) * 4 - perpY * 3);
    ctx.stroke();

  } else {
    // Default: mage staff with glowing orb tip
    const sx = x + Math.cos(angle) * staffStart;
    const sy = y + Math.sin(angle) * staffStart;
    const ex = x + Math.cos(angle) * staffEnd;
    const ey = y + Math.sin(angle) * staffEnd;
    // Staff body
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    // Orb on tip
    const orbG = ctx.createRadialGradient(ex, ey, 0, ex, ey, 5);
    orbG.addColorStop(0, '#ffffff');
    orbG.addColorStop(0.4, color);
    orbG.addColorStop(1, 'transparent');
    ctx.fillStyle = orbG;
    ctx.beginPath(); ctx.arc(ex, ey, 5, 0, Math.PI * 2); ctx.fill();
    // Glow
    ctx.shadowColor = color; ctx.shadowBlur = 6;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(ex, ey, 2, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    return;
  }
}

export function drawWizard(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.players) {
    const cls = p.cls;

    // ── Death fade animation ──
    if (!p.alive) {
      if (p._animDeathFade > 0) {
        p._animDeathFade -= 0.016; // ~60fps decay
        ctx.save();
        ctx.globalAlpha = p._animDeathFade;
        // Scale down as fading
        const deathScale = 0.5 + 0.5 * p._animDeathFade;
        ctx.translate(p.x, p.y);
        ctx.scale(deathScale, deathScale);
        ctx.translate(-p.x, -p.y);
        drawClassBody(ctx, p.x, p.y, p.angle, p.clsKey, cls.color, cls.glow, state.time, p);
        ctx.restore();
      }
      continue;
    }

    if (p.iframes > 0 && Math.sin(state.time * 25) > 0) continue;

    // ── Compute animation offsets ──
    const idleBob = p._animMoving ? 0 : Math.sin(state.time * 2.5) * 2;

    let scaleX = 1.0;
    let scaleY = 1.0;
    let lean = 0;
    if (p._animMoving) {
      // Subtle lean in movement direction
      lean = p.vx * 0.002;
      // Running "bounce" squash-stretch
      const bounce = Math.sin(state.time * 12) * 0.04;
      scaleX = 1.0 - bounce;
      scaleY = 1.0 + bounce;
    }

    // ── Aura glow (at actual position, no bob) ──
    const ag = ctx.createRadialGradient(p.x, p.y, WIZARD_SIZE * 0.5, p.x, p.y, WIZARD_SIZE * 2.5);
    ag.addColorStop(0, cls.glow + '22');
    ag.addColorStop(1, 'transparent');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(p.x, p.y, WIZARD_SIZE * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // ── Draw body + weapon with lean/squash-stretch and idle bob ──
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(lean);
    ctx.scale(scaleX, scaleY);
    ctx.translate(-p.x, -p.y);

    // Class-specific body (pass player data for fury/HP tracking)
    drawClassBody(ctx, p.x, p.y + idleBob, p.angle, p.clsKey, cls.color, cls.glow, state.time, p);

    // Class-specific weapon / aim indicator
    const scale = CLASS_SCALE[p.clsKey] || 1.0;
    drawWeapon(ctx, p.x, p.y + idleBob, p.angle, p.clsKey, cls.color, WIZARD_SIZE * scale);

    ctx.restore();

    // ── Cast flash (at actual position) ──
    if (p._animCastFlash > 0) {
      const castAlpha = Math.min(1, p._animCastFlash * 4); // quick fade
      const cg = ctx.createRadialGradient(p.x, p.y, WIZARD_SIZE * 0.3, p.x, p.y, WIZARD_SIZE * 3);
      cg.addColorStop(0, cls.color + Math.floor(castAlpha * 100).toString(16).padStart(2, '0'));
      cg.addColorStop(1, 'transparent');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(p.x, p.y, WIZARD_SIZE * 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ── Hit flash overlay (at bobbed position) ──
    if (p._animHitFlash > 0) {
      ctx.save();
      const hitAlpha = Math.min(1, p._animHitFlash * 3.3);
      ctx.globalAlpha = hitAlpha * 0.6;
      ctx.fillStyle = '#ff3333';
      ctx.beginPath();
      ctx.arc(p.x, p.y + idleBob, WIZARD_SIZE * (CLASS_SCALE[p.clsKey] || 1.0), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

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

    // Ult ready glow
    if (p.ultCharge >= 100) {
      ctx.strokeStyle = `rgba(255,200,60,${0.3 + 0.2 * Math.sin(state.time * 4)})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, WIZARD_SIZE + 6, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Health bar
    const bw = WIZARD_SIZE * 2.5;
    const bh = 3;
    const bx = p.x - bw / 2;
    const by = p.y + WIZARD_SIZE + 8;
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

    // Ult charge bar
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.fillRect(bx - 1, by + bh + 4, bw + 2, 2);
    ctx.fillStyle = p.ultCharge >= 100 ? 'rgba(255,200,60,.8)' : 'rgba(255,200,60,.3)';
    ctx.fillRect(bx, by + bh + 5, bw * Math.min(1, p.ultCharge / 100), 1);

    // Player label + class name
    ctx.fillStyle = p.idx === 0 ? 'rgba(100,180,255,.5)' : 'rgba(255,140,100,.5)';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(`P${p.idx + 1} ${cls.name}`, p.x, p.y - WIZARD_SIZE - 7);
  }
}

// ═══════════════════════════════════
//       DRAW ENEMIES
// ═══════════════════════════════════

// ── Draw a Heimer-style turret ──
function drawTurret(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, isMega: boolean, zoneActive: boolean): void {
  const s = size;
  const barrelAngle = time * 2;

  // Base platform (hexagonal)
  ctx.fillStyle = isMega ? '#cc8822' : '#996622';
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
    const px = x + Math.cos(a) * s * 0.9;
    const py = y + Math.sin(a) * s * 0.9;
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  // Base outline
  ctx.strokeStyle = isMega ? '#ffaa33' : '#bb8833';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Center dome with gradient
  const domeG = ctx.createRadialGradient(x, y - s * 0.1, s * 0.1, x, y, s * 0.5);
  domeG.addColorStop(0, isMega ? '#ffcc44' : '#ddaa33');
  domeG.addColorStop(1, isMega ? '#aa6611' : '#775511');
  ctx.fillStyle = domeG;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Three barrels (rotating with inertia feel via sin easing)
  const inertiaAngle = barrelAngle + Math.sin(barrelAngle * 0.5) * 0.1;
  for (let i = 0; i < 3; i++) {
    const a = inertiaAngle + (i / 3) * Math.PI * 2;
    const bx2 = x + Math.cos(a) * s * 0.3;
    const by2 = y + Math.sin(a) * s * 0.3;
    const barrelLen = isMega ? 1.4 : 1.1;
    const ex = x + Math.cos(a) * s * barrelLen;
    const ey = y + Math.sin(a) * s * barrelLen;

    // Barrel body
    ctx.strokeStyle = isMega ? '#ffbb44' : '#cc9933';
    ctx.lineWidth = isMega ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(bx2, by2);
    ctx.lineTo(ex, ey);
    ctx.stroke();

    // Muzzle flash when zone ticks
    if (zoneActive) {
      const flashPhase = (time * 5 + i * 2.1) % 1;
      if (flashPhase < 0.15) {
        const flashG = ctx.createRadialGradient(ex, ey, 0, ex, ey, 6);
        flashG.addColorStop(0, 'rgba(255,240,180,0.9)');
        flashG.addColorStop(0.5, 'rgba(255,180,50,0.5)');
        flashG.addColorStop(1, 'transparent');
        ctx.fillStyle = flashG;
        ctx.beginPath(); ctx.arc(ex, ey, 6, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Barrel tip glow
    const tipG = ctx.createRadialGradient(ex, ey, 0, ex, ey, 4);
    tipG.addColorStop(0, isMega ? '#ffdd66' : '#ffaa33');
    tipG.addColorStop(1, 'transparent');
    ctx.fillStyle = tipG;
    ctx.beginPath();
    ctx.arc(ex, ey, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Center eye/lens
  ctx.fillStyle = isMega ? '#ff6622' : '#ffcc44';
  ctx.beginPath();
  ctx.arc(x, y, s * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Pulsing ring (active indicator)
  const pulse = 0.3 + 0.2 * Math.sin(time * 5);
  ctx.strokeStyle = `rgba(255,170,50,${pulse})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, s * 1.1, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Draw a wolf summon ──
function drawWolf(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, target: { x: number; y: number } | null, time: number): void {
  const angle = target ? Math.atan2(target.y - y, target.x - x) : 0;
  const isMoving = target !== null;
  const runCycle = time * 12;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);

  // Body (elongated) with gradient
  const bodyG = ctx.createRadialGradient(-size * 0.1, 0, size * 0.2, 0, 0, size * 1.2);
  bodyG.addColorStop(0, '#88cc66');
  bodyG.addColorStop(1, '#557744');
  ctx.fillStyle = bodyG;
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 1.2, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Running legs (4 legs with alternating animation)
  if (isMoving) {
    ctx.strokeStyle = '#55aa44';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const legX = -size * 0.5 + (i / 3) * size * 1.2;
      const legPhase = runCycle + (i % 2 === 0 ? 0 : Math.PI);
      const legY = size * 0.5 + Math.abs(Math.sin(legPhase)) * size * 0.4;
      const kneeY = size * 0.3 + Math.sin(legPhase) * size * 0.15;
      ctx.beginPath();
      ctx.moveTo(legX, size * 0.2);
      ctx.lineTo(legX + Math.sin(legPhase) * 2, kneeY);
      ctx.lineTo(legX, legY);
      ctx.stroke();
    }
  }

  // Head
  ctx.fillStyle = '#77bb66';
  ctx.beginPath();
  ctx.arc(size * 0.8, 0, size * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Ears
  ctx.fillStyle = '#55aa44';
  ctx.beginPath();
  ctx.moveTo(size * 0.9, -size * 0.4);
  ctx.lineTo(size * 1.3, -size * 0.7);
  ctx.lineTo(size * 1.1, -size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.9, size * 0.4);
  ctx.lineTo(size * 1.3, size * 0.7);
  ctx.lineTo(size * 1.1, size * 0.2);
  ctx.closePath();
  ctx.fill();

  // Eyes
  ctx.fillStyle = '#ccff88';
  ctx.beginPath();
  ctx.arc(size * 1.0, -size * 0.15, 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(size * 1.0, size * 0.15, 2, 0, Math.PI * 2);
  ctx.fill();

  // Panting mouth (when moving)
  if (isMoving) {
    const mouthOpen = Math.abs(Math.sin(time * 6)) * size * 0.15;
    ctx.fillStyle = '#cc5555';
    ctx.beginPath();
    ctx.ellipse(size * 1.2, size * 0.1, size * 0.15, mouthOpen, 0, 0, Math.PI * 2);
    ctx.fill();
    // Tongue
    if (mouthOpen > size * 0.08) {
      ctx.fillStyle = '#ff7777';
      ctx.beginPath();
      ctx.ellipse(size * 1.3, size * 0.15 + mouthOpen * 0.3, size * 0.06, mouthOpen * 0.5, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Tail (wagging)
  const wag = Math.sin(time * 8) * 0.3;
  ctx.strokeStyle = '#66aa55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-size * 0.9, 0);
  ctx.quadraticCurveTo(-size * 1.3, Math.sin(wag) * size * 0.6, -size * 1.5, Math.sin(wag) * size * 0.4);
  ctx.stroke();

  ctx.restore();
}

// ── Draw an imp summon ──
function drawImp(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number): void {
  // Wings (dynamic flapping with varied amplitude)
  const flapBase = Math.sin(time * 10);
  const flapDetail = Math.sin(time * 15) * 0.15;
  const flap = (flapBase + flapDetail) * 0.35;

  // Wing membrane (semi-transparent with gradient)
  for (const side of [-1, 1]) {
    const wingG = ctx.createRadialGradient(
      x + side * size * 0.6, y - size * 0.2, size * 0.1,
      x + side * size * 0.6, y - size * 0.2, size * 0.8
    );
    wingG.addColorStop(0, 'rgba(130,40,160,0.5)');
    wingG.addColorStop(1, 'rgba(80,20,100,0.15)');
    ctx.fillStyle = wingG;
    ctx.beginPath();
    ctx.ellipse(x + side * size * 0.6, y - size * 0.2, size * 0.8, size * 0.45, side * (-0.3 + flap), 0, Math.PI * 2);
    ctx.fill();
    // Wing bone
    ctx.strokeStyle = 'rgba(160,60,200,0.4)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + side * size * 0.2, y - size * 0.1);
    ctx.lineTo(x + side * size * 1.2, y - size * 0.4 + flap * size * 0.3);
    ctx.stroke();
  }

  // Body with gradient
  const impG = ctx.createRadialGradient(x - size * 0.1, y - size * 0.1, size * 0.1, x, y, size * 0.7);
  impG.addColorStop(0, '#aa44cc');
  impG.addColorStop(1, '#662288');
  ctx.fillStyle = impG;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.7, 0, Math.PI * 2);
  ctx.fill();

  // Horns
  ctx.strokeStyle = '#cc55ee';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - size * 0.3, y - size * 0.5);
  ctx.quadraticCurveTo(x - size * 0.6, y - size * 0.8, x - size * 0.5, y - size * 1.0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + size * 0.3, y - size * 0.5);
  ctx.quadraticCurveTo(x + size * 0.6, y - size * 0.8, x + size * 0.5, y - size * 1.0);
  ctx.stroke();

  // Fire breath particles
  const breathAngle = Math.sin(time * 3) * 0.3;
  for (let i = 0; i < 3; i++) {
    const age = (time * 4 + i * 0.8) % 2;
    if (age < 1.2) {
      const dist = age * size * 1.5;
      const px = x + Math.cos(breathAngle - Math.PI / 2) * dist;
      const py = y - size * 0.5 + Math.sin(breathAngle) * dist * 0.3 - dist * 0.5;
      const sz = (1.2 - age) * 2;
      ctx.fillStyle = `rgba(255,${100 + Math.floor(age * 100)},50,${0.5 - age * 0.35})`;
      ctx.beginPath(); ctx.arc(px, py, sz, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Eyes (glowing red)
  for (const side of [-1, 1]) {
    const eyeX = x + side * size * 0.2;
    const eyeY = y - size * 0.1;
    const eG = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 4);
    eG.addColorStop(0, '#ff6644');
    eG.addColorStop(0.5, '#ff2222');
    eG.addColorStop(1, 'transparent');
    ctx.fillStyle = eG;
    ctx.beginPath(); ctx.arc(eyeX, eyeY, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffccaa';
    ctx.beginPath(); ctx.arc(eyeX, eyeY, 1.2, 0, Math.PI * 2); ctx.fill();
  }
}

// ── Type-specific enemy body rendering ──
function drawEnemyBody(ctx: CanvasRenderingContext2D, e: { x: number; y: number; type: string; hp?: number; maxHp?: number }, et: { size: number; color: string; boss?: boolean; phase?: boolean }, eyeAngle: number, time: number): void {
  const { x, y } = e;
  const { size, color } = et;
  const eType = e.type;

  if (eType === 'slime') {
    // ── SLIME: jiggly blob with glossy highlight and drip ──
    const wobblePhase = time * 5;
    ctx.fillStyle = color;
    ctx.beginPath();
    // Wobble vertices
    const pts = 12;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const wobble = Math.sin(wobblePhase + i * 1.5) * size * 0.12;
      const squish = 1 + Math.sin(wobblePhase * 0.7) * 0.08; // Breathing
      const rx = (size + wobble) * (1 + (Math.cos(a) > 0 ? 0.02 : -0.02));
      const ry = (size + wobble) * squish;
      const px = x + Math.cos(a) * rx;
      const py = y + Math.sin(a) * ry;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

    // Glossy highlight
    const gloss = ctx.createRadialGradient(x - size * 0.25, y - size * 0.3, size * 0.05, x, y, size);
    gloss.addColorStop(0, 'rgba(255,255,255,0.45)');
    gloss.addColorStop(0.3, 'rgba(255,255,255,0.1)');
    gloss.addColorStop(1, 'transparent');
    ctx.fillStyle = gloss;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();

    // Drip particle
    const dripPhase = (time * 2) % 3;
    if (dripPhase < 1.5) {
      const dripY = y + size + dripPhase * 4;
      const dripSize = Math.max(0.5, 2 - dripPhase * 1.2);
      ctx.fillStyle = color;
      ctx.beginPath(); ctx.arc(x + size * 0.2, dripY, dripSize, 0, Math.PI * 2); ctx.fill();
    }

    // Eyes
    const ed = size * 0.3;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.4) * ed, y + Math.sin(eyeAngle - 0.4) * ed - size * 0.1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.4) * ed, y + Math.sin(eyeAngle + 0.4) * ed - size * 0.1, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#115511';
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.4) * ed * 1.1, y + Math.sin(eyeAngle - 0.4) * ed * 1.1 - size * 0.1, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.4) * ed * 1.1, y + Math.sin(eyeAngle + 0.4) * ed * 1.1 - size * 0.1, 1.2, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'bat') {
    // ── BAT: small body with large flapping wings ──
    const flap = Math.sin(time * 16) * 0.6;
    // Wings
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(100,70,140,0.6)';
      ctx.beginPath();
      // Wing shape: 3-point with curve
      const wingTip1X = x + side * size * 2.5;
      const wingTip1Y = y - size * 0.5 + flap * size * side * 0.3;
      const wingTip2X = x + side * size * 1.8;
      const wingTip2Y = y + size * 0.5 - flap * size * side * 0.2;
      ctx.moveTo(x + side * size * 0.3, y - size * 0.3);
      ctx.quadraticCurveTo(x + side * size * 1.5, y - size * 1.0 + flap * size, wingTip1X, wingTip1Y);
      ctx.lineTo(wingTip2X, wingTip2Y);
      ctx.quadraticCurveTo(x + side * size * 0.8, y + size * 0.2, x + side * size * 0.3, y + size * 0.2);
      ctx.closePath(); ctx.fill();
      // Wing bones
      ctx.strokeStyle = 'rgba(130,90,170,0.4)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + side * size * 0.3, y);
      ctx.lineTo(wingTip1X, wingTip1Y);
      ctx.stroke();
    }
    // Small body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, size * 0.65, 0, Math.PI * 2); ctx.fill();
    // Ears
    for (const side of [-1, 1]) {
      ctx.fillStyle = '#7755aa';
      ctx.beginPath();
      ctx.moveTo(x + side * size * 0.2, y - size * 0.4);
      ctx.lineTo(x + side * size * 0.5, y - size * 1.0);
      ctx.lineTo(x + side * size * 0.05, y - size * 0.5);
      ctx.closePath(); ctx.fill();
    }
    // Eyes
    ctx.fillStyle = '#ff5555';
    ctx.beginPath(); ctx.arc(x - size * 0.2, y - size * 0.1, 1.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.2, y - size * 0.1, 1.2, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'skeleton') {
    // ── SKELETON: angular bone shape with rattling animation ──
    const rattle = Math.sin(time * 15) * 0.8;
    // Skull
    ctx.fillStyle = '#ddcc99';
    ctx.beginPath(); ctx.arc(x + rattle * 0.3, y - size * 0.35, size * 0.55, 0, Math.PI * 2); ctx.fill();
    // Jaw (rattling)
    ctx.fillStyle = '#ccbb88';
    const jawDrop = Math.abs(Math.sin(time * 6)) * size * 0.12;
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3 + rattle * 0.3, y - size * 0.05 + jawDrop);
    ctx.lineTo(x + size * 0.3 + rattle * 0.3, y - size * 0.05 + jawDrop);
    ctx.lineTo(x + size * 0.2 + rattle * 0.3, y + size * 0.15 + jawDrop);
    ctx.lineTo(x - size * 0.2 + rattle * 0.3, y + size * 0.15 + jawDrop);
    ctx.closePath(); ctx.fill();
    // Ribcage body
    ctx.strokeStyle = '#ccbb88'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const ribY = y + size * 0.15 + i * size * 0.2;
      const ribW = size * (0.5 - i * 0.08);
      ctx.beginPath();
      ctx.ellipse(x + rattle * (0.2 - i * 0.05), ribY, ribW, size * 0.08, 0, 0, Math.PI);
      ctx.stroke();
    }
    // Eye sockets
    ctx.fillStyle = '#332211';
    ctx.beginPath(); ctx.arc(x - size * 0.18 + rattle * 0.3, y - size * 0.4, size * 0.12, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.18 + rattle * 0.3, y - size * 0.4, size * 0.12, 0, Math.PI * 2); ctx.fill();
    // Eye glow
    ctx.fillStyle = 'rgba(255,80,30,0.8)';
    ctx.beginPath(); ctx.arc(x - size * 0.18 + rattle * 0.3, y - size * 0.4, size * 0.06, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.18 + rattle * 0.3, y - size * 0.4, size * 0.06, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'wraith') {
    // ── WRAITH: semi-transparent with wavy edges and trailing wisps ──
    ctx.globalAlpha = 0.55 + Math.sin(time * 3) * 0.15;
    // Wavy body (sin distortion on outline)
    ctx.fillStyle = color;
    ctx.beginPath();
    const wPts = 20;
    for (let i = 0; i <= wPts; i++) {
      const a = (i / wPts) * Math.PI * 2;
      const distort = Math.sin(time * 4 + a * 3) * size * 0.18;
      const bottomStretch = a > Math.PI * 0.6 && a < Math.PI * 1.4 ? size * 0.3 : 0;
      const r = size + distort + bottomStretch;
      i === 0 ? ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    // Trailing wisps behind
    for (let i = 0; i < 3; i++) {
      const wispA = Math.PI + (i - 1) * 0.4 + Math.sin(time * 2 + i) * 0.3;
      const wispLen = size * (1.5 + Math.sin(time * 3 + i * 2) * 0.5);
      ctx.strokeStyle = `rgba(136,85,204,${0.2 - i * 0.05})`;
      ctx.lineWidth = 2 - i * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(wispA) * size * 0.5, y + Math.sin(wispA) * size * 0.5);
      ctx.quadraticCurveTo(
        x + Math.cos(wispA) * wispLen * 0.6 + Math.sin(time * 5 + i) * 5,
        y + Math.sin(wispA) * wispLen * 0.6,
        x + Math.cos(wispA) * wispLen,
        y + Math.sin(wispA) * wispLen + Math.sin(time * 4 + i) * 4
      );
      ctx.stroke();
    }
    // Eyes
    ctx.fillStyle = 'rgba(200,120,255,0.9)';
    ctx.beginPath(); ctx.arc(x - size * 0.2, y - size * 0.15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.2, y - size * 0.15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

  } else if (eType === 'golem') {
    // ── GOLEM (boss): chunky rock segments with glowing cracks ──
    // Main body (chunky, angular)
    const rockG = ctx.createRadialGradient(x - size * 0.2, y - size * 0.2, size * 0.2, x, y, size);
    rockG.addColorStop(0, '#aa8866');
    rockG.addColorStop(0.5, '#886644');
    rockG.addColorStop(1, '#664422');
    ctx.fillStyle = rockG;
    // Chunky angular shape
    ctx.beginPath();
    const segments = 8;
    for (let i = 0; i < segments; i++) {
      const a = (i / segments) * Math.PI * 2;
      const r = size * (0.85 + hash(i * 7) * 0.3);
      i === 0 ? ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#553311'; ctx.lineWidth = 2; ctx.stroke();

    // Glowing cracks between segments
    ctx.strokeStyle = `rgba(255,${140 + Math.floor(Math.sin(time * 2) * 40)},50,${0.5 + Math.sin(time * 3) * 0.2})`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) {
      const crackA = (i / 4) * Math.PI * 2 + 0.3;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(crackA) * size * 0.2, y + Math.sin(crackA) * size * 0.2);
      ctx.lineTo(x + Math.cos(crackA + 0.1) * size * 0.6, y + Math.sin(crackA + 0.1) * size * 0.6);
      ctx.lineTo(x + Math.cos(crackA - 0.15) * size * 0.85, y + Math.sin(crackA - 0.15) * size * 0.85);
      ctx.stroke();
    }

    // Ground dust particles
    for (let i = 0; i < 4; i++) {
      const dustPhase = (time * 1.5 + i * 0.7) % 2;
      if (dustPhase < 1) {
        const dustX = x + (hash(i * 13 + 5) - 0.5) * size * 2;
        const dustY = y + size * 0.8 + dustPhase * 3;
        ctx.fillStyle = `rgba(150,120,80,${0.3 - dustPhase * 0.25})`;
        ctx.beginPath(); ctx.arc(dustX, dustY, 2 - dustPhase, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Eyes
    ctx.fillStyle = `rgba(255,${160 + Math.floor(Math.sin(time * 4) * 40)},50,0.9)`;
    ctx.beginPath(); ctx.arc(x - size * 0.25, y - size * 0.2, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.25, y - size * 0.2, 3, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'demon') {
    // ── DEMON (boss): horns, wings, fire eyes, menacing aura ──
    // Menacing aura
    const auraG = ctx.createRadialGradient(x, y, size * 0.5, x, y, size * 2.2);
    auraG.addColorStop(0, 'rgba(200,30,30,0.08)');
    auraG.addColorStop(0.5, 'rgba(150,0,0,0.04)');
    auraG.addColorStop(1, 'transparent');
    ctx.fillStyle = auraG;
    ctx.beginPath(); ctx.arc(x, y, size * 2.2, 0, Math.PI * 2); ctx.fill();

    // Wings (dark, spread)
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(80,10,10,0.5)';
      ctx.beginPath();
      ctx.moveTo(x + side * size * 0.3, y - size * 0.2);
      ctx.quadraticCurveTo(x + side * size * 2.0, y - size * 0.8, x + side * size * 1.8, y + size * 0.3);
      ctx.quadraticCurveTo(x + side * size * 1.0, y + size * 0.1, x + side * size * 0.3, y + size * 0.2);
      ctx.closePath(); ctx.fill();
    }

    // Body
    const demonG = ctx.createRadialGradient(x, y, size * 0.2, x, y, size);
    demonG.addColorStop(0, '#ee4444');
    demonG.addColorStop(0.6, '#cc3333');
    demonG.addColorStop(1, '#881111');
    ctx.fillStyle = demonG;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();

    // Horns
    ctx.fillStyle = '#441111';
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x + side * size * 0.4, y - size * 0.7);
      ctx.quadraticCurveTo(x + side * size * 0.8, y - size * 1.5, x + side * size * 0.6, y - size * 1.8);
      ctx.quadraticCurveTo(x + side * size * 0.5, y - size * 1.3, x + side * size * 0.25, y - size * 0.7);
      ctx.closePath(); ctx.fill();
    }

    // Fire eyes
    for (const side of [-1, 1]) {
      const eyeX = x + side * size * 0.3;
      const eyeY = y - size * 0.15;
      // Flame from eye
      const fh = size * 0.4 + Math.sin(time * 10 + side) * size * 0.1;
      const fG = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY - fh * 0.5, size * 0.3);
      fG.addColorStop(0, '#ffff88');
      fG.addColorStop(0.4, '#ff6622');
      fG.addColorStop(1, 'transparent');
      ctx.fillStyle = fG;
      ctx.beginPath();
      ctx.moveTo(eyeX - size * 0.15, eyeY);
      ctx.quadraticCurveTo(eyeX, eyeY - fh, eyeX + size * 0.15, eyeY);
      ctx.fill();
      ctx.fillStyle = '#ffdd44';
      ctx.beginPath(); ctx.arc(eyeX, eyeY, 2.5, 0, Math.PI * 2); ctx.fill();
    }

  } else if (eType === 'spider' || eType === 'spiderling') {
    // ── SPIDER: round body with 8 animated legs ──
    const isSmall = eType === 'spiderling';
    const legLen = isSmall ? size * 1.5 : size * 2.0;

    // 8 legs
    ctx.strokeStyle = color; ctx.lineWidth = isSmall ? 0.8 : 1.2;
    for (let i = 0; i < 8; i++) {
      const baseA = (i / 8) * Math.PI * 2;
      const legPhase = Math.sin(time * 10 + i * 1.5) * 0.15;
      const kneeR = legLen * 0.5;
      const kneeA = baseA + 0.15;
      const footR = legLen;
      const footA = baseA + legPhase;
      const kx = x + Math.cos(kneeA) * kneeR;
      const ky = y + Math.sin(kneeA) * kneeR - size * 0.2;
      const fx = x + Math.cos(footA) * footR;
      const fy = y + Math.sin(footA) * footR + size * 0.1;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(baseA) * size * 0.5, y + Math.sin(baseA) * size * 0.5);
      ctx.lineTo(kx, ky);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }

    // Body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, size * 0.65, 0, Math.PI * 2); ctx.fill();
    // Abdomen (behind)
    ctx.fillStyle = isSmall ? '#998877' : '#554433';
    ctx.beginPath(); ctx.arc(x - size * 0.15, y + size * 0.1, size * 0.5, 0, Math.PI * 2); ctx.fill();
    // Pattern on abdomen
    if (!isSmall) {
      ctx.fillStyle = '#776655';
      ctx.beginPath(); ctx.arc(x - size * 0.15, y + size * 0.05, size * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - size * 0.25, y + size * 0.2, size * 0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x - size * 0.05, y + size * 0.2, size * 0.1, 0, Math.PI * 2); ctx.fill();
    }
    // Eyes (multiple)
    ctx.fillStyle = 'rgba(255,50,30,0.8)';
    for (let i = 0; i < 4; i++) {
      const ea = eyeAngle + (i - 1.5) * 0.25;
      const ed2 = size * 0.35;
      ctx.beginPath(); ctx.arc(x + Math.cos(ea) * ed2, y + Math.sin(ea) * ed2 - size * 0.1, isSmall ? 0.8 : 1.2, 0, Math.PI * 2); ctx.fill();
    }

  } else if (eType === 'necro') {
    // ── NECRO: hooded figure with staff and dark aura + floating bob ──
    const floatY = Math.sin(time * 2) * 3; // gentle float
    const fy = y + floatY;

    // Dark aura (pulsing)
    const auraPulse = 1 + Math.sin(time * 1.5) * 0.1;
    const nAura = ctx.createRadialGradient(x, fy, size * 0.3, x, fy, size * 1.6 * auraPulse);
    nAura.addColorStop(0, 'rgba(50,100,70,0.12)');
    nAura.addColorStop(1, 'transparent');
    ctx.fillStyle = nAura;
    ctx.beginPath(); ctx.arc(x, fy, size * 1.6 * auraPulse, 0, Math.PI * 2); ctx.fill();

    // Hood
    ctx.fillStyle = '#3d7755';
    ctx.beginPath();
    ctx.moveTo(x, fy - size * 1.1);
    ctx.lineTo(x + size * 0.7, fy + size * 0.3);
    ctx.lineTo(x - size * 0.7, fy + size * 0.3);
    ctx.closePath(); ctx.fill();
    // Face shadow
    ctx.fillStyle = '#2a5540';
    ctx.beginPath(); ctx.arc(x, fy - size * 0.1, size * 0.35, 0, Math.PI * 2); ctx.fill();
    // Robe bottom
    ctx.fillStyle = '#3d7755';
    ctx.fillRect(x - size * 0.5, fy + size * 0.1, size, size * 0.7);

    // Staff
    ctx.strokeStyle = '#664422'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + size * 0.8, fy - size * 0.8);
    ctx.lineTo(x + size * 0.6, fy + size * 0.8);
    ctx.stroke();
    // Staff orb (pulsing glow)
    const orbGlow = 3 + Math.sin(time * 4) * 1.5;
    ctx.fillStyle = '#77cc99';
    ctx.beginPath(); ctx.arc(x + size * 0.8, fy - size * 0.8, orbGlow, 0, Math.PI * 2); ctx.fill();
    // Orb glow halo
    ctx.fillStyle = `rgba(119,204,153,${0.2 + Math.sin(time * 4) * 0.1})`;
    ctx.beginPath(); ctx.arc(x + size * 0.8, fy - size * 0.8, orbGlow + 3, 0, Math.PI * 2); ctx.fill();

    // Eyes
    ctx.fillStyle = '#77cc99';
    ctx.beginPath(); ctx.arc(x - size * 0.12, fy - size * 0.2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.12, fy - size * 0.2, 1.5, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'shieldbearer') {
    // ── SHIELD BEARER: armored look with visible shield + breathing ──
    const breathe = 1 + Math.sin(time * 3) * 0.03; // subtle size pulse
    const bSize = size * breathe;

    // Body (armored)
    const armorG = ctx.createRadialGradient(x, y, bSize * 0.2, x, y, bSize);
    armorG.addColorStop(0, '#99aacc');
    armorG.addColorStop(0.5, '#7788aa');
    armorG.addColorStop(1, '#556677');
    ctx.fillStyle = armorG;
    ctx.beginPath(); ctx.arc(x, y, bSize, 0, Math.PI * 2); ctx.fill();

    // Armor plates (lines across body)
    ctx.strokeStyle = 'rgba(180,200,220,0.4)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x - bSize * 0.6, y - bSize * 0.2); ctx.lineTo(x + bSize * 0.6, y - bSize * 0.2);
    ctx.moveTo(x - bSize * 0.5, y + bSize * 0.2); ctx.lineTo(x + bSize * 0.5, y + bSize * 0.2);
    ctx.stroke();

    // Shield in front (facing target) with shimmer
    const shieldDist = bSize * 0.8;
    const shieldX = x + Math.cos(eyeAngle) * shieldDist;
    const shieldY = y + Math.sin(eyeAngle) * shieldDist;
    const shieldPerp = eyeAngle + Math.PI / 2;
    const shimmer = 0.5 + Math.sin(time * 5) * 0.15; // shield shimmer
    const shG = ctx.createLinearGradient(
      shieldX - Math.cos(shieldPerp) * bSize * 0.5,
      shieldY - Math.sin(shieldPerp) * bSize * 0.5,
      shieldX + Math.cos(shieldPerp) * bSize * 0.5,
      shieldY + Math.sin(shieldPerp) * bSize * 0.5
    );
    shG.addColorStop(0, '#8899bb');
    shG.addColorStop(shimmer, '#ccddff');
    shG.addColorStop(1, '#8899bb');
    ctx.fillStyle = shG;
    ctx.beginPath();
    ctx.moveTo(shieldX - Math.cos(shieldPerp) * bSize * 0.6, shieldY - Math.sin(shieldPerp) * bSize * 0.6);
    ctx.lineTo(shieldX + Math.cos(eyeAngle) * bSize * 0.3, shieldY + Math.sin(eyeAngle) * bSize * 0.3);
    ctx.lineTo(shieldX + Math.cos(shieldPerp) * bSize * 0.6, shieldY + Math.sin(shieldPerp) * bSize * 0.6);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#99aacc'; ctx.lineWidth = 1; ctx.stroke();

    // Eyes
    const ed3 = bSize * 0.3;
    ctx.fillStyle = 'rgba(200,220,255,0.8)';
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.3) * ed3, y + Math.sin(eyeAngle - 0.3) * ed3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.3) * ed3, y + Math.sin(eyeAngle + 0.3) * ed3, 1.5, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'assassin') {
    // ── ASSASSIN: shimmer/stealth effect, dagger glint ──
    // Shimmer body (mostly invisible)
    const shimmerAlpha = 0.15 + Math.sin(time * 8) * 0.1 + Math.sin(time * 13) * 0.05;
    ctx.globalAlpha = shimmerAlpha;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Shimmer distortion lines
    ctx.strokeStyle = `rgba(50,70,90,${0.1 + Math.sin(time * 6) * 0.05})`;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const ly = y - size + (i / 2) * size * 2;
      ctx.beginPath();
      ctx.moveTo(x - size, ly + Math.sin(time * 10 + i * 3) * 2);
      ctx.lineTo(x + size, ly + Math.sin(time * 10 + i * 3 + 1) * 2);
      ctx.stroke();
    }

    // Dagger glint
    const glintPhase = (time * 3) % 2;
    if (glintPhase < 0.3) {
      const daggerX = x + Math.cos(eyeAngle) * size * 0.8;
      const daggerY = y + Math.sin(eyeAngle) * size * 0.8;
      ctx.fillStyle = `rgba(255,255,255,${0.8 - glintPhase * 2})`;
      ctx.beginPath(); ctx.arc(daggerX, daggerY, 2, 0, Math.PI * 2); ctx.fill();
      // Glint rays
      ctx.strokeStyle = `rgba(255,255,255,${0.5 - glintPhase * 1.5})`;
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 4; i++) {
        const ra = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(daggerX + Math.cos(ra) * 1, daggerY + Math.sin(ra) * 1);
        ctx.lineTo(daggerX + Math.cos(ra) * 4, daggerY + Math.sin(ra) * 4);
        ctx.stroke();
      }
    }

    // Eyes (only visible feature)
    ctx.fillStyle = 'rgba(255,80,60,0.7)';
    const ed4 = size * 0.25;
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.3) * ed4, y + Math.sin(eyeAngle - 0.3) * ed4, 1, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.3) * ed4, y + Math.sin(eyeAngle + 0.3) * ed4, 1, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'bomber') {
    // ── BOMBER: pulsing body with fuse spark ──
    const pulse = 1 + Math.sin(time * 8) * 0.1;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size * pulse, 0, Math.PI * 2);
    ctx.fill();
    // Warning glow
    const glow = ctx.createRadialGradient(x, y, size * 0.3, x, y, size * 1.5);
    glow.addColorStop(0, 'rgba(255,120,0,0.3)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Fuse spark on top
    const sparkY = y - size - 3 + Math.sin(time * 12) * 2;
    ctx.fillStyle = '#ffdd44';
    ctx.beginPath();
    ctx.arc(x, sparkY, 2, 0, Math.PI * 2);
    ctx.fill();
    // Eyes
    const bomberEd = size * 0.3;
    ctx.fillStyle = '#ffcc00';
    ctx.beginPath();
    ctx.arc(x - bomberEd, y - bomberEd * 0.3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + bomberEd, y - bomberEd * 0.3, 2, 0, Math.PI * 2);
    ctx.fill();

  } else if (eType === 'teleporter') {
    // ── TELEPORTER: flickering ghostly body ──
    const flicker = 0.6 + Math.sin(time * 15) * 0.2;
    ctx.globalAlpha = flicker;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    // Inner glow
    const tpGlow = ctx.createRadialGradient(x, y, 0, x, y, size);
    tpGlow.addColorStop(0, 'rgba(170,51,204,0.5)');
    tpGlow.addColorStop(1, 'transparent');
    ctx.fillStyle = tpGlow;
    ctx.beginPath();
    ctx.arc(x, y, size * 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    // Eyes
    const tpEd = size * 0.3;
    ctx.fillStyle = '#dd88ff';
    ctx.beginPath();
    ctx.arc(x + Math.cos(eyeAngle - 0.4) * tpEd, y + Math.sin(eyeAngle - 0.4) * tpEd, 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + Math.cos(eyeAngle + 0.4) * tpEd, y + Math.sin(eyeAngle + 0.4) * tpEd, 1.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (eType === 'splitter') {
    // ── SPLITTER: two-toned blob with pulsing split line + wobble ──
    const splitPulse = 0.5 + Math.sin(time * 4) * 0.5;
    const wobbleX = Math.sin(time * 3) * 1.5; // subtle wobble
    const wobbleScale = 1 + Math.sin(time * 2.5) * 0.04;
    const wSize = size * wobbleScale;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wobbleX, y, wSize, 0, Math.PI * 2);
    ctx.fill();
    // Two-tone halves
    ctx.fillStyle = 'rgba(80,140,80,0.15)';
    ctx.beginPath();
    ctx.arc(x + wobbleX, y, wSize, -Math.PI / 2, Math.PI / 2);
    ctx.fill();

    // Split line down the middle (pulsing)
    ctx.strokeStyle = `rgba(102,170,102,${0.4 + splitPulse * 0.6})`;
    ctx.lineWidth = 1 + splitPulse * 1.5;
    ctx.beginPath();
    ctx.moveTo(x + wobbleX, y - wSize);
    ctx.lineTo(x + wobbleX, y + wSize);
    ctx.stroke();
    // Split line glow
    ctx.strokeStyle = `rgba(102,170,102,${splitPulse * 0.2})`;
    ctx.lineWidth = 4 + splitPulse * 2;
    ctx.beginPath();
    ctx.moveTo(x + wobbleX, y - wSize);
    ctx.lineTo(x + wobbleX, y + wSize);
    ctx.stroke();

    // Two pairs of eyes
    const spEd = wSize * 0.35;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + wobbleX - spEd, y - spEd * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + wobbleX + spEd, y - spEd * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#224422';
    ctx.beginPath();
    ctx.arc(x + wobbleX - spEd, y - spEd * 0.5, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + wobbleX + spEd, y - spEd * 0.5, 1, 0, Math.PI * 2);
    ctx.fill();

  } else if (eType === 'splitling') {
    // ── SPLITLING: tiny bouncing blob ──
    const bounce = Math.abs(Math.sin(time * 10)) * 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y - bounce, size, 0, Math.PI * 2);
    ctx.fill();
    // Single eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(x + Math.cos(eyeAngle) * size * 0.2, y - bounce + Math.sin(eyeAngle) * size * 0.2, 1.5, 0, Math.PI * 2);
    ctx.fill();

  } else if (eType === 'berserker') {
    // ── BERSERKER: angular body that grows redder as HP drops ──
    const hpRatio = (e.hp !== undefined && e.maxHp !== undefined) ? e.hp / e.maxHp : 1;
    const rage = 1 - hpRatio;
    const rageSize = size * (1 + rage * 0.3);
    // Angular body (diamond-ish)
    const r = rageSize;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r * 0.8, y);
    ctx.lineTo(x, y + r * 0.7);
    ctx.lineTo(x - r * 0.8, y);
    ctx.closePath();
    ctx.fill();
    // Rage aura
    if (rage > 0.3) {
      const rageGlow = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 2);
      rageGlow.addColorStop(0, `rgba(255,0,0,${rage * 0.3})`);
      rageGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = rageGlow;
      ctx.beginPath();
      ctx.arc(x, y, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    // Angry eyes
    const bEd = r * 0.25;
    ctx.fillStyle = `rgb(255,${Math.floor(200 * hpRatio)},0)`;
    ctx.beginPath();
    ctx.arc(x - bEd, y - bEd * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + bEd, y - bEd * 0.5, 2, 0, Math.PI * 2);
    ctx.fill();

  } else if (eType === 'swarm_bat') {
    // ── SWARM BAT: small bat using same wing structure as bat ──
    const flap = Math.sin(time * 20) * 0.7; // faster flap for swarm bats
    // Wings
    for (const side of [-1, 1]) {
      ctx.fillStyle = 'rgba(100,70,140,0.5)';
      ctx.beginPath();
      const wingTip1X = x + side * size * 2.2;
      const wingTip1Y = y - size * 0.4 + flap * size * side * 0.3;
      const wingTip2X = x + side * size * 1.5;
      const wingTip2Y = y + size * 0.4 - flap * size * side * 0.2;
      ctx.moveTo(x + side * size * 0.3, y - size * 0.3);
      ctx.quadraticCurveTo(x + side * size * 1.2, y - size * 0.8 + flap * size, wingTip1X, wingTip1Y);
      ctx.lineTo(wingTip2X, wingTip2Y);
      ctx.quadraticCurveTo(x + side * size * 0.6, y + size * 0.2, x + side * size * 0.3, y + size * 0.2);
      ctx.closePath(); ctx.fill();
    }
    // Small body
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, size * 0.65, 0, Math.PI * 2); ctx.fill();
    // Eyes
    ctx.fillStyle = '#ff5555';
    ctx.beginPath(); ctx.arc(x - size * 0.15, y - size * 0.1, 0.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.15, y - size * 0.1, 0.8, 0, Math.PI * 2); ctx.fill();

  } else if (eType === 'archlord') {
    // ── ARCHLORD: imposing dark lord with crown and swirling aura ──
    // Outer dark aura (swirling)
    const swirl = time * 1.5;
    for (let i = 0; i < 6; i++) {
      const sa = swirl + (i / 6) * Math.PI * 2;
      const sd = size * 1.8 + Math.sin(time * 2 + i) * 4;
      const sx = x + Math.cos(sa) * sd;
      const sy = y + Math.sin(sa) * sd;
      const orbR = 3 + Math.sin(time * 3 + i * 2) * 1;
      ctx.fillStyle = `rgba(255,170,0,${0.15 + Math.sin(time * 2 + i) * 0.08})`;
      ctx.beginPath(); ctx.arc(sx, sy, orbR, 0, Math.PI * 2); ctx.fill();
    }

    // Dark aura gradient
    const lordAura = ctx.createRadialGradient(x, y, size * 0.4, x, y, size * 2.2);
    lordAura.addColorStop(0, 'rgba(80,30,10,0.15)');
    lordAura.addColorStop(0.5, 'rgba(200,100,20,0.06)');
    lordAura.addColorStop(1, 'transparent');
    ctx.fillStyle = lordAura;
    ctx.beginPath(); ctx.arc(x, y, size * 2.2, 0, Math.PI * 2); ctx.fill();

    // Body (dark imposing form)
    const lordG = ctx.createRadialGradient(x, y - size * 0.2, size * 0.2, x, y, size);
    lordG.addColorStop(0, '#553300');
    lordG.addColorStop(0.4, '#331100');
    lordG.addColorStop(1, '#110000');
    ctx.fillStyle = lordG;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    // Rim lighting
    ctx.strokeStyle = `rgba(255,170,0,${0.3 + Math.sin(time * 2) * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.stroke();

    // Crown (3 points above the body)
    const crownY = y - size * 0.7;
    ctx.fillStyle = '#ffcc22';
    ctx.beginPath();
    ctx.moveTo(x - size * 0.5, crownY + 3);
    ctx.lineTo(x - size * 0.35, crownY - size * 0.5);
    ctx.lineTo(x - size * 0.15, crownY + 1);
    ctx.lineTo(x, crownY - size * 0.65);
    ctx.lineTo(x + size * 0.15, crownY + 1);
    ctx.lineTo(x + size * 0.35, crownY - size * 0.5);
    ctx.lineTo(x + size * 0.5, crownY + 3);
    ctx.closePath(); ctx.fill();
    // Crown gems
    ctx.fillStyle = '#ff3322';
    ctx.beginPath(); ctx.arc(x, crownY - size * 0.4, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff6622';
    ctx.beginPath(); ctx.arc(x - size * 0.35, crownY - size * 0.25, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + size * 0.35, crownY - size * 0.25, 1.5, 0, Math.PI * 2); ctx.fill();

    // Eyes (menacing, glowing)
    const lordEd = size * 0.25;
    const eyeGlow = 0.7 + Math.sin(time * 3) * 0.3;
    ctx.fillStyle = `rgba(255,${Math.floor(120 + eyeGlow * 80)},0,${eyeGlow})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.3) * lordEd, y + Math.sin(eyeAngle - 0.3) * lordEd, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.3) * lordEd, y + Math.sin(eyeAngle + 0.3) * lordEd, 2.5, 0, Math.PI * 2); ctx.fill();
    // Eye glow halos
    ctx.fillStyle = `rgba(255,170,0,${eyeGlow * 0.2})`;
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.3) * lordEd, y + Math.sin(eyeAngle - 0.3) * lordEd, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.3) * lordEd, y + Math.sin(eyeAngle + 0.3) * lordEd, 5, 0, Math.PI * 2); ctx.fill();

  } else {
    // ── DEFAULT ENEMY: gradient circle with eyes ──
    const defG = ctx.createRadialGradient(x - size * 0.2, y - size * 0.2, size * 0.1, x, y, size);
    defG.addColorStop(0, '#ffffff22');
    defG.addColorStop(0.2, color);
    defG.addColorStop(1, 'rgba(0,0,0,0.3)');
    ctx.fillStyle = defG;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.3)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.stroke();
    // Eyes
    const eyeD = size * 0.3;
    ctx.fillStyle = 'rgba(255,50,30,.8)';
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle - 0.3) * eyeD, y + Math.sin(eyeAngle - 0.3) * eyeD, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.cos(eyeAngle + 0.3) * eyeD, y + Math.sin(eyeAngle + 0.3) * eyeD, 1.5, 0, Math.PI * 2); ctx.fill();
  }
}

export function drawEnemies(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const e of state.enemies) {
    if (!e.alive) continue;
    const et = ENEMIES[e.type];
    // Skip iframe flicker for dying enemies (they should stay visible during death anim)
    if (e._deathTimer < 0 && e.iframes > 0 && Math.sin(state.time * 30) > 0) continue;

    // ── Friendly summons: custom rendering ──
    if (e._friendly) {
      const isMegaTurret = e.hp >= 20;
      const isWolf = e.type === '_wolf';
      const isImp = e.type === '_imp';

      if (isWolf) {
        let nearest = null;
        let nd = Infinity;
        for (const e2 of state.enemies) {
          if (!e2.alive || e2._friendly) continue;
          const d = Math.sqrt((e2.x - e.x) ** 2 + (e2.y - e.y) ** 2);
          if (d < nd) { nd = d; nearest = e2; }
        }
        drawWolf(ctx, e.x, e.y, et.size, nearest, state.time);
      } else if (isImp) {
        drawImp(ctx, e.x, e.y, et.size, state.time);
      } else {
        // Check if any zone overlaps with turret (for muzzle flash)
        let zoneActive = false;
        for (const z of state.zones) {
          const dist = Math.sqrt((z.x - e.x) ** 2 + (z.y - e.y) ** 2);
          if (dist < z.radius && z.age > 0) { zoneActive = true; break; }
        }
        drawTurret(ctx, e.x, e.y, et.size, state.time, isMegaTurret, zoneActive);
      }

      // Lifespan bar
      if (e._lifespan > 0) {
        const bw = et.size * 2;
        const by2 = e.y + et.size + 4;
        ctx.fillStyle = 'rgba(0,0,0,.4)';
        ctx.fillRect(e.x - bw / 2 - 1, by2 - 1, bw + 2, 3);
        ctx.fillStyle = 'rgba(80,200,100,.5)';
        ctx.fillRect(e.x - bw / 2, by2, bw * Math.min(1, e._lifespan / 15), 2);
      }

      // HP bar for summons
      if (e.hp < e.maxHp) {
        const bw = et.size * 2;
        const by2 = e.y - et.size - 6;
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.fillRect(e.x - bw / 2 - 1, by2 - 1, bw + 2, 3);
        ctx.fillStyle = '#44cc66';
        ctx.fillRect(e.x - bw / 2, by2, bw * (e.hp / e.maxHp), 2);
      }
      continue;
    }

    // ── Regular enemies ──

    // Death animation: shrink + fade + spin
    if (e._deathTimer >= 0) {
      const deathProgress = 1 - (e._deathTimer / 0.4); // 0 -> 1
      const deathScale = 1 - deathProgress * 0.8; // shrink to 20% size
      const deathAlpha = 1 - deathProgress; // fade out
      ctx.save();
      ctx.globalAlpha *= deathAlpha;
      ctx.translate(e.x, e.y);
      ctx.rotate(deathProgress * Math.PI * 0.5); // quarter spin
      ctx.scale(deathScale, deathScale);
      ctx.translate(-e.x, -e.y);

      // Eye direction
      const target = state.players[e.target];
      const ea = target ? Math.atan2(target.y - e.y, target.x - e.x) : 0;
      drawEnemyBody(ctx, { x: e.x, y: e.y, type: e.type, hp: e.hp, maxHp: e.maxHp }, et, ea, state.time);

      ctx.restore();
      continue; // skip health bar etc for dying enemies
    }

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

    // Eye direction
    const target = state.players[e.target];
    const ea = target ? Math.atan2(target.y - e.y, target.x - e.x) : 0;

    // Attack wind-up: brief lunge/pulse toward target
    let atkTransformApplied = false;
    if (e._atkAnim > 0 && e._deathTimer < 0) {
      const atkProgress = e._atkAnim / 0.2; // 1 -> 0
      const atkScale = 1 + Math.sin(atkProgress * Math.PI) * 0.15; // pulse up then back
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(atkScale, atkScale);
      ctx.translate(-e.x, -e.y);
      atkTransformApplied = true;
    }

    // Type-specific body rendering
    drawEnemyBody(ctx, { x: e.x, y: e.y, type: e.type, hp: e.hp, maxHp: e.maxHp }, et, ea, state.time);

    // Hit flash: white overlay
    if (e._hitFlash > 0) {
      const flashAlpha = e._hitFlash / 0.12; // 1 -> 0
      ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.6})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, et.size * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    if (atkTransformApplied) ctx.restore();

    // Health bar (only when damaged)
    if (e.hp < e.maxHp) {
      const bw = et.size * 2;
      const bh = 2;
      const bx = e.x - bw / 2;
      const by2 = e.y - et.size - 4;
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(bx - 1, by2 - 1, bw + 2, bh + 2);
      ctx.fillStyle = '#cc3333';
      ctx.fillRect(bx, by2, bw * (e.hp / e.maxHp), bh);
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
    const r = s.radius;
    const a = Math.atan2(s.vy, s.vx);
    const t = state.time;

    if (s.clsKey === 'knight') {
      // ── SHIELD DISC: spinning metallic disc with light trail ──
      const spinRate = t * 14;
      // Light streak trail behind
      const speed2 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const dt2 = speed2 > 0 ? 1 / 60 : 0;
      for (let i = 1; i <= 5; i++) {
        const trailX = s.x - s.vx * dt2 * i * 2;
        const trailY = s.y - s.vy * dt2 * i * 2;
        const trailAlpha = 0.3 - i * 0.05;
        ctx.fillStyle = `rgba(200,220,240,${trailAlpha})`;
        ctx.beginPath(); ctx.arc(trailX, trailY, r * (1.0 - i * 0.12), 0, Math.PI * 2); ctx.fill();
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(spinRate);
      // Outer rim - steel blue
      const shieldGrad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 1.2);
      shieldGrad.addColorStop(0, '#ddeeff');
      shieldGrad.addColorStop(0.5, '#aabbcc');
      shieldGrad.addColorStop(0.8, '#8899aa');
      shieldGrad.addColorStop(1, '#667788');
      ctx.fillStyle = shieldGrad;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.2, 0, Math.PI * 2); ctx.fill();
      // Inner shield emblem - cross pattern
      ctx.strokeStyle = '#ccddee';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-r * 0.5, 0); ctx.lineTo(r * 0.5, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -r * 0.5); ctx.lineTo(0, r * 0.5); ctx.stroke();
      // Metallic glint that rotates
      const glintAngle = spinRate * 0.3;
      ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.3 * Math.sin(glintAngle)})`;
      ctx.beginPath();
      ctx.arc(Math.cos(glintAngle) * r * 0.5, Math.sin(glintAngle) * r * 0.5, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Bright center rivet
      ctx.fillStyle = '#eef4ff';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (s.clsKey === 'paladin') {
      // ── HOLY SMITE: golden bolt with divine radiance ──
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      // Radiating light rays
      const rayCount = 6;
      for (let i = 0; i < rayCount; i++) {
        const rayA = (i / rayCount) * Math.PI * 2 + t * 3;
        const rayLen = r * (1.8 + 0.4 * Math.sin(t * 8 + i * 2));
        ctx.strokeStyle = `rgba(255,238,170,${0.3 + 0.15 * Math.sin(t * 6 + i)})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(rayA) * r * 0.4, Math.sin(rayA) * r * 0.4);
        ctx.lineTo(Math.cos(rayA) * rayLen, Math.sin(rayA) * rayLen);
        ctx.stroke();
      }
      // Warm golden glow halo
      const holyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.0);
      holyGrad.addColorStop(0, 'rgba(255,240,200,0.5)');
      holyGrad.addColorStop(0.5, 'rgba(255,220,150,0.2)');
      holyGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = holyGrad;
      ctx.beginPath(); ctx.arc(0, 0, r * 2.0, 0, Math.PI * 2); ctx.fill();
      // Teardrop body - bright golden/white
      const bodyGrad = ctx.createRadialGradient(r * 0.2, 0, r * 0.1, 0, 0, r * 1.0);
      bodyGrad.addColorStop(0, '#ffffee');
      bodyGrad.addColorStop(0.4, '#ffddaa');
      bodyGrad.addColorStop(1, '#ccaa66');
      ctx.fillStyle = bodyGrad;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.8, -r * 1.0, 0);
      ctx.quadraticCurveTo(r * 0.2, r * 0.8, r * 1.3, 0);
      ctx.fill();
      // Star pattern in center
      ctx.fillStyle = '#ffffdd';
      const starR = r * 0.35;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const sa2 = (i / 8) * Math.PI * 2 + t * 5;
        const sr = i % 2 === 0 ? starR : starR * 0.4;
        i === 0 ? ctx.moveTo(Math.cos(sa2) * sr, Math.sin(sa2) * sr)
                : ctx.lineTo(Math.cos(sa2) * sr, Math.sin(sa2) * sr);
      }
      ctx.closePath(); ctx.fill();
      ctx.restore();

    } else if (s.clsKey === 'ranger') {
      // ── PIERCING ARROW: sleek arrow with green glow trail ──
      ctx.save();
      ctx.translate(s.x, s.y);
      const wobble = Math.sin(t * 25) * 0.02;
      ctx.rotate(a + wobble);
      // Green glow trail
      for (let i = 1; i <= 4; i++) {
        const gAlpha = 0.2 - i * 0.04;
        ctx.fillStyle = `rgba(120,200,60,${gAlpha})`;
        ctx.beginPath(); ctx.arc(-r * i * 0.8, 0, r * (0.6 - i * 0.08), 0, Math.PI * 2); ctx.fill();
      }
      // Speed lines
      ctx.strokeStyle = 'rgba(140,210,80,0.2)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        const lineY = (i - 1) * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(-r * 1.5 - i * 2, lineY);
        ctx.lineTo(-r * 2.5 - i * 3, lineY);
        ctx.stroke();
      }
      // Shaft
      ctx.fillStyle = '#88cc44';
      ctx.fillRect(-r * 1.2, -r * 0.25, r * 2.4, r * 0.5);
      // Arrowhead
      ctx.fillStyle = '#aaddaa';
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(r * 1.0, -r * 0.5);
      ctx.lineTo(r * 1.0, r * 0.5);
      ctx.closePath(); ctx.fill();
      // Metallic glint
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(r * 1.6, -r * 0.1);
      ctx.lineTo(r * 1.2, -r * 0.3);
      ctx.lineTo(r * 1.2, 0);
      ctx.closePath(); ctx.fill();
      // Fletching
      ctx.fillStyle = '#668833';
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.4); ctx.lineTo(-r * 1.5, -r * 0.6); ctx.lineTo(-r * 1.0, 0);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, r * 0.4); ctx.lineTo(-r * 1.5, r * 0.6); ctx.lineTo(-r * 1.0, 0);
      ctx.closePath(); ctx.fill();
      ctx.restore();

    } else if (s.clsKey === 'druid') {
      // ── THORN VINE: organic thorny projectile with poison trail ──
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      // Leaf particles trailing behind
      for (let i = 1; i <= 4; i++) {
        const leafAge = (t * 5 + i * 1.7) % 3;
        const leafX = -r * (1.0 + i * 0.7) + Math.sin(t * 4 + i * 3) * 2;
        const leafY = Math.cos(t * 3 + i * 2) * r * 0.4;
        const leafR2 = r * 0.25 + leafAge * r * 0.1;
        ctx.fillStyle = `rgba(80,170,50,${0.3 - i * 0.06})`;
        ctx.beginPath(); ctx.arc(leafX, leafY, leafR2, 0, Math.PI * 2); ctx.fill();
      }
      // Irregular organic body
      const pulseR = r * (1.0 + 0.1 * Math.sin(t * 10));
      const bodyGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, pulseR * 1.3);
      bodyGrad.addColorStop(0, '#66cc44');
      bodyGrad.addColorStop(0.5, '#44aa33');
      bodyGrad.addColorStop(1, '#337722');
      ctx.fillStyle = bodyGrad;
      // Draw irregular shape
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const sa2 = (i / 8) * Math.PI * 2;
        const irregR = pulseR * (0.8 + 0.3 * Math.sin(i * 2.5 + t * 3));
        i === 0 ? ctx.moveTo(Math.cos(sa2) * irregR, Math.sin(sa2) * irregR)
                : ctx.lineTo(Math.cos(sa2) * irregR, Math.sin(sa2) * irregR);
      }
      ctx.closePath(); ctx.fill();
      // Thorn spikes sticking out
      ctx.fillStyle = '#2a7718';
      for (let i = 0; i < 5; i++) {
        const thornA = (i / 5) * Math.PI * 2 + t * 2;
        const thornBase = pulseR * 0.8;
        const thornTip = pulseR * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.cos(thornA - 0.15) * thornBase, Math.sin(thornA - 0.15) * thornBase);
        ctx.lineTo(Math.cos(thornA) * thornTip, Math.sin(thornA) * thornTip);
        ctx.lineTo(Math.cos(thornA + 0.15) * thornBase, Math.sin(thornA + 0.15) * thornBase);
        ctx.closePath(); ctx.fill();
      }
      // Poison glow pulse
      const poisonAlpha = 0.15 + 0.1 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(100,255,60,${poisonAlpha})`;
      ctx.beginPath(); ctx.arc(0, 0, pulseR * 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (s.clsKey === 'engineer') {
      // ── SMART WRENCH: spinning gear/cog with sparks ──
      const gearSpin = t * 12;
      // Spark trail
      for (let i = 0; i < 3; i++) {
        const sparkAge = (t * 15 + i * 3.7) % 2;
        const sparkDx = -s.vx / 60 * (i + 1) * 2;
        const sparkDy = -s.vy / 60 * (i + 1) * 2;
        ctx.fillStyle = `rgba(255,${180 + Math.floor(sparkAge * 40)},50,${0.5 - i * 0.15})`;
        ctx.beginPath();
        ctx.arc(s.x + sparkDx + Math.sin(t * 20 + i * 5) * 3,
                s.y + sparkDy + Math.cos(t * 18 + i * 4) * 3,
                1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(gearSpin);
      // Gear body
      const teeth = 8;
      const innerR = r * 0.6;
      const outerR = r * 1.3;
      ctx.fillStyle = '#dd8833';
      ctx.beginPath();
      for (let i = 0; i < teeth * 2; i++) {
        const ga = (i / (teeth * 2)) * Math.PI * 2;
        const gr = i % 2 === 0 ? outerR : innerR;
        i === 0 ? ctx.moveTo(Math.cos(ga) * gr, Math.sin(ga) * gr)
                : ctx.lineTo(Math.cos(ga) * gr, Math.sin(ga) * gr);
      }
      ctx.closePath(); ctx.fill();
      // Center hole
      ctx.fillStyle = '#aa6622';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2); ctx.fill();
      // Metallic glint on teeth
      const glintAngle = gearSpin * 0.4;
      ctx.fillStyle = `rgba(255,255,220,${0.4 + 0.3 * Math.sin(glintAngle)})`;
      ctx.beginPath();
      ctx.arc(Math.cos(glintAngle) * r * 0.7, Math.sin(glintAngle) * r * 0.7, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
      // Center rivet
      ctx.fillStyle = '#ffcc88';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (s.clsKey === 'chronomancer') {
      // ── TEMPORAL BOLT: clock-like distortion with time-ripple rings ──
      ctx.save();
      ctx.translate(s.x, s.y);
      // Time-ripple rings expanding outward
      for (let i = 0; i < 3; i++) {
        const ringPhase = (t * 4 + i * 1.2) % 2;
        const ringR = r * (0.8 + ringPhase * 1.2);
        const ringAlpha = 0.3 * (1 - ringPhase / 2);
        ctx.strokeStyle = `rgba(255,200,60,${ringAlpha})`;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2); ctx.stroke();
      }
      // Golden/amber glow
      const timeGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.5);
      timeGrad.addColorStop(0, '#ffffcc');
      timeGrad.addColorStop(0.4, '#ffcc44');
      timeGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = timeGrad;
      ctx.beginPath(); ctx.arc(0, 0, r * 1.5, 0, Math.PI * 2); ctx.fill();
      // Clock face circle
      ctx.strokeStyle = 'rgba(255,220,100,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2); ctx.stroke();
      // Clock hands (rotating at different speeds)
      ctx.strokeStyle = '#ffeeaa';
      ctx.lineWidth = 1.5;
      // Hour hand
      const hourA = t * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(hourA) * r * 0.4, Math.sin(hourA) * r * 0.4);
      ctx.stroke();
      // Minute hand (faster)
      const minA = t * 8;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(minA) * r * 0.65, Math.sin(minA) * r * 0.65);
      ctx.stroke();
      // Bright center dot
      ctx.fillStyle = '#ffffee';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.15, 0, Math.PI * 2); ctx.fill();
      // Temporal shimmer particles
      for (let i = 0; i < 4; i++) {
        const px = Math.sin(t * 6 + i * 1.5) * r * 0.9;
        const py = Math.cos(t * 6 + i * 1.5) * r * 0.9;
        ctx.fillStyle = `rgba(255,220,100,${0.3 + 0.2 * Math.sin(t * 10 + i)})`;
        ctx.beginPath(); ctx.arc(px, py, 1.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();

    } else if (s.explode && s.color.includes('ff66')) {
      // ── FIREBALL: teardrop with smoke trail and ember sparks ──
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);

      // Smoke trail particles (behind the fireball)
      for (let i = 1; i <= 4; i++) {
        const smokeAge = (t * 8 + i * 1.3) % 2;
        const smokeX = -r * (1.5 + i * 0.8) + Math.sin(t * 5 + i * 2) * 2;
        const smokeY = Math.sin(t * 4 + i * 3) * 2;
        const smokeR = r * 0.3 + smokeAge * r * 0.3;
        ctx.fillStyle = `rgba(80,60,40,${0.25 - i * 0.05})`;
        ctx.beginPath(); ctx.arc(smokeX, smokeY, smokeR, 0, Math.PI * 2); ctx.fill();
      }

      // Ember sparks flying off
      for (let i = 0; i < 3; i++) {
        const sparkAngle = Math.PI + (i - 1) * 0.5 + Math.sin(t * 10 + i * 4) * 0.3;
        const sparkDist = r * (1 + hash(Math.floor(t * 15) + i) * 1.5);
        const sparkX = Math.cos(sparkAngle) * sparkDist;
        const sparkY = Math.sin(sparkAngle) * sparkDist;
        ctx.fillStyle = `rgba(255,${180 + Math.floor(hash(Math.floor(t * 20) + i) * 75)},50,0.7)`;
        ctx.beginPath(); ctx.arc(sparkX, sparkY, 0.8, 0, Math.PI * 2); ctx.fill();
      }

      // Outer flame
      const fGrad = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.8);
      fGrad.addColorStop(0, '#ffcc33');
      fGrad.addColorStop(0.4, '#ff6600');
      fGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = fGrad;
      ctx.beginPath();
      ctx.moveTo(r * 1.3, 0);
      ctx.quadraticCurveTo(r * 0.3, -r * 1.0, -r * 1.5, 0);
      ctx.quadraticCurveTo(r * 0.3, r * 1.0, r * 1.3, 0);
      ctx.fill();
      // Hot core
      ctx.fillStyle = '#ffffaa';
      ctx.beginPath();
      ctx.arc(r * 0.2, 0, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    } else if (s.slow > 0) {
      // ── ICE SHARD: with frost mist trail and rotation ──
      ctx.save();
      ctx.translate(s.x, s.y);
      const iceRot = a + Math.sin(t * 6) * 0.15; // Slight oscillation
      ctx.rotate(iceRot);

      // Frost mist trail
      for (let i = 1; i <= 3; i++) {
        const mistX = -r * (1.0 + i * 0.6);
        const mistY = Math.sin(t * 6 + i * 2) * r * 0.3;
        const mistR2 = r * 0.3 + i * r * 0.15;
        ctx.fillStyle = `rgba(150,210,240,${0.15 - i * 0.04})`;
        ctx.beginPath(); ctx.arc(mistX, mistY, mistR2, 0, Math.PI * 2); ctx.fill();
      }

      // Crystal body
      ctx.fillStyle = '#aaeeff';
      ctx.beginPath();
      ctx.moveTo(r * 1.5, 0);
      ctx.lineTo(r * 0.2, -r * 0.6);
      ctx.lineTo(-r * 1.0, -r * 0.3);
      ctx.lineTo(-r * 1.0, r * 0.3);
      ctx.lineTo(r * 0.2, r * 0.6);
      ctx.closePath();
      ctx.fill();
      // Shine
      ctx.fillStyle = 'rgba(255,255,255,.5)';
      ctx.beginPath();
      ctx.moveTo(r * 1.2, 0);
      ctx.lineTo(r * 0.3, -r * 0.3);
      ctx.lineTo(-r * 0.3, 0);
      ctx.closePath();
      ctx.fill();
      // Frost particles
      ctx.fillStyle = 'rgba(180,230,255,.4)';
      for (let i = 0; i < 3; i++) {
        const px = Math.sin(t * 8 + i * 2) * r * 0.5;
        const py = Math.cos(t * 8 + i * 2) * r * 0.5;
        ctx.beginPath();
        ctx.arc(px, py, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

    } else if (s.homing > 0) {
      // ── HOMING (arcane bolt): spinning star with afterimage trail ──
      // Afterimage trail (previous positions fading)
      const speed2 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const dt2 = speed2 > 0 ? 1 / 60 : 0;
      for (let i = 1; i <= 4; i++) {
        const trailX = s.x - s.vx * dt2 * i * 3;
        const trailY = s.y - s.vy * dt2 * i * 3;
        const trailAlpha = 0.3 - i * 0.06;
        const trailSize = r * (1.2 - i * 0.15);
        ctx.fillStyle = `rgba(255,136,204,${trailAlpha})`;
        ctx.beginPath(); ctx.arc(trailX, trailY, trailSize, 0, Math.PI * 2); ctx.fill();
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      const spinAngle = t * 10;
      // Outer glow
      const hGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.8);
      hGrad.addColorStop(0, s.color);
      hGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = hGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      // Star shape (8 points for more detail, spinning)
      ctx.fillStyle = '#ffaacc';
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const sa2 = spinAngle + (i / 8) * Math.PI * 2;
        const outerR = i % 2 === 0 ? r * 1.2 : r * 0.4;
        i === 0 ? ctx.moveTo(Math.cos(sa2) * outerR, Math.sin(sa2) * outerR)
                : ctx.lineTo(Math.cos(sa2) * outerR, Math.sin(sa2) * outerR);
      }
      ctx.closePath();
      ctx.fill();
      // Bright center
      ctx.fillStyle = '#ffddee';
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

    } else if (s.zap > 0) {
      // ── BALL LIGHTNING: bigger visual presence, arcs reaching outward ──
      // Outer electric field (larger, more visible)
      const fieldAlpha = 0.25 + 0.2 * Math.sin(t * 6);
      ctx.strokeStyle = `rgba(180,120,255,${fieldAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 1.8, 0, Math.PI * 2);
      ctx.stroke();

      // Secondary field
      ctx.strokeStyle = `rgba(200,160,255,${fieldAlpha * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 2.2, 0, Math.PI * 2);
      ctx.stroke();

      // Core with brighter gradient
      const bGrad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r);
      bGrad.addColorStop(0, '#ffffff');
      bGrad.addColorStop(0.3, '#eeccff');
      bGrad.addColorStop(1, '#7744bb');
      ctx.fillStyle = bGrad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();

      // Aggressive lightning arcs (more, longer, jitterier)
      ctx.strokeStyle = '#ddaaff';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 6; i++) {
        const la = noise(t * 15 + i * 7) * Math.PI * 2;
        const lx = s.x + Math.cos(la) * r;
        const ly = s.y + Math.sin(la) * r;
        const arcLen = r * (1.8 + noise(t * 20 + i * 11) * 0.8);
        const ex = s.x + Math.cos(la + noise(t * 25 + i * 3) * 0.4) * arcLen;
        const ey = s.y + Math.sin(la + noise(t * 25 + i * 3) * 0.4) * arcLen;
        const jx = noise(t * 30 + i * 17) * 5;
        const jy = noise(t * 28 + i * 23) * 5;
        ctx.beginPath();
        ctx.moveTo(lx, ly);
        ctx.lineTo((lx + ex) / 2 + jx, (ly + ey) / 2 + jy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }

    } else if (s.drain > 0) {
      // ── SOUL BOLT: ghostly wisp with occasional ghost face ──
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(a);
      // Ghost body
      const sGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.3);
      sGrad.addColorStop(0, '#88ff88');
      sGrad.addColorStop(0.5, '#44aa44');
      sGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = sGrad;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.3, 0, Math.PI * 2);
      ctx.fill();
      // Wispy tail
      ctx.strokeStyle = 'rgba(80,200,80,.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, 0);
      ctx.quadraticCurveTo(-r * 1.5, Math.sin(t * 8) * r, -r * 2.0, Math.sin(t * 6) * r * 0.5);
      ctx.stroke();

      // Ghost face (appears occasionally)
      const facePhase = Math.sin(t * 2) * 0.5 + 0.5;
      if (facePhase > 0.7) {
        const faceAlpha = (facePhase - 0.7) / 0.3;
        ctx.fillStyle = `rgba(200,255,200,${faceAlpha * 0.5})`;
        // Eyes
        ctx.beginPath(); ctx.arc(-r * 0.15, -r * 0.25, r * 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(r * 0.15, -r * 0.25, r * 0.15, 0, Math.PI * 2); ctx.fill();
        // Mouth
        ctx.beginPath(); ctx.arc(0, r * 0.1, r * 0.2, 0, Math.PI); ctx.fill();
      } else {
        // Normal eyes
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(r * 0.2, -r * 0.2, 2, 0, Math.PI * 2);
        ctx.arc(r * 0.2, r * 0.2, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

    } else if (s.color.includes('cc44') || s.color.includes('dd88')) {
      // ── ARROW / WRENCH: with wobble and speed lines ──
      ctx.save();
      ctx.translate(s.x, s.y);
      // Slight wobble for arrows
      const wobble = Math.sin(t * 20) * 0.03;
      ctx.rotate(a + wobble);

      // Speed lines behind
      ctx.strokeStyle = 'rgba(200,200,200,0.15)';
      ctx.lineWidth = 0.5;
      for (let i = 0; i < 3; i++) {
        const lineY = (i - 1) * r * 0.4;
        ctx.beginPath();
        ctx.moveTo(-r * 1.5 - i * 2, lineY);
        ctx.lineTo(-r * 2.5 - i * 3, lineY);
        ctx.stroke();
      }

      // Shaft
      ctx.fillStyle = s.color;
      ctx.fillRect(-r * 1.2, -r * 0.25, r * 2.4, r * 0.5);
      // Arrowhead
      ctx.beginPath();
      ctx.moveTo(r * 1.8, 0);
      ctx.lineTo(r * 1.0, -r * 0.5);
      ctx.lineTo(r * 1.0, r * 0.5);
      ctx.closePath();
      ctx.fill();
      // Metallic glint on arrowhead
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.moveTo(r * 1.6, -r * 0.1);
      ctx.lineTo(r * 1.2, -r * 0.3);
      ctx.lineTo(r * 1.2, 0);
      ctx.closePath(); ctx.fill();
      // Fletching
      ctx.fillStyle = s.trail || s.color;
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, -r * 0.4);
      ctx.lineTo(-r * 1.5, -r * 0.6);
      ctx.lineTo(-r * 1.0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 1.0, r * 0.4);
      ctx.lineTo(-r * 1.5, r * 0.6);
      ctx.lineTo(-r * 1.0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

    } else if (s.color.includes('4444') || s.color.includes('6644')) {
      // ── THROWING AXE / SHADOW BOLT: spinning with motion blur and metallic glint ──
      // Motion blur arc (previous rotation positions)
      const spinRate = t * 12;
      for (let i = 1; i <= 3; i++) {
        const blurRot = spinRate - i * 0.3;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(blurRot);
        ctx.globalAlpha = 0.15 - i * 0.04;
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(0, -r * 1.3);
        ctx.quadraticCurveTo(r * 1.0, -r * 0.5, r * 0.8, r * 0.3);
        ctx.lineTo(0, 0);
        ctx.lineTo(-r * 0.8, r * 0.3);
        ctx.quadraticCurveTo(-r * 1.0, -r * 0.5, 0, -r * 1.3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }

      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(spinRate);
      ctx.fillStyle = s.color;
      // Axe blade
      ctx.beginPath();
      ctx.moveTo(0, -r * 1.3);
      ctx.quadraticCurveTo(r * 1.0, -r * 0.5, r * 0.8, r * 0.3);
      ctx.lineTo(0, 0);
      ctx.lineTo(-r * 0.8, r * 0.3);
      ctx.quadraticCurveTo(-r * 1.0, -r * 0.5, 0, -r * 1.3);
      ctx.fill();
      // Handle
      ctx.strokeStyle = s.trail || '#888';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, r * 1.0);
      ctx.stroke();
      // Metallic glint on blade edge
      const glintPos = (Math.sin(spinRate * 0.5) + 1) * 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.3 + glintPos * 0.3})`;
      ctx.beginPath();
      ctx.arc(r * 0.3 * (1 - glintPos), -r * 0.7 * (1 - glintPos), 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

    } else {
      // ── DEFAULT: glowing orb (for any unmatched spell) ──
      const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 1.5);
      g.addColorStop(0, s.color);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.6)';
      ctx.beginPath();
      ctx.arc(s.x, s.y, r * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export function drawEProj(ctx: CanvasRenderingContext2D, state: GameState): void {
  for (const p of state.eProj) {
    // Enemy projectiles get a small gradient and trail
    const a = Math.atan2(p.vy, p.vx);
    // Trail
    ctx.strokeStyle = p.color + '44';
    ctx.lineWidth = p.radius * 0.6;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - Math.cos(a) * p.radius * 2, p.y - Math.sin(a) * p.radius * 2);
    ctx.stroke();
    // Body
    const epG = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius);
    epG.addColorStop(0, '#ffffff88');
    epG.addColorStop(0.4, p.color);
    epG.addColorStop(1, 'transparent');
    ctx.fillStyle = epG;
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
    } else if (pk.type === PickupType.Xp) {
      // XP gem: glowing blue-white diamond, bobbing, size based on value
      const bob = Math.sin(state.time * 4) * 3;
      const gemSize = Math.min(4 + pk.value * 0.5, 10);
      const gx = ctx.createRadialGradient(pk.x, pk.y + bob, 1, pk.x, pk.y + bob, gemSize + 4);
      gx.addColorStop(0, 'rgba(140,200,255,.5)');
      gx.addColorStop(1, 'transparent');
      ctx.fillStyle = gx;
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob, gemSize + 4, 0, Math.PI * 2);
      ctx.fill();
      // Diamond shape
      ctx.fillStyle = `rgba(180,220,255,${0.7 + pulse * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(pk.x, pk.y + bob - gemSize);
      ctx.lineTo(pk.x + gemSize * 0.6, pk.y + bob);
      ctx.lineTo(pk.x, pk.y + bob + gemSize);
      ctx.lineTo(pk.x - gemSize * 0.6, pk.y + bob);
      ctx.closePath();
      ctx.fill();
      // White highlight
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath();
      ctx.arc(pk.x, pk.y + bob - gemSize * 0.3, gemSize * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } else if (pk.type === PickupType.Gold) {
      // Gold coin: small rotating gold circle with white highlight
      const bob = Math.sin(state.time * 3 + pk.x) * 2;
      const coinR = 5;
      const scaleX = Math.abs(Math.cos(state.time * 4 + pk.y)); // rotation effect
      ctx.save();
      ctx.translate(pk.x, pk.y + bob);
      ctx.scale(Math.max(0.3, scaleX), 1);
      // Coin body
      ctx.fillStyle = '#ddcc44';
      ctx.beginPath();
      ctx.arc(0, 0, coinR, 0, Math.PI * 2);
      ctx.fill();
      // Dark edge
      ctx.strokeStyle = '#aa9933';
      ctx.lineWidth = 1;
      ctx.stroke();
      // Highlight
      ctx.fillStyle = 'rgba(255,255,220,0.6)';
      ctx.beginPath();
      ctx.arc(-1, -1, coinR * 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
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
