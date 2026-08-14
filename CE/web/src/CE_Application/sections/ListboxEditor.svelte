<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import Image from 'lucide-svelte/icons/image';
  import Rows2 from 'lucide-svelte/icons/rows-2';
  import Badge from 'lucide-svelte/icons/badge';
  import Palette from 'lucide-svelte/icons/palette';
  import Rows3 from 'lucide-svelte/icons/rows-3';
  import GalleryVertical from 'lucide-svelte/icons/gallery-vertical';
  import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
  import Wind from 'lucide-svelte/icons/wind';
  import Hand from 'lucide-svelte/icons/hand';
  import Keyboard from 'lucide-svelte/icons/keyboard';
  import LocateFixed from 'lucide-svelte/icons/locate-fixed';
  import Search from 'lucide-svelte/icons/search';
  import Highlighter from 'lucide-svelte/icons/highlighter';
  import { syncPresetChoiceRows, initPresetChoiceSync } from '../stores/presetChoiceSync.js';

  let { control = null } = $props();
  let core = $derived(getSection(control, 'Core'));
  let lb = $derived(getSection(control, 'Listbox') ?? {});
  let syncNote = $state('');
  initPresetChoiceSync(); // scans + late profile sources keep preset-sourced rows fresh

  function set(prop, value) {
    if (core?.id) updateControlProperty(core.id, `Listbox.${prop}`, value);
  }
  function toggle(prop, defaultOn = true) {
    set(prop, !(lb?.[prop] ?? defaultOn));
  }
</script>

