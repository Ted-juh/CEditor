<script>
  // RoutesTab — the Link Mapper and the modulation node-graph, which are one tab.
  //
  // They were two rows in the backlog and two design docs, and building them separately would have
  // been the mistake the Link Mapper's own open question was warning about. Both are editors over
  // the SAME route list: the list view is the doc's "visible mixer strip" form, and the canvas is
  // the patch-cord view. Switching between them changes nothing but the drawing — which is the
  // proof that "one model, three editors" is true rather than aspirational.
  //
  // The third editor is the properties-panel link that already shipped, and the Macro's slots and
  // Router's destinations appear here as cables without either component knowing this tab exists.
  //
  // THE MATHS IS NOT HERE. `utils/routeModel.js` evaluates a route and finds cycles;
  // `utils/routeAdapters.js` reads the components. This is the surface.

  import Cable from 'lucide-svelte/icons/cable';
  import List from 'lucide-svelte/icons/list';
  import Network from 'lucide-svelte/icons/network';
  import Plus from 'lucide-svelte/icons/plus';
  import Trash2 from 'lucide-svelte/icons/trash-2';
  import TriangleAlert from 'lucide-svelte/icons/triangle-alert';

  import { activePanel } from '../stores/panels.js';
  import { addRoute, removeRoute, updateRoute } from '../stores/routes.js';
  import { panelRoutes, routeEndpointCandidates, routeWriteTarget } from '../utils/routeAdapters.js';
  import { ROUTE_CURVE, ROUTE_MODE, describeRoute, endpointAddress, routeCycles } from '../utils/routeModel.js';
  import { cinfo, cwarn } from '../stores/console.js';

  let view = $state('list');
  let newFrom = $state('');
  let newTo = $state('');
  let notice = $state('');

  let routes = $derived(panelRoutes($activePanel));
  let candidates = $derived(routeEndpointCandidates($activePanel));
  let sources = $derived(candidates.filter((entry) => entry.canSource));
  let targets = $derived(candidates.filter((entry) => entry.canTarget));
  let cycles = $derived(routeCycles(routes));
  // A route inside a cycle is the one to remove, so the row says so rather than a banner naming
  // addresses the author then has to match up by eye.
  let cycleAddresses = $derived(new Set(cycles.flat()));

  function labelFor(endpoint) {
    if (!endpoint) return '—';
    if (endpoint.kind === 'device') return `${endpoint.parameterId || 'unbound'}${endpoint.deviceRole ? ` (${endpoint.deviceRole})` : ''}`;
    const hit = candidates.find((entry) => endpointAddress(entry.endpoint) === endpointAddress(endpoint));
    return hit?.label ?? `${endpoint.controlId}.${endpoint.port}`;
  }

  function endpointFor(address) {
    return candidates.find((entry) => endpointAddress(entry.endpoint) === address)?.endpoint ?? null;
  }

  function doAdd() {
    const from = endpointFor(newFrom);
    const to = endpointFor(newTo);
    if (!from || !to) { notice = 'Pick a source and a target.'; return; }

    const result = addRoute({ from, to });
    if (result.ok) {
      notice = '';
      newFrom = '';
      newTo = '';
      cinfo(`Route: ${labelFor(from)} → ${labelFor(to)}`);
      return;
    }
    // The cycle is named, because "add failed" would send the author looking at the wrong wire.
    notice = result.cycle?.length
      ? `${result.reason}: ${result.cycle.map((address) => labelFor(endpointFor(address)) || address).join(' → ')}`
      : result.reason;
    cwarn(`Route refused — ${notice}`);
  }

  function patch(route, field, value) {
    const result = updateRoute(route.id, { [field]: value });
    if (result.ok) return;
    // A derived route is a view of a Macro slot; saying where it lives beats failing silently.
    const where = result.editAt ?? routeWriteTarget(route);
    notice = where.kind === 'panel'
      ? result.reason
      : `That route is a ${where.kind} assignment — edit it in the ${where.section} section of that component.`;
  }

  // --- canvas ------------------------------------------------------------------------------------
  // Nodes are laid out in two columns, sources left and targets right, rather than at the controls'
  // panel positions. A cable canvas that mirrored the layout would put two knobs sitting next to
  // each other on top of one another and draw a cable of zero length; readable beats faithful.
  let nodes = $derived.by(() => {
    const seen = new Map();
    const push = (endpoint, side) => {
      const address = endpointAddress(endpoint);
      if (!address) return;
      const hit = seen.get(address);
      if (hit) { hit.side = hit.side === side ? side : 'both'; return; }
      seen.set(address, { address, endpoint, side, label: labelFor(endpoint) });
    };
    for (const route of routes) { push(route.from, 'source'); push(route.to, 'target'); }

    const left = [...seen.values()].filter((node) => node.side !== 'target');
    const right = [...seen.values()].filter((node) => node.side === 'target');
    const rowHeight = 34;
    const place = (list, x) => list.map((node, index) => ({ ...node, x, y: 20 + index * rowHeight }));
    return [...place(left, 14), ...place(right, 250)];
  });

  let nodeAt = $derived(new Map(nodes.map((node) => [node.address, node])));
  let canvasHeight = $derived(Math.max(120, 40 + nodes.length * 20));

  function cablePath(route) {
    const from = nodeAt.get(endpointAddress(route.from));
    const to = nodeAt.get(endpointAddress(route.to));
    if (!from || !to) return '';
    const x1 = from.x + 120;
    const y1 = from.y + 10;
    const x2 = to.x;
    const y2 = to.y + 10;
    // A cubic with horizontal handles — a straight line between two rows in the same column would
    // vanish behind the nodes, and the sag is what makes crossing cables followable.
    const bend = Math.max(30, Math.abs(x2 - x1) / 2);
    return `M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`;
  }
