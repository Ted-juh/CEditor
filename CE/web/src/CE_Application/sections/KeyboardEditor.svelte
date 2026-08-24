<script>
  // Keyboard — range, channel, and what a key out of the panel's key does.
  //
  // The scale-lock choice is the only one that needs explaining: `off` plays every key, `quantize`
  // moves an out-of-key press to the nearest in-key note, and `refuse` sends nothing. Out-of-key
  // keys are shaded either way, so the rule is visible before the player meets it.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PanelKeyCell from '../properties/PanelKeyCell.svelte';
  import Piano from 'lucide-svelte/icons/piano';
  import Music from 'lucide-svelte/icons/music';
  import Palette from 'lucide-svelte/icons/palette';
  import SwatchCluster from '../properties/SwatchCluster.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let k = $derived(getSection(control, 'Keyboard'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Keyboard.${prop}`, value);
  }
</script>

{#if k}
  <PropertySection title="Keyboard" icon={Piano}>
    <NumberCell label="Lowest note" min={0} max={127} step={1} value={k.lowNote ?? 48} onchange={(v) => set('lowNote', v)} />
    <NumberCell label="Highest note" min={0} max={127} step={1} value={k.highNote ?? 72} onchange={(v) => set('highNote', v)} />
    <NumberCell label="Channel" min={1} max={16} step={1} value={k.channel ?? 1} onchange={(v) => set('channel', v)} />
    <NumberCell label="Velocity" min={1} max={127} step={1} value={k.velocity ?? 100} onchange={(v) => set('velocity', v)} />
    <NumberCell label="Octave" min={-4} max={4} step={1} value={k.octave ?? 0} onchange={(v) => set('octave', v)} />
    <NumberCell label="Transpose" min={-24} max={24} step={1} value={k.transpose ?? 0} onchange={(v) => set('transpose', v)} />

    <PropertyCell
      label="Latch"
      span={2}
      hint="A key stays down until it is pressed again. This is what makes a chord possible with one mouse pointer, which is most of the point of having a keyboard rather than a note ribbon."
    >
      <PropertyToggle value={k.latch === true} onchange={(next) => set('latch', next)} />
    </PropertyCell>
    <PropertyCell label="Note labels" span={2} hint="C3, C4… on the C keys. A keyboard with no landmarks is hard to read at a glance.">
      <PropertyToggle value={k.showLabels !== false} onchange={(next) => set('showLabels', next)} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Key & scale" icon={Music}>
    <PanelKeyCell {control} section="Keyboard" />
    <PropertyCell
      label="Out of key"
      span={2}
      hint="Off plays every key. Quantize moves an out-of-key press to the nearest in-key note. Refuse sends nothing. Out-of-key keys are shaded whichever is chosen, so the rule is visible before it bites."
    >
      <select class="val" value={k.scaleLock ?? 'off'} onchange={(event) => set('scaleLock', event.target.value)}>
        <option value="off">Play it anyway</option>
        <option value="quantize">Move to the nearest in-key note</option>
        <option value="refuse">Send nothing</option>
      </select>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Colours" icon={Palette}>
    <PropertyCell label="" span={4} compact>
      <SwatchCluster swatches={[
        { key: 'whiteColour', label: 'White', value: k.whiteColour ?? 'FFE8E8E8', target: { type: 'control', controlId: core?.id, path: 'Keyboard.whiteColour' } },
        { key: 'blackColour', label: 'Black', value: k.blackColour ?? 'FF1A1A1A', target: { type: 'control', controlId: core?.id, path: 'Keyboard.blackColour' } },
        { key: 'heldColour', label: 'Held', value: k.heldColour ?? 'FF5B9BD5', target: { type: 'control', controlId: core?.id, path: 'Keyboard.heldColour' } },
        { key: 'outOfKeyColour', label: 'Out of key', value: k.outOfKeyColour ?? 'FF9A9A9A', target: { type: 'control', controlId: core?.id, path: 'Keyboard.outOfKeyColour' } },
        { key: 'labelColour', label: 'Labels', value: k.labelColour ?? 'FF555555', target: { type: 'control', controlId: core?.id, path: 'Keyboard.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}