{#if lb}
  <PropertySection title="Rows">
    <PropertyCell label="Row height" span={2} compact hint="Fixed row height in px (0 = auto from font size).">
      <NumberCell label="Height" value={lb.rowHeight ?? 0} step={1} min={0} max={80} defaultValue={0} onchange={(v) => set('rowHeight', Math.max(0, Math.round(v)))} />
    </PropertyCell>
    <PropertyCell label="Density" span={2} hint="Comfortable or compact auto row height.">
      <Segmented
        ariaLabel="Density"
        value={lb.density ?? 'comfortable'}
        options={[
          { value: 'comfortable', label: 'Comfortable' },
          { value: 'compact', label: 'Compact' },
        ]}
        onchange={(v) => set('density', v)}
      />
    </PropertyCell>
    <PropertyCell label="Appearance" span={4} hint="Icons, two-line subtitles, badges, colour swatch, zebra stripes, card rows, edge fades. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'showIcons', title: 'Icons — show per-row icons when set', on: lb.showIcons !== false, icon: Image },
          { key: 'twoLine', title: 'Two-line — per-row subtitle on a second line', on: lb.twoLine === true, icon: Rows2 },
          { key: 'showBadges', title: 'Badges — per-row trailing badges', on: lb.showBadges !== false, icon: Badge },
          { key: 'showSwatch', title: 'Swatch — per-row colour stripe', on: lb.showSwatch === true, icon: Palette },
          { key: 'zebra', title: 'Zebra — alternating row stripes', on: lb.zebra === true, icon: Rows3 },
          { key: 'cardRows', title: 'Cards — gaps + rounded corners per row', on: lb.cardRows === true, icon: GalleryVertical },
          { key: 'fadeEdges', title: 'Fade edges — top/bottom fade hinting more content', on: lb.fadeEdges === true, icon: ChevronsUpDown },
        ]}
        ontoggle={(key) => toggle(key, key === 'showIcons' || key === 'showBadges')}
      />
    </PropertyCell>
    <PropertyCell label="Scrollbar" span={4} hint="Scrollbar visibility.">
      <Segmented
        ariaLabel="Scrollbar visibility"
        value={lb.scrollbar ?? 'auto'}
        options={[
          { value: 'auto', label: 'Auto' },
          { value: 'always', label: 'Always' },
          { value: 'thin', label: 'Thin' },
          { value: 'hidden', label: 'Hidden' },
        ]}
        onchange={(v) => set('scrollbar', v)}
      />
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
    <PropertyCell label="Accent" span={2} hint="Selection/highlight colour (empty = the Background border colour). Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'accentColour', label: 'Accent', value: lb.accentColour || 'FF89C2FF', target: { type: 'control', controlId: core?.id, path: 'Listbox.accentColour' } },
      ]} />
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
      <Segmented
        ariaLabel="Scroll mode"
        value={lb.scrollMode ?? 'line'}
        options={[
          { value: 'line', label: 'Line' },
          { value: 'smooth', label: 'Smooth' },
        ]}
        onchange={(v) => set('scrollMode', v)}
      />
    </PropertyCell>
    <PropertyCell label="Nav" span={2} hint="Momentum, drag scroll, keyboard navigation, follow selection. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'momentum', title: 'Momentum — inertial flick scrolling (smooth mode)', on: lb.momentum === true, icon: Wind },
          { key: 'dragScroll', title: 'Drag scroll — grab and swipe the list', on: lb.dragScroll === true, icon: Hand },
          { key: 'keyboardNav', title: 'Keyboard — arrows / Page / Home / End move selection', on: lb.keyboardNav !== false, icon: Keyboard },
          { key: 'scrollIntoView', title: 'Follow selection — keep the selected row scrolled into view', on: lb.scrollIntoView !== false, icon: LocateFixed },
        ]}
        ontoggle={(key) => toggle(key, key === 'keyboardNav' || key === 'scrollIntoView')}
      />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Search">
    <PropertyCell label="Type-ahead" span={2} hint="Focus + type to jump to a matching row.">
      <Segmented
        ariaLabel="Type-ahead"
        value={lb.typeAhead ?? 'off'}
        options={[
          { value: 'off', label: 'Off' },
          { value: 'prefix', label: 'Prefix' },
          { value: 'fuzzy', label: 'Fuzzy' },
        ]}
        onchange={(v) => set('typeAhead', v)}
      />
    </PropertyCell>
    <PropertyCell label="Show" span={2} hint="Filter box, match highlighting. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'filterBox', title: 'Filter box — header search field that live-filters rows', on: lb.filterBox === true, icon: Search },
          { key: 'highlightMatch', title: 'Highlight — highlight the matched substring', on: lb.highlightMatch !== false, icon: Highlighter },
        ]}
        ontoggle={(key) => toggle(key, key === 'highlightMatch')}
      />
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
      <Segmented
        ariaLabel="Commit mode"
        value={lb.confirmMode ?? 'single'}
        options={[
          { value: 'single', label: 'Single click' },
          { value: 'double', label: 'Double click' },
          { value: 'enter', label: 'Enter key' },
        ]}
        onchange={(v) => set('confirmMode', v)}
      />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Data">
    <PropertyCell label="Source" span={2} hint="Rows from the Value editor, the device's live preset list, or the profile's shipped factory catalog.">
      <select class="val" value={lb.choiceSource ?? 'rows'} onchange={(e) => { set('choiceSource', e.target.value); if (e.target.value !== 'rows') syncPresetChoiceRows({}); }}>
        <option value="rows">Value rows</option>
        <option value="devicePresets">Device presets</option>
        <option value="factoryCatalog">Factory catalog</option>
      </select>
    </PropertyCell>
    {#if (lb.choiceSource ?? 'rows') !== 'rows'}
      <PropertyCell label="Rows" span={2} hint="Rebuild the preset rows from the profile (and latest scan) now.">
        <button class="val" type="button" onclick={() => { const r = syncPresetChoiceRows({}); syncNote = r.updated ? `Updated ${r.updated} selector(s).` : (r.targets ? 'Rows already up to date (or no preset model on the active profile).' : 'No preset-sourced selectors on this panel.'); }}>Sync from device profile</button>
        {#if syncNote}<span class="hint-note">{syncNote}</span>{/if}
      </PropertyCell>
    {/if}
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

  .hint-note {
    display: block;
    margin-top: 4px;
    font-size: 11px;
    opacity: 0.7;
  }
  .val:focus-visible {
    outline: 2px solid #5B9BD5;
    outline-offset: 1px;
    border-color: #5B9BD5;
  }
  .field-row { display: flex; gap: 4px; align-items: center; }
</style>
