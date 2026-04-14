// ═══════════════════════════════════
//   SPELL POOL — Structure-of-Arrays
// ═══════════════════════════════════
//
// Stores spell data in contiguous typed arrays for cache locality.
// SpellView provides backward-compatible property access via getters/setters.
// Uses swap-and-pop release instead of splice for O(1) removal.

/** Minimal init shape accepted by SpellPool.add() / push() */
export interface SpellInit {
  type: string;
  dmg: number;
  speed: number;
  radius: number;
  life: number;
  color: string;
  trail: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  owner: number;
  age: number;
  zapTimer: number;
  pierceLeft: number;
  homing: number;
  zap: number;
  zapRate: number;
  slow: number;
  drain: number;
  explode: number;
  burn: number;
  stun: number;
  clsKey: string;
  _reversed: boolean;
  _bounces: number;
  _slot: number;
}

// ── Typed-array helpers ──

function growFloat32(old: Float32Array, newCap: number): Float32Array {
  const a = new Float32Array(newCap);
  a.set(old);
  return a;
}

function growInt32(old: Int32Array, newCap: number): Int32Array {
  const a = new Int32Array(newCap);
  a.set(old);
  return a;
}

function growUint8(old: Uint8Array, newCap: number): Uint8Array {
  const a = new Uint8Array(newCap);
  a.set(old);
  return a;
}

// ═══════════════════════════════════
//          SpellView
// ═══════════════════════════════════

/** A lightweight proxy that reads/writes a single slot in the SpellPool's typed arrays. */
export class SpellView {
  constructor(public _pool: SpellPool, public _idx: number) {}

  // String fields
  get type(): string { return this._pool.type[this._idx]; }
  set type(v: string) { this._pool.type[this._idx] = v; }

  get color(): string { return this._pool.color[this._idx]; }
  set color(v: string) { this._pool.color[this._idx] = v; }

  get trail(): string { return this._pool.trail[this._idx]; }
  set trail(v: string) { this._pool.trail[this._idx] = v; }

  get clsKey(): string { return this._pool.clsKey[this._idx]; }
  set clsKey(v: string) { this._pool.clsKey[this._idx] = v; }

  // Float32 fields
  get dmg(): number { return this._pool.dmg[this._idx]; }
  set dmg(v: number) { this._pool.dmg[this._idx] = v; }

  get speed(): number { return this._pool.speed[this._idx]; }
  set speed(v: number) { this._pool.speed[this._idx] = v; }

  get radius(): number { return this._pool.radius[this._idx]; }
  set radius(v: number) { this._pool.radius[this._idx] = v; }

  get life(): number { return this._pool.life[this._idx]; }
  set life(v: number) { this._pool.life[this._idx] = v; }

  get x(): number { return this._pool.x[this._idx]; }
  set x(v: number) { this._pool.x[this._idx] = v; }

  get y(): number { return this._pool.y[this._idx]; }
  set y(v: number) { this._pool.y[this._idx] = v; }

  get vx(): number { return this._pool.vx[this._idx]; }
  set vx(v: number) { this._pool.vx[this._idx] = v; }

  get vy(): number { return this._pool.vy[this._idx]; }
  set vy(v: number) { this._pool.vy[this._idx] = v; }

  get age(): number { return this._pool.age[this._idx]; }
  set age(v: number) { this._pool.age[this._idx] = v; }

  get zapTimer(): number { return this._pool.zapTimer[this._idx]; }
  set zapTimer(v: number) { this._pool.zapTimer[this._idx] = v; }

  get pierceLeft(): number { return this._pool.pierceLeft[this._idx]; }
  set pierceLeft(v: number) { this._pool.pierceLeft[this._idx] = v; }

  get homing(): number { return this._pool.homing[this._idx]; }
  set homing(v: number) { this._pool.homing[this._idx] = v; }

  get zap(): number { return this._pool.zap[this._idx]; }
  set zap(v: number) { this._pool.zap[this._idx] = v; }

  get zapRate(): number { return this._pool.zapRate[this._idx]; }
  set zapRate(v: number) { this._pool.zapRate[this._idx] = v; }

  get slow(): number { return this._pool.slow[this._idx]; }
  set slow(v: number) { this._pool.slow[this._idx] = v; }

  get drain(): number { return this._pool.drain[this._idx]; }
  set drain(v: number) { this._pool.drain[this._idx] = v; }

  get explode(): number { return this._pool.explode[this._idx]; }
  set explode(v: number) { this._pool.explode[this._idx] = v; }

  get burn(): number { return this._pool.burn[this._idx]; }
  set burn(v: number) { this._pool.burn[this._idx] = v; }

  get stun(): number { return this._pool.stun[this._idx]; }
  set stun(v: number) { this._pool.stun[this._idx] = v; }

