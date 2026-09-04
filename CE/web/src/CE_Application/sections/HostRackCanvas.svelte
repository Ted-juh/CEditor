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
    hostState, focusRackPart, loadInstrument, addEffect, setPartDestination, setBusDestination,
    rackCanvasLayout, canvasDropTargets, hostCanvasDrag, CANVAS_NODE_W, CANVAS_NODE_H,
    setCanvasPosition, clearCanvasPositions,
    openEditor, closeEditor, floatEditor, closeEditorWindow, unloadInstrument, removeRackPart,
  } from '../stores/instrumentHost.js';
  import PluginTile from './PluginTile.svelte';
  import AppWindow from 'lucide-svelte/icons/app-window';
  import PictureInPicture2 from 'lucide-svelte/icons/picture-in-picture-2';
  import Unplug from 'lucide-svelte/icons/unplug';
  import Trash2 from 'lucide-svelte/icons/trash-2';

  let layout = $derived(rackCanvasLayout($hostState.rack));

  // Legal targets for whatever is in flight, recomputed as the drag starts rather than on
  // every dragover: the answer only changes when the payload does.
  let targets = $derived(new Set(canvasDropTargets($hostState.rack, $hostCanvasDrag)));
  let hovered = $state('');
  // Offered only when there is something to undo — a button that always says "reset" invites
  // the question of what it would reset when nothing has been moved.
  let placedCount = $derived(layout.nodes.filter((n) => n.placed).length);

  const fromCatalogue = (kind) => kind === 'instrument' || kind === 'effect';
  // Every box can be picked up and put somewhere, which is why they are all draggable now.
  // Only a part or a bus has a DESTINATION to change, and that is what lets the two gestures
  // share one drag with no modifier key: a drop on another box is routing, a drop on empty
  // canvas is placing. A return or the master has no destination, so for those the drag only
  // ever means "put it here" — canvasDropTargets returns nothing for them and no box lights.
  const isNodeDrag = (kind) => kind === 'part' || kind === 'bus'
                               || kind === 'return' || kind === 'master';

  // The same four actions the list row carries, so the canvas is not a view you have to
  // leave to do anything. Before this, a part node could be focused and rewired and nothing
  // else: opening a plug-in's interface, floating it or removing the part all meant switching
  // back to List, which is a worse place to hide a control than any menu.
  const toggleEditor = (partId) =>
    ($hostState.editorOpenPartId === partId ? closeEditor() : openEditor(partId));
  const toggleFloat = (partId) =>
    ($hostState.floatingEditorPartIds.includes(partId)
       ? closeEditorWindow(partId) : floatEditor(partId));
  // A click on the strip is about the plug-in, not about which box is focused, and a drag
  // started on a button would otherwise also be read as a drag of the node underneath.
  const actOn = (event, run) => { event.stopPropagation(); run(); };

  const editedIn = {
    part: 'Drag onto a bus or the master to route it · drop an effect here to insert it',
    bus: 'Group bus — drag it onto another bus or the master · drop an effect here to insert it',
    return: 'Send return — drop an effect here; its chain lives in the dock’s Rack tab',
    master: 'Master chain — drop an effect here; it also lives in the dock’s Rack tab',
  };

  // Where inside the box the drag started. Without it the box jumps so its top-left corner
  // lands under the pointer, which looks like the drop went somewhere you did not aim.
  let grabOffset = { x: 0, y: 0 };

  function dragStart(event, node) {
    const box = event.currentTarget.getBoundingClientRect();
    grabOffset = { x: event.clientX - box.left, y: event.clientY - box.top };
    hostCanvasDrag.set({ kind: node.kind, id: node.id, label: node.title });
    // A payload is still set for anything outside this component that may want it; the store
    // above is what THIS component reads, for the dragover reason.
    event.dataTransfer?.setData('text/plain', node.title);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  }

  function dragEnd() {
    hostCanvasDrag.set({ kind: '', id: '', label: '' });
    hovered = '';
    newPartHot = false;
  }

  function dragOver(event, node) {
    if (!targets.has(node.id)) return;      // no preventDefault = not a drop target at all
    event.preventDefault();
    // The effect has to MATCH what the source allowed or the browser cancels the drop
    // outright, silently. Anything dragged in from the CATALOGUE is a copy — an instrument or
    // an effect class is used, never consumed — while a node dragged inside the canvas is
    // moved to a new destination. Getting this wrong loses the drop with no error anywhere,
    // which is exactly how the effect drag failed the first time it was tried.
    if (event.dataTransfer)
      event.dataTransfer.dropEffect = fromCatalogue($hostCanvasDrag.kind) ? 'copy' : 'move';
    hovered = node.id;
  }

  // No dragleave anywhere. It fires when the pointer crosses onto a CHILD of the node too,
  // and relatedTarget is null during a drag in Chromium, so the event cannot tell "left the
  // box" from "moved within it" — either way the highlight switched off while you were still
  // over the box you were aiming at. dragover fires continuously on whatever is under the
  // pointer, so it owns the highlight, and the end of the drag clears it.
  $effect(() => { if (!$hostCanvasDrag.kind) { hovered = ''; newPartHot = false; } });

  // Dropping an instrument where there is no box: the rack gains a part and the instrument
  // goes into it. The gesture was the obvious one and did nothing at all until now — the
  // canvas invited it and swallowed it, which is worse than not offering it.
  //
  // No new command was needed. `loadInstrument` with no part named already means "into a new
  // part", because the first thing anyone does with an empty rack is press Load and the old
  // contract made that click silently do nothing. One service call, so there is no window in
  // which a part exists with nothing in it.
  let newPartHot = $state(false);
  const draggingInstrument = $derived($hostCanvasDrag.kind === 'instrument');

  // Empty canvas takes two different drops, told apart by what is in flight rather than by a
  // modifier key: an instrument from the browser becomes a new part, and a box already on the
  // canvas is simply placed where you let go of it.
  function canvasOver(event) {
    const kind = $hostCanvasDrag.kind;
    if (!draggingInstrument && !isNodeDrag(kind)) return;
    // A node under the pointer owns the drop. Without this the empty-canvas zone would
    // compete with the box you were actually aiming at, since the boxes sit inside it.
    if (event.target.closest?.('.node')) { newPartHot = false; return; }
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = draggingInstrument ? 'copy' : 'move';
    newPartHot = draggingInstrument;
  }

  function canvasDrop(event) {
    const drag = $hostCanvasDrag;
    if (event.target.closest?.('.node')) return;
    if (!draggingInstrument && !isNodeDrag(drag.kind)) return;
    event.preventDefault();

    if (draggingInstrument) {
      loadInstrument('', drag.id);
    } else {
      // The canvas scrolls, so the drop point is measured against the canvas element itself,
      // never the viewport. Clamped at zero because a box at a negative coordinate is drawn
      // outside its own container and cannot be reached again.
      const box = event.currentTarget.getBoundingClientRect();
      setCanvasPosition(drag.id,
                        Math.max(0, event.clientX - box.left - grabOffset.x),
                        Math.max(0, event.clientY - box.top - grabOffset.y));
    }
    dragEnd();
  }

  function drop(event, node) {
    if (!targets.has(node.id)) return;
    event.preventDefault();
    const drag = $hostCanvasDrag;
    // Every drop goes through a command that already exists. The canvas decides WHAT is legal
    // and the service decides whether it happens, exactly as the dropdowns do.
    if (drag.kind === 'part') setPartDestination(drag.id, node.id === '@master' ? '' : node.id);
    else if (drag.kind === 'bus') setBusDestination(drag.id, node.id === '@master' ? '' : node.id);
    else if (drag.kind === 'instrument' && node.kind === 'part') loadInstrument(node.id, drag.id);
    // The master's chain is addressed by name, not by a node id — the one place where what
    // the drawing calls a box and what the service calls a chain differ.
    else if (drag.kind === 'effect') addEffect(node.id === '@master' ? 'master' : node.id, drag.id);
    dragEnd();
  }
