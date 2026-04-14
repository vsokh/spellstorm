// ═══════════════════════════════════
//   ENEMY POOL — Structure-of-Arrays
// ═══════════════════════════════════
//
// Stores enemy data in contiguous typed arrays for cache locality.
// EnemyView provides backward-compatible property access via getters/setters.

/** Minimal init shape accepted by EnemyPool.add() / push() */
export interface EnemyInit {
  id: number;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  atkTimer: number;
  target: number;
  iframes: number;
  slowTimer: number;
  stunTimer: number;
  _burnTimer: number;
  _burnTick: number;
  _burnOwner: number;
  _friendly: boolean;
  _owner: number;
  _lifespan: number;
  _spdMul: number;
  _dmgMul: number;
  _teleportTimer: number;
  _lmbHitTimer: number;
  _hitFlash: number;
  _deathTimer: number;
  _atkAnim: number;
  _dmgReductionActive: boolean;
  _dmgReductionTimer: number;
  _dmgReductionTriggered: boolean;
  _elite: boolean;
  // Network interpolation (optional)
  _targetX?: number;
  _targetY?: number;
  _prevX?: number;
  _prevY?: number;
  _lerpT?: number;
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
//          EnemyView
// ═══════════════════════════════════

/** A lightweight proxy that reads/writes a single slot in the EnemyPool's typed arrays. */
export class EnemyView {
  constructor(public _pool: EnemyPool, public _idx: number) {}

  get id() { return this._pool.id[this._idx]; }
  set id(v: number) { this._pool.id[this._idx] = v; }

  get x() { return this._pool.x[this._idx]; }
  set x(v: number) { this._pool.x[this._idx] = v; }

  get y() { return this._pool.y[this._idx]; }
  set y(v: number) { this._pool.y[this._idx] = v; }

  get vx() { return this._pool.vx[this._idx]; }
  set vx(v: number) { this._pool.vx[this._idx] = v; }

  get vy() { return this._pool.vy[this._idx]; }
  set vy(v: number) { this._pool.vy[this._idx] = v; }

  get hp() { return this._pool.hp[this._idx]; }
  set hp(v: number) { this._pool.hp[this._idx] = v; }

  get maxHp() { return this._pool.maxHp[this._idx]; }
  set maxHp(v: number) { this._pool.maxHp[this._idx] = v; }

  get atkTimer() { return this._pool.atkTimer[this._idx]; }
  set atkTimer(v: number) { this._pool.atkTimer[this._idx] = v; }

  get iframes() { return this._pool.iframes[this._idx]; }
  set iframes(v: number) { this._pool.iframes[this._idx] = v; }

  get slowTimer() { return this._pool.slowTimer[this._idx]; }
  set slowTimer(v: number) { this._pool.slowTimer[this._idx] = v; }

  get stunTimer() { return this._pool.stunTimer[this._idx]; }
  set stunTimer(v: number) { this._pool.stunTimer[this._idx] = v; }

  get target() { return this._pool.target[this._idx]; }
  set target(v: number) { this._pool.target[this._idx] = v; }

  get _burnTimer() { return this._pool._burnTimer[this._idx]; }
  set _burnTimer(v: number) { this._pool._burnTimer[this._idx] = v; }

  get _burnTick() { return this._pool._burnTick[this._idx]; }
  set _burnTick(v: number) { this._pool._burnTick[this._idx] = v; }

  get _burnOwner() { return this._pool._burnOwner[this._idx]; }
  set _burnOwner(v: number) { this._pool._burnOwner[this._idx] = v; }

  get _owner() { return this._pool._owner[this._idx]; }
  set _owner(v: number) { this._pool._owner[this._idx] = v; }

  get _lifespan() { return this._pool._lifespan[this._idx]; }
  set _lifespan(v: number) { this._pool._lifespan[this._idx] = v; }

  get _spdMul() { return this._pool._spdMul[this._idx]; }
  set _spdMul(v: number) { this._pool._spdMul[this._idx] = v; }

  get _dmgMul() { return this._pool._dmgMul[this._idx]; }
  set _dmgMul(v: number) { this._pool._dmgMul[this._idx] = v; }

  get _teleportTimer() { return this._pool._teleportTimer[this._idx]; }
  set _teleportTimer(v: number) { this._pool._teleportTimer[this._idx] = v; }

  get _lmbHitTimer() { return this._pool._lmbHitTimer[this._idx]; }
  set _lmbHitTimer(v: number) { this._pool._lmbHitTimer[this._idx] = v; }

  get _hitFlash() { return this._pool._hitFlash[this._idx]; }
  set _hitFlash(v: number) { this._pool._hitFlash[this._idx] = v; }

  get _deathTimer() { return this._pool._deathTimer[this._idx]; }
  set _deathTimer(v: number) { this._pool._deathTimer[this._idx] = v; }