  // Int32 fields
  get owner(): number { return this._pool.owner[this._idx]; }
  set owner(v: number) { this._pool.owner[this._idx] = v; }

  get _bounces(): number { return this._pool._bounces[this._idx]; }
  set _bounces(v: number) { this._pool._bounces[this._idx] = v; }

  get _slot(): number { return this._pool._slot[this._idx]; }
  set _slot(v: number) { this._pool._slot[this._idx] = v; }

  // Uint8 (boolean) fields
  get _reversed(): boolean { return this._pool._reversed[this._idx] === 1; }
  set _reversed(v: boolean) { this._pool._reversed[this._idx] = v ? 1 : 0; }
}

// ═══════════════════════════════════
//          SpellPool
// ═══════════════════════════════════

export class SpellPool {
  private _capacity: number;
  private _count: number = 0;

  // SoA typed arrays — Float32 for numeric fields
  dmg: Float32Array;
  speed: Float32Array;
  radius: Float32Array;
  life: Float32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  age: Float32Array;
  zapTimer: Float32Array;
  pierceLeft: Float32Array;
  homing: Float32Array;
  zap: Float32Array;
  zapRate: Float32Array;
  slow: Float32Array;
  drain: Float32Array;
  explode: Float32Array;
  burn: Float32Array;
  stun: Float32Array;

  // Int32 fields
  owner: Int32Array;
  _bounces: Int32Array;
  _slot: Int32Array;

  // Uint8 (boolean) fields
  _reversed: Uint8Array;

  // Regular arrays for string data
  type: string[];
  color: string[];
  trail: string[];
  clsKey: string[];

  // Pre-allocated view pool
  private _views: (SpellView | undefined)[];

  constructor(capacity: number = 128) {
    this._capacity = capacity;
    const c = capacity;

    // Float32
    this.dmg = new Float32Array(c);
    this.speed = new Float32Array(c);
    this.radius = new Float32Array(c);
    this.life = new Float32Array(c);
    this.x = new Float32Array(c);
    this.y = new Float32Array(c);
    this.vx = new Float32Array(c);
    this.vy = new Float32Array(c);
    this.age = new Float32Array(c);
    this.zapTimer = new Float32Array(c);
    this.pierceLeft = new Float32Array(c);
    this.homing = new Float32Array(c);
    this.zap = new Float32Array(c);
    this.zapRate = new Float32Array(c);
    this.slow = new Float32Array(c);
    this.drain = new Float32Array(c);
    this.explode = new Float32Array(c);
    this.burn = new Float32Array(c);
    this.stun = new Float32Array(c);

    // Int32
    this.owner = new Int32Array(c);
    this._bounces = new Int32Array(c);
    this._slot = new Int32Array(c);

    // Uint8
    this._reversed = new Uint8Array(c);

    // String arrays
    this.type = new Array(c).fill('');
    this.color = new Array(c).fill('');
    this.trail = new Array(c).fill('');
    this.clsKey = new Array(c).fill('');

    this._views = [];
  }

  /** Number of active spells. Compatible with array length reads. */
  get length(): number { return this._count; }

  /** Assignment to 0 clears the pool (for backward compat with `array.length = 0`). */
  set length(n: number) { if (n === 0) this.clear(); }

  /** Add a spell from a Spell-like object. Returns the SpellView. */
  add(spell: Partial<SpellInit> & { type: string }): SpellView {
    let idx = this._count;
    if (idx >= this._capacity) this._grow();
    this._count++;
    this._writeSlot(idx, spell);
    return this._getView(idx);
  }

  /** Release slot at index using swap-and-pop pattern. */
  release(idx: number): void {
    const last = this._count - 1;
    if (idx < last) {
      // Copy data from last slot to released slot
      // Float32
      this.dmg[idx] = this.dmg[last];
      this.speed[idx] = this.speed[last];
      this.radius[idx] = this.radius[last];
      this.life[idx] = this.life[last];
      this.x[idx] = this.x[last];
      this.y[idx] = this.y[last];
      this.vx[idx] = this.vx[last];
      this.vy[idx] = this.vy[last];
      this.age[idx] = this.age[last];
      this.zapTimer[idx] = this.zapTimer[last];
      this.pierceLeft[idx] = this.pierceLeft[last];
      this.homing[idx] = this.homing[last];
      this.zap[idx] = this.zap[last];
      this.zapRate[idx] = this.zapRate[last];
      this.slow[idx] = this.slow[last];
      this.drain[idx] = this.drain[last];
      this.explode[idx] = this.explode[last];
      this.burn[idx] = this.burn[last];
      this.stun[idx] = this.stun[last];
      // Int32
      this.owner[idx] = this.owner[last];
      this._bounces[idx] = this._bounces[last];
      this._slot[idx] = this._slot[last];
      // Uint8
      this._reversed[idx] = this._reversed[last];
      // Strings
      this.type[idx] = this.type[last];
      this.color[idx] = this.color[last];
      this.trail[idx] = this.trail[last];
      this.clsKey[idx] = this.clsKey[last];
    }
    this._count--;
  }

