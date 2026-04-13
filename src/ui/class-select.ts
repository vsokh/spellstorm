import { GameState } from '../state';
import { NetworkMode, SpellDefInput } from '../types';
import { CLASSES, CLASS_ORDER } from '../constants';
import { sendMessage } from '../network';
import { getSynergy } from '../systems/synergy';

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

function generateSpellDescription(spell: SpellDefInput): string {
  // Ultimate abilities
  if (spell.ultCharge && spell.mana === 0) {
    return 'Ultimate ability. Charges through combat.';
  }

  const parts: string[] = [];

  // Type-specific opener
  switch (spell.type) {
    case 'ally_shield':
      return `Shields your ally for ${spell.duration || 0}s.`;
    case 'blink':
      return `Dash ${spell.range || 0} units forward.`;
    case 'rewind':
      return 'Rewind to your position from 3s ago.';
    case 'beam':
      parts.push(`Channels a beam dealing ${spell.dmg || 0} dmg at ${spell.range || 0} range`);
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
      } else {
        parts.push('Creates an area of effect');
      }
      break;
    case 'leap':
      parts.push(`Leaps and slams dealing ${spell.dmg || 0} dmg`);
      break;
    case 'barrage':
      parts.push(`Fires ${spell.count || 0} projectiles in a spread dealing ${spell.dmg || 0} dmg`);
      break;
    case 'trap':
      if (spell.dmg) {
        parts.push(`Places a trap dealing ${spell.dmg} dmg`);
      } else {
        parts.push('Places a trap that triggers on enemies');
      }
      break;
    case 'aoe_delayed':
      parts.push(`Summons a delayed area dealing ${spell.dmg || 0} dmg`);
      break;
    case 'ultimate':
      // Summon-type spells (Spirit Wolf, Summon Imp) use ultimate type but have mana cost
      parts.push('Summons a companion to fight for you');
      break;
    default: {
      const dmg = spell.dmg || 0;
      if (spell.explode) {
        parts.push(`Fires an explosive projectile dealing ${dmg} dmg`);
      } else {
        parts.push(`Fires a ${spell.homing ? 'homing' : 'fast'} projectile dealing ${dmg} dmg`);
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
      <div class="cd-spell-desc">${generateSpellDescription(spell)}</div>
      ${buildSpellEffects(spell)}
    </div>`;
  }).join('');

  // Check for synergy with ally's class
  let synergyHtml = '';
  const allyKey = state.mode === NetworkMode.Guest ? state.hostClassKey
    : state.mode === NetworkMode.Host ? state.guestClassKey
    : null;
  if (allyKey) {
    const syn = getSynergy(key, allyKey);
    if (syn) {
      synergyHtml = `<div class="cd-synergy-tag" style="color:${syn.color};border-color:${syn.color}">` +
        `SYNERGY: ${syn.name}</div>` +
        `<div class="cd-synergy-desc" style="color:${syn.color}">${syn.desc}</div>`;
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

  CLASS_ORDER.forEach((k, i) => {
    const c = CLASSES[k];
    const card = document.createElement('div');
    card.className = 'class-card' + (i === state.selectedClassIndex ? ' selected' : '');

    const spList = c.spells.map(s =>
      `<span style="color:${s.color || c.color}">${s.key}</span> ${s.name}`
    ).join(' &middot; ');

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

    card.innerHTML = `<div class="cname" style="color:${c.color}">${c.name}</div>` +
      `<div class="cdesc">${c.desc}</div>` +
      `<div class="cdesc" style="margin-top:3px;color:#554466;font-size:9px">Passive: ${c.passive.desc}</div>` +
      `<div class="cdesc" style="font-size:9px;margin-top:2px">${spList}</div>` +
      synTag;

    card.onclick = () => {
      state.selectedClassIndex = i;
      buildGrid(state);
    };
    grid.appendChild(card);
  });

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
