<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';
  import { aarrggbbToHex, mergeHexKeepAlpha } from '../utils/colourHex.js';

  let { control = null } = $props();
  let core = $derived(getSection(control, 'Core'));
  let lb = $derived(getSection(control, 'Listbox') ?? {});

  function set(prop, value) {
    if (core?.id) updateControlProperty(core.id, `Listbox.${prop}`, value);
  }
  function toggle(prop, defaultOn = true) {
    set(prop, !(lb?.[prop] ?? defaultOn));
  }
</script>

{#if lb}
  <PropertySection title="Rows">
    <PropertyCell label="Row height" span={2} hint="Fixed row height in px (0 = auto from font size).">
      <NumberInput value={lb.rowHeight ?? 0} step={1} min={0} max={80} onchange={(v) => set('rowHeight', Math.max(0, Math.round(v)))} />
    </PropertyCell>
    <PropertyCell label="Density" span={2} hint="Comfortable or compact auto row height.">
      <select class="val" value={lb.density ?? 'comfortable'} onchange={(e) => set('density', e.target.value)}>
        <option value="comfortable">Comfortable</option>
        <option value="compact">Compact</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Icons" span={1} hint="Show per-row icons when set.">
      <PropertyToggle value={lb.showIcons !== false} onchange={() => toggle('showIcons', true)} />
    </PropertyCell>
    <PropertyCell label="Two-line" span={1} hint="Show the per-row subtitle on a second line.">
      <PropertyToggle value={lb.twoLine === true} onchange={() => toggle('twoLine', false)} />
    </PropertyCell>
    <PropertyCell label="Badges" span={1} hint="Show per-row trailing badges.">
      <PropertyToggle value={lb.showBadges !== false} onchange={() => toggle('showBadges', true)} />
    </PropertyCell>
    <PropertyCell label="Swatch" span={1} hint="Show the per-row colour stripe.">
      <PropertyToggle value={lb.showSwatch === true} onchange={() => toggle('showSwatch', false)} />
    </PropertyCell>
    <PropertyCell label="Zebra" span={1} hint="Alternating row stripes.">
      <PropertyToggle value={lb.zebra === true} onchange={() => toggle('zebra', false)} />
    </PropertyCell>
    <PropertyCell label="Cards" span={1} hint="Gaps + rounded corners per row.">
      <PropertyToggle value={lb.cardRows === true} onchange={() => toggle('cardRows', false)} />
    </PropertyCell>
    <PropertyCell label="Fade edges" span={1} hint="Top/bottom fade hinting more content.">
      <PropertyToggle value={lb.fadeEdges === true} onchange={() => toggle('fadeEdges', false)} />
    </PropertyCell>
    <PropertyCell label="Scrollbar" span={1} hint="Scrollbar visibility.">
      <select class="val" value={lb.scrollbar ?? 'auto'} onchange={(e) => set('scrollbar', e.target.value)}>
        <option value="auto">Auto</option>
        <option value="always">Always</option>
        <option value="thin">Thin</option>
        <option value="hidden">Hidden</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Empty text" span={4} hint="Shown when the list has no rows.">
      <input class="val" type="text" value={lb.emptyText ?? 'No items'} oninput={(e) => set('emptyText', e.target.value)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Selection">
    <PropertyCell label="Style" span={2} hint="How the selected row is marked.">
      <select class="val" value={lb.selectionStyle ?? 'bar'} onchange={(e) => set('selectionStyle', e.target.value)}>
        <option value="bar">Full bar</option>
        <option value="stripe">Left stripe</option>
        <option value="outline">Outline</option>
        <option value="check">Checkmark</option>
        <option value="bold">Bold only</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Accent" span={2} hint="Selection/highlight colour (empty = the Background border colour).">
      <div class="field-row">
        <input class="val cswatch" type="color" title="Pick accent (keeps alpha)" value={aarrggbbToHex(lb.accentColour || 'FF89C2FF')} oninput={(e) => set('accentColour', mergeHexKeepAlpha(lb.accentColour || 'FF000000', e.target.value))} />
        <input class="val" type="text" placeholder="AARRGGBB" value={lb.accentColour ?? ''} onchange={(e) => set('accentColour', e.target.value.trim())} />
      </div>
    </PropertyCell>
    <PropertyCell label="Animate" span={2} hint="Slide/fade the selection indicator between rows.">
      <PropertyToggle value={lb.selectionAnim === true} onchange={() => toggle('selectionAnim', false)} />
    </PropertyCell>
    <PropertyCell label="Multi-select" span={2} hint="Checkbox / ctrl-click multi-selection.">
      <PropertyToggle value={lb.multiSelect === true} onchange={() => toggle('multiSelect', false)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Scroll & navigation">
    <PropertyCell label="Scroll" span={2} hint="Line-by-line snap, or smooth/pixel scrolling.">
      <select class="val" value={lb.scrollMode ?? 'line'} onchange={(e) => set('scrollMode', e.target.value)}>
        <option value="line">Line</option>
        <option value="smooth">Smooth</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Momentum" span={2} hint="Inertial flick scrolling (smooth mode).">
      <PropertyToggle value={lb.momentum === true} onchange={() => toggle('momentum', false)} />
    </PropertyCell>
    <PropertyCell label="Drag scroll" span={1} hint="Grab and swipe the list.">
      <PropertyToggle value={lb.dragScroll === true} onchange={() => toggle('dragScroll', false)} />
    </PropertyCell>
    <PropertyCell label="Keyboard" span={1} hint="Arrows / Page / Home / End move selection.">
      <PropertyToggle value={lb.keyboardNav !== false} onchange={() => toggle('keyboardNav', true)} />
    </PropertyCell>
    <PropertyCell label="Follow sel" span={2} hint="Keep the selected row scrolled into view.">
      <PropertyToggle value={lb.scrollIntoView !== false} onchange={() => toggle('scrollIntoView', true)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Search">
    <PropertyCell label="Type-ahead" span={2} hint="Focus + type to jump to a matching row.">
      <select class="val" value={lb.typeAhead ?? 'off'} onchange={(e) => set('typeAhead', e.target.value)}>
        <option value="off">Off</option>
        <option value="prefix">Prefix</option>
        <option value="fuzzy">Fuzzy</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Filter box" span={1} hint="Header search field that live-filters rows.">
      <PropertyToggle value={lb.filterBox === true} onchange={() => toggle('filterBox', false)} />
    </PropertyCell>
    <PropertyCell label="Highlight" span={1} hint="Highlight the matched substring.">
      <PropertyToggle value={lb.highlightMatch !== false} onchange={() => toggle('highlightMatch', true)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Interaction">
    <PropertyCell label="Hover" span={1} hint="Highlight the row under the pointer.">
      <PropertyToggle value={lb.hoverHighlight !== false} onchange={() => toggle('hoverHighlight', true)} />
    </PropertyCell>
    <PropertyCell label="Hover anim" span={3} hint="Animation on the hovered row.">
      <select class="val" value={lb.hoverAnim ?? 'none'} onchange={(e) => set('hoverAnim', e.target.value)}>
        <option value="none">None</option>
        <option value="glow">Glow</option>
        <option value="slide">Slide</option>
        <option value="scale">Scale</option>
        <option value="icon">Icon reveal</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Commit" span={4} hint="When a pick 'commits' (fires recall / value-change).">
      <select class="val" value={lb.confirmMode ?? 'single'} onchange={(e) => set('confirmMode', e.target.value)}>
        <option value="single">Single click</option>
        <option value="double">Double click</option>
        <option value="enter">Enter key</option>
      </select>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Data (preset browser)">
    <PropertyCell label="Source" span={2} hint="Rows from the Value editor, or the device's preset list.">
      <select class="val" value={lb.choiceSource ?? 'rows'} onchange={(e) => set('choiceSource', e.target.value)}>
        <option value="rows">Value rows</option>
        <option value="devicePresets">Device presets</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Recall" span={1} hint="Fire the bound recall action on select/confirm.">
      <PropertyToggle value={lb.recallOnSelect === true} onchange={() => toggle('recallOnSelect', false)} />
    </PropertyCell>
    <PropertyCell label="Now playing" span={1} hint="Mark the live/recalled row distinct from selection.">
      <PropertyToggle value={lb.nowPlaying === true} onchange={() => toggle('nowPlaying', false)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%;
    box-sizing: border-box;
    background: #1A1A1A;
    border: 1px solid #333;
    color: #DDD;
    border-radius: 4px;
    padding: 3px 6px;
    font-size: 12px;
  }
  .val:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
    border-color: #5B9BD5;
  }
  .field-row { display: flex; gap: 4px; align-items: center; }
  .cswatch { width: 30px; flex: 0 0 auto; padding: 1px; height: 24px; cursor: pointer; }
</style>
