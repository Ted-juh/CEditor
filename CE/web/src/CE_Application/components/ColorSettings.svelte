<script>
  /**
   * ColorSettings — Format display, Harmony swatches, Tint/Shade variations,
   * Quick actions, Opacity presets, and Bit Depth for the Colors tab sidebar.
   */
  import Copy from 'lucide-svelte/icons/copy';
  import Check from 'lucide-svelte/icons/check';
  import Sun from 'lucide-svelte/icons/sun';
  import Moon from 'lucide-svelte/icons/moon';
  import Droplets from 'lucide-svelte/icons/droplets';
  import Thermometer from 'lucide-svelte/icons/thermometer';
  import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
  import { hexToRgb, rgbToHex, rgbToHsl, alphaToHex, quantizeColor } from '../utils/colorMath.js';
  import { computeHarmony } from '../utils/colorHarmony.js';
  import { invertColor, grayscaleColor, shiftLightness, shiftSaturation } from '../utils/colorActions.js';

  let { color = 'FF0000', alpha = 1, onApplyColor, stepSize = $bindable(10) } = $props();

  let format = $state('hex');
  let harmonyType = $state('complementary');
  let bitDepth = $state('24');
  let copied = $state(false);

  function applyColor(hex6, a = alpha) {
    onApplyColor?.(alphaToHex(a) + hex6);
  }

  // --- Derived color values ---

  let rgb = $derived(hexToRgb(color));
  let rawHsl = $derived(rgbToHsl(rgb[0], rgb[1], rgb[2]));

  // Preserve hue & saturation when color is achromatic (black/white/grey) so
  // sliders don't jump back to 0° whenever the user hits grey.
  let savedHue = $state(0);
  let savedSat = $state(0);
  $effect(() => {
    const [r, g, b] = rgb;
    const [h, s] = rawHsl;
    if (r !== g || g !== b) {
      savedHue = h;
      savedSat = s;
    }
  });
  // Round for display; harmony + quick actions all pass through hslToRgb
  // which rounds its own output anyway.
  let hsl = $derived([Math.round(savedHue), Math.round(savedSat), Math.round(rawHsl[2])]);

  let alphaInt = $derived(Math.round(alpha * 255));
  let alphaPct = $derived(alpha.toFixed(2));

  // --- Format display ---

  let formattedColor = $derived((() => {
    const [r, g, b] = rgb;
    const [h, s, l] = hsl;
    switch (format) {
      case 'hex':  return `#${alphaToHex(alpha)}${color}`;
      case 'rgb':  return `rgb(${r}, ${g}, ${b})`;
      case 'argb': return `argb(${alphaInt}, ${r}, ${g}, ${b})`;
      case 'rgba': return `rgba(${r}, ${g}, ${b}, ${alphaPct})`;
      case 'hsl':  return `hsl(${h}, ${s}%, ${l}%)`;
      case 'hsla': return `hsla(${h}, ${s}%, ${l}%, ${alphaPct})`;
      default:     return `#${color}`;
    }
  })());

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(formattedColor);
      copied = true;
      setTimeout(() => copied = false, 1200);
    } catch {
      // Fallback: no-op
    }
  }

  // --- Harmony colors ---
  let harmonyColors = $derived(computeHarmony(hsl[0], hsl[1], hsl[2], harmonyType));

  // --- Quick actions ---
  function actionInvert()     { applyColor(invertColor(color)); }
  function actionGrayscale()  { applyColor(grayscaleColor(color)); }
  function actionLighten()    { applyColor(shiftLightness(hsl[0], hsl[1], hsl[2],  10)); }
  function actionDarken()     { applyColor(shiftLightness(hsl[0], hsl[1], hsl[2], -10)); }
  function actionSaturate()   { applyColor(shiftSaturation(hsl[0], hsl[1], hsl[2],  15)); }
  function actionDesaturate() { applyColor(shiftSaturation(hsl[0], hsl[1], hsl[2], -15)); }

  // --- Opacity presets ---
  function setOpacity(value) {
    applyColor(color, value);
  }

  // --- Bit Depth ---
  let quantized = $derived(quantizeColor(rgb[0], rgb[1], rgb[2], bitDepth));
  let quantizedHex = $derived(rgbToHex(quantized[0], quantized[1], quantized[2]));
  let isQuantized = $derived(bitDepth === '8' || bitDepth === '16');
