<script>
  /**
   * HostRackCanvas.svelte — the signal path as a picture (rack-canvas plan, stage 2).
   *
   * Read-only on purpose. The rack column tells you what EXISTS; this tells you where the
   * sound GOES, which no amount of headings ever did: instruments on the left, the buses they
   * join in the middle, the master on the right, returns in a band of their own because they
   * take a copy rather than carrying the signal.
   *
   * Nothing here edits. Clicking a part focuses it, which is the same thing clicking its row
   * does — the dock then shows it. Everything else is labelled with where it IS edited. That
   * is deliberate for this stage: a picture has to earn dragging before it gets it, and a
   * canvas that lets you draw connections the engine cannot build would be worse than a list.
   */
  import { hostState, focusRackPart, rackCanvasLayout, CANVAS_NODE_W, CANVAS_NODE_H }
    from '../stores/instrumentHost.js';

  let layout = $derived(rackCanvasLayout($hostState.rack));

  const editedIn = {
    part: 'Click to focus — edit it in the dock below',
    bus: 'Group bus — its inserts and destination live in the Mixer',
    return: 'Send return — its chain lives in the dock’s Rack tab',
    master: 'Master chain — the dock’s Rack tab',
  };
</script>

<div class="canvas-scroll" data-testid="host-rack-canvas">
  <div class="canvas" style={`width:${layout.width}px;height:${layout.height}px`}>
    <svg class="wires" width={layout.width} height={layout.height} aria-hidden="true">
      {#each layout.wires as wire (wire.kind + wire.from + wire.to)}
        <path d={wire.d} class={wire.kind} />
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
                      data-testid={`canvas-node-${node.id}`}
                      title={label}
                      aria-label={label}
                      style={`left:${node.x}px;top:${node.y}px;width:${CANVAS_NODE_W}px;height:${CANVAS_NODE_H}px`}
                      onclick={node.kind === 'part' ? () => focusRackPart(node.id) : undefined}>
        <span class="node-title">{node.title}</span>
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
    <span class="canvas-note">Read-only for now — click a part to focus it.</span>
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
  .node.muted { opacity: 0.5; }
  .node.unresolved { border-color: #7a4a4a; }
  .node.bus { background: #232b21; }
  .node.return { background: #1f2630; }
  .node.master { background: #2a2620; }

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
