<script>
  /**
   * The dock's Render tab: the rendered look of the layer selected in the Component Designer
   * (utils/layerRenderedLook.js), the same look a knob's plate, a fader cap, a key or a meter's
   * housing can take on the panel, with the same fields the Knob, Slider, Button and Meter tabs show
   * for it. Flat, the layer draws its fill, stroke and effects; Rendered, it draws a lit object made
   * from these properties and lit by the set's lamp: a turned body (a knob, a lamp) or a block (a
   * key, a cap, a housing) the size of its box. Its body colour is the layer's fill.
   *
   * A layer made from a panel control by Create Component from Selection arrives with these set;
   * this is where an author sees and changes them, or gives any layer the look.
   */
  import { activePanel } from '../stores/panels.js';
  import { standaloneComponentControl, updateControlProperty } from '../stores/controls.js';
  import { componentDesignerStatus } from '../stores/componentDesignerStatus.js';
  import { designerMaskTarget } from '../stores/layerMaskActions.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import { activeControlSet } from '../stores/controlSets.js';
  import { resolveColourLiteral } from '../models/controlSets.js';
  import { RENDERED_BLOCK_TOPS, RENDERED_MATERIALS, RENDERED_PROFILES, RENDERED_TOPS } from '../utils/renderedLook.js';
  import { numberOr } from '../utils/primitives.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import PropertyColor from '../properties/PropertyColor.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import '../properties/propertyTheme.css';

  let target = $derived(designerMaskTarget($componentDesignerStatus, $activePanel?.controls ?? [], $standaloneComponentControl));
  let part = $derived(target?.part ?? null);
  let rendered = $derived(String(part?.look ?? '') === 'rendered');
  let block = $derived(String(part?.renderShape ?? 'round') === 'block');
  let fluted = $derived(part?.renderProfile === 'fluted');
  let ridgedTop = $derived(block && part?.renderTop === 'ridged');
  let turns = $derived(part?.meta?.fixedLight === true);

  const fillOf = (layer) => layer?._children?.Background?._children?.Fill?.colour;
  const shown = (colour, fallback = 'FF3A3A3A') => resolveColourLiteral(colour, $activeControlSet, fallback);

  function set(key, value) {
    if (target) updateControlProperty(target.controlId, `Parts.${target.layer}.${key}`, value);
  }

  // Rendered: the layer's fill is its body colour, so it is turned on; a new layer takes the shape its
  // box suggests, a square one a turned body and anything else a block.
  function setLook(value) {
    if (!target) return;
    if (value !== 'rendered') {
      set('look', '');
      return;
    }
    if (!part?.renderShape) {
      const square = Math.abs(target.frame.width - target.frame.height) <= Math.max(target.frame.width, target.frame.height) * 0.08;
      set('renderShape', square ? 'round' : 'block');
    }
    set('Background.Fill.solidEnabled', true);
    set('look', 'rendered');
  }

  function setTurns(value) {
    if (!target) return;
    set('meta.fixedLight', value === true);
    if (value === true && part?.meta?.renderTurn === undefined) set('meta.renderTurn', 0);
  }

  function pickColour(path, current) {
    if (!target) return;
    activateColorTarget({ type: 'control', controlId: target.controlId, path: `Parts.${target.layer}.${path}` }, current || shown(current));
    displayTabRequest.set({ tab: 'colors' });
  }
</script>