</script>

<div class="color-settings">

  <!-- Format -->
  <div class="section">
    <div class="section-label">Format</div>
    <div class="format-row">
      <select class="combo format-combo" bind:value={format}>
        <option value="hex">Hex</option>
        <option value="rgb">RGB</option>
        <option value="argb">ARGB</option>
        <option value="rgba">RGBA</option>
        <option value="hsl">HSL</option>
        <option value="hsla">HSLA</option>
      </select>
      <div class="value-row">
        <span class="value-text">{formattedColor}</span>
        <button class="copy-btn" onclick={copyToClipboard} title="Copy to clipboard">
          {#if copied}
            <Check size={12} strokeWidth={1.5} />
          {:else}
            <Copy size={12} strokeWidth={1.5} />
          {/if}
        </button>
      </div>
    </div>
  </div>

  <!-- Step -->
  <div class="section">
    <div class="section-label">Step</div>
    <div class="step-row">
      {#each [0, 1, 5, 10, 20, 25] as val}
        <button
          class="step-btn"
          class:active={stepSize === val}
          onclick={() => stepSize = val}
          title={val === 0 ? 'Smooth — no quantisation while dragging' : `Quantise drags to ${val}% steps`}
        >
          {val === 0 ? 'Off' : `${val}%`}
        </button>
      {/each}
    </div>
  </div>

  <!-- Harmony -->
  <div class="section">
    <div class="section-label">Harmony</div>
    <select class="combo" bind:value={harmonyType}>
      <option value="complementary">Complementary</option>
      <option value="analogous">Analogous</option>
      <option value="triadic">Triadic</option>
      <option value="split">Split-Complementary</option>
      <option value="tetradic">Tetradic</option>
    </select>
    <div class="harmony-swatches">
      <button
        class="harmony-swatch current"
        style="background: #{color}"
        title="Current: #{color}"
      ></button>
      {#each harmonyColors as hc}
        <button
          class="harmony-swatch"
          style="background: #{hc}"
          title="#{hc} — click to apply"
          onclick={() => applyColor(hc)}
        ></button>
      {/each}
    </div>
  </div>

  <!-- Quick Actions -->
  <div class="section">
    <div class="section-label">Quick Actions</div>
    <div class="actions-row">
      <button class="action-btn" onclick={actionDarken} title="Darken 10%">
        <Moon size={13} strokeWidth={1.5} />
      </button>
      <button class="action-btn" onclick={actionLighten} title="Lighten 10%">
        <Sun size={13} strokeWidth={1.5} />
      </button>
      <button class="action-btn" onclick={actionDesaturate} title="Desaturate -15%">
        <Thermometer size={13} strokeWidth={1.5} />
      </button>
      <button class="action-btn" onclick={actionSaturate} title="Saturate +15%">
        <Droplets size={13} strokeWidth={1.5} />
      </button>
      <button class="action-btn" onclick={actionGrayscale} title="Grayscale">
        <span class="action-text">G</span>
      </button>
      <button class="action-btn" onclick={actionInvert} title="Invert">
        <RotateCcw size={13} strokeWidth={1.5} />
      </button>
    </div>
  </div>

  <!-- Opacity Presets -->
  <div class="section">
    <div class="section-label">Opacity</div>
    <div class="opacity-row">
      {#each [0, 0.25, 0.5, 0.75, 1] as val}
        <button
          class="opacity-btn"
          class:active={Math.abs(alpha - val) < 0.01}
          onclick={() => setOpacity(val)}
        >
          {Math.round(val * 100)}%
        </button>
      {/each}
    </div>
  </div>

  <!-- Depth -->
  <div class="section">
    <div class="section-label">Depth</div>
    <select class="combo" bind:value={bitDepth}>
      <option value="8">8-bit (256)</option>
      <option value="16">16-bit (65K)</option>
      <option value="24">24-bit (16M)</option>
      <option value="32">32-bit (16M+A)</option>
    </select>
    {#if isQuantized}
      <div class="depth-preview">
        <span class="depth-swatch" style="background: #{color}"></span>
        <span class="depth-arrow">→</span>
        <span class="depth-swatch" style="background: #{quantizedHex}"></span>
        <span class="depth-hex">#{quantizedHex}</span>
      </div>
    {/if}
  </div>

</div>

<style>
  .color-settings {
    padding: 8px;
    overflow-y: auto;
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .color-settings::-webkit-scrollbar {
    width: 12px;
  }

  .color-settings::-webkit-scrollbar-track {
    background: #5B9BD5;
  }

  .color-settings::-webkit-scrollbar-thumb {
    background: #1A1A1A;
    border-radius: 6px;
    border: 2px solid #5B9BD5;
  }

  .section {
    padding: 6px 0;
    border-bottom: 1px solid #333;
  }

  .section:last-child {
    border-bottom: none;
  }

  .section-label {
    font-size: 9px;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .combo {
    width: 100%;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 3px;
    font-family: inherit;
    outline: none;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%23888'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 6px center;
    padding-right: 20px;
  }

  .combo:focus {
    border-color: #5B9BD5;
  }

  /* Format */
  .format-row {
    display: flex;
    gap: 4px;
  }

  .format-combo {
    width: 50%;
    flex-shrink: 0;
  }

  .value-row {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 0;
  }

  .value-text {
    font-family: monospace;
    font-size: 10px;
    color: #BBB;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .copy-btn {
    background: none;
    border: 1px solid #333;
    color: #888;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 2px;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: all 0.1s;
  }

  .copy-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  /* Harmony */
  .harmony-swatches {
    display: flex;
    gap: 3px;
    margin-top: 4px;
    flex-wrap: wrap;
  }

  .harmony-swatch {
    width: 22px;
    height: 22px;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
    padding: 0;
    transition: border-color 0.1s;
  }

  .harmony-swatch:hover {
    border-color: #5B9BD5;
  }

  .harmony-swatch.current {
    border-color: #888;
    cursor: default;
  }

  /* Quick Actions */
  .actions-row {
    display: flex;
    gap: 3px;
    flex-wrap: wrap;
  }

  .action-btn {
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    cursor: pointer;
    padding: 4px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.1s;
    flex: 1;
    min-width: 28px;
  }

  .action-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
    background: #252525;
  }

  .action-text {
    font-size: 11px;
    font-weight: 700;
    line-height: 13px;
  }

  /* Step */
  .step-row {
    display: flex;
    gap: 3px;
  }

  .step-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    font-family: inherit;
    padding: 3px 2px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .step-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .step-btn.active {
    background: #094771;
    border-color: #5B9BD5;
    color: #DDD;
  }

  /* Opacity */
  .opacity-row {
    display: flex;
    gap: 3px;
  }

  .opacity-btn {
    flex: 1;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #888;
    font-size: 10px;
    font-family: inherit;
    padding: 3px 2px;
    border-radius: 3px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .opacity-btn:hover {
    color: #DDD;
    border-color: #5B9BD5;
  }

  .opacity-btn.active {
    background: #094771;
    border-color: #5B9BD5;
    color: #DDD;
  }

  /* Depth */
  .depth-preview {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
  }

  .depth-swatch {
    width: 18px;
    height: 18px;
    border: 1px solid #555;
    border-radius: 3px;
  }

  .depth-arrow {
    font-size: 10px;
    color: #666;
  }

  .depth-hex {
    font-family: monospace;
    font-size: 10px;
    color: #888;
  }
</style>
