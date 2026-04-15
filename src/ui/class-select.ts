import { GameState } from '../state';
import { NetworkMode, SpellDefInput } from '../types';
import { CLASSES, CLASS_ORDER, WIZARD_SIZE } from '../constants';
import { sendMessage } from '../network';
import { getSynergy, getSynergiesForClass } from '../systems/synergy';
import { startPreviews, stopPreviews } from './spell-preview';
import { drawClassBody, drawWeapon, CLASS_SCALE } from '../rendering/draw-entities';

// ═══════════════════════════════════
//       CLASS SELECTION SCREEN
// ═══════════════════════════════════

const SPELL_TYPE_LABELS: Record<string, string> = {
  projectile: 'Projectile',
  homing: 'Homing',
  beam: 'Beam',
  cone: 'Cone',
  nova: 'Nova',
  aoe_delayed: 'Area (Delayed)',
  blink: 'Dash',
  barrage: 'Barrage',
  zone: 'Zone',
  rewind: 'Rewind',
  leap: 'Leap',
  ally_shield: 'Ally Shield',
  trap: 'Trap',
  ultimate: 'Ultimate',
};

const ULTIMATE_DESCRIPTIONS: Record<string, string> = {
  pyromancer: 'Rain 8 meteors across the battlefield, leaving lingering burn zones.',
  cryomancer: 'Freeze all enemies in place and deal burst damage to each.',
  stormcaller: 'Unleash chain lightning that bounces between up to 8 enemies, dealing heavy damage.',
  arcanist: 'Launch a spiral of 20 homing arcane missiles.',
  necromancer: 'Summon 6 skeletal allies to fight by your side.',
  chronomancer: 'Freeze all enemies in time while you move at increased speed.',
  knight: 'Become invulnerable for 3 seconds and reflect all damage.',
  berserker: 'Enter a blood frenzy: double damage and speed for 5 seconds, but take double damage.',
  paladin: 'Heal all players for 75% max HP and smite all enemies.',
  ranger: 'Unleash a barrage of 20 arrows in a wide cone.',
  druid: 'Summon a ring of 6 thorn zones and 2 treant allies.',
  warlock: 'Mark all enemies with Doom — after 3 seconds, they take 35% max HP damage.',
  monk: 'Deliver 20 rapid melee strikes in a cone with knockback.',
  engineer: 'Deploy a powerful Mega Turret with 20 HP that fires for 12 seconds.',
  graviturge: 'Create a gravity vortex that pulls enemies inward, crushing them with gravitational force.',
  bladecaller: 'Unleash a flurry of blade strikes, dashing between enemies at blinding speed.',
  architect: 'Deploy a massive arcane construct that persists on the battlefield, damaging and slowing enemies.',
  hexblade: 'Curse all enemies with hex stacks that detonate in chain explosions.',
  warden: 'Become invulnerable and project a protective aura that shields nearby allies.',
};

const EFFECT_DEFS: { key: keyof SpellDefInput; label: string; cssClass: string }[] = [
  { key: 'burn', label: 'Burn', cssClass: 'tag-burn' },
  { key: 'slow', label: 'Slow', cssClass: 'tag-slow' },
  { key: 'stun', label: 'Stun', cssClass: 'tag-stun' },
  { key: 'drain', label: 'Drain', cssClass: 'tag-drain' },
  { key: 'explode', label: 'Explode', cssClass: 'tag-explode' },
  { key: 'homing', label: 'Homing', cssClass: 'tag-homing' },
  { key: 'pierce', label: 'Pierce', cssClass: 'tag-pierce' },
  { key: 'heal', label: 'Heal', cssClass: 'tag-heal' },
  { key: 'zap', label: 'Chain', cssClass: 'tag-chain' },
];

function buildSpellEffects(spell: SpellDefInput): string {
  const tags = EFFECT_DEFS
    .filter(e => spell[e.key])
    .map(e => `<span class="cd-effect-tag ${e.cssClass}">${e.label}</span>`)
    .join('');
  return tags ? `<div class="cd-spell-effects">${tags}</div>` : '';
}

