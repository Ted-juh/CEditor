<script>
  // Tabbed Container — the pages, and which one is showing.
  //
  // Which children belong to which page lives on the CHILDREN (Core.tabPageId), not in a list here.
  // A list would go stale the moment somebody deleted a control, and then a page would claim a
  // child that no longer exists while the child that replaced it belonged to nothing.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { componentListWithElement } from '../utils/componentElements.js';
  import { tabPages } from '../utils/tabContainerLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Layers from 'lucide-svelte/icons/layers';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let t = $derived(getSection(control, 'TabContainer'));
  let pages = $derived(tabPages(control));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `TabContainer.${prop}`, value);
  }
  function setPages(next) { set('pages', next); }
  function addPage() { setPages(componentListWithElement('TabContainer', 'pages', pages, t)); }
  function renamePage(index, label) {
    setPages(pages.map((page, i) => (i === index ? { ...page, label } : page)));
  }
  function removePage(index) {
    // Never down to zero. Children of a removed page fall back to the first one rather than
    // vanishing (see childPageId), and with no pages at all there is nowhere for them to fall back
    // to and nothing on screen to add a page with.
    if (pages.length <= 1) return;
    const next = [...pages];
    next.splice(index, 1);
    setPages(next);
    if ((t.pageIndex ?? 0) >= next.length) set('pageIndex', next.length - 1);
  }
</script>

{#if t}
  <PropertySection title="Pages" icon={Layers}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add page" onclick={addPage}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="A control belongs to whichever page was showing when it was dropped in. Removing a page returns its children to the first one rather than hiding them for good." compact>
      <div class="pages">
        {#each pages as page, index (page.id ?? index)}
          <div class="page-row" class:active={(t.pageIndex ?? 0) === index}>
            <button type="button" class="show" title="Show this page" onclick={() => set('pageIndex', index)}>
              {(t.pageIndex ?? 0) === index ? '●' : '○'}
            </button>
            <input
              class="val name" type="text" value={page.label ?? `Page ${index + 1}`}
              onchange={(event) => renamePage(index, event.target.value)}
            />
            <button type="button" class="remove" title="Remove" disabled={pages.length <= 1} onclick={() => removePage(index)}>×</button>
          </div>
        {/each}
      </div>
    </PropertyCell>

    <PropertyCell label="Tab strip" span={2} hint="Off leaves the pages switchable only by binding or script — which is what a footswitch-driven page set wants.">
      <PropertyToggle value={t.showStrip !== false} onchange={(next) => set('showStrip', next)} />
    </PropertyCell>
    <PropertyCell label="Edge" span={2} hint="Which side the strip sits on.">
      <select class="val" value={t.edge ?? 'top'} onchange={(event) => set('edge', event.target.value)}>
        <option value="top">Top</option>
        <option value="bottom">Bottom</option>
        <option value="left">Left</option>
        <option value="right">Right</option>
      </select>
    </PropertyCell>
    <NumberCell label="Strip size" min={12} max={80} step={1} value={t.stripSize ?? 26} onchange={(v) => set('stripSize', v)} />
  </PropertySection>

  <PropertySection title="Colours" icon={Palette}>
    <PropertyCell label="" span={4} compact>
      <SwatchCluster swatches={[
        { key: 'stripColour', label: 'Strip', value: t.stripColour ?? 'FF1B1B20', target: { type: 'control', controlId: core?.id, path: 'TabContainer.stripColour' } },
        { key: 'tabColour', label: 'Tab', value: t.tabColour ?? 'FF26262E', target: { type: 'control', controlId: core?.id, path: 'TabContainer.tabColour' } },
        { key: 'activeTabColour', label: 'Active', value: t.activeTabColour ?? 'FF3A5A80', target: { type: 'control', controlId: core?.id, path: 'TabContainer.activeTabColour' } },
        { key: 'labelColour', label: 'Label', value: t.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'TabContainer.labelColour' } },
        { key: 'activeLabelColour', label: 'Active label', value: t.activeLabelColour ?? 'FFFFFFFF', target: { type: 'control', controlId: core?.id, path: 'TabContainer.activeLabelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .pages { display: flex; flex-direction: column; gap: 4px; }
  .page-row { display: flex; align-items: center; gap: 4px; }
  .page-row .name { flex: 1; min-width: 0; }
  .show, .remove {
    background: #262630; border: 1px solid #3A3A44; border-radius: 3px; color: #999;
    font-family: inherit; font-size: 11px; padding: 2px 7px; cursor: pointer;
  }
  .page-row.active .show { color: #5B9BD5; border-color: #3A5A80; }
  .remove:hover:not(:disabled) { color: #E57373; }
  .remove:disabled { opacity: 0.35; cursor: default; }
</style>
