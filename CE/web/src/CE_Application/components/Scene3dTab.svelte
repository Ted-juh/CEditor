<script>
  /**
   * The dock's 3D tab: the objects of the 3D part selected in the Component Designer
   * (docs/design/import-formats.md, 3; utils/scene3dModel.js), each with its shape, its material and
   * how it moves. A change of shape, finish or motion renders the part again (stores/scene3dActions.js),
   * the layers already there shown until the new ones are ready; a colour, picked in the Colors dock,
   * changes at once. Selecting any layer a 3D part made edits that 3D part.
   */
  import { activePanel } from '../stores/panels.js';
  import { standaloneComponentControl } from '../stores/controls.js';
  import { componentDesignerStatus } from '../stores/componentDesignerStatus.js';
  import { designerMaskTarget } from '../stores/layerMaskActions.js';
  import { activateColorTarget } from '../stores/colorTarget.js';
  import { displayTabRequest } from '../stores/displayTab.js';
  import {
    addScene3dObject, removeScene3dObject, renderScene3dPart, scene3dRenders, scene3dSelection, setScene3dColour, setScene3dObject,
  } from '../stores/scene3dActions.js';
  import { describeObject, FINISH_LABELS, FINISHES, isRound, normalizeScene3d, starterKnob } from '../utils/scene3dModel.js';
  import { isScene3dPart, scene3dOwner } from '../utils/scene3dMerge.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import '../properties/propertyTheme.css';

  let target = $derived(designerMaskTarget($componentDesignerStatus, $activePanel?.controls ?? [], $standaloneComponentControl));
  // The 3D part: the one selected, or the one that made the layer selected.
  let sceneName = $derived(!target ? '' : isScene3dPart(target.part) ? target.layer : scene3dOwner(target.part));
  let marker = $derived(sceneName ? target?.control?._children?.Parts?._children?.[sceneName] ?? null : null);
  let recipe = $derived(marker ? normalizeScene3d(marker.meta?.scene3d ?? starterKnob()) : null);
  let index = $derived.by(() => {
    const picked = $scene3dSelection;
    const n = recipe?.objects?.length ?? 0;
    if (picked && picked.controlId === target?.controlId && picked.part === sceneName && picked.index < n) return picked.index;
    return 0;
  });
  let object = $derived(recipe?.objects?.[index] ?? null);
  let render = $derived(target && sceneName ? $scene3dRenders[`${target.controlId}:${sceneName}`] ?? null : null);
  let made = $derived(marker?.meta?.scene3dRendered ?? null);
  let status = $derived(render?.status === 'rendering' ? 'Rendering…'
    : render?.status === 'failed' ? render.message
      : made ? `Rendered · ${(made.milliseconds / 1000).toFixed(1)} s · ${made.layers} layers` : 'Not rendered yet');

  const pickObject = (i) => scene3dSelection.set({ controlId: target.controlId, part: sceneName, index: i });
  const set = (patch) => setScene3dObject(target.controlId, sceneName, index, patch);
  const shape = (key, value) => set({ shape: { [key]: value } });
  const material = (key, value) => set({ material: { [key]: value } });

  function pickColour() {
    if (!object) return;
    const controlId = target.controlId;
    const part = sceneName;
    const at = index;
    activateColorTarget({
      type: 'callback',
      label: `${part} › ${object.name} › Colour`,
      apply: (hex) => setScene3dColour(controlId, part, at, hex),
    }, object.material.colour);
    displayTabRequest.set({ tab: 'colors' });
  }

  const swatch = (argb) => `#${String(argb ?? 'FF808080').slice(2)}`;
</script>

