<script>
  /**
   * The Envelope's curve, drawn and draggable at design time.
   *
   * In the properties panel a curve is a list of rows, each holding two number boxes and a dropdown.
   * The shape is not on screen anywhere in the panel. It IS on screen in preview — and preview is a
   * rehearsal, so a curve dragged there goes back to what it was when preview stops.
   *
   * Nodes have handles, and that is not a slider: the value here IS the shape. Same rule as the
   * bezier and polyline editors.
   *
   * The picture is `EnvelopeRenderer`, the same component the canvas draws with.
   */
  import { updateControlProperty } from '../../stores/controls.js';
  import EnvelopeRenderer from '../../editor/EnvelopeRenderer.svelte';
  import PropertySelect from '../../properties/PropertySelect.svelte';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import Plus from 'lucide-svelte/icons/plus';
  import {
    envelopeGeometry, envToPx, envFromPx, envHitNode, envDragNode, envAddNode, envRemoveNode,
    envelopePoints, envelopeConfig, ENVELOPE_CURVES, ENVELOPE_PRESETS, envelopePreset,
  } from '../../utils/envelopeLayout.js';
  import { envelopeRows, envelopeStages, envelopeIsFlat, snapTo } from '../../utils/designerModel.js';

  let { control = null, controlId = '' } = $props();

  let stageW = $state(0);
  let stageH = $state(0);

  let points = $derived(envelopePoints(control));
  let config = $derived(envelopeConfig(control));
  let rows = $derived(envelopeRows(control));
  let stages = $derived(envelopeStages(control));
  let flat = $derived(envelopeIsFlat(control));
  let geom = $derived(envelopeGeometry(stageW, stageH, 8));
  let dots = $derived(rows.map((row) => ({ ...row, ...envToPx(row, geom) })));

  let wanted = $state(-1);
  let index = $derived(wanted >= 0 && wanted < rows.length ? wanted : -1);
  let node = $derived(index >= 0 ? rows[index] : null);
  let drag = $state(null);

  const lockY = $derived(Array.isArray(config.lockYIndices) ? config.lockYIndices.map(Number) : []);

  function write(next) {
    if (!controlId) return;
    updateControlProperty(controlId, 'Envelope.points', next);
  }

  function local(event) {
    const box = event.currentTarget.getBoundingClientRect();
    return { px: event.clientX - box.left, py: event.clientY - box.top };
  }

  function down(event) {
    const { px, py } = local(event);
    const hit = envHitNode(points, geom, px, py, 11);
    if (hit >= 0) {
      wanted = hit;
      drag = { index: hit };
      event.currentTarget.setPointerCapture?.(event.pointerId);
      return;
    }
    // Empty space adds a node where you clicked, which is what the panel's "+ Add" cannot do — it
    // drops one in the widest gap and you find it afterwards.
    const at = envFromPx(px, py, geom);
    const added = envAddNode(points, snapTo(at.x, config.snapX), snapTo(at.y, config.snapY));
    write(added.points);
    wanted = added.index;
    drag = { index: added.index };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function move(event) {
    if (!drag) return;
    const { px, py } = local(event);
    const at = envFromPx(px, py, geom);
    write(envDragNode(points, drag.index, snapTo(at.x, config.snapX), snapTo(at.y, config.snapY), {
      lockEndsX: true,
      lockYIndices: lockY,
    }));
  }

  function up() { drag = null; }

  function remove(at) {
    if (at <= 0 || at >= points.length - 1) return;
    write(envRemoveNode(points, at));
    wanted = -1;
  }

  function applyPreset(name) {
    if (!controlId) return;
    const shape = envelopePreset(name);
    updateControlProperty(controlId, 'Envelope.points', shape.points.map((point, i) => ({ id: `e${i}`, tension: 0, ...point })));
    updateControlProperty(controlId, 'Envelope.sustainIndex', shape.sustainIndex);
    updateControlProperty(controlId, 'Envelope.lockYIndices', shape.lockYIndices);
    updateControlProperty(controlId, 'Envelope.preset', name);
    wanted = -1;
  }

  function setSustain(at) {
    if (!controlId) return;
    updateControlProperty(controlId, 'Envelope.sustainIndex', config.sustainIndex === at ? -1 : at);
  }

  function setCurve(at, curve) {
    write(points.map((point, i) => (i === at ? { ...point, curve } : point)));
  }
</script>

<div class="envdes">
  <div class="stagecol">
    <div class="colh">
      Curve
      <s>{rows.length} nodes · A {stages.attackMs}{stages.unit} · D {stages.decayMs}{stages.unit} · S {Math.round(stages.sustain * 100)}% · R {stages.releaseMs}{stages.unit}</s>
    </div>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="stage" bind:clientWidth={stageW} bind:clientHeight={stageH}
      onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
    >
      {#if stageW > 0 && stageH > 0}
        <div class="fill">
          <EnvelopeRenderer {control} width={stageW} height={stageH} activeIndex={index} />
        </div>
        <svg class="handles" width={stageW} height={stageH} viewBox={`0 0 ${stageW} ${stageH}`}>
          {#each dots as dot (dot.id)}
            <circle cx={dot.px} cy={dot.py} r={dot.index === index ? 6 : 4.5}
                    fill={dot.isSustain ? '#F2C94C' : (dot.index === index ? '#8FEDE3' : '#5B9BD5')}
                    stroke="#0C0F12" stroke-width="1.5" />
            {#if dot.isSustain}
              <line x1={dot.px} y1={8} x2={dot.px} y2={stageH - 8} stroke="#F2C94C" stroke-width="1" stroke-dasharray="2 3" opacity="0.5" />
            {/if}
          {/each}
        </svg>
      {/if}
      {#if flat}
        <p class="blank">This curve is a flat line — every node is at the same level, so the
          envelope outputs one number for its whole run.</p>
      {/if}
    </div>
  </div>

  <div class="railcol">
    <div class="colh">Shapes</div>
    <div class="fills">
      {#each ENVELOPE_PRESETS as name (name)}
        <button type="button" class="chip" class:on={config.preset === name}
                title={`Replace the curve with a ${name} shape`} onclick={() => applyPreset(name)}>{name}</button>
      {/each}
    </div>

    <div class="colh nodes">Nodes <s>{rows.length}</s></div>
    <div class="list">
      {#each rows as row (row.id)}
        <button type="button" class="node" class:sel={row.index === index} class:sus={row.isSustain}
                onclick={() => { wanted = row.index; }}>
          <span class="nn">{row.index + 1}</span>
          <span class="nxy">{row.x.toFixed(2)} · {row.y.toFixed(2)}</span>
          <span class="ncv">{row.curve}</span>
        </button>
      {/each}
    </div>

    <div class="box">
      {#if node}
        <div class="grp">Node {node.index + 1}</div>
        <div class="r">
          <label for="env-curve">Curve</label>
          <PropertySelect options={ENVELOPE_CURVES.map((value) => ({ value, label: value }))}
                          value={node.curve} ariaLabel="Segment curve"
                          onchange={(value) => setCurve(node.index, value)} />
        </div>
        <div class="fills">
          <button type="button" class="chip" class:on={node.isSustain} title="Hold here while a note is held"
                  onclick={() => setSustain(node.index)}>sustain</button>
          <button type="button" class="chip danger" disabled={node.isEnd}
                  title={node.isEnd ? 'An envelope keeps its start and its end' : 'Remove this node'}
                  onclick={() => remove(node.index)}><Trash2 size={11} /> remove</button>
        </div>
        {#if node.yLocked}
          <p class="nhint">This node's level is locked by the shape — drag it sideways.</p>
        {/if}
      {:else}
        <p class="nhint"><Plus size={11} /> Drag a node to move it. Click empty space to add one
          where you clicked — the panel's Add drops one in the widest gap instead.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .envdes { display: flex; gap: 10px; padding: 10px; align-items: stretch; min-height: 0; flex: 1 1 auto; }
  .stagecol { flex: 1 1 0; min-width: 260px; display: flex; flex-direction: column; }
  .railcol { flex: 0 0 220px; min-width: 0; display: flex; flex-direction: column; }

  .colh {
    display: flex; align-items: center; gap: 6px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #616C75;
    margin-bottom: 7px; white-space: nowrap; overflow: hidden;
  }
  .colh s { margin-left: auto; text-decoration: none; letter-spacing: 0.04em; font-size: 8px; }
  .colh.nodes { margin-top: 10px; }

    /* The renderer and the hit layer are taken OUT OF FLOW on purpose.

     `.stage` is `flex: 1 1 auto` and reports its size back through `bind:clientWidth/clientHeight`,
     which the renderer is then drawn at. Leave the renderer in flow and that is a loop: the SVG's
     height contributes to the container's height, which resizes the SVG, which... Svelte stops it
     with `effect_update_depth_exceeded` and the tab freezes on whatever it had. Absolute positioning
     means the drawing can never influence the box it is measured from. */
  .fill { position: absolute; inset: 0; }

  .stage {
    position: relative; flex: 1 1 auto; min-height: 180px;
    border: 1px solid #2E3540; border-radius: 4px; background: #0C0F12;
    overflow: hidden; cursor: crosshair; touch-action: none;
  }
  .handles { position: absolute; inset: 0; pointer-events: none; }
  .blank {
    position: absolute; inset: auto 12px 10px 12px; margin: 0;
    font: 400 10px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #E5A029; pointer-events: none;
  }

  .list { display: flex; flex-direction: column; gap: 2px; flex: 0 1 auto; min-height: 0; overflow: hidden auto; }
  .node {
    display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 6px;
    padding: 4px 6px; border: 1px solid #2E3540; border-radius: 3px; background: #12171A;
    cursor: pointer; text-align: left;
  }
  .node:hover { border-color: #4A555E; }
  .node.sel { border-color: #5B9BD5; background: #173449; }
  .node.sus { box-shadow: inset 2px 0 0 #F2C94C; }
  .nn { font: 600 9px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }
  .nxy { font: 400 9.5px/1 'IBM Plex Mono', ui-monospace, monospace; color: #C3D0DA; }
  .ncv { font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }

  .box { margin-top: 8px; border: 1px solid #333; border-radius: 4px; background: #1A1D20; padding: 6px 8px 9px; }
  .grp {
    font: 600 8px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em; text-transform: uppercase; color: #4B545C;
    margin: 2px 0; padding-bottom: 3px; border-bottom: 1px solid #262B30;
  }
  .r { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 6px; align-items: center; margin-top: 6px; }
  .r > label { font: 400 9.5px/1.15 'IBM Plex Sans', system-ui, sans-serif; color: #616C75; text-align: right; }

  .fills { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; }
  .chip {
    display: inline-flex; align-items: center; gap: 3px;
    border: 1px solid #333B42; background: #12171A; color: #9AA6AE;
    font: 600 9px/1 'IBM Plex Sans', system-ui, sans-serif;
    padding: 5px 7px; border-radius: 3px; cursor: pointer;
  }
  .chip:hover:not(:disabled) { border-color: #5B9BD5; color: #E8EEF5; }
  .chip.on { border-color: #0E7C70; background: #0B2320; color: #8FEDE3; }
  .chip.danger:hover:not(:disabled) { border-color: #8A4A4A; color: #D98C8C; }
  .chip:disabled { opacity: 0.35; cursor: default; }

  .nhint { margin: 6px 0 0; font: 400 9px/1.5 'IBM Plex Sans', system-ui, sans-serif; color: #69737B; }
</style>
