<script>
  /**
   * FollowGraph.svelte — the song form, drawn.
   *
   * A clip's follow action is a song form expressed as five dropdowns, which means the shape of
   * a set has only ever existed in somebody's head — and on a row of dropdowns an arrow that
   * will never fire looks exactly like one that will. Drawn, it does not.
   *
   * The rules are `clipFollowGraph` in the store, not here: they are the engine's rules, they
   * were established by driving PerformanceEngine rather than by reading it, and they are worth
   * testing without a component to mount. What lives in this file is the geometry and nothing
   * else, which is why the boxes and the arrows cannot drift apart.
   *
   * Document order is kept deliberately. "Next clip" means the next row, so reordering the boxes
   * into a prettier graph would hide the very thing being drawn.
   */
  import { clipFollowGraph } from '../stores/instrumentHost.js';

  let { clips = [] } = $props();

  let graph = $derived(clipFollowGraph(clips));
  let open = $state(true);

  const GUTTER = 52;      // the lane the arrows curve through
  const WIDTH = 230;
  const ROW = 26;
  const GAP = 9;
  const PAD = 6;

  const rowY = (index) => PAD + index * (ROW + GAP);
  const midY = (index) => rowY(index) + ROW / 2;
  let height = $derived(graph.nodes.length === 0 ? 0 : rowY(graph.nodes.length - 1) + ROW + PAD);

  /** One edge as a curve out into the gutter and back. The bulge grows with the distance the
      arrow travels, so a Next between neighbours and a wrap from the bottom row to the top do
      not lie on top of each other. A clip that follows itself has no distance to bulge over and
      gets the smallest one, which draws as a loop beside its own box. */
  const edgePath = (edge) => {
    const from = graph.nodes.find((n) => n.clipId === edge.fromClipId);
    const to = graph.nodes.find((n) => n.clipId === edge.toClipId);
    if (!from || !to) return '';
    const y1 = midY(from.index);
    const y2 = midY(to.index);
    const bulge = Math.min(GUTTER - 10, 12 + Math.abs(from.index - to.index) * 9);
    return `M ${GUTTER} ${y1} C ${GUTTER - bulge} ${y1}, ${GUTTER - bulge} ${y2}, ${GUTTER - 3} ${y2}`;
  };

  /** What happens when this clip has run its course, in the fewest words that are still true. */
  const endLabel = (node) => {
    if (node.deadReason) return `${node.action} — never fires`;
    if (node.kind === 'terminal') return node.stopNote;
    if (node.kind === 'fan') return `any of ${node.fanOut}, after ${node.afterLoops}`;
    if (node.kind === 'follow') {
      const target = graph.nodes.find((n) => n.clipId === node.target);
      return `${node.action === 'next' ? 'next:' : '→'} ${target?.name ?? ''}, after ${node.afterLoops}`;
    }
    return 'loops until stopped';
  };
</script>