  get _atkAnim() { return this._pool._atkAnim[this._idx]; }
  set _atkAnim(v: number) { this._pool._atkAnim[this._idx] = v; }

  get _dmgReductionTimer() { return this._pool._dmgReductionTimer[this._idx]; }
  set _dmgReductionTimer(v: number) { this._pool._dmgReductionTimer[this._idx] = v; }

  // Network interpolation
  get _targetX() { return this._pool._targetX[this._idx]; }
  set _targetX(v: number) { this._pool._targetX[this._idx] = v; }

  get _targetY() { return this._pool._targetY[this._idx]; }
  set _targetY(v: number) { this._pool._targetY[this._idx] = v; }

  get _prevX() { return this._pool._prevX[this._idx]; }
  set _prevX(v: number) { this._pool._prevX[this._idx] = v; }

  get _prevY() { return this._pool._prevY[this._idx]; }
  set _prevY(v: number) { this._pool._prevY[this._idx] = v; }

  get _lerpT() { return this._pool._lerpT[this._idx]; }
  set _lerpT(v: number) { this._pool._lerpT[this._idx] = v; }

  // Booleans (stored as Uint8, converted to boolean)
  get alive(): boolean { return this._pool.alive[this._idx] === 1; }
  set alive(v: boolean) { this._pool.alive[this._idx] = v ? 1 : 0; }

  get _friendly(): boolean { return this._pool._friendly[this._idx] === 1; }
  set _friendly(v: boolean) { this._pool._friendly[this._idx] = v ? 1 : 0; }

  get _elite(): boolean { return this._pool._elite[this._idx] === 1; }
  set _elite(v: boolean) { this._pool._elite[this._idx] = v ? 1 : 0; }

  get _dmgReductionActive(): boolean { return this._pool._dmgReductionActive[this._idx] === 1; }
  set _dmgReductionActive(v: boolean) { this._pool._dmgReductionActive[this._idx] = v ? 1 : 0; }

  get _dmgReductionTriggered(): boolean { return this._pool._dmgReductionTriggered[this._idx] === 1; }
  set _dmgReductionTriggered(v: boolean) { this._pool._dmgReductionTriggered[this._idx] = v ? 1 : 0; }

  // String field
  get type(): string { return this._pool.type[this._idx]; }
  set type(v: string) { this._pool.type[this._idx] = v; }
}

// ═══════════════════════════════════
//          EnemyPool
// ═══════════════════════════════════

export class EnemyPool {
  private _capacity: number;
  private _count: number = 0;
  private _freeList: number[] = [];

  // SoA typed arrays — Float32 for numeric fields
  id: Int32Array;
  x: Float32Array;
  y: Float32Array;
  vx: Float32Array;
  vy: Float32Array;
  hp: Float32Array;
  maxHp: Float32Array;
  atkTimer: Float32Array;
  iframes: Float32Array;
  slowTimer: Float32Array;
  stunTimer: Float32Array;
  target: Int32Array;
  _burnTimer: Float32Array;
  _burnTick: Float32Array;
  _burnOwner: Int32Array;
  _owner: Int32Array;
  _lifespan: Float32Array;
  _spdMul: Float32Array;
  _dmgMul: Float32Array;
  _teleportTimer: Float32Array;
  _lmbHitTimer: Float32Array;
  _hitFlash: Float32Array;
  _deathTimer: Float32Array;
  _atkAnim: Float32Array;
  _dmgReductionTimer: Float32Array;
  // Network interpolation
  _targetX: Float32Array;
  _targetY: Float32Array;
  _prevX: Float32Array;
  _prevY: Float32Array;
  _lerpT: Float32Array;

  // Uint8 for booleans (0/1)
  alive: Uint8Array;
  _friendly: Uint8Array;
  _elite: Uint8Array;
  _dmgReductionActive: Uint8Array;
  _dmgReductionTriggered: Uint8Array;

  // Regular arrays for non-numeric data
  type: string[];

  // Pre-allocated view pool (one view per slot, reused)
  private _views: (EnemyView | undefined)[];

