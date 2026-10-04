<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import FieldList from '../properties/FieldList.svelte';
  import { CROSSFADER_FIELDS, CROSSFADER_HANDLE_FIELDS, CROSSFADER_RETURN_FIELDS } from '../models/inspectorFieldSets.js';
  import HeaderPill from '../properties/HeaderPill.svelte';
  import ArrowLeftRight from 'lucide-svelte/icons/arrow-left-right';
  import IterationCcw from 'lucide-svelte/icons/iteration-ccw';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let x = $derived(getSection(control, 'Crossfader'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Crossfader.${prop}`, value);
  }
</script>

{#if x}
  <!-- Ordinary fields are data (models/inspectorFieldSets.js); Labels & colours below stays hand-written. -->
  <PropertySection title="Handle design" icon={Palette}>
    <FieldList fields={CROSSFADER_HANDLE_FIELDS} values={x} {set} />
  </PropertySection>
  <PropertySection title="Crossfader" icon={ArrowLeftRight}>
    <FieldList fields={CROSSFADER_FIELDS} values={x} {set} />
  </PropertySection>

  <PropertySection title="Return to rest" icon={IterationCcw}>
    <FieldList fields={CROSSFADER_RETURN_FIELDS} values={x} {set} />
  </PropertySection>

  <PropertySection title="Labels & colours" icon={Palette}>
    <PropertyCell label="Labels" span={1} hint="Show the A/B end labels.">
      <PropertyToggle value={x.showLabels !== false} onchange={() => set('showLabels', !(x.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Label A" span={1}>
      <input class="val" type="text" value={x.labelA ?? 'A'} onchange={(e) => set('labelA', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Label B" span={1}>
      <input class="val" type="text" value={x.labelB ?? 'B'} onchange={(e) => set('labelB', e.target.value)} />
    </PropertyCell>
    <PropertyCell label="Colours" span={4} hint="A-side fill, B-side fill, handle, groove. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'fillAColour', label: 'A', value: x.fillAColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.fillAColour' } },
        { key: 'fillBColour', label: 'B', value: x.fillBColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.fillBColour' } },
        { key: 'handleColour', label: 'Handle', value: x.handleColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.handleColour' } },
        { key: 'trackColour', label: 'Track', value: x.trackColour, target: { type: 'control', controlId: core?.id, path: 'Crossfader.trackColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
</style>