{#if graph.nodes.length > 0}
  <div class="follow-graph" data-testid="follow-graph">
    <button type="button" class="graph-toggle" data-testid="follow-graph-toggle"
            aria-expanded={open} onclick={() => (open = !open)}>
      {open ? '▾' : '▸'} Song form
      {#if graph.warnings.length > 0}
        <span class="warn-count" data-testid="follow-graph-warn-count">{graph.warnings.length}</span>
      {/if}
    </button>

    {#if open}
      <svg class="graph" role="img" aria-label="How the clips hand off to each other"
           viewBox={`0 0 ${WIDTH} ${height}`} style={`height: ${height}px`}>
        <defs>
          <marker id="follow-arrow" viewBox="0 0 8 8" refX="7" refY="4"
                  markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 8 4 L 0 8 z" />
          </marker>
        </defs>

        <!-- A Random follow fans to EVERY other clip, so one arrow per destination is a
             hairball that says less than the number does. It gets a stub and a count instead;
             the arrows drawn here are only the ones an eye can follow. -->
        {#each graph.edges.filter((e) => e.kind !== 'random') as edge (edge.fromClipId + '>' + edge.toClipId)}
          <path class="edge" class:next={edge.kind === 'next'} data-testid="graph-edge"
                d={edgePath(edge)} marker-end="url(#follow-arrow)" />
        {/each}

        {#each graph.nodes as node (node.clipId)}
          <g class="node" class:dead={node.deadReason !== ''} class:entry={!node.reachable}
             data-testid="graph-node">
            <rect x={GUTTER} y={rowY(node.index)} width={WIDTH - GUTTER - 2} height={ROW} rx="3" />
            <text class="name" x={GUTTER + 7} y={midY(node.index) - 1}>{node.name}</text>
            <text class="end" x={GUTTER + 7} y={midY(node.index) + 9}>{endLabel(node)}</text>

            {#if node.kind === 'terminal'}
              <!-- An end drawn as an end: the bar somebody looks for when they ask whether the
                   set finishes on its own. -->
              <line class="stop" data-testid="graph-stop" x1={WIDTH - 6} y1={rowY(node.index) + 5}
                    x2={WIDTH - 6} y2={rowY(node.index) + ROW - 5} />
            {/if}
            {#if node.kind === 'fan'}
              <path class="fan" data-testid="graph-fan"
                    d={`M ${GUTTER} ${midY(node.index)} l -13 -7
                        M ${GUTTER} ${midY(node.index)} l -15 0
                        M ${GUTTER} ${midY(node.index)} l -13 7`} />
            {/if}
            {#if !node.reachable}
              <!-- Nothing leads here, so it is launched by hand. Not a mistake — it is how a set
                   starts — which is why it is a label rather than a warning. -->
              <text class="by-hand" x={GUTTER - 20} y={midY(node.index) + 3}
                    data-testid="graph-entry">by hand</text>
            {/if}
          </g>
        {/each}
      </svg>

      <!-- Every one of these is a setting the engine ignores or quietly turns into something
           else. They were found by driving PerformanceEngine, and each is a thing you would
           otherwise discover during the gig rather than before it. -->
      {#if graph.warnings.length > 0}
        <ul class="warnings" data-testid="follow-graph-warnings">
          {#each graph.warnings as warning (warning.code + warning.clipId)}
            <li data-testid={`graph-warning-${warning.code}`}>{warning.text}</li>
          {/each}
        </ul>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .follow-graph { margin: 4px 0 10px; }

  button.graph-toggle {
    display: flex; align-items: center; gap: 6px; width: 100%; text-align: left;
    background: transparent; border: 1px solid transparent; border-radius: 4px;
    padding: 3px 6px; color: #9aa5b1; font-size: 11px; letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  button.graph-toggle:hover { background: #1c2126; color: #d6dbe0; }
  .warn-count {
    margin-left: auto; color: #d9a13c; border: 1px solid #d9a13c66; border-radius: 8px;
    padding: 0 6px; font-size: 10px; letter-spacing: 0;
  }

  .graph { display: block; width: 100%; max-width: 230px; overflow: visible; }
  .graph :global(#follow-arrow path) { fill: #6d7a88; }

  .edge { fill: none; stroke: #6d7a88; stroke-width: 1.2; }
  /* Next walks document order, so its meaning is the layout itself. Dashed rather than
     coloured: it is the same kind of hand-off, only one nobody named a target for. */
  .edge.next { stroke-dasharray: 3 2; }
  .fan { fill: none; stroke: #6d7a88; stroke-width: 1.2; }

  .node rect { fill: #161a1e; stroke: #333c46; stroke-width: 1; }
  .node.entry rect { stroke-dasharray: 3 2; }
  .node.dead rect { stroke: #d9a13c88; }
  .name { fill: #d6dbe0; font-size: 9.5px; }
  .end { fill: #7d8894; font-size: 8px; }
  .node.dead .end { fill: #d9a13c; }
  .by-hand { fill: #566372; font-size: 7.5px; }
  .stop { stroke: #9aa5b1; stroke-width: 2; }

  .warnings { list-style: none; margin: 6px 0 0; padding: 0; color: #d9a13c; font-size: 10.5px; }
  .warnings li { padding: 2px 0 2px 10px; text-indent: -10px; }
</style>
