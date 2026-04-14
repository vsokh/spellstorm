import { profiler } from './profiler';

// ═══════════════════════════════════
//     PERFORMANCE DEBUG HUD OVERLAY
// ═══════════════════════════════════

let visible = false;

/** Section labels in display order */
const SECTION_ORDER = [
  'updatePlayers',
  'updateSpells',
  'updateAoe',
  'updateZones',
  'updateEnemies',
  'updateEProj',
  'updateWaves',
  'camera',
  'effects',
  'hud',
  'render',
];

/** Entity labels in display order */
const ENTITY_ORDER = [
  'enemies',
  'spells',
  'particles',
  'trails',
  'zones',
  'aoeMarkers',
  'pickups',
];

// ── Overlay styling ──
const BG_COLOR = 'rgba(0, 0, 0, 0.72)';
const TEXT_COLOR = '#e0e0e0';
const WARN_COLOR = '#ff4444';
const BAR_COLOR = '#44cc66';
const BAR_BG_COLOR = 'rgba(255, 255, 255, 0.1)';
const FONT = '12px monospace';
const LINE_HEIGHT = 16;
const PADDING = 10;
const BAR_WIDTH = 80;
const BAR_HEIGHT = 8;

/**
 * Set up F3 key listener to toggle the overlay.
 * Also enables/disables the profiler to avoid overhead when overlay is hidden.
 */
export function initPerfOverlay(_canvas: HTMLCanvasElement): void {
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'F3') {
      e.preventDefault();
      visible = !visible;
      profiler.enabled = visible;
    }
  });
}

/** Returns true if the overlay is currently visible */
export function isPerfOverlayVisible(): boolean {
  return visible;
}

/**
 * Draw the performance overlay directly on the game canvas.
 * Reads data from the profiler singleton.
 */
export function drawPerfOverlay(ctx: CanvasRenderingContext2D): void {
  if (!visible) return;

  const data = profiler.getData();
  if (!data) return;

  ctx.save();

  // Reset transform so we draw in screen space
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.font = FONT;
  ctx.textBaseline = 'top';

  // ── Calculate panel dimensions ──
  const sectionCount = SECTION_ORDER.length;
  const entityCount = ENTITY_ORDER.length;
  // Lines: title, fps, blank, "Systems:" header, sections, blank, "Entities:" header, entities, (optional gc warning)
  const lineCount = 2 + 1 + 1 + sectionCount + 1 + 1 + entityCount + (data.gcPause ? 1 : 0);
  const panelWidth = 260;
  const panelHeight = lineCount * LINE_HEIGHT + PADDING * 2;

  // ── Background ──
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(4, 4, panelWidth, panelHeight);

  let y = 4 + PADDING;
  const x = 4 + PADDING;

  // ── FPS & frame time ──
  const fpsColor = data.avgFps >= 55 ? '#44ff44' : data.avgFps >= 30 ? '#ffcc00' : WARN_COLOR;
  ctx.fillStyle = fpsColor;
  ctx.fillText(`FPS: ${data.avgFps.toFixed(1)}`, x, y);
  ctx.fillStyle = TEXT_COLOR;
  ctx.fillText(`${data.frameTime.toFixed(2)} ms`, x + 100, y);
  y += LINE_HEIGHT;

  // Frame budget bar (16.67ms)
  const budgetFrac = Math.min(data.frameTime / 16.67, 2);
  const budgetBarW = panelWidth - PADDING * 2;
  ctx.fillStyle = BAR_BG_COLOR;
  ctx.fillRect(x, y, budgetBarW, BAR_HEIGHT);
  ctx.fillStyle = budgetFrac <= 1 ? '#44cc66' : '#ff6644';
  ctx.fillRect(x, y, budgetBarW * Math.min(budgetFrac, 1), BAR_HEIGHT);
  // Budget line at 16.67ms
  if (budgetFrac < 2) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath();
    ctx.moveTo(x + budgetBarW * 0.5, y);
    ctx.lineTo(x + budgetBarW * 0.5, y + BAR_HEIGHT);
    ctx.stroke();
  }
  y += LINE_HEIGHT;

  // ── Spacer ──
  y += LINE_HEIGHT * 0.25;

  // ── Systems breakdown ──
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('Systems:', x, y);
  y += LINE_HEIGHT;

  // Find max section time for bar scaling (at least 1ms to avoid div-by-zero)
  let maxSectionTime = 1;
  for (const name of SECTION_ORDER) {
    const t = data.sections[name] || 0;
    if (t > maxSectionTime) maxSectionTime = t;
  }

  for (const name of SECTION_ORDER) {
    const t = data.sections[name] || 0;
    const label = name.length > 14 ? name.slice(0, 14) : name;

    // Label
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(label, x, y);

    // Time value
    ctx.fillText(`${t.toFixed(2)} ms`, x + 110, y);

    // Bar
    const barX = x + 170;
    const barFrac = t / maxSectionTime;
    ctx.fillStyle = BAR_BG_COLOR;
    ctx.fillRect(barX, y + 3, BAR_WIDTH, BAR_HEIGHT);
    ctx.fillStyle = BAR_COLOR;
    ctx.fillRect(barX, y + 3, BAR_WIDTH * barFrac, BAR_HEIGHT);

    y += LINE_HEIGHT;
  }

  // ── Spacer ──
  y += LINE_HEIGHT * 0.25;

  // ── Entity counts ──
  ctx.fillStyle = '#aaaaaa';
  ctx.fillText('Entities:', x, y);
  y += LINE_HEIGHT;

  for (const name of ENTITY_ORDER) {
    const count = data.entities[name] || 0;
    ctx.fillStyle = TEXT_COLOR;
    ctx.fillText(`${name}: ${count}`, x, y);
    y += LINE_HEIGHT;
  }

  // ── GC pause warning ──
  if (data.gcPause) {
    ctx.fillStyle = WARN_COLOR;
    ctx.fillText('!! GC PAUSE DETECTED !!', x, y);
    y += LINE_HEIGHT;
  }

  ctx.restore();
}
