<script>
  /**
   * HostRackCanvas.svelte — the signal path as a picture you can rewire (rack-canvas plan,
   * stages 2 and 3).
   *
   * The rack column tells you what EXISTS; this tells you where the sound GOES, which no
   * amount of headings ever did: instruments on the left, the buses they join in the middle,
   * the master on the right, returns in a band of their own because they take a copy rather
   * than carrying the signal.
   *
   * Routing is the one thing you can change here, by dragging a part or a bus onto its
   * destination, and by dragging an instrument in from the browser. Everything else is
   * labelled with where it IS edited. That restraint is the design, not a gap: a part's
   * inserts are a serial chain with no splits and no parallel branches, so a canvas offering
   * free cabling would promise a patchbay this engine does not have. Legal targets light up;
   * everything else refuses the drop outright, which is why the picture can never be drawn
   * into a routing the service would turn down.
   */
  import {
    hostState, focusRackPart, loadInstrument, setPartDestination, setBusDestination,
    rackCanvasLayout, canvasDropTargets, hostCanvasDrag, CANVAS_NODE_W, CANVAS_NODE_H,
  } from '../stores/instrumentHost.js';
  import PluginTile from './PluginTile.svelte';

  let layout = $derived(rackCanvasLayout($hostState.rack));

  // Legal targets for whatever is in flight, recomputed as the drag starts rather than on
  // every dragover: the answer only changes when the payload does.
  let targets = $derived(new Set(canvasDropTargets($hostState.rack, $hostCanvasDrag)));
  let hovered = $state('');

  const editedIn = {
    part: 'Drag onto a bus or the master to route it · click to focus and edit below',
    bus: 'Group bus — drag it onto another bus or the master · its inserts live in the Mixer',
    return: 'Send return — its chain lives in the dock’s Rack tab',
    master: 'Master chain — the dock’s Rack tab',
  };

  function dragStart(event, node) {
    if (node.kind !== 'part' && node.kind !== 'bus') return;
    hostCanvasDrag.set({ kind: node.kind, id: node.id, label: node.title });
    // A payload is still set for anything outside this component that may want it; the store
    // above is what THIS component reads, for the dragover reason.
    event.dataTransfer?.setData('text/plain', node.title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function dragEnd() {
    hostCanvasDrag.set({ kind: '', id: '', label: '' });
    hovered = '';
  }

  function dragOver(event, node) {
    if (!targets.has(node.id)) return;      // no preventDefault = not a drop target at all
    event.preventDefault();
    // The effect has to MATCH what the source allowed or the browser cancels the drop
    // outright, silently: an instrument is copied onto a part, a node is moved to a new
    // destination, and saying "move" over a copy source loses the drop with no error.
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = $hostCanvasDrag.kind === 'instrument' ? 'copy' : 'move';
    hovered = node.id;
  }

  // No dragleave anywhere. It fires when the pointer crosses onto a CHILD of the node too,
  // and relatedTarget is null during a drag in Chromium, so the event cannot tell "left the
  // box" from "moved within it" — either way the highlight switched off while you were still
  // over the box you were aiming at. dragover fires continuously on whatever is under the
  // pointer, so it owns the highlight, and the end of the drag clears it.
  $effect(() => { if (!$hostCanvasDrag.kind) hovered = ''; });

  function drop(event, node) {
    if (!targets.has(node.id)) return;
    event.preventDefault();
    const drag = $hostCanvasDrag;
    // Every drop goes through a command that already exists. The canvas decides WHAT is legal
    // and the service decides whether it happens, exactly as the dropdowns do.
    if (drag.kind === 'part') setPartDestination(drag.id, node.id === '@master' ? '' : node.id);
    else if (drag.kind === 'bus') setBusDestination(drag.id, node.id === '@master' ? '' : node.id);
    else if (drag.kind === 'instrument' && node.kind === 'part') loadInstrument(node.id, drag.id);
    dragEnd();
  }
</script>

<div class="canvas-scroll" data-testid="host-rack-canvas">
  <div class="canvas" style={`width:${layout.width}px;height:${layout.height}px`}>
    <svg class="wires" width={layout.width} height={layout.height} aria-hidden="true">
      {#each layout.wires as wire (wire.kind + wire.from + wire.to)}
        <path d={wire.d} class={wire.kind} data-from={wire.from} data-to={wire.to} />
      {/each}
    </svg>

    {#each layout.nodes as node (node.id)}
      {@const label = `${node.title} — ${editedIn[node.kind]}`}
      <svelte:element this={node.kind === 'part' ? 'button' : 'div'}
                      type={node.kind === 'part' ? 'button' : undefined}
                      class={`node ${node.kind}`}
                      class:focused={node.focused}
                      class:muted={node.muted}
                      class:unresolved={node.unresolved}
                      class:dragging={$hostCanvasDrag.id === node.id}
                      class:target={targets.has(node.id)}
                      class:hovered={hovered === node.id}
                      data-testid={`canvas-node-${node.id}`}
                      title={label}
                      aria-label={label}
                      draggable={node.kind === 'part' || node.kind === 'bus'}
                      style={`left:${node.x}px;top:${node.y}px;width:${CANVAS_NODE_W}px;height:${CANVAS_NODE_H}px`}
                      ondragstart={(e) => dragStart(e, node)}
                      ondragend={dragEnd}
                      ondragover={(e) => dragOver(e, node)}
                      ondrop={(e) => drop(e, node)}
                      onclick={node.kind === 'part' ? () => focusRackPart(node.id) : undefined}>
        <span class="node-head">
          {#if node.kind === 'part' && (node.hasInstrument || node.unresolved)}
            <PluginTile ceId={node.ceId} name={node.title} vendor={node.subtitle} size={20} />
          {/if}
          <span class="node-title">{node.title}</span>
        </span>
        <span class="node-meta">
          {#if node.midi > 0}<span class="badge midi" title={`${node.midi} MIDI modules`}>♪{node.midi}</span>{/if}
          {#if node.inserts > 0}<span class="badge fx" title={`${node.inserts} inserts`}>fx{node.inserts}</span>{/if}
          <span class="node-sub">{node.subtitle}</span>
        </span>
      </svelte:element>
    {/each}
  </div>

  <div class="canvas-key">
    <span><i class="swatch audio"></i>signal</span>
    <span><i class="swatch send"></i>send (a copy)</span>
    <span class="canvas-note">
      {#if $hostCanvasDrag.kind}
        Dropping <strong>{$hostCanvasDrag.label}</strong> — only the lit boxes will take it.
      {:else}
        Drag a part or bus onto its destination · drag an instrument here from the right.
      {/if}
    </span>
  </div>
</div>

<style>
  .canvas-scroll { flex: 1; min-height: 0; overflow: auto; }
  .canvas { position: relative; }
  .wires { position: absolute; inset: 0; pointer-events: none; }
  .wires path { fill: none; stroke-width: 1.5px; }
  .wires path.audio { stroke: #5b9bd5; }
  .wires path.send { stroke: #6f8a70; stroke-dasharray: 4 3; }

  .node {
    position: absolute;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    box-sizing: border-box;
    padding: 6px 9px;
    border: 1px solid #3b4652;
    border-radius: 5px;
    background: #20262c;
    color: #d6dbe0;
    font-size: 12px;
    text-align: left;
    overflow: hidden;
  }
  button.node { cursor: pointer; font-family: inherit; }
  button.node:hover { border-color: #5b9bd5; }
  .node.focused { border-color: #5b9bd5; background: #24313d; }
  .node[draggable='true'] { cursor: grab; }
  .node.dragging { opacity: 0.4; }
  /* Legal targets say so before you get there; everything else refuses the drop outright, so
     the canvas cannot be drawn into a routing the engine would turn down. */
  .node.target { border-color: #6f8a70; border-style: dashed; }
  .node.hovered { border-color: #8fc4a8; border-style: solid; background: #223026; }
  .node.muted { opacity: 0.5; }
  .node.unresolved { border-color: #7a4a4a; }
  .node.bus { background: #232b21; }
  .node.return { background: #1f2630; }
  .node.master { background: #2a2620; }

  .node-head { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .node-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .node-meta { display: flex; align-items: center; gap: 4px; min-width: 0; }
  .node-sub {
    color: #7d8894; font-size: 10px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  .badge {
    flex: none;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 10px;
    background: #2c3742;
    color: #9aa5b1;
  }
  .badge.midi { color: #7fb4e0; }
  .badge.fx { color: #8fc4a8; }

  .canvas-key {
    position: sticky;
    left: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 6px 12px 0;
    color: #7d8894;
    font-size: 10px;
  }
  .canvas-key span { display: inline-flex; align-items: center; gap: 4px; }
  .swatch { width: 14px; height: 0; border-top: 2px solid #5b9bd5; }
  .swatch.send { border-top-style: dashed; border-top-color: #6f8a70; }
  .canvas-note { margin-left: auto; }
</style>
