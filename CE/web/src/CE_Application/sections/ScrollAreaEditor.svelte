<script>
  // Scroll Area — which way it scrolls and how a wheel notch feels.
  //
  // There is no "content size" field here on purpose. The extent is measured from the children, so
  // it is right by construction; an author-set one goes stale the moment a control moves, and then
  // the scrollbar either stops short of a control that is really there or scrolls past the end into
  // nothing — both of which look like the scroll area is broken rather than like the number is.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { contentExtent } from '../utils/scrollAreaLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import ScrollText from 'lucide-svelte/icons/scroll-text';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let a = $derived(getSection(control, 'ScrollArea'));
  let extent = $derived(contentExtent(control));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `ScrollArea.${prop}`, value);
  }
</script>

{#if a}
  <PropertySection title="Scrolling" icon={ScrollText}>
    <PropertyCell label="Direction" span={2} hint="Which axes may scroll. An axis whose content fits shows no scrollbar.">
      <select class="val" value={a.direction ?? 'vertical'} onchange={(event) => set('direction', event.target.value)}>
        <option value="vertical">Vertical</option>
        <option value="horizontal">Horizontal</option>
        <option value="both">Both</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Wheel" span={2} hint="Line moves a stated distance per notch, which is predictable. Smooth passes the raw delta through, which is what a trackpad wants.">
      <select class="val" value={a.scrollMode ?? 'line'} onchange={(event) => set('scrollMode', event.target.value)}>
        <option value="line">Line</option>
        <option value="smooth">Smooth</option>
      </select>
    </PropertyCell>
    <NumberCell label="Line height" min={4} max={200} step={1} value={a.lineHeight ?? 24} onchange={(v) => set('lineHeight', v)} />
    <NumberCell label="Scrollbar" min={4} max={24} step={1} value={a.scrollbarSize ?? 10} onchange={(v) => set('scrollbarSize', v)} />

    <PropertyCell label="Content" span={4} hint="Measured from the children, not set here — an author-set extent goes stale the moment a control moves." compact>
      <span class="extent">{Math.round(extent.width)} × {Math.round(extent.height)} px across
        {(control?.children?.length ?? 0)} child{(control?.children?.length ?? 0) === 1 ? '' : 'ren'}</span>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Colours" icon={Palette}>
    <PropertyCell label="" span={4} compact>
      <SwatchCluster swatches={[
        { key: 'trackColour', label: 'Track', value: a.trackColour ?? 'FF1A1A1A', target: { type: 'control', controlId: core?.id, path: 'ScrollArea.trackColour' } },
        { key: 'thumbColour', label: 'Thumb', value: a.thumbColour ?? 'FF454550', target: { type: 'control', controlId: core?.id, path: 'ScrollArea.thumbColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .extent { color: #888; font-size: 11px; }
</style>
