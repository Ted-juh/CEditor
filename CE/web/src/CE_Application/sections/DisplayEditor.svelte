<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { LCD_PALETTES } from '../editor/LcdDisplayRenderer.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let display = $derived(getSection(control, 'Display'));
  let rows = $derived(Math.max(1, Math.round(Number(display?.rows ?? 2))));
  let lines = $derived(Array.isArray(display?.lines) ? display.lines : []);
  let paletteEntries = $derived(Object.entries(LCD_PALETTES));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Display.${prop}`, value);
  }

  function toggle(prop, defaultOn = true) {
    const current = display?.[prop];
    const isOn = current === undefined ? defaultOn : current !== false;
    set(prop, !isOn);
  }

  // Applying a palette writes its colours into the Display section; individual
  // colours stay editable afterwards.
  function applyPalette(id) {
    const p = LCD_PALETTES[id];
    if (!p) return;
    set('palette', id);
    set('litColour', p.lit);
    set('unlitColour', p.unlit);
    set('screenColour', p.screen);
    set('backlightColour', p.backlight);
  }

  function setLine(index, value) {
    set(`lines.${index}`, String(value ?? ''));
  }
</script>

{#if display}
  <PropertySection title="Screen">
    <PropertyCell label="Palette" span={4} hint="Ready-made lit/unlit/backlight colour set. You can still tweak colours below.">
      <select class="val" value={display.palette ?? 'greenStn'} onchange={(event) => applyPalette(event.target.value)}>
        {#each paletteEntries as [id, entry]}
          <option value={id}>{entry.label}</option>
        {/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Columns" span={2} hint="Characters per line.">
      <NumberInput value={display.cols ?? 16} step={1} min={1} max={64} onchange={(value) => set('cols', Math.round(value))} />
    </PropertyCell>
    <PropertyCell label="Rows" span={2} hint="Number of text lines.">
      <NumberInput value={display.rows ?? 2} step={1} min={1} max={16} onchange={(value) => set('rows', Math.round(value))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Text">
    {#each Array.from({ length: rows }) as _, index}
      <PropertyCell label={`Line ${index + 1}`} span={4} hint="Text shown on this row (truncated/padded to the column count).">
        <input class="val" type="text" value={lines[index] ?? ''} oninput={(event) => setLine(index, event.target.value)} />
      </PropertyCell>
    {/each}
  </PropertySection>

  <PropertySection title="Colour">
    <PropertyCell label="Lit" span={2} hint="Foreground (lit segment) colour, AARRGGBB.">
      <input class="val" type="text" value={display.litColour ?? 'FF2BE86A'} onchange={(event) => set('litColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Unlit" span={2} hint="Faint unlit 'ghost' segment colour, AARRGGBB.">
      <input class="val" type="text" value={display.unlitColour ?? '242BE86A'} onchange={(event) => set('unlitColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Screen" span={2} hint="Screen substrate behind the pixels, AARRGGBB.">
      <input class="val" type="text" value={display.screenColour ?? 'FF06371C'} onchange={(event) => set('screenColour', event.target.value.trim())} />
    </PropertyCell>
    <PropertyCell label="Backlight" span={2} hint="Backlight wash colour, AARRGGBB.">
      <input class="val" type="text" value={display.backlightColour ?? 'FF0E5A2E'} onchange={(event) => set('backlightColour', event.target.value.trim())} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Lighting">
    <PropertyCell label="Backlight" span={2} hint="Turn the backlight wash on or off.">
      <PropertyToggle value={display.backlightOn !== false} onchange={() => toggle('backlightOn', true)} />
    </PropertyCell>
    <PropertyCell label="Brightness" span={2} hint="Foreground intensity (0–100).">
      <NumberInput value={display.brightness ?? 100} step={5} min={0} max={100} onchange={(value) => set('brightness', value)} />
    </PropertyCell>
    <PropertyCell label="Contrast" span={2} hint="LCD trim-pot feel — ghost/backlight strength (0–100).">
      <NumberInput value={display.contrast ?? 55} step={5} min={0} max={100} onchange={(value) => set('contrast', value)} />
    </PropertyCell>
    <PropertyCell label="Ghost dots" span={2} hint="Faint unlit cells behind the text (realism cue).">
      <PropertyToggle value={display.showGhost !== false} onchange={() => toggle('showGhost', true)} />
    </PropertyCell>
    <PropertyCell label="Scanlines" span={2} hint="Horizontal scanline overlay.">
      <PropertyToggle value={display.showScanlines === true} onchange={() => toggle('showScanlines', false)} />
    </PropertyCell>
    <PropertyCell label="Cell grid" span={2} hint="Faint pixel/cell grid lines.">
      <PropertyToggle value={display.showGrid === true} onchange={() => toggle('showGrid', false)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Layout">
    <PropertyCell label="Padding" span={2} hint="Inset from the bezel to the screen (px).">
      <NumberInput value={display.padding ?? 10} step={1} min={0} onchange={(value) => set('padding', value)} />
    </PropertyCell>
    <PropertyCell label="Font Scale" span={2} hint="Relative glyph size.">
      <NumberInput value={display.fontScale ?? 1} step={0.05} min={0.3} max={3} onchange={(value) => set('fontScale', value)} />
    </PropertyCell>
    <PropertyCell label="Char Gap" span={2} hint="Extra spacing between characters (px).">
      <NumberInput value={display.charSpacing ?? 1} step={1} min={0} onchange={(value) => set('charSpacing', value)} />
    </PropertyCell>
    <PropertyCell label="Line Gap" span={2} hint="Extra spacing between rows (px).">
      <NumberInput value={display.lineSpacing ?? 3} step={1} min={0} onchange={(value) => set('lineSpacing', value)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%;
    box-sizing: border-box;
    background: var(--input-bg, #1c1c1c);
    border: 1px solid var(--input-border, #3a3a3a);
    color: var(--text, #e8e8e8);
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
  }
</style>
