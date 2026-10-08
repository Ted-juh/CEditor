<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { NOTE_SHARP, NOTE_FLAT, useFlats, chordPadPads } from '../utils/chordPadLayout.js';
  import FieldList from '../properties/FieldList.svelte';
  import { CHORDPAD_FIELDS, CHORDPAD_PERFORMANCE_FIELDS } from '../models/inspectorFieldSets.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PanelKeyCell from '../properties/PanelKeyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Music from 'lucide-svelte/icons/music';
  import Activity from 'lucide-svelte/icons/activity';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let cp = $derived(getSection(control, 'ChordPad'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `ChordPad.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let flats = $derived(useFlats(num(cp?.key, 0), String(cp?.scale ?? 'major')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  // A live preview of what the pads will spell.
  let padPreview = $derived.by(() => {
    try { return chordPadPads(control).map((p) => p.name).join('  ·  '); } catch { return ''; }
  });

</script>

{#if cp}
  <!-- Ordinary fields are data (models/inspectorFieldSets.js); the cells below are the editor's own. -->
  {#snippet panelKey()}<PanelKeyCell {control} section="ChordPad" />{/snippet}
  {#snippet keyPicker()}
    <PropertyCell label="Key" span={2} hint="The tonic. Pads and the wheel's lit wedge follow it.">
      <select class="val" value={String(num(cp.key, 0))} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
        {#each keyNames as nm, i (i)}<option value={String(i)}>{nm}</option>{/each}
      </select>
    </PropertyCell>
  {/snippet}
  {#snippet preview()}
    <PropertyCell label="" span={4} hint="What the pads currently spell." compact>
      <div class="preview">{padPreview}</div>
    </PropertyCell>
  {/snippet}
  {#snippet echoColour()}
    <PropertyCell label="Echo colour" span={1} hint="Colour of the incoming-note outline. Click the swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'echo', label: 'Echo', value: cp.echoColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'ChordPad.echoColour' } },
      ]} />
    </PropertyCell>
  {/snippet}
  {#snippet note()}
    <PropertyCell label="" span={4} hint="Notes are sent as raw MIDI on the 'mainSynth' device role — pick a hardware output there for them to reach the synth." compact>
      <div class="note">Plays MIDI notes · ch {num(cp.channel, 1)} · vel {num(cp.velocity, 96)}</div>
    </PropertyCell>
  {/snippet}

  <PropertySection title="Chord Pad" icon={Music}>
    <FieldList fields={CHORDPAD_FIELDS} values={cp} {set} slots={{ panelKey, key: keyPicker, preview }} />
  </PropertySection>

  <PropertySection title="Performance" icon={Activity}>
    <FieldList fields={CHORDPAD_PERFORMANCE_FIELDS} values={cp} {set} slots={{ echoColour, note }} />
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Pad colours" span={4} hint="Pad fill, in-key accent, tonic accent, minor ring, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fieldColour', label: 'Field', value: cp.fieldColour ?? 'FF101017', target: { type: 'control', controlId: core?.id, path: 'ChordPad.fieldColour' } },
        { key: 'padColour', label: 'Pads', value: cp.padColour ?? 'FF171720', target: { type: 'control', controlId: core?.id, path: 'ChordPad.padColour' } },
        { key: 'echoColour', label: 'Echo', value: cp.echoColour ?? 'FF39D98A', target: { type: 'control', controlId: core?.id, path: 'ChordPad.echoColour' } },
        { key: 'inKeyColour', label: 'In key', value: cp.inKeyColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'ChordPad.inKeyColour' } },
        { key: 'tonicColour', label: 'Tonic', value: cp.tonicColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'ChordPad.tonicColour' } },
        { key: 'minorColour', label: 'Minors', value: cp.minorColour ?? 'FF9B8AFF', target: { type: 'control', controlId: core?.id, path: 'ChordPad.minorColour' } },
        { key: 'labelColour', label: 'Labels', value: cp.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'ChordPad.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .preview { font-size: 12px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; }
  .note { font-size: 11px; color: #8a8a94; }
</style>