function generateSpellDescription(spell: SpellDefInput, classKey?: string): string {
  // Ultimate abilities
  if (spell.ultCharge && spell.mana === 0) {
    const desc = classKey ? ULTIMATE_DESCRIPTIONS[classKey] : undefined;
    return desc || 'Ultimate ability. Charges through combat.';
  }

  const parts: string[] = [];

  // Type-specific opener
  switch (spell.type) {
    case 'ally_shield':
      return `Shields your ally for ${spell.duration || 0}s.`;
    case 'blink':
      return `Dash forward.`;
    case 'rewind':
      return 'Rewind to your position from 3s ago.';
    case 'beam':
      parts.push(`Channels a beam dealing ${spell.dmg || 0} dmg`);
      break;
    case 'cone':
      parts.push(`Releases a cone blast dealing ${spell.dmg || 0} dmg`);
      break;
    case 'nova':
      parts.push(`Emits a nova dealing ${spell.dmg || 0} dmg`);
      break;
    case 'zone':
      if (spell.dmg) {
        parts.push(`Creates a zone dealing ${spell.dmg} dmg/tick`);
      } else if (spell.heal) {
        parts.push('Creates a healing zone');
      } else if (spell.stun) {
        parts.push('Creates a zone that roots enemies');
      } else if (spell.slow) {
        parts.push('Creates a slowing field');
      } else {
        parts.push('Creates an area zone');
      }
      break;
    case 'leap':
      parts.push(`Leaps and slams dealing ${spell.dmg || 0} dmg`);
      break;
    case 'barrage':
      parts.push(`Fires ${spell.count || 0} projectiles in a spread dealing ${spell.dmg || 0} dmg each`);
      break;
    case 'trap':
      if (spell.count && spell.count > 1) {
        parts.push(`Places ${spell.count} traps dealing ${spell.dmg || 0} dmg each`);
      } else if (spell.dmg) {
        parts.push(`Places a trap dealing ${spell.dmg} dmg`);
      } else {
        parts.push('Places a trap that triggers on enemies');
      }
      break;
    case 'aoe_delayed':
      parts.push(`Strikes an area after a short delay dealing ${spell.dmg || 0} dmg`);
      break;
    case 'ultimate':
      // Summon-type spells (Spirit Wolf, Summon Imp) use ultimate type but have mana cost
      if (spell.name === 'Spirit Wolf') {
        parts.push('Summons a spirit wolf that fights alongside you');
      } else if (spell.name === 'Summon Imp') {
        parts.push('Summons a demonic imp that attacks nearby enemies');
      } else {
        parts.push('Summons a companion to fight for you');
      }
      break;
    default: {
      const dmg = spell.dmg || 0;
      if (spell.explode) {
        parts.push(`Fires an explosive projectile dealing ${dmg} dmg`);
      } else {
        parts.push(`Fires a ${spell.homing ? 'homing ' : ''}projectile dealing ${dmg} dmg`);
      }
      break;
    }
  }

  // Effects
  const effects: string[] = [];
  if (spell.burn) effects.push(`burns for ${spell.burn} dmg`);
  if (spell.slow) effects.push('slows enemies');
  if (spell.stun) effects.push(`stuns for ${spell.stun}s`);
  if (spell.drain) effects.push(`drains ${spell.drain} HP`);
  if (spell.heal) effects.push(`heals ${spell.heal} HP/tick`);
  if (spell.explode && spell.type !== 'projectile' && spell.type !== 'homing') effects.push('explodes on impact');
  if (spell.pierce) effects.push('pierces enemies');
  if (spell.homing && spell.type !== 'projectile' && spell.type !== 'homing') effects.push('tracks targets');
  if (spell.zap) effects.push('chains to nearby enemies');

  // Duration for zones
  if (spell.duration && spell.type === 'zone') {
    effects.push(`lasts ${spell.duration}s`);
  }

  if (effects.length > 0) {
    parts.push('that ' + effects.join(', '));
  }

  return parts.join(' ') + '.';
}

function buildSpellStats(spell: SpellDefInput): string {
  // Ultimate spells with ultCharge show a different note
  if (spell.ultCharge && spell.mana === 0 && spell.cd === 0) {
    return `<div class="cd-ult-note">Charges in combat</div>`;
  }

  const parts: string[] = [];
  if (spell.dmg) {
    parts.push(`<span><span class="cd-stat-label">DMG</span>${spell.dmg}</span>`);
  }
  parts.push(`<span><span class="cd-stat-label">MANA</span>${spell.mana}</span>`);
  if (spell.cd > 0) {
    parts.push(`<span><span class="cd-stat-label">CD</span>${spell.cd}s</span>`);
  }
  return `<div class="cd-spell-stats">${parts.join('')}</div>`;
}

