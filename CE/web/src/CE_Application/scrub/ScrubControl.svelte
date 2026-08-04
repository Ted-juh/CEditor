<script lang="ts">
  /**
   * One component, both shapes. The render mode is independent of the input
   * mapping on purpose: a rotary-looking knob can be driven by a vertical
   * drag, a bidirectional drag or true rotation without changing markup.
   *
   * Svelte 5 runes. For Svelte 4, swap $props/$derived for export let and $:.
   */
  import { dragScrub, type DragScrubParams } from './dragScrubAction';
  import { presets, type DragScrubOptions } from './dragScrub';

  interface Props extends Partial<DragScrubOptions> {
    value: number;
    onChange: (v: number) => void;
    onDragStart?: () => void;
    onDragEnd?: () => void;
    /** Visual shape. Independent of the input mapping. */
    shape?: 'linear' | 'rotary';
    label?: string;
    /** Formatted value for display and for screen readers. */
    display?: string;
    defaultValue?: number;
    pointerLock?: boolean;
    disabled?: boolean;
    /** Named entry from `presets`, applied under any explicit props. */
    preset?: keyof typeof presets;
  }

  let {
    value,
    onChange,
    onDragStart,
    onDragEnd,
    shape = 'linear',
    label = '',
    display,
    defaultValue,
    pointerLock = false,
    disabled = false,
    preset,
    ...config
  }: Props = $props();

  const params = $derived({
    ...(preset ? presets[preset] : {}),
    ...config,
    value,
    onChange,
    onDragStart,
    onDragEnd,
    defaultValue,
    pointerLock,
    disabled,
  } as DragScrubParams);

  const min = $derived(config.min ?? 0);
  const max = $derived(config.max ?? 1);
  const norm = $derived(Math.max(0, Math.min(1, (value - min) / (max - min) || 0)));
  const text = $derived(display ?? value.toFixed(2));

  // Rotary sweep: 270 degrees, gap at the bottom.
  const ARC = 270;
  const angle = $derived(-135 + norm * ARC);
  const R = 32;
  const C = 2 * Math.PI * R;
</script>

<div
  class="scrub"
  class:disabled
  role="slider"
  tabindex={disabled ? -1 : 0}
  aria-label={label || 'Value'}
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={value}
  aria-valuetext={text}
  aria-disabled={disabled}
  use:dragScrub={params}
>
  {#if shape === 'rotary'}
    <svg class="dial" viewBox="0 0 80 80" aria-hidden="true">
      <circle
        class="track"
        cx="40" cy="40" r={R}
        stroke-dasharray={`${(C * ARC) / 360} ${C}`}
        transform="rotate(135 40 40)"
      />
      <circle
        class="fill"
        cx="40" cy="40" r={R}
        stroke-dasharray={`${(C * ARC * norm) / 360} ${C}`}
        transform="rotate(135 40 40)"
      />
      <line
        class="pointer"
        x1="40" y1="40" x2="40" y2="14"
        transform={`rotate(${angle} 40 40)`}
      />
    </svg>
  {:else}
    <div class="track-linear" aria-hidden="true">
      <div class="fill-linear" style={`width: ${norm * 100}%`}></div>
      <div class="thumb" style={`left: ${norm * 100}%`}></div>
    </div>
  {/if}

  {#if label}<span class="label">{label}</span>{/if}
  <span class="value">{text}</span>
</div>

<style>
  .scrub {
    --accent: var(--scrub-accent, #7aa2f7);
    --track: var(--scrub-track, #2a2e3a);
    --text: var(--scrub-text, #c8ccd6);

    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.5rem;
    user-select: none;
    -webkit-user-select: none;
    color: var(--text);
    font: 500 11px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace;
  }

  .scrub:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 3px;
    border-radius: 4px;
  }

  .scrub.disabled {
    opacity: 0.4;
    cursor: not-allowed !important;
  }

  .dial {
    width: 72px;
    height: 72px;
    overflow: visible;
  }

  .dial circle {
    fill: none;
    stroke-width: 6;
    stroke-linecap: round;
  }

  .track { stroke: var(--track); }
  .fill { stroke: var(--accent); }

  .pointer {
    stroke: var(--text);
    stroke-width: 2.5;
    stroke-linecap: round;
  }

  .track-linear {
    position: relative;
    width: var(--scrub-width, 140px);
    height: 6px;
    border-radius: 3px;
    background: var(--track);
  }

  .fill-linear {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 3px;
    background: var(--accent);
  }

  .thumb {
    position: absolute;
    top: 50%;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: var(--text);
    transform: translate(-50%, -50%);
  }

  .label {
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.65;
  }

  .value {
    font-variant-numeric: tabular-nums;
  }

  @media (prefers-reduced-motion: no-preference) {
    .fill-linear, .thumb, .fill { transition: none; }
  }
</style>
