<script>
  /**
   * The dock's Mask tab: the mask of the layer selected in the Component Designer.
   *
   * Photoshop's Properties › Masks and Figma's mask, in this model's terms (utils/partMask.js): a
   * picture whose alpha says how much of the layer shows, on or off, inverted or not, moving with
   * the layer or staying put on the artboard, placed in % of the layer's box (or the artboard's).
   * A layer without one gets one here: Add Mask (reveal all), Load Image… (any picture; an opaque
   * one's brightness becomes the mask), or Mask With Layer (another layer's outline).
   *
   * The Layers list shows the same mask beside each layer's thumbnail; a click there opens this tab.
   */
  import { activePanel } from '../stores/panels.js';
  import { standaloneComponentControl } from '../stores/controls.js';
  import { componentDesignerStatus } from '../stores/componentDesignerStatus.js';
  import { chooseMaskPicture, designerMaskTarget, pictureAsMask, writeLayerMask } from '../stores/layerMaskActions.js';
  import { notify } from '../stores/scriptUi.js';
  import { fitMaskToLayer, maskActive, maskLinked, newMask, partMaskCSS, relinkMask } from '../utils/partMask.js';
  import { layerOutlineMask } from '../utils/layerMaskOutline.js';
  import { attachBooleanInputs } from '../utils/booleanGroups.js';
  import { deepClone } from '../utils/deepClone.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import '../properties/propertyTheme.css';

  const PREVIEW = 110;

  let target = $derived(designerMaskTarget($componentDesignerStatus, $activePanel?.controls ?? [], $standaloneComponentControl));
  let mask = $derived(target?.mask ?? null);
  let linked = $derived(maskLinked(mask));
  let busy = $state('');

  // The preview is the layer's box while the mask is linked, the artboard's while it is not (with the
  // layer's box dashed in it), fitted into a square.
  let previewSpace = $derived(!target ? null : (linked
    ? { width: Math.max(1, target.frame.width), height: Math.max(1, target.frame.height) }
    : target.artboard));
  let previewSize = $derived.by(() => {
    if (!previewSpace) return { width: PREVIEW, height: PREVIEW, scale: 1 };
    const scale = Math.min(PREVIEW / previewSpace.width, PREVIEW / previewSpace.height);
    return { width: previewSpace.width * scale, height: previewSpace.height * scale, scale };
  });
  let previewMaskCSS = $derived(mask?.src ? partMaskCSS({ ...mask, enabled: true }, previewSize.width, previewSize.height) : '');
  let previewLayerBox = $derived(!target || linked ? '' : [
    `left:${target.frame.left * previewSize.scale}px`, `top:${target.frame.top * previewSize.scale}px`,
    `width:${target.frame.width * previewSize.scale}px`, `height:${target.frame.height * previewSize.scale}px`,
  ].join(';'));

  function write(next) {
    if (target) writeLayerMask(target.controlId, target.layer, next);
  }

  function set(changes) {
    if (mask) write({ ...mask, ...changes });
  }

  function setLinked(value) {
    if (mask) write(relinkMask(mask, target.frame, target.artboard, value));
  }

  function fit() {
    if (mask) write(fitMaskToLayer(mask, target.frame, target.artboard));
  }

  async function loadImage() {
    if (!target || busy) return;
    const { controlId, layer, frame, artboard } = target;
    const base = mask;
    busy = 'load';
    try {
      const picked = await chooseMaskPicture();
      if (!picked) return;
      const src = await pictureAsMask(picked);
      const next = fitMaskToLayer({ ...(base ?? newMask()), src, enabled: true }, frame, artboard);
      writeLayerMask(controlId, layer, next);
    } finally {
      busy = '';
    }
  }

  async function maskWithLayer(event) {
    const name = event.currentTarget.value;
    event.currentTarget.value = '';
    if (!target || !name || busy) return;
    const { controlId, layer, part, artboard } = target;
    const base = mask;
    busy = 'layer';
    try {
      // A combined shape needs its operands attached to have an outline (utils/booleanGroups.js).
      const children = deepClone(target.control._children.Parts._children);
      attachBooleanInputs(children);
      const made = await layerOutlineMask(children[name], part, artboard.width, artboard.height, { linked: maskLinked(base) });
      if (!made) {
        notify(`"${name}" has no outline to mask with.`, { kind: 'warn' });
        return;
      }
      writeLayerMask(controlId, layer, { ...(base ?? newMask()), ...made, enabled: true });
    } finally {
      busy = '';
    }
  }
</script>

