/**
 * dragScrub — pointer-drag value scrubbing for continuous and stepped controls.
 *
 * Pure logic: no DOM, no Svelte, no JUCE. Feed it pointer samples, it hands
 * back values. Works in normalised space (0..1 by default) so it drops
 * straight into a JUCE WebSliderRelay without a conversion layer.
 */

export type Axis = 'x' | 'y' | 'both' | 'radial' | 'rotary';
export type Combine = 'sum' | 'projected' | 'magnitude';
export type Tracking = 'absolute' | 'relative';

export interface DragScrubOptions {
  /** Which pointer motion feeds the value. */
  axis: Axis;
  /** Default: right increases. */
  invertX: boolean;
  /** Default: up increases. */
  invertY: boolean;
  /** How x and y are merged into one number. Only used when axis = 'both'. */
  combine: Combine;
  weightX: number;
  weightY: number;
  /** 'absolute' maps pointer position onto the track. 'relative' accumulates deltas. */
  tracking: Tracking;
  /** Value units per pixel of effective motion. */
  sensitivity: number;
  /** Ignore the first N px so a click doesn't nudge the value. */
  deadZone: number;
  /** Let the first few px of travel choose x or y, then commit to it. */
  autoLock: boolean;
  autoLockThreshold: number;
  /** Modifier multipliers. */
  fineFactor: number;
  coarseFactor: number;
  /**
   * Direction treated as "increase" for 'projected' and 'magnitude', in radians.
   * 0 = right, Math.PI / 2 = up. Default is 45 deg up-right.
   */
  increaseAngle: number;
  /** Rotary: pixels-equivalent produced by one full revolution. */
  pixelsPerTurn: number;
  /** 0 = continuous. Otherwise the quantisation interval in value units. */
  step: number;
  /** 0..0.5 — extra travel required to leave the current step. */
  hysteresis: number;
  /** Pixels-equivalent per wheel notch. */
  wheelPixels: number;
  min: number;
  max: number;
}

export interface PointerSample {
  /** CSS pixels, page or client space — just be consistent. */
  x: number;
  y: number;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface BeginContext {
  /** Element bounds. Required for 'absolute' tracking and for radial/rotary anchoring. */
  bounds?: Rect;
  /** Jump the value to the pointer on press. Only meaningful for absolute tracking. */
  jumpToPointer?: boolean;
}

export const defaultOptions: DragScrubOptions = {
  axis: 'x',
  invertX: false,
  invertY: false,
  combine: 'projected',
  weightX: 1,
  weightY: 1,
  tracking: 'relative',
  sensitivity: 1 / 200, // 200 px covers the full 0..1 range
  deadZone: 2,
  autoLock: false,
  autoLockThreshold: 4,
  fineFactor: 0.1,
  coarseFactor: 5,
  increaseAngle: Math.PI / 4,
  pixelsPerTurn: 400,
  step: 0,
  hysteresis: 0.15,
  wheelPixels: 12,
  min: 0,
  max: 1,
};

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

interface DragState {
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  centerX: number;
  centerY: number;
  bounds?: Rect;
  travel: number;
  engaged: boolean;
  lockedAxis: 'x' | 'y' | null;
  lockTravelX: number;
  lockTravelY: number;
  lastAngle: number;
  lastRadius: number;
}

export class DragScrub {
  readonly options: DragScrubOptions;

  /** Continuous value, before quantisation. Stepped controls keep this sub-step. */
  private raw: number;
  /** Value actually handed out. Equals raw when step = 0. */
  private emitted: number;
  private drag: DragState | null = null;

  constructor(options: Partial<DragScrubOptions> = {}, initialValue = 0) {
    this.options = { ...defaultOptions, ...options };
    this.raw = clamp(initialValue, this.options.min, this.options.max);
    this.emitted = this.raw;
  }

  get value(): number {
    return this.emitted;
  }

  get isDragging(): boolean {
    return this.drag !== null;
  }

  /** Sync from an external source (host automation, undo, another view). */
  setValue(v: number): void {
    this.raw = clamp(v, this.options.min, this.options.max);
    this.emitted = this.raw;
  }

