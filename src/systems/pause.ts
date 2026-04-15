import { GameState } from '../state';
import { GamePhase } from '../types';
import {
  generateSpellDescription,
  buildSpellEffects,
  SPELL_TYPE_LABELS,
} from '../ui/class-select';

export function openPause(state: GameState): void {
  state.gamePhase = GamePhase.Paused;
  document.body.classList.remove('in-game');
  if (document.pointerLockElement) document.exitPointerLock();
  renderPauseSkills(state);
  const el = document.getElementById('pause-screen');
  if (el) el.style.display = 'flex';
}

export function closePause(state: GameState): void {
  state.gamePhase = GamePhase.Playing;
  document.body.classList.add('in-game');
  const el = document.getElementById('pause-screen');
  if (el) el.style.display = 'none';
}

function renderPauseSkills(state: GameState): void {
  const p = state.players[state.localIdx];
  if (!p) return;

  const cls = p.cls;
  const clsKey = p.clsKey;

  // Class name
  const nameEl = document.getElementById('pause-class-name');
  if (nameEl) {
    nameEl.textContent = cls.name;
    nameEl.style.color = cls.color;
  }

  // Passive
  const passiveEl = document.getElementById('pause-passive');
  if (passiveEl && cls.passive) {
    passiveEl.innerHTML = `<strong style="color:${cls.color}">${cls.passive.name}:</strong> ${cls.passive.desc}`;
  }

  // Spells
  const grid = document.getElementById('pause-spells');
  if (!grid) return;
  grid.innerHTML = '';

  const spellCount = Math.min(4, cls.spells.length);
  for (let i = 0; i < spellCount; i++) {
    const spell = cls.spells[i];
    const isUlt = !!(spell.ultCharge && spell.mana === 0);
    const typeName = SPELL_TYPE_LABELS[spell.type] || spell.type;
    const desc = generateSpellDescription(spell, clsKey);
    const effects = buildSpellEffects(spell);

    // Stats line
    let stats = '';
    if (isUlt) {
      stats = '<span>ULT</span>';
    } else {
      const parts: string[] = [];
      if (spell.dmg) parts.push(`<span style="color:#ff6655">DMG ${spell.dmg}</span>`);
      if (spell.mana) parts.push(`<span style="color:#4488ff">MANA ${spell.mana}</span>`);
      if (spell.cd) parts.push(`<span style="color:#aaaacc">CD ${spell.cd}s</span>`);
      stats = parts.join('');
    }

    const card = document.createElement('div');
    card.className = 'pause-spell-card';
    card.innerHTML =
      `<div class="pause-spell-key">${spell.key}</div>` +
      `<div class="pause-spell-name" style="color:${spell.color}">${spell.name}</div>` +
      `<div class="pause-spell-type">${typeName}</div>` +
      `<div class="pause-spell-stats">${stats}</div>` +
      `<div class="pause-spell-desc">${desc}</div>` +
      effects;

    grid.appendChild(card);
  }
}

export function initPause(state: GameState): void {
  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;

    if (state.gamePhase === GamePhase.Playing && !state.shopOpen) {
      e.preventDefault();
      openPause(state);
    } else if (state.gamePhase === GamePhase.Paused) {
      e.preventDefault();
      closePause(state);
    }
  });
}
