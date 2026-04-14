import type { GameState } from '../state';

// ═══════════════════════════════════
//     LIGHTWEIGHT GAME LOOP PROFILER
// ═══════════════════════════════════

/** Per-frame snapshot stored in the ring buffer */
export interface FrameData {
  /** Wall-clock frame time in ms */
  frameTime: number;
  /** Instantaneous FPS (1000 / frameTime) */
  fps: number;
  /** Rolling average FPS over last 60 frames */
  avgFps: number;
  /** Named section timings in ms */
  sections: Record<string, number>;
  /** Entity counts snapshot */
  entities: Record<string, number>;
  /** True if this frame was flagged as a likely GC pause */
  gcPause: boolean;
  /** Timestamp (performance.now) when frame started */
  timestamp: number;
}

const ROLLING_WINDOW = 60;
const HISTORY_SIZE = 300;

class Profiler {
  enabled = false;

  // ── Internal state ──
  private _frameStartTime = 0;
  private _sectionStarts: Record<string, number> = {};
  private _currentSections: Record<string, number> = {};
  private _currentEntities: Record<string, number> = {};

  // Rolling FPS buffer (circular)
  private _frameTimes: number[] = new Array(ROLLING_WINDOW).fill(16.67);
  private _frameIdx = 0;
  private _frameCount = 0;

  // Frame history ring buffer
  private _history: FrameData[] = [];
  private _historyIdx = 0;

  // ── Public API ──

  /** Call at the very top of the game loop */
  frameStart(): void {
    if (!this.enabled) return;
    this._frameStartTime = performance.now();
    this._currentSections = {};
    this._currentEntities = {};
  }

  /** Call at the very bottom of the game loop (before rAF) */
  frameEnd(): void {
    if (!this.enabled) return;
    const now = performance.now();
    const frameTime = now - this._frameStartTime;

    // Update rolling FPS buffer
    this._frameTimes[this._frameIdx] = frameTime;
    this._frameIdx = (this._frameIdx + 1) % ROLLING_WINDOW;
    this._frameCount++;

    // Compute rolling average
    const count = Math.min(this._frameCount, ROLLING_WINDOW);
    let sum = 0;
    for (let i = 0; i < count; i++) {
      sum += this._frameTimes[i];
    }
    const avgFrameTime = sum / count;
    const avgFps = 1000 / avgFrameTime;

    // Detect GC pause: frame took > 2x the rolling average
    const gcPause = frameTime > avgFrameTime * 2 && this._frameCount > ROLLING_WINDOW;

    const data: FrameData = {
      frameTime,
      fps: 1000 / frameTime,
      avgFps,
      sections: { ...this._currentSections },
      entities: { ...this._currentEntities },
      gcPause,
      timestamp: this._frameStartTime,
    };

    // Store in ring buffer
    if (this._history.length < HISTORY_SIZE) {
      this._history.push(data);
    } else {
      this._history[this._historyIdx] = data;
    }
    this._historyIdx = (this._historyIdx + 1) % HISTORY_SIZE;
  }

  /** Begin timing a named section */
  begin(section: string): void {
    if (!this.enabled) return;
    this._sectionStarts[section] = performance.now();
  }

  /** End timing a named section */
  end(section: string): void {
    if (!this.enabled) return;
    const start = this._sectionStarts[section];
    if (start !== undefined) {
      this._currentSections[section] = performance.now() - start;
    }
  }

  /** Snapshot entity counts from the current game state */
  countEntities(state: GameState): void {
    if (!this.enabled) return;
    this._currentEntities = {
      enemies: state.enemies.length,
      spells: state.spells.length,
      particles: state.particles.length,
      trails: state.trails.length,
      shockwaves: state.shockwaves.length,
      texts: state.texts.length,
      beams: state.beams.length,
      zones: state.zones.length,
      aoeMarkers: state.aoeMarkers.length,
      eProj: state.eProj.length,
      pillars: state.pillars.length,
      pickups: state.pickups.length,
    };
  }

  /** Get the most recent frame data (or null if none recorded) */
  getData(): FrameData | null {
    if (this._history.length === 0) return null;
    const idx = (this._historyIdx - 1 + this._history.length) % this._history.length;
    return this._history[idx];
  }

  /** Get the full frame history ring buffer (oldest to newest) */
  getHistory(): FrameData[] {
    if (this._history.length < HISTORY_SIZE) {
      return this._history.slice();
    }
    // Reorder so oldest is first
    return [
      ...this._history.slice(this._historyIdx),
      ...this._history.slice(0, this._historyIdx),
    ];
  }
}

/** Singleton profiler instance */
export const profiler = new Profiler();