</script>

<div class="canvas-scroll" data-testid="host-rack-canvas">
  <div class="canvas" style={`width:${layout.width}px;height:${layout.height}px`}
       class:drag-in-flight={$hostCanvasDrag.kind !== ''}
       role="presentation"
       ondragover={canvasOver}
       ondrop={canvasDrop}>
    <svg class="wires" width={layout.width} height={layout.height} aria-hidden="true">
      {#each layout.wires as wire (wire.kind + wire.from + wire.to)}
        <path d={wire.d} class={wire.kind} data-from={wire.from} data-to={wire.to} />
      {/each}
    </svg>

    {#each layout.nodes as node (node.id)}
      {@const label = `${node.title} — ${editedIn[node.kind]}`}
      {@const isPart = node.kind === 'part'}
      <!-- A part node used to BE a <button>, which is no longer possible now that it carries
           buttons of its own — a button inside a button is not a tree a browser will build.
           role, tabindex and the Enter/Space handler put back exactly what the element gave
           up, and the box keeps its click-to-focus.

           Both ignores below are the analyser losing a ternary, not a11y being waived: role
           and tabindex are driven by the SAME `isPart`, so the element that carries a
           tabindex is always the one that carries role="button" and the key handler, and a
           bus, return or master node is a plain group. -->
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class={`node ${node.kind}`}
           class:focused={node.focused}
           class:muted={node.muted}
           class:unresolved={node.unresolved}
           class:dragging={$hostCanvasDrag.id === node.id}
           class:target={targets.has(node.id)}
           class:hovered={hovered === node.id}
           data-testid={`canvas-node-${node.id}`}
           title={label}
           aria-label={label}
           role={isPart ? 'button' : 'group'}
           tabindex={isPart ? 0 : undefined}
           draggable="true"
           style={`left:${node.x}px;top:${node.y}px;width:${CANVAS_NODE_W}px;height:${CANVAS_NODE_H}px`}
           ondragstart={(e) => dragStart(e, node)}
           ondragend={dragEnd}
           ondragover={(e) => dragOver(e, node)}
           ondrop={(e) => drop(e, node)}
           onclick={isPart ? () => focusRackPart(node.id) : undefined}
           onkeydown={isPart
                        ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); focusRackPart(node.id); } }
                        : undefined}>
        <span class="node-head">
          {#if isPart && (node.hasInstrument || node.unresolved)}
            <PluginTile ceId={node.ceId} name={node.title} vendor={node.subtitle} size={20} />
          {/if}
          <span class="node-title">{node.title}</span>
        </span>
        <span class="node-meta">
          {#if node.midi > 0}<span class="badge midi" title={`${node.midi} MIDI modules`}>♪{node.midi}</span>{/if}
          {#if node.inserts > 0}<span class="badge fx" title={`${node.inserts} inserts`}>fx{node.inserts}</span>{/if}
          <span class="node-sub">{node.subtitle}</span>
        </span>

        <!-- On hover and on keyboard focus rather than always: at rest the picture is the
             signal path, and four icons on every box would compete with the wires it exists
             to draw. While anything is being dragged the strip stays down whatever the
             pointer is over — a drop target that sprouts buttons under the cursor is a drop
             you will miss. -->
        {#if isPart}
          <span class="node-actions">
            <button type="button" class="node-action" disabled={!node.hasInstrument}
                    class:on={$hostState.editorOpenPartId === node.id}
                    data-testid="canvas-open-editor"
                    aria-label={`Show ${node.title}'s own interface in the host`}
                    title="Show the plug-in's own interface in the native pane"
                    onclick={(e) => actOn(e, () => toggleEditor(node.id))}>
              <AppWindow size={13} strokeWidth={1.9} />
            </button>
            <button type="button" class="node-action" disabled={!node.hasInstrument}
                    class:on={$hostState.floatingEditorPartIds.includes(node.id)}
                    data-testid="canvas-float-editor"
                    aria-label={`Pop ${node.title}'s interface out into its own window`}
                    title="Pop the plug-in's interface out into its own window"
                    onclick={(e) => actOn(e, () => toggleFloat(node.id))}>
              <PictureInPicture2 size={13} strokeWidth={1.9} />
            </button>
            <button type="button" class="node-action" disabled={!node.hasInstrument}
                    data-testid="canvas-unload"
                    aria-label={`Unload ${node.title}'s instrument, keep the part`}
                    title="Unload the instrument, keep the part"
                    onclick={(e) => actOn(e, () => unloadInstrument(node.id))}>
              <Unplug size={13} strokeWidth={1.9} />
            </button>
            <button type="button" class="node-action danger"
                    data-testid="canvas-remove-part"
                    aria-label={`Remove ${node.title} from the rack`}
                    title="Remove this part"
                    onclick={(e) => actOn(e, () => removeRackPart(node.id))}>
              <Trash2 size={13} strokeWidth={1.9} />
            </button>
          </span>
        {/if}
      </div>
    {/each}

    <!-- Where the new part will appear, shown only while an instrument is in flight. The
         slot is the target, but so is the rest of the empty canvas: this says WHERE it will
         land, it does not demand you hit it. -->
    {#if draggingInstrument}
      <div class="node new-part" class:hovered={newPartHot}
           data-testid="canvas-new-part"
           style={`left:${layout.newPartSlot.x}px;top:${layout.newPartSlot.y}px;width:${CANVAS_NODE_W}px;height:${CANVAS_NODE_H}px`}>
        <span class="node-title">＋ New part</span>
        <span class="node-sub">drop here, or anywhere empty</span>
      </div>
    {/if}
  </div>

  <div class="canvas-key">
    <span><i class="swatch audio"></i>signal</span>
    <span><i class="swatch send"></i>send (a copy)</span>
    <span class="canvas-note">
      {#if draggingInstrument}
        Dropping <strong>{$hostCanvasDrag.label}</strong> — onto a part to replace it, or anywhere
        empty for a new one.
      {:else if $hostCanvasDrag.kind}
        Dropping <strong>{$hostCanvasDrag.label}</strong> — onto a lit box to route it there, or
        anywhere empty to leave it where you drop it.
      {:else}
        Drag a box onto its destination to route it, or onto empty space to place it · drag an
        instrument or effect here from the right.
      {/if}
    </span>
    {#if placedCount > 0}
      <button type="button" class="reset-layout" data-testid="canvas-reset-layout"
              title="Forget every hand-placed box and lay the canvas out again"
              onclick={() => clearCanvasPositions()}>
        Reset layout ({placedCount})
      </button>
    {/if}
  </div>
</div>

<style>
  .canvas-scroll { flex: 1; min-height: 0; overflow: auto; }
  /* The canvas shrink-wraps its boxes, which made "drop on empty space" a promise it could
     barely keep: on a small rack the element was a couple of hundred pixels tall and the
     apparently-empty area below it belonged to the scroller, not the canvas, so a drop there
     silently did nothing. Filling the viewport makes the empty space you can see the empty
     space you can use. */
  .canvas { position: relative; min-width: 100%; min-height: 100%; }
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
  .reset-layout {
    margin-left: auto;
    padding: 2px 8px;
    border: 1px solid #3b4652;
    border-radius: 4px;
    background: #20262c;
    color: #a8b4c0;
    font-family: inherit;
    font-size: 11px;
    cursor: pointer;
  }
  .reset-layout:hover { border-color: #5b9bd5; color: #d6dbe0; }

  .node.new-part {
    border-style: dashed;
    border-color: #4a5a6a;
    background: rgba(91, 155, 213, 0.05);
    color: #8fa4b8;
    pointer-events: none;   /* the canvas underneath owns the drop, not this hint */
  }
  .node.new-part.hovered { border-color: #5b9bd5; background: rgba(91, 155, 213, 0.16); color: #d6dbe0; }

  .node[role='button'] { cursor: pointer; font-family: inherit; }
  .node[role='button']:hover { border-color: #5b9bd5; }
  .node[role='button']:focus-visible { outline: 2px solid #5b9bd5; outline-offset: 1px; }
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

  /* Bottom-right, over the subtitle: the two lines that matter — the name and the routing
     the wires draw — stay uncovered. Its own ground so the text underneath does not read
     through the icons. */
  .node-actions {
    position: absolute;
    right: 3px;
    bottom: 3px;
    display: flex;
    align-items: center;
    gap: 1px;
    padding: 1px;
    border-radius: 4px;
    background: rgba(23, 26, 29, 0.94);
    opacity: 0;
    pointer-events: none;
    transition: opacity 90ms linear;
  }
  .node:hover > .node-actions,
  .node:focus-within > .node-actions { opacity: 1; pointer-events: auto; }
  /* Spelled out rather than left to source order: while a drag is on, the strip stays
     down whatever is hovered or focused. */
  .canvas.drag-in-flight .node:hover > .node-actions,
  .canvas.drag-in-flight .node:focus-within > .node-actions { opacity: 0; pointer-events: none; }
  .node-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: none;
    color: #8b97a3;
    cursor: pointer;
  }
  .node-action:hover:not(:disabled) { background: #2c3742; color: #d6dbe0; }
  .node-action.on { background: #24313d; color: #7fb4e0; }
  .node-action.danger:hover:not(:disabled) { background: #3a2626; color: #e4b3b3; }
  .node-action:disabled { opacity: 0.3; cursor: default; }

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
