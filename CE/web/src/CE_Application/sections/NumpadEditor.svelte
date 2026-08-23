<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import Hash from 'lucide-svelte/icons/hash';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let x = $derived(getSection(control, 'Numpad'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Numpad.${prop}`, value);
  }
</script>

{#if x}
  <PropertySection title="Numpad" icon={Hash}>
    <PropertyCell label="Min" span={1} compact hint="Lowest value the pad will emit. An entry below it is refused, not clamped.">
      <NumberCell label="Min" min={-9999} max={9999} step={1} value={x.min ?? 0} defaultValue={0} onchange={(v) => set('min', Math.round(v))} />
    </PropertyCell>
    <PropertyCell label="Max" span={1} compact hint="Highest value the pad will emit. An entry above it is refused, not clamped — clamping would recall something nobody asked for.">
      <NumberCell label="Max" min={-9999} max={9999} step={1} value={x.max ?? 127} defaultValue={127} onchange={(v) => set('max', Math.round(v))} />
    </PropertyCell>
    <PropertyCell label="Digits" span={1} compact hint="Widest entry accepted, and the readout's width.">
      <NumberCell label="Digits" min={1} max={6} step={1} value={x.digits ?? 3} defaultValue={3} onchange={(v) => set('digits', Math.max(1, Math.min(6, Math.round(v))))} />
    </PropertyCell>
    <PropertyCell label="Offset" span={1} compact hint="Typed minus offset = emitted. For a machine whose front panel calls its first preset 1 while the wire calls it 0, set 1.">
      <NumberCell label="Offset" min={-99} max={99} step={1} value={x.displayOffset ?? 0} defaultValue={0} onchange={(v) => set('displayOffset', Math.round(v))} />
    </PropertyCell>
    <PropertyCell label="Commit on length" span={2} hint="Emit as soon as Digits have been typed instead of waiting for Enter. Only safe at a fixed width — a machine numbered 1..128 cannot be entered blind.">
      <PropertyToggle value={x.commitOnLength === true} onchange={() => set('commitOnLength', !(x.commitOnLength === true))} />
    </PropertyCell>
    <PropertyCell label="Editable" span={2} hint="Accept presses in preview.">
      <PropertyToggle value={x.editable !== false} onchange={() => set('editable', !(x.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Readout" span={2} hint="Show the display strip above the keys.">
      <PropertyToggle value={x.showDisplay !== false} onchange={() => set('showDisplay', !(x.showDisplay !== false))} />
    </PropertyCell>
    <PropertyCell label="Idle readout" span={2} hint="What the display shows before anything is typed.">
      <select class="val" value={x.placeholder ?? 'value'} onchange={(e) => set('placeholder', e.target.value)}>
        <option value="value">Committed value</option>
        <option value="blank">Blank</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Clear key" span={1} hint="Show the C key.">
      <PropertyToggle value={x.showClear !== false} onchange={() => set('showClear', !(x.showClear !== false))} />
    </PropertyCell>
    <PropertyCell label="Enter key" span={1} hint="Show the ↵ key. With Commit on length off, hiding it leaves no way to commit.">
      <PropertyToggle value={x.showEnter !== false} onchange={() => set('showEnter', !(x.showEnter !== false))} />
    </PropertyCell>
    <PropertyCell label="Gap" span={2} compact hint="Pixels between keys.">
      <NumberCell label="Gap" min={0} max={24} step={1} value={x.gap ?? 4} defaultValue={4} onchange={(v) => set('gap', Math.max(0, v))} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="Digit keys, action keys (C / ↵), key labels, and the readout. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'keyColour', label: 'Key', value: x.keyColour, target: { type: 'control', controlId: core?.id, path: 'Numpad.keyColour' } },
        { key: 'actionColour', label: 'Action', value: x.actionColour, target: { type: 'control', controlId: core?.id, path: 'Numpad.actionColour' } },
        { key: 'keyLabelColour', label: 'Label', value: x.keyLabelColour, target: { type: 'control', controlId: core?.id, path: 'Numpad.keyLabelColour' } },
        { key: 'displayTextColour', label: 'Readout', value: x.displayTextColour, target: { type: 'control', controlId: core?.id, path: 'Numpad.displayTextColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
</style>
