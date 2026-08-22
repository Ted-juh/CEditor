<script>
  /**
   * ColorChooser — a 2D saturation/brightness square with four band sliders
   * under it, a hex field that accepts what people type, and a screen
   * eyedropper.
   *
   * WHAT CHANGED AND WHY. This used to be four 1-D HSL bands and nothing else:
   * no square, and the band labelled "B" was HSL lightness, so it ran black →
   * colour → WHITE and the top of it was unreachable pastel. Both are fixed
   * here — the state is HSB (see utils/hsvMath.js), the square is the primary
   * control, and the bands remain for the people who liked them, now measuring
   * the axes their labels claim.
   *
   * Props:
   *   color    — 6-digit RRGGBB hex (central colour, owned by parent)
   *   alpha    — 0-1 float (owned by parent)
   *   stepSize — band drag quantisation; 0 = smooth (the default)
   *   onchange(AARRGGBB) — every interaction that changes the colour
   */

  import { onMount } from 'svelte';
  import Pipette from 'lucide-svelte/icons/pipette';
  import { rgbToHex, alphaToHex } from '../utils/colorMath.js';
  import { hsvToRgb, hsvToHslaString, hexToHsvPreserving } from '../utils/hsvMath.js';
  import { hueBand, saturationBand, brightnessBand, alphaBand, svSquareBackground } from '../utils/bandGradients.js';
  import { parseColourInput, formatColourInput } from '../utils/hexInput.js';
  import { eyedropperAvailable, pickScreenColour } from '../utils/screenEyedropper.js';
  import { dragScrub } from '../scrub/dragScrubAction';
  import { presets } from '../scrub/dragScrub';
  import { appScrubOverrides } from '../utils/scrubRuntime.js';

  let { color = '333333', alpha: propAlpha = 1, stepSize = 10, onchange } = $props();

  // --- Internal HSB state (for smooth dragging) ---
  // Seeded from the props rather than from zero: effects do not run during
  // SSR, so a chooser that waited for its sync effect rendered the wrong
  // colour on first paint (and in the server-rendered tests).
  const seed = hexToHsvPreserving(color);
  let hue = $state(seed.h);
  let saturation = $state(seed.s);
  let brightness = $state(seed.v);
  let alpha = $state(propAlpha);
  let hexInput = $state('');
  let editingHex = $state(false);
  let notice = $state('');           // why an entry was refused, or an eyedropper failure
  let hasEyedropper = $state(false); // resolved on mount — SSR has no window

  // Flag: when true, the next prop change is our own echo — skip it
  let ignoreNextPropChange = false;

  onMount(() => {
    hasEyedropper = eyedropperAvailable(typeof window === 'undefined' ? globalThis : window);
  });

  // --- Sync internal state from external colour prop ---
  function syncFromHex(hex6) {
    const next = hexToHsvPreserving(hex6, { h: hue, s: saturation, v: brightness });
    hue = next.h;
    saturation = next.s;
    brightness = next.v;
  }

  // --- React to prop changes (external colour updates) ---
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
  let currentRgb = $derived(hsvToRgb(hue, saturation, brightness));
  let currentHex6 = $derived(rgbToHex(currentRgb[0], currentRgb[1], currentRgb[2]));
  let currentFullHex = $derived(alphaToHex(alpha) + currentHex6);
  let displayHex = $derived(formatColourInput(currentHex6, alpha));
  let colorWithAlpha = $derived(hsvToHslaString(hue, saturation, brightness, alpha));

  // --- Square + band backgrounds ---
  let squareBackground = $derived(svSquareBackground(hue));
  let hueGradient   = $derived(hueBand(saturation, brightness));
  let satGradient   = $derived(saturationBand(hue, brightness));
  let brightGradient = $derived(brightnessBand(hue, saturation));
  let alphaGradient = $derived(alphaBand(hue, saturation, brightness));

  // --- Thumb positions (0-1) ---
  let huePos = $derived(hue / 360);
  let satPos = $derived(1 - saturation / 100);
  let brightPos = $derived(brightness / 100);
  let alphaPos = $derived(1 - alpha);

  // --- Thumb colours ---
  let thumbColor = $derived(`#${currentHex6}`);
  let alphaThumbColor = $derived(colorWithAlpha);

  // --- Fire change to parent ---
  function fireChange() {
    // Any other way of choosing a colour retires a rejected hex entry. Without
    // this the field would sit there showing text the user has already moved on
    // from, contradicting the colour under the thumb.
    editingHex = false;
    notice = '';
    if (onchange) {
      // Tell the effect to ignore the prop echo that will come back
      ignoreNextPropChange = true;
      onchange(currentFullHex);
    }
  }

  // --- The 2D saturation/brightness square -------------------------------
  // Plain pointer handlers rather than dragScrub: dragScrub is a one-axis
  // scrubber and this is a field, where x and y are two different quantities
  // read from one pointer position.
  let squareEl = $state(null);
  let squareDragging = $state(false);

  const clamp01 = (v) => Math.max(0, Math.min(1, v));

  function applySquare(event) {
    const el = squareEl;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    saturation = clamp01((event.clientX - rect.left) / rect.width) * 100;
    brightness = (1 - clamp01((event.clientY - rect.top) / rect.height)) * 100;
    fireChange();
  }

  function handleSquarePointerDown(event) {
    event.preventDefault();
    squareDragging = true;
    squareEl?.setPointerCapture?.(event.pointerId);
    applySquare(event);
  }

  function handleSquarePointerMove(event) {
    if (squareDragging) applySquare(event);
  }

  function handleSquarePointerUp(event) {
    if (!squareDragging) return;
    squareDragging = false;
    squareEl?.releasePointerCapture?.(event.pointerId);
  }

  function handleSquareKeydown(event) {
    const stepAmount = event.shiftKey ? 10 : 1;
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':  saturation = Math.max(0, saturation - stepAmount); break;
      case 'ArrowRight': saturation = Math.min(100, saturation + stepAmount); break;
      case 'ArrowUp':    brightness = Math.min(100, brightness + stepAmount); break;
      case 'ArrowDown':  brightness = Math.max(0, brightness - stepAmount); break;
      case 'Home':       saturation = 0; break;
      case 'End':        saturation = 100; break;
      default: handled = false;
    }
    if (!handled) return;
    event.preventDefault();
    fireChange();
  }

  // --- Band dragging -----------------------------------------------------
  // Each band is an absolute horizontal track. Saturation and alpha grow
  // right-to-left (invertX), matching the gradients they float over.
  let bandParams = $derived({
    hue: {
      ...presets.linearHorizontal,
      ...appScrubOverrides(),
      min: 0,
      max: 360,
      step: (stepSize / 100) * 360,
      value: hue,
      manageCursor: false,
      onChange: (v) => { hue = v; fireChange(); },
    },
    saturation: {
      ...presets.linearHorizontal,
      ...appScrubOverrides(),
      invertX: true,
      min: 0,
      max: 100,
      step: stepSize,
      value: saturation,
      manageCursor: false,
      onChange: (v) => { saturation = v; fireChange(); },
    },
    brightness: {
      ...presets.linearHorizontal,
      ...appScrubOverrides(),
      min: 0,
      max: 100,
      step: stepSize,
      value: brightness,
      manageCursor: false,
      onChange: (v) => { brightness = v; fireChange(); },
    },
    alpha: {
      ...presets.linearHorizontal,
      ...appScrubOverrides(),
      invertX: true,
      min: 0,
      max: 100,
      step: stepSize,
      value: alpha * 100,
      manageCursor: false,
      onChange: (v) => { alpha = v / 100; fireChange(); },
    },
  });

  function getBandNow(id) {
    switch (id) {
      case 'hue': return Math.round(hue);
      case 'saturation': return Math.round(saturation);
      case 'brightness': return Math.round(brightness);
      case 'alpha': return Math.round(alpha * 100);
    }
  }

  // --- Hex input ---------------------------------------------------------
  function handleHexFocus(e) {
    editingHex = true;
    notice = '';
    hexInput = displayHex;
    e.target.select();
  }

  function handleHexBlur() {
    // Clicking the square or a band while the field has focus fires the
    // pointer handler before the blur in some engines; `editingHex` is already
    // false by then, and re-applying the stale text would undo the click the
    // user just made.
    if (!editingHex) return;
    applyHexInput();
  }

  function handleHexKeydown(e) {
    if (e.key === 'Enter') {
      e.target.blur();
    } else if (e.key === 'Escape') {
      editingHex = false;
      notice = '';
      hexInput = displayHex;
      e.target.blur();
    }
  }

  /**
   * Commit whatever is in the field. A refusal keeps the text the user typed
   * and says what is wrong with it — the old version accepted 6 or 8 hex
   * characters and silently reverted everything else, which is indisputably
   * the worst of the available behaviours: `#abc` looked like a dead keypress.
   */
  function applyHexInput() {
    const result = parseColourInput(hexInput);
    if (!result.ok) {
      notice = result.reason;
      return;
    }
    notice = '';
    editingHex = false;
    alpha = result.alpha;
    syncFromHex(result.color);
    fireChange();
  }

  // --- Screen eyedropper -------------------------------------------------
  async function handleEyedropper() {
    notice = '';
    const result = await pickScreenColour(typeof window === 'undefined' ? globalThis : window);
    if (result.ok) {
      syncFromHex(result.color);
      fireChange();
      return;
    }
    if (result.cancelled) return;
    notice = result.reason;
  }

  // --- Band config ---
  const bands = [
    { id: 'hue', label: 'H', title: 'Hue' },
    { id: 'saturation', label: 'S', title: 'Saturation' },
    { id: 'brightness', label: 'B', title: 'Brightness (HSB value)' },
    { id: 'alpha', label: 'A', title: 'Alpha' },
  ];

  function getGradient(id) {
    switch (id) {
      case 'hue': return hueGradient;
      case 'saturation': return satGradient;
      case 'brightness': return brightGradient;
      case 'alpha': return alphaGradient;
    }
  }

  function getThumbPos(id) {
    switch (id) {
      case 'hue': return huePos;
      case 'saturation': return satPos;
      case 'brightness': return brightPos;
      case 'alpha': return alphaPos;
    }
  }

  function getThumbColor(id) {
    return id === 'alpha' ? alphaThumbColor : thumbColor;
  }
