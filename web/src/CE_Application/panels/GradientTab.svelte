<script>
  /**
   * Gradient tab for DisplayPanel. Owns the gradient tab's local-only
   * state (`gradientSelectedStop`, `gradientShape`, `gradientSwatches`,
   * and the gradient-preset swatch handlers) plus the tab template + CSS.
   *
   * `currentGradient` itself stays in the parent because the cross-tab
   * stop-color editing flow (Colors tab's live mini-preview) also reads
   * and mutates it. The child receives it as a prop and bubbles all
   * mutations through `onchange`.
   */
  import GradientEditor from '../components/GradientEditor.svelte';
  import GradientSettings from '../components/GradientSettings.svelte';
  import SwatchGrid from '../components/SwatchGrid.svelte';
  import { deepClone } from '../utils/deepClone.js';

  let {
    gradient,                   // current gradient (parent-owned)
    swatches = [],              // shared color swatches (parent-owned)
    onchange = null,            // (newGradient) => void
    oneditstopcolor = null,     // (stopIndex) => void — triggers cross-tab flow
    onshapechange = null,       // (shape) => void — sync shape to parent
    onswatchdblclick = null,
    onswatchrightclick = null,
  } = $props();

  // Tab-local state — not shared with any other tab.
  let selectedStop = $state(0);
  let shape = $state('rectangle');
  let gradientPresets = $state(Array(24).fill(null));

  // Swatch click: filled cell → apply that color to the currently selected
  // gradient stop. Empty cell → store the selected stop's color into the
  // swatch. `swatches` is a $state proxy from the parent — mutating it
  // here propagates through Svelte's reactivity.
  function handleSwatchClick(index) {
    if (swatches[index]) {
      const newStops = gradient.stops.map((s, i) =>
        i === selectedStop ? { ...s, color: swatches[index] } : s
      );
      onchange?.({ ...gradient, stops: newStops });
    } else if (gradient.stops[selectedStop]) {
      swatches[index] = gradient.stops[selectedStop].color;
    }
  }

  // --- Preset handlers (gradient storage, not colors) ---
  function handlePresetClick(index) {
    if (gradientPresets[index]) {
      const loaded = deepClone(gradientPresets[index]);
      onchange?.(loaded);
    } else {
      gradientPresets[index] = deepClone(gradient);
    }
  }

  function handlePresetDblClick(index) {
    gradientPresets[index] = null;
  }

  function handlePresetRightClick(index, e) {
    e.preventDefault();
    gradientPresets[index] = deepClone(gradient);
  }
</script>

<div class="gradient-layout">
  <div class="gradient-preview">
    <GradientEditor
      {gradient}
      {selectedStop}
      {shape}
      onchange={(g) => onchange?.(g)}
      onSelectStop={(i) => selectedStop = i}
    />
  </div>
  <div class="gradient-sidebar">
    <div class="sidebar-settings">
      <GradientSettings
        {gradient}
        {selectedStop}
        {shape}
        onchange={(g) => onchange?.(g)}
        onSelectStop={(i) => selectedStop = i}
        onEditStopColor={(i) => oneditstopcolor?.(i)}
        onShapeChange={(s) => {
          shape = s;
          onshapechange?.(s);
        }}
        gradientSwatches={gradientPresets}
        onGradientPresetClick={handlePresetClick}
        onGradientPresetDblClick={handlePresetDblClick}
        onGradientPresetRightClick={handlePresetRightClick}
      />
    </div>
    <SwatchGrid
      {swatches}
      onclick={handleSwatchClick}
      ondblclick={(i) => onswatchdblclick?.(i)}
      oncontextmenu={(i, e) => onswatchrightclick?.(i, e)}
      getTitle={(s) => s ? `#${s} — click to assign to selected stop` : 'Click to store stop color'}
    />
  </div>
</div>

<style>
  .gradient-layout {
    display: flex;
    height: 100%;
  }

  .gradient-preview {
    width: 75%;
    flex-shrink: 0;
    border-right: 1px solid #333;
  }

  .gradient-sidebar {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .sidebar-settings {
    flex: 3;
    overflow: auto;
  }
</style>