function updateDetailPanel(state: GameState): void {
  const panel = document.getElementById('class-detail');
  if (!panel) return;

  stopPreviews();

  const key = CLASS_ORDER[state.selectedClassIndex];
  const cls = CLASSES[key];
  if (!cls) { panel.innerHTML = ''; return; }

  const spellCards = cls.spells.map(spell => {
    const typeLabel = SPELL_TYPE_LABELS[spell.type] || spell.type;
    const badgeColor = spell.color || cls.color;
    return `<div class="cd-spell">
      <div class="cd-spell-top">
        <span class="cd-key-badge" style="color:${badgeColor};border-color:${badgeColor}">${spell.key}</span>
        <span class="cd-spell-name">${spell.name}</span>
        <span class="cd-spell-type">${typeLabel}</span>
      </div>
      ${buildSpellStats(spell)}
      <div class="cd-spell-desc">${generateSpellDescription(spell, key)}</div>
      ${buildSpellEffects(spell)}
      <canvas class="cd-spell-preview" width="250" height="36"></canvas>
    </div>`;
  }).join('');

  // Build synergy section for co-op modes (Host or Guest)
  let synergyHtml = '';
  const isCoop = state.mode === NetworkMode.Host || state.mode === NetworkMode.Guest;
  if (isCoop) {
    const allyKey = state.mode === NetworkMode.Guest ? state.hostClassKey
      : state.guestClassKey;
    const synergies = getSynergiesForClass(key);
    if (synergies.length > 0) {
      const items = synergies.map(({ synergy: syn, partnerClass: partnerKey }) => {
        const partnerCls = CLASSES[partnerKey];
        if (!partnerCls) return '';
        const isActive = allyKey === partnerKey;
        const activeClass = isActive ? ' cd-synergy-active' : '';
        // Determine bonus labels: match class order from synergy definition
        const cls0 = CLASSES[syn.classes[0]];
        const cls1 = CLASSES[syn.classes[1]];
        const bonus0Label = cls0 ? cls0.name : syn.classes[0];
        const bonus1Label = cls1 ? cls1.name : syn.classes[1];
        return `<div class="cd-synergy-item${activeClass}" style="border-left-color:${syn.color}">` +
          `<div class="cd-synergy-header">` +
            `<span class="cd-synergy-name" style="color:${syn.color}">${syn.name}</span>` +
            `<span class="cd-synergy-partner">with <span style="color:${partnerCls.color}">${partnerCls.name}</span></span>` +
          `</div>` +
          `<div class="cd-synergy-flavor">${syn.desc}</div>` +
          `<div class="cd-synergy-bonuses">` +
            `<div>\u2022 ${bonus0Label}: ${syn.bonuses[0]}</div>` +
            `<div>\u2022 ${bonus1Label}: ${syn.bonuses[1]}</div>` +
          `</div>` +
        `</div>`;
      }).join('');
      synergyHtml = `<div class="cd-synergy-section">` +
        `<div class="cd-section-label">Team Synergies</div>` +
        items +
      `</div>`;
    }
  }

  panel.innerHTML =
    `<div class="cd-header" style="color:${cls.color}">${cls.name}</div>` +
    `<div class="cd-desc">${cls.desc}</div>` +
    synergyHtml +
    `<div class="cd-section-label">Passive</div>` +
    `<div class="cd-passive">` +
      `<div class="cd-passive-name">${cls.passive.name}</div>` +
      `<div class="cd-passive-desc">${cls.passive.desc}</div>` +
    `</div>` +
    `<div class="cd-divider"></div>` +
    `<div class="cd-section-label">Spells</div>` +
    spellCards;

  startPreviews(cls.spells, cls.color, cls.glow);
}

// ── Card canvas animation state ──
let cardCanvases: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; clsKey: string; color: string; glow: string }[] = [];
let cardAnimFrame: number | null = null;

