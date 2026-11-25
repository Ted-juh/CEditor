<script>
  /**
   * A library card's preview (utils/effectPreview.js): an effect on a small stand-in of what it plays
   * on, through the engines a control plays it through. It plays while `active` (its card pointed at
   * or focused), again after a rest, and is still otherwise; with reduced motion it stays still.
   *
   * `delay` starts it that long after each play begins and `period`, where given, is one play's
   * length: a scene preset's stand-ins all play on the preset's clock, each at its own start.
   */
  import { onDestroy, untrack } from 'svelte';
  import { previewOf, previewKind, PREVIEW_VALUE, PREVIEW_WORD } from '../../utils/effectPreview.js';
  import { valueEffectAt } from '../../utils/valueDrawn.js';

  let { entry = null, active = false, delay = 0, period = null, small = false } = $props();

  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let kind = $derived(previewKind(entry));
  // What it is at rest (which layers it has), and the play while it plays: a new phase each time.
  let still = $derived(previewOf(entry, { delay }));
  let phase = $state('a');
  let playing = $state(false);
  let shown = $derived(playing ? previewOf(entry, { phase, delay }) : null);
  let ring = $state(PREVIEW_VALUE);

  let timer = null;
  let frame = null;
  let began = 0;
  function stop() {
    clearTimeout(timer);
    timer = null;
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    frame = null;
  }
  $effect(() => {
    const on = active && !reduced && kind !== 'none';
    const every = Math.max(300, Number(period) || still.period || 0);
    untrack(() => {
      stop();
      playing = on;
      ring = PREVIEW_VALUE;
      if (!on) return;
      const again = () => {
        phase = phase === 'a' ? 'b' : 'a';
        began = performance.now();
        timer = setTimeout(again, every);
      };
      again();
      if (kind !== 'ring' || typeof requestAnimationFrame !== 'function') return;
      const step = (now) => {
        ring = valueEffectAt(entry.effect, (now - began - still.delay) / still.length, PREVIEW_VALUE);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    });
  });
  onDestroy(stop);

  // A knob's ring: 270 degrees of a circle from the bottom left, as pathLength 100.
  const SWEEP = 75;
</script>

<span class="pv" class:small aria-hidden="true" data-preview={kind} data-playing={playing ? '' : undefined}>
  {#if shown?.rules}{@html `<style>${shown.rules}</style>`}{/if}
  {#if kind === 'box'}
    <span class="box" style={shown?.box}>
      <span class="fill" class:grad={still.gradient} style={shown?.fill}></span>
      {#if still.image}<span class="img" style={shown?.image}></span>{/if}
      <span class="w" style={shown?.word}>Aa</span>
    </span>
  {:else if kind === 'word'}
    <span class="word">{#if shown}{#each shown.pieces as piece, i (i)}<span style={piece.style}>{piece.text}</span>{/each}{:else}{PREVIEW_WORD}{/if}</span>
  {:else if kind === 'pattern'}
    <span class="frame"><span class="stripes" style={shown?.pattern}></span></span>
  {:else if kind === 'ring'}
    <svg viewBox="0 0 24 24" class="ring">
      <circle cx="12" cy="12" r="9" pathLength="100" stroke-dasharray={`${SWEEP} 100`} transform="rotate(135 12 12)" class="track" />
      <circle cx="12" cy="12" r="9" pathLength="100" stroke-dasharray={`${(SWEEP * Math.max(0, Math.min(1, ring))).toFixed(2)} 100`} transform="rotate(135 12 12)" class="value" data-ring-value={ring.toFixed(3)} />
    </svg>
  {/if}
</span>

<style>
  .pv {
    position: relative; flex: 0 0 auto; display: inline-flex; align-items: center; justify-content: center;
    width: 46px; height: 26px; overflow: hidden; border-radius: 4px; background: #11151A;
  }
  .pv.small { width: 26px; height: 22px; }
  .box { position: relative; width: 26px; height: 16px; border-radius: 3px; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; }
  .small .box { width: 16px; height: 12px; }
  .fill { position: absolute; inset: 0; background-color: #3D6E94; }
  .fill.grad {
    background-image: linear-gradient(calc(100deg + var(--ce-g-turn, 0deg)),
      #24557A calc(0% + var(--ce-g-shift, 0%)), #9FD6FF calc(50% + var(--ce-g-shift, 0%)), #24557A calc(100% + var(--ce-g-shift, 0%)));
  }
  .img {
    position: absolute; inset: -4px;
    background: repeating-conic-gradient(#C8553D 0 25%, #3C9B5F 0 50%) 0 0 / 8px 8px;
  }
  .w { position: relative; font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF3; }
  .small .w { display: none; }
  .word { font: 600 12px/1 'IBM Plex Sans', system-ui, sans-serif; color: #E8EEF3; white-space: pre; }
  .small .word { font-size: 8px; }
  .frame { position: relative; width: 30px; height: 18px; border: 1px solid #5A6672; border-radius: 3px; overflow: hidden; }
  .small .frame { width: 18px; height: 12px; }
  .stripes {
    position: absolute; inset: 0;
    background: repeating-linear-gradient(135deg, #7FB8E0 0 2px, transparent 2px 6px);
  }
  .ring { width: 22px; height: 22px; }
  .small .ring { width: 18px; height: 18px; }
  .ring circle { fill: none; stroke-width: 3; stroke-linecap: round; }
  .ring .track { stroke: #2C343C; }
  .ring .value { stroke: #5B9BD5; }
</style>