<section class="render-tab property-theme" aria-label="Layer rendered look">
  <div class="context-bar" class:active={!!target}>
    {#if target}
      <span>Editing: <strong>{target.layer}</strong> · {rendered ? (block ? 'Rendered block' : 'Rendered body') : 'Flat'}</span>
    {:else}
      <span>Editing: <strong>nothing</strong></span>
    {/if}
  </div>
  {#if !target}
    <p class="empty">Select a layer in the Component Designer to draw it as a rendered object: a turned body or a block, lit by the set's lamp, as a knob's plate, a fader cap, a key or a meter's housing can be on the panel.</p>
  {:else}
    <div class="property-grid render-grid">
      <PropertyCell label="Look" span={2} hint="Flat: drawn from its fill, stroke and effects. Rendered: drawn as a lit object from the fields below, lit by the set's lamp; its fill colour is its body's.">
        <select class="val" value={rendered ? 'rendered' : 'flat'} onchange={(e) => setLook(e.target.value)}>
          <option value="flat">Flat</option><option value="rendered">Rendered</option>
        </select>
      </PropertyCell>
      {#if rendered}
        <PropertyCell label="Shape" span={2} hint="A turned body, round, the size of the layer's larger side (a knob, a lamp); or a block the layer's box (a key, a fader cap, a housing).">
          <select class="val" value={block ? 'block' : 'round'} onchange={(e) => set('renderShape', e.target.value)}>
            <option value="round">Turned Body</option><option value="block">Block</option>
          </select>
        </PropertyCell>
        {#if block}
          <PropertyCell label="Corner %" span={1} compact hint="Its corners, as a percentage of half its narrower side: 100 rounds the ends.">
            <NumberCell label="Corner" value={numberOr(part?.renderCorner, 30)} defaultValue={30} step={1} min={0} max={100} onchange={(v) => set('renderCorner', v)} />
          </PropertyCell>
          <PropertyCell label="Height %" span={1} compact hint="How tall it stands, as a percentage of its narrower side: a bezel is low, a key taller. Its shadow grows with it.">
            <NumberCell label="Height" value={numberOr(part?.renderHeight, 30)} defaultValue={30} step={1} min={10} max={200} onchange={(v) => set('renderHeight', v)} />
          </PropertyCell>
          <PropertyCell label="Taper %" span={1} compact hint="How much smaller its top is than its foot.">
            <NumberCell label="Taper" value={numberOr(part?.renderTaper, 6)} defaultValue={6} step={1} min={0} max={40} onchange={(v) => set('renderTaper', v)} />
          </PropertyCell>
          <PropertyCell label="Top" span={1} hint="Its top: flat, with an insert, ridged, a dome or a dish.">
            <select class="val" value={part?.renderTop ?? 'flat'} onchange={(e) => set('renderTop', e.target.value)}>
              {#each RENDERED_BLOCK_TOPS as [id, label] (id)}<option value={id}>{label}</option>{/each}
            </select>
          </PropertyCell>
          <PropertyCell label="Ridges" span={1} compact disabled={!ridgedTop} hint="How many ridges across a ridged top.">
            <NumberCell label="Ridges" value={numberOr(part?.renderCount, 5)} defaultValue={5} step={1} min={1} max={40} onchange={(v) => set('renderCount', Math.round(Number(v) || 0))} />
          </PropertyCell>
          <PropertyCell label="Ridge Depth %" span={1} compact disabled={!ridgedTop && part?.renderTop !== 'insert' && part?.renderTop !== 'dish'} hint="How deep a ridged top's ridges, an insert or a dish go.">
            <NumberCell label="Depth" value={numberOr(part?.renderDepth, 12)} defaultValue={12} step={1} min={0} max={60} onchange={(v) => set('renderDepth', v)} />
          </PropertyCell>
          <PropertyCell label="Ridges Run" span={2} disabled={!ridgedTop} hint="Which way the ridges follow one another: along a fader's travel.">
            <select class="val" value={part?.renderAxis ?? 'x'} onchange={(e) => set('renderAxis', e.target.value)}>
              <option value="x">Across</option><option value="y">Down</option>
            </select>
          </PropertyCell>
        {:else}
          <PropertyCell label="Light Stays Put" span={2} hint="Turned, its ridges turn while its light stays where the set's lamp is, as a knob's rendered plate turns with its value. Off, it turns as a picture.">
            <PropertyToggle value={turns} onchange={(next) => setTurns(next)} />
          </PropertyCell>
          <PropertyCell label="Profile" span={2} hint="Its side: smooth, knurled (fine ridges, a machined grip) or fluted (broad grooves).">
            <select class="val" value={part?.renderProfile ?? 'smooth'} onchange={(e) => set('renderProfile', e.target.value)}>
              {#each RENDERED_PROFILES as [id, label] (id)}<option value={id}>{label}</option>{/each}
            </select>
          </PropertyCell>
          <PropertyCell label="Ridges" span={1} compact disabled={(part?.renderProfile ?? 'smooth') === 'smooth'} hint="How many ridges or flutes round its side.">
            <NumberCell label="Ridges" value={numberOr(part?.renderCount, fluted ? 18 : 72)} defaultValue={fluted ? 18 : 72} step={1} min={3} max={160} onchange={(v) => set('renderCount', Math.round(Number(v) || 0))} />
          </PropertyCell>
          <PropertyCell label="Ridge Depth %" span={1} compact disabled={(part?.renderProfile ?? 'smooth') === 'smooth'} hint="How deep the ridges cut, as a percentage of its radius.">
            <NumberCell label="Depth" value={numberOr(part?.renderDepth, fluted ? 10 : 4)} defaultValue={fluted ? 10 : 4} step={0.5} min={0} max={30} onchange={(v) => set('renderDepth', v)} />
          </PropertyCell>
          <PropertyCell label="Taper %" span={1} compact hint="How much narrower its top is than its foot, as a percentage of its radius.">
            <NumberCell label="Taper" value={numberOr(part?.renderTaper, 8)} defaultValue={8} step={1} min={0} max={40} onchange={(v) => set('renderTaper', v)} />
          </PropertyCell>
          <PropertyCell label="Height %" span={1} compact hint="How tall it stands, as a percentage of its radius: its shadow grows with it.">
            <NumberCell label="Height" value={numberOr(part?.renderHeight, 80)} defaultValue={80} step={1} min={20} max={160} onchange={(v) => set('renderHeight', v)} />
          </PropertyCell>
          <PropertyCell label="Top" span={2} hint="Its top: flat, with an insert set into it, or a dome.">
            <select class="val" value={part?.renderTop ?? 'flat'} onchange={(e) => set('renderTop', e.target.value)}>
              {#each RENDERED_TOPS as [id, label] (id)}<option value={id}>{label}</option>{/each}
            </select>
          </PropertyCell>
        {/if}
        <PropertyCell label="Material" span={2} hint="What its body is made of.">
          <select class="val" value={part?.renderMaterial ?? (block ? 'satin' : 'metal')} onchange={(e) => set('renderMaterial', e.target.value)}>
            {#each RENDERED_MATERIALS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Top Material" span={2} hint="What its top is made of.">
          <select class="val" value={part?.renderTopMaterial ?? (block ? 'satin' : 'spun')} onchange={(e) => set('renderTopMaterial', e.target.value)}>
            {#each RENDERED_MATERIALS as [id, label] (id)}<option value={id}>{label}</option>{/each}
          </select>
        </PropertyCell>
        <PropertyCell label="Body Colour" span={2} hint="Its body's colour: the layer's fill. The swatch opens it in the Colors dock.">
          <PropertyColor value={shown(fillOf(part))} onchange={(v) => set('Background.Fill.colour', v)} onswatchclick={() => pickColour('Background.Fill.colour', fillOf(part))} />
        </PropertyCell>
        <PropertyCell label="Top Colour" span={2} hint="Its top's colour; empty, the body's.">
          <PropertyColor value={shown(part?.renderTopColour || fillOf(part))} onchange={(v) => set('renderTopColour', v)} onswatchclick={() => pickColour('renderTopColour', part?.renderTopColour)} />
        </PropertyCell>
      {/if}
    </div>
    {#if rendered}
      <p class="hint">Drawn as the panel draws a rendered part, lit by the set's lamp; until its picture is made, or where the plug-in cannot make one, its fill shows. An exported plug-in carries the pictures.</p>
    {/if}
  {/if}
</section>

<style>
  .render-tab { display: flex; flex-direction: column; min-width: 0; height: 100%; overflow: auto; }
  .context-bar { padding: 6px 12px; color: #9aa; font-size: 11px; border-bottom: 1px solid #2c2c2c; }
  .context-bar.active strong { color: #E4E4E4; }
  .empty { padding: 12px; color: #999; font-size: 12px; max-width: 520px; }
  .render-grid { display: grid; gap: 7px 9px; padding: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start; max-width: 720px; }
  .hint { color: #888; font-size: 11px; padding: 0 12px 12px; margin: 0; max-width: 640px; }
</style>
