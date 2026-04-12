import { GameState } from '../state';

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
        `<span style="color:${ultOk ? '#ffcc44' : '#332244'}">R</span>` +
        `${!ultOk ? `<div class="cd-ov" style="height:${100 - p.ultCharge}%"></div>` : ''}` +
        `</div>`;
    } else {
      const ok = p.cd[i] <= 0 && p.mana >= sd.mana;
      const cdP = p.cd[i] > 0 ? Math.round((p.cd[i] / sd.cd) * 100) : 0;
      spH += `<div class="sp-icon" style="border-color:${ok ? p.cls.color : 'rgba(60,40,80,.3)'}">` +
        `<span style="color:${ok ? p.cls.color : '#332244'}">${sd.key}</span>` +
        `${cdP > 0 ? `<div class="cd-ov" style="height:${cdP}%"></div>` : ''}` +
        `</div>`;
    }
  }
  spH += '</div>';

  const fury = p._furyActive ? ' <span style="color:#ff4444">FURY</span>' : '';
  const hpRatio = p.hp / p.maxHp;
  const hpColor = hpRatio > 0.5 ? '#33cc55' : '#cc3333';
  const ultColor = p.ultCharge >= 100 ? '#ffcc44' : '#886633';

  const hudP1 = document.getElementById('hud-p1');
  if (hudP1) {
    hudP1.innerHTML = `<span style="color:${p.cls.color}">${p.cls.name}</span>${fury}
      <div>
        <div class="bar-o"><div class="bar-i" style="width:${hpRatio * 100}%;background:${hpColor}"></div></div>
        <div class="bar-o" style="margin-top:2px"><div class="bar-i" style="width:${(p.mana / p.maxMana) * 100}%;background:#4488ff"></div></div>
        <div class="bar-o" style="margin-top:1px"><div class="bar-i" style="width:${p.ultCharge}%;background:${ultColor}"></div></div>
      </div>${spH}`;
  }

  const hudRoom = document.getElementById('hud-room');
  if (hudRoom) {
    const aliveEnemies = state.enemies.filter(e => e.alive && !e._friendly).length;
    hudRoom.textContent = `Wave ${state.wave} \u00b7 ${aliveEnemies} enemies \u00b7 ${state.totalKills} kills`;
  }

  const goldVal = document.getElementById('gold-val');
  if (goldVal) goldVal.textContent = String(state.gold);

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