  /**
   * Start a gesture. Returns a value if the press itself changed it
   * (absolute tracking with jumpToPointer), otherwise null.
   */
  begin(sample: PointerSample, ctx: BeginContext = {}): number | null {
    const b = ctx.bounds;
    this.drag = {
      startX: sample.x,
      startY: sample.y,
      lastX: sample.x,
      lastY: sample.y,
      centerX: b ? b.left + b.width / 2 : sample.x,
      centerY: b ? b.top + b.height / 2 : sample.y,
      bounds: b,
      travel: 0,
      engaged: this.options.deadZone <= 0,
      lockedAxis: null,
      lockTravelX: 0,
      lockTravelY: 0,
      lastAngle: 0,
      lastRadius: 0,
    };

    const d = this.drag;
    d.lastAngle = Math.atan2(d.centerY - sample.y, sample.x - d.centerX);
    d.lastRadius = Math.hypot(sample.x - d.centerX, sample.y - d.centerY);

    if (this.options.tracking === 'absolute' && b && ctx.jumpToPointer) {
      d.engaged = true;
      return this.commit(this.absoluteValue(sample, b));
    }
    return null;
  }

  /** Feed a move. Returns the new value, or null if nothing changed. */
  move(sample: PointerSample): number | null {
    const d = this.drag;
    if (!d) return null;
    const o = this.options;

    if (o.tracking === 'absolute' && d.bounds) {
      const next = this.absoluteValue(sample, d.bounds);
      d.lastX = sample.x;
      d.lastY = sample.y;
      return next === this.emitted ? null : this.commit(next);
    }

    // Screen y grows downward; flip once, here, so everything below is in
    // human terms: positive uy means the pointer moved up.
    let dx = (sample.x - d.lastX) * (o.invertX ? -1 : 1);
    let uy = (d.lastY - sample.y) * (o.invertY ? -1 : 1);

    const segment = Math.hypot(sample.x - d.lastX, sample.y - d.lastY);
    d.travel += segment;
    d.lockTravelX += Math.abs(dx);
    d.lockTravelY += Math.abs(uy);

    if (!d.engaged) {
      if (d.travel < o.deadZone) {
        d.lastX = sample.x;
        d.lastY = sample.y;
        return null;
      }
      // Crossing the dead zone: apply only the part of this move that lies
      // beyond it. Discarding the whole segment would swallow a fast flick.
      d.engaged = true;
      const scale = segment > 0 ? Math.min(1, (d.travel - o.deadZone) / segment) : 0;
      const crossX = d.lastX + (sample.x - d.lastX) * (1 - scale);
      const crossY = d.lastY + (sample.y - d.lastY) * (1 - scale);
      d.lastAngle = Math.atan2(d.centerY - crossY, crossX - d.centerX);
      d.lastRadius = Math.hypot(crossX - d.centerX, crossY - d.centerY);
      dx *= scale;
      uy *= scale;
    }

    if (o.autoLock && !d.lockedAxis && (o.axis === 'both' || o.axis === 'x' || o.axis === 'y')) {
      if (Math.max(d.lockTravelX, d.lockTravelY) >= o.autoLockThreshold) {
        d.lockedAxis = d.lockTravelX >= d.lockTravelY ? 'x' : 'y';
      }
    }

    const pixels = this.effectivePixels(dx, uy, sample, d);

    d.lastX = sample.x;
    d.lastY = sample.y;

    if (pixels === 0) return null;

    const next = clamp(
      this.raw + pixels * o.sensitivity * this.modifier(sample),
      o.min,
      o.max
    );
    const before = this.emitted;
    const after = this.commit(next);
    return after === before ? null : after;
  }

  end(): void {
    this.drag = null;
  }

  /** Wheel scrubbing. deltaY is the raw browser value; sign is normalised here. */
  wheel(deltaY: number, sample: Partial<PointerSample> = {}): number | null {
    const o = this.options;
    const notches = -Math.sign(deltaY);
    const pixels = notches * o.wheelPixels * (o.invertY ? -1 : 1);
    const next = clamp(this.raw + pixels * o.sensitivity * this.modifier(sample), o.min, o.max);
    const before = this.emitted;
    const after = this.commit(next);
    return after === before ? null : after;
  }

  // ---- internals -------------------------------------------------------

