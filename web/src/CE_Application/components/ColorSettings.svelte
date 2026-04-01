<script>
  /**
   * ColorSettings — Format display, Harmony swatches, Tint/Shade variations,
   * Quick actions, Opacity presets, and Bit Depth for the Colors tab sidebar.
   */
  import { Copy, Check, Sun, Moon, Droplets, Thermometer, RotateCcw } from 'lucide-svelte';

  let { color = 'FF0000', alpha = 1, onApplyColor, stepSize = $bindable(10) } = $props();

  let format = $state('hex');
  let harmonyType = $state('complementary');
  let bitDepth = $state('24');
  let copied = $state(false);

  // --- Color parsing ---

  function hexToRgb(hex) {
    hex = hex.replace(/^#/, '');
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function rgbToHex(r, g, b) {
    const toHex = v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0').toUpperCase();
    return toHex(r) + toHex(g) + toHex(b);
  }

  function applyColor(hex6, a = alpha) {
    if (onApplyColor) {
      const alphaHex = Math.round(a * 255).toString(16).padStart(2, '0').toUpperCase();
      onApplyColor(alphaHex + hex6);
    }
  }

  // --- Derived color values ---

  let rgb = $derived(hexToRgb(color));
  let rawHsl = $derived(rgbToHsl(rgb[0], rgb[1], rgb[2]));

  // Preserve hue & saturation when color is achromatic (black/white/grey)
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
  let hsl = $derived([savedHue, savedSat, rawHsl[2]]);

  let alphaInt = $derived(Math.round(alpha * 255));
  let alphaPct = $derived(alpha.toFixed(2));

  // --- Format display ---

  let formattedColor = $derived((() => {
    const [r, g, b] = rgb;
    const [h, s, l] = hsl;
    switch (format) {
      case 'hex':  return `#${alphaInt.toString(16).padStart(2, '0').toUpperCase()}${color}`;
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
      // Fallback
    }
  }

  // --- Harmony colors ---

  function hueShift(h, deg) {
    return ((h + deg) % 360 + 360) % 360;
  }

  function harmonyHslToHex(h, s, l) {
    const [r, g, b] = hslToRgb(h, s, l);
    return rgbToHex(r, g, b);
  }

  let harmonyColors = $derived((() => {
    const [h, s, l] = hsl;
    switch (harmonyType) {
      case 'complementary':
        return [harmonyHslToHex(hueShift(h, 180), s, l)];
      case 'analogous':
        return [harmonyHslToHex(hueShift(h, -30), s, l), harmonyHslToHex(hueShift(h, 30), s, l)];
      case 'triadic':
        return [harmonyHslToHex(hueShift(h, 120), s, l), harmonyHslToHex(hueShift(h, 240), s, l)];
      case 'split':
        return [harmonyHslToHex(hueShift(h, 150), s, l), harmonyHslToHex(hueShift(h, 210), s, l)];
      case 'tetradic':
        return [harmonyHslToHex(hueShift(h, 90), s, l), harmonyHslToHex(hueShift(h, 180), s, l), harmonyHslToHex(hueShift(h, 270), s, l)];
      default:
        return [];
    }
  })());

  // --- Tint/Shade variations ---
  // 5 tints (lighter) and 5 shades (darker) of current color

  // --- Quick actions ---

  function actionInvert() {
    const [r, g, b] = rgb;
    applyColor(rgbToHex(255 - r, 255 - g, 255 - b));
  }

  function actionGrayscale() {
    const [r, g, b] = rgb;
    const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    applyColor(rgbToHex(gray, gray, gray));
  }

  function actionLighten() {
    const [h, s, l] = hsl;
    const newL = Math.min(100, l + 10);
    const [r, g, b] = hslToRgb(h, s, newL);
    applyColor(rgbToHex(r, g, b));
  }

  function actionDarken() {
    const [h, s, l] = hsl;
    const newL = Math.max(0, l - 10);
    const [r, g, b] = hslToRgb(h, s, newL);
    applyColor(rgbToHex(r, g, b));
  }

  function actionDesaturate() {
    const [h, s, l] = hsl;
    const newS = Math.max(0, s - 15);
    const [r, g, b] = hslToRgb(h, newS, l);
    applyColor(rgbToHex(r, g, b));
  }

  function actionSaturate() {
    const [h, s, l] = hsl;
    const newS = Math.min(100, s + 15);
    const [r, g, b] = hslToRgb(h, newS, l);
    applyColor(rgbToHex(r, g, b));
  }

  // --- Opacity presets ---

  function setOpacity(value) {
    applyColor(color, value);
  }

  // --- Bit Depth ---

  function quantize(value, bits) {
    const levels = (1 << bits) - 1;
    return Math.round(value / 255 * levels) * 255 / levels;
  }

  function quantizeColor(r, g, b, depth) {
    switch (depth) {
      case '8':  return [quantize(r, 3), quantize(g, 3), quantize(b, 2)];
      case '16': return [quantize(r, 5), quantize(g, 6), quantize(b, 5)];
      default:   return [r, g, b];
    }
  }

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
      {#each [1, 5, 10, 20, 25] as val}
        <button
          class="step-btn"
          class:active={stepSize === val}
          onclick={() => stepSize = val}
        >
          {val}%
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
