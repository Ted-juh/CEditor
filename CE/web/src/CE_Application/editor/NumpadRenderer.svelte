<script>
  // Numpad — a readout over a 3x4 keypad: digits 1-9, then Clear / 0 / Enter.
  //
  // Visual only. The presses are driven by the preview surface, which shares numpadLayout's geometry
  // and its entry rules, so what is drawn and what is hit-tested cannot disagree about where a key
  // is. The in-progress entry arrives as Numpad.__pending and the pressed key as Numpad.__down,
  // exactly as the Crossfader's live mix arrives as __mix.
  import { numpadConfig, numpadDisplayText, numpadKeys } from '../utils/numpadLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }
  function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }

  let raw = $derived(control?._children?.Numpad ?? {});
  let cfg = $derived(numpadConfig(control));
  let value = $derived(n(control?._children?.Value?.value, cfg.min));
  // The live entry while typing; '' once committed.
  let pending = $derived(String(raw.__pending ?? ''));
  let down = $derived(String(raw.__down ?? ''));
  let rejected = $derived(String(raw.__rejected ?? ''));

  let layout = $derived(numpadKeys(width, height, cfg));
  let text = $derived(numpadDisplayText(pending, value, cfg));

  let keyCss = $derived(css(cfg.keyColour, 'rgba(27,27,27,1)'));
  let keyDownCss = $derived(css(cfg.keyDownColour, 'rgba(46,46,46,1)'));
  let labelCss = $derived(css(cfg.keyLabelColour, 'rgba(232,232,232,1)'));
  let actionCss = $derived(css(cfg.actionColour, 'rgba(36,48,64,1)'));
  let displayCss = $derived(css(cfg.displayColour, 'rgba(11,11,11,1)'));
  // Out of range is said in the readout rather than swallowed: a refused entry that looks like an
  // accepted one is the worst of the three outcomes.
  let displayTextCss = $derived(rejected === 'outOfRange'
    ? 'rgba(224,120,120,1)'
    : css(cfg.displayTextColour, 'rgba(127,216,180,1)'));
  let borderCss = $derived(css(cfg.borderColour, 'rgba(0,0,0,1)'));

  let displayFont = $derived(layout.display
    ? Math.max(9, Math.min(layout.display.height * 0.66, width * 0.28))
    : 0);
  const keyFont = (key) => Math.max(9, Math.min(key.height * 0.44, key.width * 0.44));
</script>

<svg
  class="numpad"
  viewBox="0 0 {Math.max(1, width)} {Math.max(1, height)}"
  width={Math.max(1, width)}
  height={Math.max(1, height)}
  preserveAspectRatio="none"
  aria-hidden="true"
>
  {#if layout.display}
    <rect
      x={layout.display.x} y={layout.display.y}
      width={layout.display.width} height={layout.display.height}
      rx="3" fill={displayCss} stroke={borderCss} stroke-width="1"
    />
    <text
      x={layout.display.x + layout.display.width - 6}
      y={layout.display.y + layout.display.height / 2}
      text-anchor="end" dominant-baseline="central"
      font-family="ui-monospace, monospace" font-size={displayFont} fill={displayTextCss}
    >{text}</text>
  {/if}

  {#each layout.keys as key (key.id)}
    {#if !key.hidden}
      <rect
        x={key.x} y={key.y} width={key.width} height={key.height}
        rx="3"
        fill={down === key.id ? keyDownCss : (key.kind === 'digit' ? keyCss : actionCss)}
        stroke={borderCss} stroke-width="1"
      />
      <text
        x={key.x + key.width / 2} y={key.y + key.height / 2}
        text-anchor="middle" dominant-baseline="central"
        font-family="ui-sans-serif, system-ui, sans-serif" font-size={keyFont(key)} fill={labelCss}
      >{key.label}</text>
    {/if}
  {/each}
</svg>

<style>
  .numpad {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    pointer-events: none;
  }
</style>