  /** Collapse pointer motion into a single signed pixel count. */
  private effectivePixels(dx: number, uy: number, sample: PointerSample, d: DragState): number {
    const o = this.options;
    const axis = d.lockedAxis ?? o.axis;

    switch (axis) {
      case 'x':
        return dx * o.weightX;

      case 'y':
        return uy * o.weightY;

      case 'both': {
        const vx = dx * o.weightX;
        const vy = uy * o.weightY;
        const ux = Math.cos(o.increaseAngle);
        const uyDir = Math.sin(o.increaseAngle);

        if (o.combine === 'sum') {
          // Diagonal moves at double rate; the opposing diagonal cancels to zero.
          return vx + vy;
        }
        const projection = vx * ux + vy * uyDir;
        if (o.combine === 'projected') {
          // Never exceeds the pixels actually travelled. Predictable.
          return projection;
        }
        // 'magnitude': every pixel counts regardless of direction.
        return Math.sign(projection) * Math.hypot(vx, vy);
      }

      case 'radial': {
        const r = Math.hypot(sample.x - d.centerX, sample.y - d.centerY);
        const delta = r - d.lastRadius;
        d.lastRadius = r;
        return delta * (o.invertY ? -1 : 1);
      }

      case 'rotary': {
        const a = Math.atan2(d.centerY - sample.y, sample.x - d.centerX);
        let delta = a - d.lastAngle;
        // Unwrap across the +/-PI seam so a full turn doesn't snap backwards.
        if (delta > Math.PI) delta -= 2 * Math.PI;
        else if (delta < -Math.PI) delta += 2 * Math.PI;
        d.lastAngle = a;
        return (delta / (2 * Math.PI)) * o.pixelsPerTurn * (o.invertX ? -1 : 1);
      }
    }
  }

  private modifier(sample: Partial<PointerSample>): number {
    const o = this.options;
    if (sample.shiftKey) return o.fineFactor;
    if (sample.ctrlKey || sample.metaKey) return o.coarseFactor;
    return 1;
  }

  private absoluteValue(sample: PointerSample, b: Rect): number {
    const o = this.options;
    const span = o.max - o.min;
    let t: number;
    if (o.axis === 'y') {
      t = 1 - (sample.y - b.top) / b.height;
      if (o.invertY) t = 1 - t;
    } else {
      t = (sample.x - b.left) / b.width;
      if (o.invertX) t = 1 - t;
    }
    return clamp(o.min + t * span, o.min, o.max);
  }

  /**
   * Store the continuous value and derive the emitted one. Stepped controls
   * need extra travel past the midpoint before flipping, or they chatter
   * between two steps when the pointer sits on the boundary.
   */
  private commit(next: number): number {
    const o = this.options;
    this.raw = next;

    if (o.step <= 0) {
      this.emitted = next;
      return next;
    }

    const currentIdx = Math.round(this.emitted / o.step);
    const targetIdx = Math.round(next / o.step);

    if (targetIdx !== currentIdx) {
      const dir = targetIdx > currentIdx ? 1 : -1;
      const boundary = (currentIdx + dir * (0.5 + o.hysteresis)) * o.step;
      const crossed = dir > 0 ? next >= boundary : next <= boundary;
      if (crossed) {
        this.emitted = clamp(targetIdx * o.step, o.min, o.max);
      }
    }
    return this.emitted;
  }
}

/**
 * Per-widget starting points. Each widget type ships one of these; the config
 * panel only needs to expose direction, invert and sensitivity on top.
 */
export const presets: Record<string, Partial<DragScrubOptions>> = {
  /** Classic horizontal slider — pointer position maps onto the track. */
  linearHorizontal: { axis: 'x', tracking: 'absolute' },

  /** Vertical fader. */
  linearVertical: { axis: 'y', tracking: 'absolute' },

  /** Plugin-style knob: vertical drag, no track to map onto. */
  knob: { axis: 'y', tracking: 'relative', sensitivity: 1 / 250, deadZone: 2 },

  /** Bidirectional knob — up and right both open it up. */
  knobBidirectional: {
    axis: 'both',
    combine: 'projected',
    tracking: 'relative',
    sensitivity: 1 / 250,
  },

  /** Every pixel of motion counts, in any direction. Fast, coarse. */
  knobFreeform: {
    axis: 'both',
    combine: 'magnitude',
    tracking: 'relative',
    sensitivity: 1 / 300,
  },

  /** Continuous rotation — unbounded range in a small footprint. */
  rotary: { axis: 'rotary', tracking: 'relative', pixelsPerTurn: 400, sensitivity: 1 / 400 },

  /** Drag-scrub a number field. Horizontal, no track. */
  numberField: { axis: 'x', tracking: 'relative', sensitivity: 1 / 300, deadZone: 3 },

  /** Stepped reorder / sort handle. */
  reorderHandle: {
    axis: 'y',
    tracking: 'relative',
    autoLock: true,
    step: 1,
    hysteresis: 0.2,
    sensitivity: 1 / 24, // one step per 24 px
    min: 0,
    max: Number.MAX_SAFE_INTEGER,
  },

  /** Splitter — axis fixed by orientation, nothing to configure. */
  splitterHorizontal: { axis: 'x', tracking: 'absolute', deadZone: 0 },
};
