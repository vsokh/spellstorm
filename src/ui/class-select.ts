import { GameState } from '../state';
import { NetworkMode, SpellDefInput } from '../types';
import { CLASSES, CLASS_ORDER } from '../constants';
import { sendMessage } from '../network';

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
      ${buildSpellEffects(spell)}
    </div>`;
  }).join('');

  panel.innerHTML =
    `<div class="cd-header" style="color:${cls.color}">${cls.name}</div>` +
    `<div class="cd-desc">${cls.desc}</div>` +
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

    card.innerHTML = `<div class="cname" style="color:${c.color}">${c.name}</div>` +
      `<div class="cdesc">${c.desc}</div>` +
      `<div class="cdesc" style="margin-top:3px;color:#554466;font-size:9px">Passive: ${c.passive.desc}</div>` +
      `<div class="cdesc" style="font-size:9px;margin-top:2px">${spList}</div>`;

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