<section class="scene3d-tab property-theme" aria-label="3D part">
  <div class="context-bar" class:active={!!object}>
    {#if object}
      <span>Editing: <strong>{sceneName} › {object.name}</strong></span>
      <span class="status" class:failed={render?.status === 'failed'} data-testid="scene3d-status">{status}</span>
    {:else}
      <span>Editing: <strong>nothing</strong></span>
    {/if}
  </div>
  {#if !object}
    <p class="empty">Select a 3D part in the Component Designer, or draw one with the 3D tool: a knob CEditor renders from its objects, each with a shape, a material and a motion, lit by the set's lamp.</p>
  {:else}
    <div class="objects" role="listbox" aria-label="Objects">
      {#each recipe.objects as each, i (i)}
        <button type="button" role="option" aria-selected={i === index} class:selected={i === index} onclick={() => pickObject(i)}>
          <strong>{each.name}</strong><em>{describeObject(each)}</em>
        </button>
      {/each}
    </div>
    <div class="property-grid scene-grid">
      <PropertyCell label="Name" span={2} hint="What the object is called. Its layers are named after it.">
        <input class="val" type="text" value={object.name} onchange={(e) => set({ name: e.target.value })} />
      </PropertyCell>
      <PropertyCell label="With the Value" span={2} hint="Stays put; turns with the value (a round body's light stays where the lamp is while its ridges turn; anything else is rendered every 27 degrees); or a lamp, lit by a value of its own.">
        <select class="val" value={object.motion} onchange={(e) => set({ motion: e.target.value })}>
          <option value="stays">Stays</option><option value="turns">Turns</option><option value="lamp">Lamp</option>
        </select>
      </PropertyCell>

      <div class="group-head">Shape</div>
      {#if object.shape.kind === 'mesh'}
        <p class="note">From the file{object.shape.triangles ? `: ${object.shape.triangles.toLocaleString()} triangles` : ''}. CEditor does not change a model's shape; its material and motion are yours.</p>
      {:else}
        <PropertyCell label="Kind" span={2} hint="A turned body (a knob's skirt, body or top), a block (a key, a fader cap), or a pointer.">
          <select class="val" value={object.shape.kind} onchange={(e) => shape('kind', e.target.value)}>
            <option value="turned">Turned Body</option><option value="block">Block</option><option value="pointer">Pointer</option>
          </select>
        </PropertyCell>
        {#if object.shape.kind === 'turned'}
          <PropertyCell label="Side" span={2} hint="Smooth, knurled (fine ridges, a machined grip) or fluted (broad grooves).">
            <select class="val" value={object.shape.side} onchange={(e) => shape('side', e.target.value)}>
              <option value="smooth">Smooth</option><option value="knurled">Knurled</option><option value="fluted">Fluted</option>
            </select>
          </PropertyCell>
          <PropertyCell label="Ridges" span={1} compact disabled={object.shape.side === 'smooth'} hint="How many ridges or flutes round its side.">
            <NumberCell label="Ridges" value={object.shape.ridges} step={1} min={3} max={180} onchange={(v) => shape('ridges', Math.round(Number(v) || 0))} />
          </PropertyCell>
          <PropertyCell label="Depth %" span={1} compact disabled={object.shape.side === 'smooth'} hint="How deep they cut, as a percentage of its radius.">
            <NumberCell label="Depth" value={object.shape.depth} step={0.5} min={0} max={20} onchange={(v) => shape('depth', v)} />
          </PropertyCell>
          <PropertyCell label="Diameter %" span={1} compact hint="Across, as a percentage of the 3D part's smaller side.">
            <NumberCell label="Diameter" value={object.shape.diameter} step={1} min={2} max={100} onchange={(v) => shape('diameter', v)} />
          </PropertyCell>
          <PropertyCell label="Height %" span={1} compact hint="How tall, as a percentage of the part's radius: its shadow grows with it.">
            <NumberCell label="Height" value={object.shape.height} step={1} min={1} max={200} onchange={(v) => shape('height', v)} />
          </PropertyCell>
          <PropertyCell label="Stands At %" span={1} compact hint="How high its foot is, as a percentage of the part's radius: on the panel, or on the top of what is under it.">
            <NumberCell label="Base" value={object.shape.base} step={1} min={0} max={200} onchange={(v) => shape('base', v)} />
          </PropertyCell>
          <PropertyCell label="Taper %" span={1} compact hint="How much narrower its top is than its foot.">
            <NumberCell label="Taper" value={object.shape.taper} step={1} min={0} max={60} onchange={(v) => shape('taper', v)} />
          </PropertyCell>
          <PropertyCell label="Top" span={2} hint="Flat, with an insert set into it, a dome or a dish.">
            <select class="val" value={object.shape.top} onchange={(e) => shape('top', e.target.value)}>
              <option value="flat">Flat</option><option value="insert">Insert</option><option value="dome">Dome</option><option value="dish">Dish</option>
            </select>
          </PropertyCell>
        {:else if object.shape.kind === 'block'}
          <PropertyCell label="Width %" span={1} compact hint="Across, as a percentage of the part's smaller side.">
            <NumberCell label="Width" value={object.shape.width} step={1} min={2} max={100} onchange={(v) => shape('width', v)} />
          </PropertyCell>
          <PropertyCell label="Length %" span={1} compact hint="Down, as a percentage of the part's smaller side.">
            <NumberCell label="Length" value={object.shape.length} step={1} min={2} max={100} onchange={(v) => shape('length', v)} />
          </PropertyCell>
          <PropertyCell label="Corner %" span={1} compact hint="Its corners, as a percentage of its narrower side.">
            <NumberCell label="Corner" value={object.shape.corner} step={1} min={0} max={50} onchange={(v) => shape('corner', v)} />
          </PropertyCell>
          <PropertyCell label="Height %" span={1} compact hint="How tall, as a percentage of the part's radius.">
            <NumberCell label="Height" value={object.shape.height} step={1} min={1} max={200} onchange={(v) => shape('height', v)} />
          </PropertyCell>
          <PropertyCell label="Stands At %" span={1} compact hint="How high its foot is, as a percentage of the part's radius.">
            <NumberCell label="Base" value={object.shape.base} step={1} min={0} max={200} onchange={(v) => shape('base', v)} />
          </PropertyCell>
        {:else}
          <PropertyCell label="Style" span={2} hint="A line or a bar from the middle out, a dot near the edge, or a chicken-head across the knob.">
            <select class="val" value={object.shape.style} onchange={(e) => shape('style', e.target.value)}>
              <option value="line">Line</option><option value="bar">Bar</option><option value="dot">Dot</option><option value="chicken-head">Chicken-head</option>
            </select>
          </PropertyCell>
          <PropertyCell label="Length %" span={1} compact hint="How long, as a percentage of the part's smaller side.">
            <NumberCell label="Length" value={object.shape.length} step={1} min={1} max={100} onchange={(v) => shape('length', v)} />
          </PropertyCell>
          <PropertyCell label="Width %" span={1} compact hint="How wide, as a percentage of the part's smaller side.">
            <NumberCell label="Width" value={object.shape.width} step={0.5} min={0.5} max={60} onchange={(v) => shape('width', v)} />
          </PropertyCell>
          <PropertyCell label="From %" span={1} compact hint="Where it starts from the middle, as a percentage of the part's smaller side.">
            <NumberCell label="From" value={object.shape.from} step={1} min={0} max={100} onchange={(v) => shape('from', v)} />
          </PropertyCell>
          <PropertyCell label="Stands At %" span={1} compact hint="How high it sits, as a percentage of the part's radius: on the top of the knob.">
            <NumberCell label="Base" value={object.shape.base} step={1} min={0} max={200} onchange={(v) => shape('base', v)} />
          </PropertyCell>
          <PropertyCell label="Height %" span={1} compact hint="How tall, as a percentage of the part's radius.">
            <NumberCell label="Height" value={object.shape.height} step={0.5} min={0.5} max={200} onchange={(v) => shape('height', v)} />
          </PropertyCell>
        {/if}
      {/if}

      <div class="group-head">Material</div>
      <PropertyCell label="Finish" span={2} hint="What it is made of: a metal reflects in its own colour.">
        <select class="val" value={object.material.finish} onchange={(e) => material('finish', e.target.value)}>
          {#each FINISHES as id (id)}<option value={id}>{FINISH_LABELS[id]}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Colour" span={1} hint="Its colour, in the Colors dock. It changes at once, lit as it was.">
        <button type="button" class="swatch" style={`background:${swatch(object.material.colour)}`} aria-label={`${object.name}'s colour`} onclick={pickColour}></button>
      </PropertyCell>
      <PropertyCell label="Roughness %" span={1} compact hint="How rough its surface: 0 a mirror, 100 chalk.">
        <NumberCell label="Roughness" value={object.material.roughness} step={1} min={0} max={100} onchange={(v) => material('roughness', v)} />
      </PropertyCell>
    </div>
    <div class="actions">
      <button type="button" onclick={() => addScene3dObject(target.controlId, sceneName, index)}>Add Object</button>
      <button type="button" disabled={recipe.objects.length <= 1} onclick={() => removeScene3dObject(target.controlId, sceneName, index)}>Remove</button>
      <button type="button" class="right" onclick={() => renderScene3dPart(target.controlId, sceneName)}>Render Again</button>
    </div>
    {#if object.motion === 'turns'}
      <p class="hint">{isRound(object) ? 'Round: its light stays where the lamp is as it turns, so it is rendered once.' : 'Not round: rendered every 27 degrees, as the Blender add-on renders a pointer.'}</p>
    {/if}
  {/if}
</section>

<style>
  .scene3d-tab { display: flex; flex-direction: column; min-width: 0; height: 100%; overflow: auto; }
  .context-bar { display: flex; gap: 10px; align-items: baseline; padding: 6px 12px; color: #9aa; font-size: 11px; border-bottom: 1px solid #2c2c2c; flex-wrap: wrap; }
  .context-bar.active strong { color: #E4E4E4; }
  .status { margin-left: auto; color: #8FEDE3; font-variant-numeric: tabular-nums; }
  .status.failed { color: #E5A029; }
  .empty { padding: 12px; color: #999; font-size: 12px; max-width: 520px; }
  .objects { display: flex; gap: 4px; flex-wrap: wrap; padding: 8px 12px 0; }
  .objects button { display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 4px 8px; border: 1px solid #333; border-radius: 4px; background: #1a1a1a; color: #bbb; font: 600 11px/1.3 inherit; cursor: pointer; }
  .objects button em { font-style: normal; font-weight: 400; font-size: 10px; color: #777; }
  .objects button.selected { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .objects button:focus-visible, .actions button:focus-visible, .swatch:focus-visible { outline: 2px solid #14B8A6; outline-offset: 1px; }
  .scene-grid { display: grid; gap: 7px 9px; padding: 10px 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start; max-width: 720px; }
  .group-head { grid-column: 1 / -1; font: 600 9px/1 ui-monospace, monospace; letter-spacing: .14em; text-transform: uppercase; color: #5B9BD5; margin-top: 6px; }
  .note { grid-column: 1 / -1; color: #999; font-size: 11px; margin: 0; }
  .swatch { width: 100%; min-height: 22px; border: 1px solid #0008; border-radius: 3px; cursor: pointer; }
  .actions { display: flex; gap: 6px; padding: 0 12px 8px; }
  .actions button { border: 1px solid #333; border-radius: 3px; background: #1a1a1a; color: #bbb; padding: 4px 10px; font: 600 11px/1.2 inherit; cursor: pointer; }
  .actions button:disabled { opacity: .45; cursor: default; }
  .actions .right { margin-left: auto; }
  .hint { color: #888; font-size: 11px; padding: 0 12px 12px; margin: 0; max-width: 640px; }
</style>