  constructor(capacity: number = 256) {
    this._capacity = capacity;
    const c = capacity;

    // Int32
    this.id = new Int32Array(c);
    this.target = new Int32Array(c);
    this._burnOwner = new Int32Array(c);
    this._owner = new Int32Array(c);

    // Float32
    this.x = new Float32Array(c);
    this.y = new Float32Array(c);
    this.vx = new Float32Array(c);
    this.vy = new Float32Array(c);
    this.hp = new Float32Array(c);
    this.maxHp = new Float32Array(c);
    this.atkTimer = new Float32Array(c);
    this.iframes = new Float32Array(c);
    this.slowTimer = new Float32Array(c);
    this.stunTimer = new Float32Array(c);
    this._burnTimer = new Float32Array(c);
    this._burnTick = new Float32Array(c);
    this._lifespan = new Float32Array(c);
    this._spdMul = new Float32Array(c);
    this._dmgMul = new Float32Array(c);
    this._teleportTimer = new Float32Array(c);
    this._lmbHitTimer = new Float32Array(c);
    this._hitFlash = new Float32Array(c);
    this._deathTimer = new Float32Array(c);
    this._atkAnim = new Float32Array(c);
    this._dmgReductionTimer = new Float32Array(c);
    this._targetX = new Float32Array(c);
    this._targetY = new Float32Array(c);
    this._prevX = new Float32Array(c);
    this._prevY = new Float32Array(c);
    this._lerpT = new Float32Array(c);

    // Uint8 (booleans)
    this.alive = new Uint8Array(c);
    this._friendly = new Uint8Array(c);
    this._elite = new Uint8Array(c);
    this._dmgReductionActive = new Uint8Array(c);
    this._dmgReductionTriggered = new Uint8Array(c);

    // Non-typed
    this.type = new Array(c).fill('');
    this._views = [];

    // Initialize _deathTimer to -1 for all slots
    this._deathTimer.fill(-1);
    // Initialize _lerpT to 1 (no interpolation) for all slots
    this._lerpT.fill(1);
    // Initialize _spdMul and _dmgMul to 1
    this._spdMul.fill(1);
    this._dmgMul.fill(1);
  }

  /** Number of used slots (alive + dead-in-animation). Compatible with array length reads. */
  get length(): number { return this._count; }

  /** Assignment to 0 clears the pool (for backward compat with `array.length = 0`). */
  set length(n: number) { if (n === 0) this.clear(); }

  /** Add an enemy from an Enemy-like object. Returns the EnemyView. */
  add(enemy: Partial<EnemyInit> & { type: string }): EnemyView {
    let idx: number;
    if (this._freeList.length > 0) {
      idx = this._freeList.pop()!;
    } else {
      idx = this._count;
      if (idx >= this._capacity) this._grow();
      this._count++;
    }
    this._writeSlot(idx, enemy);
    return this._getView(idx);
  }

  /** Remove all enemies (used between waves, etc.) */
  clear(): void {
    this._count = 0;
    this._freeList.length = 0;
    // Reset typed arrays to defaults for re-use
    this._deathTimer.fill(-1, 0, this._capacity);
    this._lerpT.fill(1, 0, this._capacity);
    this._spdMul.fill(1, 0, this._capacity);
    this._dmgMul.fill(1, 0, this._capacity);
    this.alive.fill(0, 0, this._capacity);
  }

  /** Iterate over all enemies (yields EnemyView). */
  *[Symbol.iterator](): Generator<EnemyView> {
    for (let i = 0; i < this._count; i++) {
      yield this._getView(i);
    }
  }

  /** Get view at index (for indexed access like pool[i] replacement). */
  at(idx: number): EnemyView {
    return this._getView(idx);
  }

  /** Array-compatible filter method */
  filter(pred: (e: EnemyView) => boolean): EnemyView[] {
    const result: EnemyView[] = [];
    for (let i = 0; i < this._count; i++) {
      const v = this._getView(i);
      if (pred(v)) result.push(v);
    }
    return result;
  }

  /** Array-compatible find method */
  find(pred: (e: EnemyView) => boolean): EnemyView | undefined {
    for (let i = 0; i < this._count; i++) {
      const v = this._getView(i);
      if (pred(v)) return v;
    }
    return undefined;
  }

  /** Array-compatible map method */
  map<T>(fn: (e: EnemyView) => T): T[] {
    const result: T[] = [];
    for (let i = 0; i < this._count; i++) {
      result.push(fn(this._getView(i)));
    }
    return result;
  }

  /** For compatibility with `state.enemies.push({...})` */
  push(...enemies: any[]): number {
    for (const e of enemies) this.add(e);
    return this._count;
  }

  // ── Private helpers ──

  private _getView(idx: number): EnemyView {
    if (!this._views[idx]) {
      this._views[idx] = new EnemyView(this, idx);
    }
    return this._views[idx]!;
  }