function animateCards(): void {
  const time = performance.now() / 1000;
  for (const c of cardCanvases) {
    const ctx = c.ctx;
    const w = c.canvas.width;
    const h = c.canvas.height;
    ctx.clearRect(0, 0, w, h);

    const scale = 3;
    const cx = w / 2;
    const cy = h / 2;
    const idleBob = Math.sin(time * 2.5) * (2 * scale);

    ctx.save();
    ctx.scale(scale, scale);
    const sx = cx / scale;
    const sy = cy / scale;

    // Aura glow
    const S = WIZARD_SIZE * (CLASS_SCALE[c.clsKey] || 1);
    const ag = ctx.createRadialGradient(sx, sy, S * 0.5, sx, sy, S * 2.5);
    ag.addColorStop(0, c.glow + '22');
    ag.addColorStop(1, 'transparent');
    ctx.fillStyle = ag;
    ctx.beginPath();
    ctx.arc(sx, sy, S * 2.5, 0, Math.PI * 2);
    ctx.fill();

    drawClassBody(ctx, sx, sy + idleBob / scale, 0, c.clsKey, c.color, c.glow, time, undefined);
    drawWeapon(ctx, sx, sy + idleBob / scale, 0, c.clsKey, c.color, S);
    ctx.restore();
  }
  cardAnimFrame = requestAnimationFrame(animateCards);
}

function startCardAnimation(): void {
  if (cardAnimFrame !== null) return;
  animateCards();
}

export function stopCardAnimation(): void {
  if (cardAnimFrame !== null) {
    cancelAnimationFrame(cardAnimFrame);
    cardAnimFrame = null;
  }
  cardCanvases = [];
}

export function showSelect(state: GameState): void {
  const lobby = document.getElementById('lobby');
  const selectScreen = document.getElementById('select-screen');
  if (lobby) lobby.style.display = 'none';
  if (selectScreen) selectScreen.style.display = 'flex';
  buildGrid(state);
}

function buildGrid(state: GameState): void {
  const grid = document.getElementById('class-grid');
  if (!grid) return;
  grid.innerHTML = '';

  // Stop any prior animation before rebuilding
  stopCardAnimation();

  CLASS_ORDER.forEach((k, i) => {
    const c = CLASSES[k];
    const card = document.createElement('div');
    card.className = 'class-card' + (i === state.selectedClassIndex ? ' selected' : '');

    // Check synergy with ally's picked class
    const allyKey = state.mode === NetworkMode.Guest ? state.hostClassKey
      : state.mode === NetworkMode.Host ? state.guestClassKey
      : null;
    let synTag = '';
    if (allyKey) {
      const syn = getSynergy(k, allyKey);
      if (syn) {
        synTag = `<div class="cdesc" style="margin-top:3px;font-size:9px;color:${syn.color};font-weight:bold">SYNERGY: ${syn.name}</div>`;
      }
    }

    // Class name + synergy tag via innerHTML, canvas added programmatically
    card.innerHTML = `<div class="cname" style="color:${c.color}">${c.name}</div>` + synTag;

    // Create animated character canvas
    const canvas = document.createElement('canvas');
    canvas.className = 'class-char-canvas';
    canvas.width = 200;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Insert canvas after the class name (before synergy tag if present)
      const cname = card.querySelector('.cname');
      if (cname && cname.nextSibling) {
        card.insertBefore(canvas, cname.nextSibling);
      } else {
        card.appendChild(canvas);
      }
      cardCanvases.push({ canvas, ctx, clsKey: k, color: c.color, glow: c.glow });
    }

    card.onclick = () => {
      state.selectedClassIndex = i;
      buildGrid(state);
    };
    grid.appendChild(card);
  });

  startCardAnimation();
  updateDetailPanel(state);
}

/**
 * Wire up the confirmClass button. The caller provides onBeginGame.
 */
export function setupClassSelect(
  state: GameState,
  onBeginGame: (c1: string, c2: string) => void,
): void {
  const btnReady = document.getElementById('btn-ready');
  if (!btnReady) return;
  btnReady.addEventListener('click', () => {
    const cls = CLASS_ORDER[state.selectedClassIndex];

    if (state.mode === NetworkMode.Local) {
      onBeginGame(cls, cls);
    } else if (state.mode === NetworkMode.Host) {
      state.hostClassKey = cls;
      const statusEl = document.getElementById('select-status');
      if (statusEl) statusEl.textContent = 'Waiting for partner...';
      if (state.guestClassKey) {
        sendMessage(state, { type: 'go', h: cls, g: state.guestClassKey });
        onBeginGame(cls, state.guestClassKey);
      }
    } else if (state.mode === NetworkMode.Guest) {
      sendMessage(state, { type: 'cls', cls });
      const statusEl = document.getElementById('select-status');
      if (statusEl) statusEl.textContent = 'Waiting for host...';
    }
  });
}
