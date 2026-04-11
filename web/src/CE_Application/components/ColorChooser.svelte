<script>
  /**
   * ColorChooser — "Gradient Bands on Live Preview"
   * A large color preview with 4 floating gradient band sliders:
   * Hue, Saturation, Lightness, Alpha.
   * The entire background IS the selected color.
   *
   * Props:
   *   color  — 6-digit RRGGBB hex (central color, owned by parent)
   *   alpha  — 0-1 float (owned by parent)
   *   onchange(AARRGGBB) — called when user interacts with bands or hex input
   */

  import { hexToRgb, rgbToHex, rgbToHsl, hslToRgb, alphaToHex } from '../utils/colorMath.js';
  import { hueBand, saturationBand, lightnessBand, alphaBand } from '../utils/bandGradients.js';

  let { color = '333333', alpha: propAlpha = 1, stepSize = 10, onchange } = $props();

  // --- Internal HSL state (for smooth dragging) ---
  let hue = $state(0);
  let saturation = $state(0);
  let lightness = $state(20);
  let alpha = $state(1);
  let dragging = $state(null);
  let hexInput = $state('');
  let editingHex = $state(false);

  // Flag: when true, the next prop change is our own echo — skip it
  let ignoreNextPropChange = false;

  // --- Sync internal state from external color prop ---
  function syncFromHex(hex6) {
    const [r, g, b] = hexToRgb(hex6);
    const [h, s, l] = rgbToHsl(r, g, b);
    // When color is achromatic (black, white, or grey), rgbToHsl returns h=0, s=0.
    // Preserve existing hue and saturation so sliders don't jump.
    const isAchromatic = (r === g && g === b);
    if (!isAchromatic) {
      hue = h;
      saturation = s;
    }
    lightness = l;
  }

  // --- React to prop changes (external color updates) ---
  $effect(() => {
    // Read props to establish dependency
    const c = color;
    const a = propAlpha;

    if (ignoreNextPropChange) {
      ignoreNextPropChange = false;
      return;
    }

    syncFromHex(c);
    alpha = a;
  });

  // --- Derived values ---
  let currentRgb = $derived(hslToRgb(hue, saturation, lightness));
  let currentHex6 = $derived(rgbToHex(currentRgb[0], currentRgb[1], currentRgb[2]));
  let currentFullHex = $derived(alphaToHex(alpha) + currentHex6);
  let displayHex = $derived('#' + currentFullHex);
  let colorWithAlpha = $derived(`hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);

  // --- Gradient strings for each band ---
  let hueGradient   = $derived(hueBand(saturation, lightness));
  let satGradient   = $derived(saturationBand(hue, lightness));
  let lightGradient = $derived(lightnessBand(hue, saturation));
  let alphaGradient = $derived(alphaBand(hue, saturation, lightness));

  // --- Thumb positions (0-1) ---
  let huePos = $derived(hue / 360);
  let satPos = $derived(1 - saturation / 100);
  let lightPos = $derived(lightness / 100);
  let alphaPos = $derived(1 - alpha);

  // --- Thumb colors ---
  let thumbColor = $derived(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
  let alphaThumbColor = $derived(`hsla(${hue}, ${saturation}%, ${lightness}%, ${alpha})`);

  // --- Fire change to parent ---
  function fireChange() {
    if (onchange) {
      // Tell the effect to ignore the prop echo that will come back
      ignoreNextPropChange = true;
      onchange(currentFullHex);
    }
  }

  // --- Drag handling ---
  function getBandValue(e, bandEl) {
    const rect = bandEl.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    return x / rect.width;
  }

  function startDrag(band, e) {
    dragging = band;
    updateFromDrag(e);
  }

  function snap(value, max) {
    const step = (stepSize / 100) * max;
    return Math.round(value / step) * step;
  }

  function updateFromDrag(e) {
    if (!dragging) return;
    const bandEl = document.querySelector(`[data-band="${dragging}"]`);
    if (!bandEl) return;
    const ratio = getBandValue(e, bandEl);

    switch (dragging) {
      case 'hue':        hue = snap(ratio * 360, 360); break;
      case 'saturation': saturation = snap((1 - ratio) * 100, 100); break;
      case 'lightness':  lightness = snap(ratio * 100, 100); break;
      case 'alpha':      alpha = snap((1 - ratio) * 100, 100) / 100; break;
    }

    fireChange();
  }

  function stopDrag() {
    dragging = null;
  }

  // --- Hex input ---
  function handleHexFocus(e) {
    editingHex = true;
    hexInput = displayHex;
    e.target.select();
  }

  function handleHexBlur() {
    editingHex = false;
    applyHexInput();
  }

  function handleHexKeydown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      editingHex = false;
      hexInput = displayHex;
    }
  }

  function applyHexInput() {
    let hex = hexInput.replace(/^#/, '').replace(/[^0-9A-Fa-f]/g, '');
    if (hex.length === 8) {
      // AARRGGBB
      alpha = parseInt(hex.slice(0, 2), 16) / 255;
      syncFromHex(hex.slice(2, 8));
      fireChange();
    } else if (hex.length === 6) {
      syncFromHex(hex);
      fireChange();
    }
  }

  // --- Band config ---
  const bands = [
    { id: 'hue', label: 'H' },
    { id: 'saturation', label: 'S' },
    { id: 'lightness', label: 'B' },
    { id: 'alpha', label: 'A' },
  ];

  function getGradient(id) {
    switch (id) {
      case 'hue': return hueGradient;
      case 'saturation': return satGradient;
      case 'lightness': return lightGradient;
      case 'alpha': return alphaGradient;
    }
  }

  function getThumbPos(id) {
    switch (id) {
      case 'hue': return huePos;
      case 'saturation': return satPos;
      case 'lightness': return lightPos;
      case 'alpha': return alphaPos;
    }
  }

  function getThumbColor(id) {
    return id === 'alpha' ? alphaThumbColor : thumbColor;
  }
</script>

<svelte:window
  onmousemove={dragging ? updateFromDrag : undefined}
  onmouseup={dragging ? stopDrag : undefined}
/>

<div class="color-chooser">
  <!-- Checkerboard (visible through alpha) -->
  <div class="checkerboard"></div>

  <!-- Color overlay -->
  <div class="color-overlay" style="background: {colorWithAlpha}"></div>

  <!-- Hex input (top-right corner) -->
  <div class="hex-corner">
    <input
      class="hex-input"
      type="text"
      value={editingHex ? hexInput : displayHex}
      onfocus={handleHexFocus}
      onblur={handleHexBlur}
      onkeydown={handleHexKeydown}
      oninput={(e) => hexInput = e.target.value}
      spellcheck="false"
    />
  </div>

  <!-- Gradient bands (bottom) -->
  <div class="bands-container">
    {#each bands as band}
      <div class="band-wrapper">
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="band"
          class:is-alpha={band.id === 'alpha'}
          data-band={band.id}
          role="slider"
          tabindex="-1"
          aria-valuenow={getThumbPos(band.id) * 100}
          onmousedown={(e) => startDrag(band.id, e)}
        >
          {#if band.id === 'alpha'}
            <div class="band-checkerboard"></div>
          {/if}
          <div class="band-gradient" style="background: {getGradient(band.id)}"></div>
          <div
            class="thumb"
            style="left: {getThumbPos(band.id) * 100}%; background: {getThumbColor(band.id)}"
          ></div>
          <span class="band-label">{band.label}</span>
        </div>
      </div>
    {/each}
  </div>
</div>

<style>
  .color-chooser {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 120px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    user-select: none;
  }

  .checkerboard {
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#2A2A2A 0% 25%, #1A1A1A 0% 50%) 0 0 / 16px 16px;
    z-index: 0;
  }

  .color-overlay {
    position: absolute;
    inset: 0;
    z-index: 1;
    transition: background 0.05s;
  }

  .bands-container {
    position: relative;
    z-index: 2;
    margin-top: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 20px 10px;
  }

  .band-wrapper {
    position: relative;
  }

  .band {
    position: relative;
    width: 100%;
    height: 18px;
    border-radius: 4px;
    cursor: pointer;
    overflow: visible;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
    border-bottom: 1px solid rgba(0, 0, 0, 0.6);
    border-left: 1px solid rgba(0, 0, 0, 0.4);
    border-right: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .band-checkerboard {
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0 / 10px 10px;
    border-radius: 4px;
    overflow: hidden;
  }

  .band-gradient {
    position: absolute;
    inset: 0;
    border-radius: 4px;
    overflow: hidden;
  }

  .thumb {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.6), inset 0 0 2px rgba(0, 0, 0, 0.2);
    transform: translate(-50%, -50%);
    pointer-events: none;
    z-index: 3;
  }

  .band-label {
    position: absolute;
    right: 6px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.85);
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
    opacity: 0;
    transition: opacity 0.15s;
    pointer-events: none;
    z-index: 4;
  }

  .band:hover .band-label {
    opacity: 1;
  }

  .hex-corner {
    position: absolute;
    top: 6px;
    right: 8px;
    z-index: 3;
  }

  .hex-input {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #DDD;
    font-family: monospace;
    font-size: 11px;
    padding: 3px 8px;
    border-radius: 3px;
    text-align: center;
    width: 90px;
    outline: none;
  }

  .hex-input:focus {
    border-color: #5B9BD5;
    background: rgba(0, 0, 0, 0.5);
  }
</style>