<section class="mask-tab property-theme" aria-label="Layer mask">
  <div class="context-bar" class:active={!!target}>
    {#if target}
      <span>Editing: <strong>{target.layer}</strong> · {mask ? 'Layer Mask' : 'No mask'}</span>
    {:else}
      <span>Editing: <strong>nothing</strong></span>
    {/if}
  </div>
  {#if !target}
    <p class="empty">Select a layer in the Component Designer to give it a mask or edit the one it has. A mask says how much of the layer shows: white shows it, black or clear hides it.</p>
  {:else}
    <div class="body">
      <div class="preview-well" title={mask ? 'The mask: white shows the layer, clear hides it' : 'No mask'}>
        <div class="preview" class:off={mask && !maskActive(mask)} class:none={!mask} style={`width:${previewSize.width}px; height:${previewSize.height}px`}>
          {#if mask?.src}<div class="preview-mask" style={previewMaskCSS}></div>{/if}
          {#if previewLayerBox}<div class="preview-layer" style={previewLayerBox}></div>{/if}
          {#if !mask}<span>No mask</span>{/if}
        </div>
      </div>
      <div class="property-grid mask-grid">
        {#if mask}
          <PropertyCell label="Enabled" hint="Off keeps the mask without applying it.">
            <PropertyToggle value={mask.enabled !== false} ariaLabel="Mask enabled" onchange={(value) => set({ enabled: value })} />
          </PropertyCell>
          <PropertyCell label="Invert" hint="Show the layer where the mask is clear instead.">
            <PropertyToggle value={mask.invert === true} ariaLabel="Invert mask" onchange={(value) => set({ invert: value })} />
          </PropertyCell>
          <PropertyCell label="Linked to Layer" span={2} hint="Off: the mask stays put on the artboard while the layer moves under it.">
            <PropertyToggle value={linked} ariaLabel="Mask linked to layer" onchange={(value) => setLinked(value)} />
          </PropertyCell>
          <PropertyCell label="X %" compact hint={linked ? 'Left edge, in % of the layer.' : 'Left edge, in % of the artboard.'}>
            <NumberCell label="X %" value={Number(mask.x ?? 0)} step={1} onchange={(value) => set({ x: value })} />
          </PropertyCell>
          <PropertyCell label="Y %" compact hint={linked ? 'Top edge, in % of the layer.' : 'Top edge, in % of the artboard.'}>
            <NumberCell label="Y %" value={Number(mask.y ?? 0)} step={1} onchange={(value) => set({ y: value })} />
          </PropertyCell>
          <PropertyCell label="W %" compact hint="Width of the mask.">
            <NumberCell label="W %" value={Number(mask.width ?? 100)} min={0} step={1} onchange={(value) => set({ width: value })} />
          </PropertyCell>
          <PropertyCell label="H %" compact hint="Height of the mask.">
            <NumberCell label="H %" value={Number(mask.height ?? 100)} min={0} step={1} onchange={(value) => set({ height: value })} />
          </PropertyCell>
          <div class="action span-2"><button type="button" onclick={fit} title="Place the mask over exactly this layer">Fit to Layer</button></div>
        {:else}
          <div class="action span-2"><button type="button" onclick={() => write(newMask())} title="A mask that shows the whole layer, to size or replace">Add Mask</button></div>
        {/if}
        <div class="action span-2"><button type="button" onclick={loadImage} disabled={!!busy} title="Use a picture as the mask: its transparency, or its brightness when it has none">{busy === 'load' ? 'Loading…' : 'Load Image…'}</button></div>
        <div class="action span-2">
          <select aria-label="Mask with layer" title="Use another layer's outline as this layer's mask" disabled={!!busy || !target.layers.length} onchange={maskWithLayer} value="">
            <option value="" disabled>{busy === 'layer' ? 'Masking…' : 'Mask With Layer ▾'}</option>
            {#each target.layers as name (name)}<option value={name}>{name}</option>{/each}
          </select>
        </div>
        {#if mask}
          <div class="action span-2"><button type="button" class="danger" onclick={() => write(null)} title="Remove the mask from this layer">Delete Mask</button></div>
        {/if}
      </div>
    </div>
    <p class="hint">White shows the layer, black or clear hides it. <b>Mask With Layer</b> uses another layer's outline as this layer's mask, as a clipping mask does; that layer stays as it is, so hide it when it should only mask.</p>
  {/if}
</section>

<style>
  .mask-tab { display: flex; flex-direction: column; min-width: 0; height: 100%; overflow: auto; }
  .context-bar { padding: 6px 12px; color: #9aa; font-size: 11px; border-bottom: 1px solid #2c2c2c; }
  .context-bar.active strong { color: #E4E4E4; }
  .empty { padding: 12px; color: #999; font-size: 12px; max-width: 520px; }
  .body { display: flex; gap: 14px; padding: 12px; align-items: flex-start; }
  .preview-well { width: 110px; height: 110px; flex: none; display: flex; align-items: center; justify-content: center; }
  .preview { position: relative; border: 1px solid #444; border-radius: 3px; overflow: hidden;
    background: repeating-conic-gradient(#3a3a3a 0 25%, #2a2a2a 0 50%) 0 0 / 12px 12px; }
  .preview.off { opacity: .45; }
  .preview.none { display: flex; align-items: center; justify-content: center; color: #777; font-size: 11px; border-style: dashed; background: #1A1A1A; }
  .preview-mask { position: absolute; inset: 0; background: #fff; }
  .preview-layer { position: absolute; border: 1px dashed #4FC3F7; box-sizing: border-box; pointer-events: none; }
  .mask-grid { display: grid; flex: 1; min-width: 0; gap: 7px 9px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-content: start; }
  .action { display: flex; align-items: flex-end; }
  .action.span-2 { grid-column: span 2; }
  .action button, .action select { width: 100%; height: 28px; border: 1px solid #3B3B3B; background: #1E1E1E; color: #E4E4E4; border-radius: 5px; font: inherit; font-size: 11px; cursor: pointer; }
  .action select { text-align: center; text-align-last: center; }
  .action button:hover:not(:disabled), .action select:hover:not(:disabled) { border-color: #5B9BD5; }
  .action button:disabled, .action select:disabled { opacity: .45; cursor: default; }
  .action button.danger:hover { border-color: #C0504D; color: #FFB3B0; }
  .hint { color: #888; font-size: 11px; padding: 0 12px 12px; margin: 0; max-width: 640px; }
</style>
