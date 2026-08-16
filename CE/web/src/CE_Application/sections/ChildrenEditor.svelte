<script>
  /**
   * The Children section — how a container sizes itself around what is inside it.
   *
   * This is the editor for utils/containerFit.js, and it exists because that mechanism shipped
   * without one: `fitWidth`, the minimums and the per-side padding were reachable only from a script
   * or by hand-editing the .cepanel, which is the same as not existing.
   *
   * PADDING IS TRI-STATE and that is the only fiddly thing here. `padding` is one number every
   * existing panel already has; the four sides are null when unset and fall back to it. A number
   * input cannot say "unset", so the sides are behind a toggle: off means all four are null and the
   * shared number rules, on seeds each side from the shared number so turning it on changes nothing
   * you can see. Turning it back off writes null — not zero, which would silently reset the padding.
   */
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { FIT_CONTENTS, FIT_LOCKED } from '../utils/containerFit.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let children = $derived(getSection(control, 'Children'));

  let childCount = $derived(Object.keys(children?._children ?? {}).length);
  let fitWidth = $derived(children?.fitWidth === FIT_CONTENTS);
  let fitHeight = $derived(children?.fitHeight === FIT_CONTENTS);

  let sharedPadding = $derived(Number(children?.padding) || 0);
  let perSide = $derived(
    children?.paddingLeft != null || children?.paddingRight != null
    || children?.paddingTop != null || children?.paddingBottom != null
  );
  const SIDES = ['paddingLeft', 'paddingRight', 'paddingTop', 'paddingBottom'];

  function set(prop, value) {
    if (!core?.id) return;
    const path = `Children.${prop}`;
    if ($selectedComponentIds.size > 1) updateSelectedProperty(path, value);
    else updateControlProperty(core.id, path, value);
  }

  function setPerSide(on) {
    for (const side of SIDES) set(side, on ? sharedPadding : null);
  }
</script>

{#if children}
  <PropertySection title="Size from contents">
    <PropertyCell label="Width" span={2} hint="Derive the width from the children, or keep the authored width.">
      <PropertyToggle value={fitWidth} onchange={(on) => set('fitWidth', on ? FIT_CONTENTS : FIT_LOCKED)} />
    </PropertyCell>
    <PropertyCell label="Height" span={2} hint="Derive the height from the children, or keep the authored height.">
      <PropertyToggle value={fitHeight} onchange={(on) => set('fitHeight', on ? FIT_CONTENTS : FIT_LOCKED)} />
    </PropertyCell>

    <!-- Disabled rather than hidden: a floor you set and then locked the axis on is still stored,
         and a row that vanishes makes that look like it was thrown away. -->
    <PropertyCell label="Min W" span={2} disabled={!fitWidth}
                  hint="A fitted width never goes below this. 0 is pure fit.">
      <NumberCell value={children.minWidth ?? 0} step={1} min={0} onchange={(v) => set('minWidth', v)} />
    </PropertyCell>
    <PropertyCell label="Min H" span={2} disabled={!fitHeight}
                  hint="A fitted height never goes below this. 0 is pure fit.">
      <NumberCell value={children.minHeight ?? 0} step={1} min={0} onchange={(v) => set('minHeight', v)} />
    </PropertyCell>

    <PropertyCell label="" span={4} hint="Fitting changes this container's size only — children never move.">
      <span class="note">
        {#if fitWidth || fitHeight}
          {childCount === 0
            ? 'Nothing inside yet — a fitted axis collapses to its minimum.'
            : `Fitting around ${childCount} child${childCount === 1 ? '' : 'ren'}. Drag handles on a fitted edge are off.`}
        {:else}
          Both axes locked — the size is whatever Transform says.
        {/if}
      </span>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Padding">
    <PropertyCell label="All sides" span={2} disabled={perSide}
                  hint="Space between the container's edge and its contents, on every side.">
      <NumberCell value={sharedPadding} step={1} min={0} onchange={(v) => set('padding', v)} />
    </PropertyCell>
    <PropertyCell label="Per side" span={2} hint="Give each side its own padding — a header needs more room at the top.">
      <PropertyToggle value={perSide} onchange={setPerSide} />
    </PropertyCell>

    {#if perSide}
      <PropertyCell label="Left" span={1} hint="Padding on the left edge.">
        <NumberCell value={children.paddingLeft ?? sharedPadding} step={1} min={0} onchange={(v) => set('paddingLeft', v)} />
      </PropertyCell>
      <PropertyCell label="Right" span={1} hint="Padding on the right edge.">
        <NumberCell value={children.paddingRight ?? sharedPadding} step={1} min={0} onchange={(v) => set('paddingRight', v)} />
      </PropertyCell>
      <PropertyCell label="Top" span={1} hint="Padding above the contents — where a section header goes.">
        <NumberCell value={children.paddingTop ?? sharedPadding} step={1} min={0} onchange={(v) => set('paddingTop', v)} />
      </PropertyCell>
      <PropertyCell label="Bottom" span={1} hint="Padding below the contents.">
        <NumberCell value={children.paddingBottom ?? sharedPadding} step={1} min={0} onchange={(v) => set('paddingBottom', v)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Clipping">
    <PropertyCell label="Clip" span={2} hint="Hide anything that sticks out past this container's edges.">
      <PropertyToggle value={children.clip === true} onchange={(on) => set('clip', on)} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .note { color: #777; font-size: 10px; line-height: 1.35; display: block; }
</style>