  private _writeSlot(idx: number, e: Partial<EnemyInit> & { type: string }): void {
    this.id[idx] = e.id ?? 0;
    this.type[idx] = e.type;
    this.x[idx] = e.x ?? 0;
    this.y[idx] = e.y ?? 0;
    this.vx[idx] = e.vx ?? 0;
    this.vy[idx] = e.vy ?? 0;
    this.hp[idx] = e.hp ?? 1;
    this.maxHp[idx] = e.maxHp ?? 1;
    this.alive[idx] = e.alive !== undefined ? (e.alive ? 1 : 0) : 1;
    this.atkTimer[idx] = e.atkTimer ?? 0;
    this.target[idx] = e.target ?? 0;
    this.iframes[idx] = e.iframes ?? 0;
    this.slowTimer[idx] = e.slowTimer ?? 0;
    this.stunTimer[idx] = e.stunTimer ?? 0;
    this._burnTimer[idx] = e._burnTimer ?? 0;
    this._burnTick[idx] = e._burnTick ?? 0;
    this._burnOwner[idx] = e._burnOwner ?? 0;
    this._friendly[idx] = e._friendly ? 1 : 0;
    this._owner[idx] = e._owner ?? 0;
    this._lifespan[idx] = e._lifespan ?? 0;
    this._spdMul[idx] = e._spdMul ?? 1;
    this._dmgMul[idx] = e._dmgMul ?? 1;
    this._teleportTimer[idx] = e._teleportTimer ?? 0;
    this._lmbHitTimer[idx] = e._lmbHitTimer ?? 0;
    this._hitFlash[idx] = e._hitFlash ?? 0;
    this._deathTimer[idx] = e._deathTimer ?? -1;
    this._atkAnim[idx] = e._atkAnim ?? 0;
    this._elite[idx] = e._elite ? 1 : 0;
    this._dmgReductionActive[idx] = e._dmgReductionActive ? 1 : 0;
    this._dmgReductionTimer[idx] = e._dmgReductionTimer ?? 0;
    this._dmgReductionTriggered[idx] = e._dmgReductionTriggered ? 1 : 0;
    // Network interpolation
    this._targetX[idx] = e._targetX ?? 0;
    this._targetY[idx] = e._targetY ?? 0;
    this._prevX[idx] = e._prevX ?? 0;
    this._prevY[idx] = e._prevY ?? 0;
    this._lerpT[idx] = e._lerpT ?? 1;
  }

  /** Grow capacity by doubling */
  private _grow(): void {
    const newCap = this._capacity * 2;

    // Int32
    this.id = growInt32(this.id, newCap);
    this.target = growInt32(this.target, newCap);
    this._burnOwner = growInt32(this._burnOwner, newCap);
    this._owner = growInt32(this._owner, newCap);

    // Float32
    this.x = growFloat32(this.x, newCap);
    this.y = growFloat32(this.y, newCap);
    this.vx = growFloat32(this.vx, newCap);
    this.vy = growFloat32(this.vy, newCap);
    this.hp = growFloat32(this.hp, newCap);
    this.maxHp = growFloat32(this.maxHp, newCap);
    this.atkTimer = growFloat32(this.atkTimer, newCap);
    this.iframes = growFloat32(this.iframes, newCap);
    this.slowTimer = growFloat32(this.slowTimer, newCap);
    this.stunTimer = growFloat32(this.stunTimer, newCap);
    this._burnTimer = growFloat32(this._burnTimer, newCap);
    this._burnTick = growFloat32(this._burnTick, newCap);
    this._lifespan = growFloat32(this._lifespan, newCap);
    this._spdMul = growFloat32(this._spdMul, newCap);
    this._dmgMul = growFloat32(this._dmgMul, newCap);
    this._teleportTimer = growFloat32(this._teleportTimer, newCap);
    this._lmbHitTimer = growFloat32(this._lmbHitTimer, newCap);
    this._hitFlash = growFloat32(this._hitFlash, newCap);
    const newDt = growFloat32(this._deathTimer, newCap);
    // Fill new slots with -1 default
    newDt.fill(-1, this._capacity);
    this._deathTimer = newDt;
    this._atkAnim = growFloat32(this._atkAnim, newCap);
    this._dmgReductionTimer = growFloat32(this._dmgReductionTimer, newCap);
    this._targetX = growFloat32(this._targetX, newCap);
    this._targetY = growFloat32(this._targetY, newCap);
    this._prevX = growFloat32(this._prevX, newCap);
    this._prevY = growFloat32(this._prevY, newCap);
    const newLerpT = growFloat32(this._lerpT, newCap);
    newLerpT.fill(1, this._capacity);
    this._lerpT = newLerpT;

    // Uint8
    this.alive = growUint8(this.alive, newCap);
    this._friendly = growUint8(this._friendly, newCap);
    this._elite = growUint8(this._elite, newCap);
    this._dmgReductionActive = growUint8(this._dmgReductionActive, newCap);
    this._dmgReductionTriggered = growUint8(this._dmgReductionTriggered, newCap);

    // _spdMul / _dmgMul new slots default to 1
    this._spdMul.fill(1, this._capacity);
    this._dmgMul.fill(1, this._capacity);

    // type array: extend
    while (this.type.length < newCap) this.type.push('');

    // Update view pool references (views point to `this`, so they auto-see new arrays)
    // But we need to extend the views array capacity
    // Views are created lazily, no need to extend.

    this._capacity = newCap;
  }
}
