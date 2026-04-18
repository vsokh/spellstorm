import { GameState } from '../state';
import { MAX_WAVES } from '../constants';

// ═══════════════════════════════════
//       HUD UPDATE
// ═══════════════════════════════════

export function updateHUD(state: GameState): void {
  const p = state.players[state.localIdx];
  if (!p) return;

  // Build spell icon row
  let spH = '<div class="spell-icons">';
  const spellCount = Math.min(4, p.cls.spells.length);
  for (let i = 0; i < spellCount; i++) {
    const sd = p.cls.spells[i];
    if (sd.type === 'ultimate') {
      const ultOk = p.ultCharge >= 100;
      spH += `<div class="sp-icon" style="border-color:${ultOk ? '#ffcc44' : 'rgba(60,40,80,.3)'}">` +
        `${ultOk ? `<span style="color:#ffcc44;font-size:9px">Space</span>` : `<span class="cd-txt">${Math.round(p.ultCharge)}%</span>`}` +
        `${!ultOk ? `<div class="cd-ov" style="height:${100 - p.ultCharge}%"></div>` : ''}` +
        `</div>`;
    } else {
      const ok = p.cd[i] <= 0 && p.mana >= sd.mana;
      const cdP = p.cd[i] > 0 ? Math.round((p.cd[i] / sd.cd) * 100) : 0;
      spH += `<div class="sp-icon" style="border-color:${ok ? p.cls.color : 'rgba(60,40,80,.3)'}">` +
        `${p.cd[i] > 0 ? `<span class="cd-txt">${Math.ceil(p.cd[i])}</span>` : `<span style="color:${ok ? p.cls.color : '#332244'}">${sd.key}</span>`}` +
        `${cdP > 0 ? `<div class="cd-ov" style="height:${cdP}%"></div>` : ''}` +
        `</div>`;
    }
  }
  spH += '</div>';

  const fury = p._furyActive ? ' <span style="color:#ff4444">FURY</span>' : '';
  const hpRatio = p.hp / p.maxHp;
  const hpColor = hpRatio > 0.5 ? '#33cc55' : '#cc3333';
  const ultColor = p.ultCharge >= 100 ? '#ffcc44' : '#886633';
  const xpRatio = p.xpToNext > 0 ? (p.xp / p.xpToNext) * 100 : 0;

  const hudP1 = document.getElementById('hud-p1');
  if (hudP1) {
    const livesHtml = state.maxLives > 0
      ? `<div style="margin-top:4px;font-size:13px;color:#44ccff">${'❤️'.repeat(state.lives)}${'🖤'.repeat(state.maxLives - state.lives)}</div>`
      : '';
    hudP1.innerHTML = `<span style="color:${p.cls.color}">${p.cls.name}</span>${fury}
      <div>
        <div class="bar-o"><div class="bar-i" style="width:${hpRatio * 100}%;background:${hpColor}"></div></div>
        <div class="bar-o" style="margin-top:4px"><div class="bar-i" style="width:${(p.mana / p.maxMana) * 100}%;background:${p.clsKey === 'stormcaller' ? '#cc88ff' : '#4488ff'}"></div></div>
        <div class="bar-o" style="margin-top:3px"><div class="bar-i" style="width:${p.ultCharge}%;background:${ultColor}"></div></div>
        <div style="margin-top:4px;display:flex;align-items:center;gap:6px">
          <span class="xp-lv">Lv${p.level}</span>
          <div class="bar-o bar-xp"><div class="bar-i" style="width:${xpRatio}%;background:#bb77ff"></div></div>
        </div>
        ${livesHtml}
      </div>`;
  }

  const skillBar = document.getElementById('skill-bar');
  if (skillBar) skillBar.innerHTML = spH;

  const hudRoom = document.getElementById('hud-room');
  if (hudRoom) {
    const aliveEnemies = state.enemies.filter(e => e.alive && !e._friendly && e._deathTimer < 0).length;
    const livesStr = state.maxLives > 0 ? ` \u00b7 \u2665 ${state.lives}` : '';
    hudRoom.textContent = `Wave ${state.wave} / ${MAX_WAVES} \u00b7 ${aliveEnemies} enemies \u00b7 ${state.totalKills} kills${livesStr}`;
  }

  const goldVal = document.getElementById('gold-val');
  if (goldVal) goldVal.textContent = String(state.gold);

  const shopBtn = document.getElementById('shop-btn') as HTMLButtonElement | null;
  if (shopBtn) {
    const canShop = !state.waveActive && !state.shopOpen && state.wave < MAX_WAVES;
    shopBtn.disabled = !canShop;
  }

  // Player 2 (partner) HUD
  const p2 = state.players[1];
  const hudP2 = document.getElementById('hud-p2');
  if (hudP2) {
    if (p2) {
      const p2Ratio = p2.hp / p2.maxHp;
      const p2Color = p2Ratio > 0.5 ? '#33cc55' : '#cc3333';
      hudP2.innerHTML = `<span style="color:${p2.cls.color}">${p2.cls.name}</span>` +
        `<div><div class="bar-o"><div class="bar-i" style="width:${p2Ratio * 100}%;background:${p2Color}"></div></div></div>`;
    } else {
      hudP2.innerHTML = '';
    }
  }
}
