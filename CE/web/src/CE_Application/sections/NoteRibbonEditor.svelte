<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    ribbonZones, ribbonRange,
  } from '../utils/noteRibbonLayout.js';
  import { NOTE_SHARP, NOTE_FLAT, useFlats, noteName } from '../utils/chordPadLayout.js';
  import FieldList from '../properties/FieldList.svelte';
  import {
    NOTERIBBON_APPEARANCE_FIELDS, NOTERIBBON_KEYBOARD_FIELDS, NOTERIBBON_PERFORMANCE_FIELDS,
  } from '../models/inspectorFieldSets.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PanelKeyCell from '../properties/PanelKeyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Music from 'lucide-svelte/icons/music';
  import Activity from 'lucide-svelte/icons/activity';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let r = $derived(getSection(control, 'NoteRibbon'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `NoteRibbon.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let flats = $derived(useFlats(num(r?.key, 0), String(r?.scale ?? 'major')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let isGlide = $derived(String(r?.mode ?? 'snap') === 'glide');


  let span = $derived.by(() => {
    try {
      const { lo, hi } = ribbonRange(control);
      const label = (m) => `${noteName(((m % 12) + 12) % 12, flats)}${Math.floor(m / 12) - 1}`;
      return `${label(lo)} → ${label(hi)} · ${ribbonZones(control).length} zones`;
    } catch { return ''; }
  });
</script>

{#if r}
  <!-- Ordinary fields are data (models/inspectorFieldSets.js); the cells below are the editor's own. -->
  {#snippet panelKey()}<PanelKeyCell {control} section="NoteRibbon" />{/snippet}
  {#snippet keyPicker()}
    <PropertyCell label="Key" span={1} hint="Tonic. Roots are accented; in scale-snap mode only these notes are reachable.">
      <select class="val" value={String(num(r.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
        {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
      </select>
    </PropertyCell>
  {/snippet}
  {#snippet spanPreview()}
    <PropertyCell label="" span={4} hint="What the strip currently covers." compact>
      <div class="preview">{span}</div>
    </PropertyCell>
  {/snippet}
  {#snippet bendNote()}
    <PropertyCell label="" span={2} hint="Bend only reaches ±the range, so past that the note retriggers on a new root." compact>
      <div class="note">Retriggers past ±{num(r.bendRange, 2)} semitones</div>
    </PropertyCell>
  {/snippet}
  {#snippet echoColour()}
    <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline. Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'echoColour', label: 'Echo', value: r.echoColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.echoColour' } },
      ]} />
    </PropertyCell>
  {/snippet}
  {#snippet info()}
    <PropertyCell label="" span={3} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth." compact>
      <div class="note">Plays MIDI notes · ch {num(r.channel, 1)}{isGlide ? ' · + pitch bend' : ''}{String(r.modAxis ?? 'none') === 'cc' ? ` · + CC${num(r.modCc, 1)}` : ''}</div>
    </PropertyCell>
  {/snippet}

  <PropertySection title="Ribbon Keyboard" icon={Music}>
    <FieldList fields={NOTERIBBON_KEYBOARD_FIELDS} values={r} {set} slots={{ panelKey, key: keyPicker, span: spanPreview }} />
  </PropertySection>

  <PropertySection title="Performance" icon={Activity}>
    <FieldList fields={NOTERIBBON_PERFORMANCE_FIELDS} values={r} {set} slots={{ bendNote, echoColour, info }} />
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <FieldList fields={NOTERIBBON_APPEARANCE_FIELDS} values={r} {set} />
    <PropertyCell label="Colours" span={4} hint="Field, zone fill, in-key accent, root accent, touch rail, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: r.fieldColour ?? 'FF101017', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.fieldColour' } },
        { key: 'zoneColour', label: 'Zones', value: r.zoneColour ?? 'FF171720', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.zoneColour' } },
        { key: 'inKeyColour', label: 'In key', value: r.inKeyColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.inKeyColour' } },
        { key: 'rootColour', label: 'Roots', value: r.rootColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.rootColour' } },
        { key: 'touchColour', label: 'Touch', value: r.touchColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.touchColour' } },
        { key: 'labelColour', label: 'Labels', value: r.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'NoteRibbon.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