  /** Remove all spells */
  clear(): void {
    this._count = 0;
  }

  /** Iterate over all active spells (yields SpellView). */
  *[Symbol.iterator](): Generator<SpellView> {
    for (let i = 0; i < this._count; i++) {
      yield this._getView(i);
    }
  }

  /** Get view at index. */
  at(idx: number): SpellView {
    return this._getView(idx);
  }

  /** Array-compatible filter method */
  filter(pred: (s: SpellView) => boolean): SpellView[] {
    const result: SpellView[] = [];
    for (let i = 0; i < this._count; i++) {
      const v = this._getView(i);
      if (pred(v)) result.push(v);
    }
    return result;
  }

  /** Array-compatible find method */
  find(pred: (s: SpellView) => boolean): SpellView | undefined {
    for (let i = 0; i < this._count; i++) {
      const v = this._getView(i);
      if (pred(v)) return v;
    }
    return undefined;
  }

  /** For compatibility with `state.spells.push({...})` */
  push(...spells: any[]): number {
    for (const s of spells) this.add(s);
    return this._count;
  }

  // ── Private helpers ──

  private _getView(idx: number): SpellView {
    if (!this._views[idx]) {
      this._views[idx] = new SpellView(this, idx);
    }
    return this._views[idx]!;
  }

  private _writeSlot(idx: number, s: Partial<SpellInit> & { type: string }): void {
    // String fields
    this.type[idx] = s.type;
    this.color[idx] = s.color ?? '';
    this.trail[idx] = s.trail ?? '';
    this.clsKey[idx] = s.clsKey ?? '';
    // Float32 fields
    this.dmg[idx] = s.dmg ?? 0;
    this.speed[idx] = s.speed ?? 0;
    this.radius[idx] = s.radius ?? 0;
    this.life[idx] = s.life ?? 0;
    this.x[idx] = s.x ?? 0;
    this.y[idx] = s.y ?? 0;
    this.vx[idx] = s.vx ?? 0;
    this.vy[idx] = s.vy ?? 0;
    this.age[idx] = s.age ?? 0;
    this.zapTimer[idx] = s.zapTimer ?? 0;
    this.pierceLeft[idx] = s.pierceLeft ?? 0;
    this.homing[idx] = s.homing ?? 0;
    this.zap[idx] = s.zap ?? 0;
    this.zapRate[idx] = s.zapRate ?? 0;
    this.slow[idx] = s.slow ?? 0;
    this.drain[idx] = s.drain ?? 0;
    this.explode[idx] = s.explode ?? 0;
    this.burn[idx] = s.burn ?? 0;
    this.stun[idx] = s.stun ?? 0;
    // Int32 fields
    this.owner[idx] = s.owner ?? 0;
    this._bounces[idx] = s._bounces ?? 0;
    this._slot[idx] = s._slot ?? 0;
    // Uint8 (boolean) fields
    this._reversed[idx] = s._reversed ? 1 : 0;
  }

  /** Grow capacity by doubling */
  private _grow(): void {
    const newCap = this._capacity * 2;

    // Float32
    this.dmg = growFloat32(this.dmg, newCap);
    this.speed = growFloat32(this.speed, newCap);
    this.radius = growFloat32(this.radius, newCap);
    this.life = growFloat32(this.life, newCap);
    this.x = growFloat32(this.x, newCap);
    this.y = growFloat32(this.y, newCap);
    this.vx = growFloat32(this.vx, newCap);
    this.vy = growFloat32(this.vy, newCap);
    this.age = growFloat32(this.age, newCap);
    this.zapTimer = growFloat32(this.zapTimer, newCap);
    this.pierceLeft = growFloat32(this.pierceLeft, newCap);
    this.homing = growFloat32(this.homing, newCap);
    this.zap = growFloat32(this.zap, newCap);
    this.zapRate = growFloat32(this.zapRate, newCap);
    this.slow = growFloat32(this.slow, newCap);
    this.drain = growFloat32(this.drain, newCap);
    this.explode = growFloat32(this.explode, newCap);
    this.burn = growFloat32(this.burn, newCap);
    this.stun = growFloat32(this.stun, newCap);

    // Int32
    this.owner = growInt32(this.owner, newCap);
    this._bounces = growInt32(this._bounces, newCap);
    this._slot = growInt32(this._slot, newCap);

    // Uint8
    this._reversed = growUint8(this._reversed, newCap);

    // String arrays
    while (this.type.length < newCap) this.type.push('');
    while (this.color.length < newCap) this.color.push('');
    while (this.trail.length < newCap) this.trail.push('');
    while (this.clsKey.length < newCap) this.clsKey.push('');

    this._capacity = newCap;
  }
}