</script>

<div class="color-chooser">
  <!-- Saturation / brightness square — the primary control -->
  <div class="sv-area">
    <div
      class="sv-square"
      bind:this={squareEl}
      style="background: {squareBackground}"
      role="slider"
      tabindex="0"
      aria-label="Saturation and brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(brightness)}
      aria-valuetext="Saturation {Math.round(saturation)}%, brightness {Math.round(brightness)}%"
      onpointerdown={handleSquarePointerDown}
      onpointermove={handleSquarePointerMove}
      onpointerup={handleSquarePointerUp}
      onpointercancel={handleSquarePointerUp}
      onkeydown={handleSquareKeydown}
    >
      <div
        class="sv-thumb"
        style="left: {saturation}%; top: {100 - brightness}%; background: {thumbColor}"
      ></div>
    </div>

    <div class="sv-toolbar">
      <span class="swatch-preview" title="Current colour">
        <span class="swatch-checker"></span>
        <span class="swatch-fill" style="background: {colorWithAlpha}"></span>
      </span>
      <button
        class="eyedropper"
        type="button"
        onclick={handleEyedropper}
        disabled={!hasEyedropper}
        title={hasEyedropper ? 'Pick a colour from anywhere on screen' : 'This browser has no screen eyedropper'}
        aria-label="Pick a colour from the screen"
      >
        <Pipette size={13} strokeWidth={1.6} />
      </button>
      <input
        class="hex-input"
        class:invalid={!!notice}
        type="text"
        value={editingHex ? hexInput : displayHex}
        onfocus={handleHexFocus}
        onblur={handleHexBlur}
        onkeydown={handleHexKeydown}
        oninput={(e) => { hexInput = e.target.value; notice = ''; }}
        aria-label="Colour value"
        aria-invalid={!!notice}
        title="#RGB, #ARGB, #RRGGBB, #AARRGGBB or rgb()"
        spellcheck="false"
      />
    </div>

    {#if notice}
      <div class="notice" role="status">{notice}</div>
    {/if}
  </div>

  <!-- Gradient bands (bottom) -->
  <div class="bands-container">
    {#each bands as band}
      <div class="band-wrapper">
        <div
          class="band"
          class:is-alpha={band.id === 'alpha'}
          data-band={band.id}
          role="slider"
          tabindex="0"
          aria-label={band.title}
          aria-valuemin={0}
          aria-valuemax={band.id === 'hue' ? 360 : 100}
          aria-valuenow={getBandNow(band.id)}
          title={band.title}
          use:dragScrub={bandParams[band.id]}
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

  .sv-area {
    position: relative;
    flex: 1;
    min-height: 90px;
    padding: 8px 20px 0;
    display: flex;
  }

  .sv-square {
    flex: 1;
    position: relative;
    border-radius: 4px;
    cursor: crosshair;
    touch-action: none;
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5), 0 1px 4px rgba(0, 0, 0, 0.4);
  }

  .sv-square:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .sv-thumb {
    position: absolute;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 2px solid #fff;
    box-shadow: 0 0 3px rgba(0, 0, 0, 0.8), inset 0 0 2px rgba(0, 0, 0, 0.3);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .sv-toolbar {
    position: absolute;
    top: 14px;
    right: 26px;
    display: flex;
    align-items: center;
    gap: 4px;
    z-index: 3;
  }

  .swatch-preview {
    position: relative;
    width: 20px;
    height: 20px;
    border-radius: 3px;
    overflow: hidden;
    border: 1px solid rgba(0, 0, 0, 0.5);
    flex-shrink: 0;
  }

  .swatch-checker {
    position: absolute;
    inset: 0;
    background: repeating-conic-gradient(#555 0% 25%, #333 0% 50%) 0 0 / 8px 8px;
  }

  .swatch-fill {
    position: absolute;
    inset: 0;
  }

  .eyedropper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.45);
    color: #DDD;
    cursor: pointer;
  }

  .eyedropper:hover:not(:disabled) {
    border-color: #5B9BD5;
    color: #FFF;
  }

  .eyedropper:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .notice {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 4px;
    font-size: 10px;
    color: #F2B04A;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
    z-index: 3;
  }

  .bands-container {
    position: relative;
    z-index: 2;
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

  .band:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
  }

  .hex-input {
    background: rgba(0, 0, 0, 0.45);
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
    background: rgba(0, 0, 0, 0.6);
  }

  .hex-input.invalid {
    border-color: #F2B04A;
  }
</style>