</script>

<div class="routes-tab">
  <div class="block">
    <div class="block-head">
      <Cable size={12} />
      <span>Routes</span>
      <div class="seg">
        <button class="seg-btn" class:seg-active={view === 'list'} onclick={() => (view = 'list')} title="Mixer-strip list">
          <List size={11} />
        </button>
        <button class="seg-btn" class:seg-active={view === 'graph'} onclick={() => (view = 'graph')} title="Patch-cord canvas">
          <Network size={11} />
        </button>
      </div>
    </div>

    <div class="row">
      <select class="field" bind:value={newFrom} aria-label="Route source">
        <option value="">Source…</option>
        {#each sources as entry (endpointAddress(entry.endpoint))}
          <option value={endpointAddress(entry.endpoint)}>{entry.label}</option>
        {/each}
      </select>
      <span class="arrow">→</span>
      <select class="field" bind:value={newTo} aria-label="Route target">
        <option value="">Target…</option>
        {#each targets as entry (endpointAddress(entry.endpoint))}
          <option value={endpointAddress(entry.endpoint)}>{entry.label}</option>
        {/each}
      </select>
      <button class="btn primary" onclick={doAdd}><Plus size={11} /> Route</button>
    </div>

    {#if notice}
      <div class="notice"><TriangleAlert size={11} /> {notice}</div>
    {/if}
    {#if cycles.length}
      <div class="notice">
        <TriangleAlert size={11} />
        {cycles.length === 1 ? 'A loop' : `${cycles.length} loops`} in the existing routes — the rows
        marked below feed back into themselves and are not evaluated.
      </div>
    {/if}
  </div>

  {#if routes.length === 0}
    <p class="empty">No routes yet. A route sends one control's value to another, with its own range,
      depth and curve — the same record a Macro slot and a Router destination already are.</p>
  {:else if view === 'list'}
    <div class="block">
      <div class="block-head"><span>{routes.length} route{routes.length === 1 ? '' : 's'}</span></div>
      <ul class="list">
        {#each routes as route (route.id)}
          {@const owned = (route.origin ?? 'panel') === 'panel'}
          {@const looped = cycleAddresses.has(endpointAddress(route.to))}
          <li class="item" class:looped>
            <label class="chk" title="Enabled">
              <input
                type="checkbox"
                checked={route.enabled !== false}
                onchange={(event) => patch(route, 'enabled', event.currentTarget.checked)}
              />
            </label>
            <span class="ends" title={describeRoute(route, { sourceLabel: labelFor(route.from), targetLabel: labelFor(route.to) })}>
              {labelFor(route.from)} <span class="arrow">→</span> {labelFor(route.to)}
            </span>
            {#if !owned}<span class="tag">{route.origin}</span>{/if}
            {#if route.shapedBySource}<span class="tag" title="Shaped by the Router's own transfer curve">curved</span>{/if}
            {#if looped}<span class="tag warn">loop</span>{/if}

            <input
              class="field num"
              type="number" step="0.05" min="-4" max="4"
              value={route.depth}
              title="Depth — negative inverts"
              disabled={!owned}
              onchange={(event) => patch(route, 'depth', Number(event.currentTarget.value))}
            />
            <input
              class="field num"
              type="number" step="0.05"
              value={route.offset}
              title="Offset, in target units"
              disabled={!owned}
              onchange={(event) => patch(route, 'offset', Number(event.currentTarget.value))}
            />
            <select
              class="field small"
              value={route.curve}
              title="Response curve"
              disabled={!owned}
              onchange={(event) => patch(route, 'curve', event.currentTarget.value)}
            >
              {#each Object.values(ROUTE_CURVE) as curve}<option value={curve}>{curve}</option>{/each}
            </select>
            <select
              class="field small"
              value={route.mode}
              title="Drives — replaces the target's value. Modulates — sums onto it."
              disabled={!owned}
              onchange={(event) => patch(route, 'mode', event.currentTarget.value)}
            >
              <option value={ROUTE_MODE.set}>drives</option>
              <option value={ROUTE_MODE.add}>modulates</option>
            </select>
            <button
              class="btn icon"
              title={owned ? 'Remove this route' : 'Remove it in the component that owns it'}
              disabled={!owned}
              onclick={() => removeRoute(route.id)}
            ><Trash2 size={11} /></button>
          </li>
        {/each}
      </ul>
    </div>
  {:else}
    <div class="block">
      <div class="block-head"><span>Patch cords</span></div>
      <svg class="canvas" viewBox={`0 0 380 ${canvasHeight}`} style={`height:${canvasHeight}px`} role="img" aria-label="Route graph">
        {#each routes as route (route.id)}
          {@const looped = cycleAddresses.has(endpointAddress(route.to))}
          <path
            class="cable"
            class:off={route.enabled === false}
            class:inverted={route.depth < 0}
            class:looped
            d={cablePath(route)}
          >
            <title>{describeRoute(route, { sourceLabel: labelFor(route.from), targetLabel: labelFor(route.to) })}</title>
          </path>
        {/each}
        {#each nodes as node (node.address)}
          <g class="node" class:target={node.side === 'target'}>
            <rect x={node.x} y={node.y} width="120" height="20" rx="4" />
            <text x={node.x + 6} y={node.y + 14}>{node.label.slice(0, 20)}</text>
          </g>
        {/each}
      </svg>
      <p class="hint">Laid out source-left, target-right rather than at the controls' panel positions —
        two knobs side by side would otherwise sit on top of one another with a cable of no length.</p>
    </div>
  {/if}
</div>

<style>
  .routes-tab { padding: 10px; overflow-y: auto; height: 100%; color: #C8C8C8; font-size: 12px; }
  .empty { color: #777; font-size: 12px; line-height: 1.5; }

  .block { border: 1px solid #333; border-radius: 6px; padding: 9px 10px; margin-bottom: 10px; background: #262626; }
  .block-head {
    display: flex; align-items: center; gap: 6px; color: #5B9BD5; font-size: 10px;
    text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 7px;
  }
  .block-head span:first-of-type { flex: 1; }

  .row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .arrow { color: #777; }

  .field {
    background: #1A1A1A; border: 1px solid #3A3A3A; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 12px; padding: 3px 6px; min-width: 0; flex: 1;
  }
  .field:focus { outline: none; border-color: #5B9BD5; }
  .field:disabled { opacity: 0.45; }
  .field.num { flex: 0 0 58px; text-align: right; }
  .field.small { flex: 0 0 84px; font-size: 11px; }

  .btn {
    display: inline-flex; align-items: center; gap: 4px;
    background: #383F47; border: 1px solid #4C555E; border-radius: 4px; color: #DDD;
    font-family: inherit; font-size: 11px; padding: 3px 9px; cursor: pointer; white-space: nowrap;
  }
  .btn:hover { background: #454E57; color: #FFF; }
  .btn:disabled { opacity: 0.4; cursor: default; }
  .btn.primary { background: #3A5A80; border-color: #4A72A0; color: #FFF; }
  .btn.icon { padding: 3px 6px; }

  .seg { display: inline-flex; border: 1px solid #3A3A3A; border-radius: 4px; overflow: hidden; }
  .seg-btn {
    display: inline-flex; align-items: center;
    background: #1A1A1A; border: none; color: #AAA; padding: 3px 8px; cursor: pointer;
  }
  .seg-btn:hover { color: #FFF; }
  .seg-active { background: #3A5A80; color: #FFF; }

  .notice {
    display: flex; align-items: center; gap: 5px; margin-top: 7px;
    color: #F2C94C; font-size: 11px; line-height: 1.4;
  }

  .list { list-style: none; margin: 0; padding: 0; }
  .item { display: flex; align-items: center; gap: 5px; padding: 3px 0; flex-wrap: wrap; }
  .item.looped { background: rgba(242, 201, 76, 0.07); }
  .chk { display: inline-flex; }
  .ends { flex: 1; min-width: 130px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tag {
    background: #2E2E36; border: 1px solid #3A3A44; border-radius: 3px;
    color: #999; font-size: 9px; padding: 1px 4px; text-transform: uppercase; letter-spacing: 0.4px;
  }
  .tag.warn { color: #F2C94C; border-color: #6A5A24; }

  .canvas { width: 100%; display: block; }
  .cable { fill: none; stroke: #5B9BD5; stroke-width: 1.6; }
  .cable.inverted { stroke: #F2994A; }
  .cable.off { stroke: #555; stroke-dasharray: 3 3; }
  .cable.looped { stroke: #F2C94C; stroke-width: 2.2; }
  .node rect { fill: #1F1F26; stroke: #3A3A44; }
  .node.target rect { fill: #21262E; stroke: #3E4A58; }
  .node text { fill: #C8C8C8; font-size: 10px; font-family: inherit; }
  .hint { color: #666; font-size: 10px; line-height: 1.5; margin: 7px 0 0; }
</style>
