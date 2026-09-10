<script>
  /**
   * The pages, and the rules that choose between them.
   *
   * Two things here have never existed. Each layout shows a THUMBNAIL of itself, rendered by the
   * same `composeLayout` the canvas uses — the panel offers a dropdown of names, so the only way to
   * see a page today is to switch to it. And the rules are DRAGGABLE: `resolveActiveLayoutId` takes
   * the first match, the panel's own tooltip says "put specific ones first", and the panel has no
   * way to put anything first. Reordering meant deleting every rule below and retyping it.
   *
   * The live marker and the shadow warning are the same arithmetic read two ways, and both go
   * through the shipped `selectorRuleMatches` rather than a second copy of the operator table.
   */
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import { composeLayout } from '../../utils/lcdZones.js';
  import { liveRuleIndex, shadowedRuleIndex, itemRect as rectOf } from '../../utils/screenModel.js';

  let {
    kind = 'lcd',
    grid = { unitsX: 16, unitsY: 2 },
    layouts = [],
    selectedLayoutId = '',
    rules = [],
    layoutNameById = new Map(),
    testValue = '',
    onpick = () => {},
    onreorder = () => {},
    ontest = () => {},
  } = $props();

  let live = $derived(liveRuleIndex(rules, testValue));

  let dragIndex = $state(-1);
  let dropIndex = $state(-1);
  let rowEls = $state([]);

  const OPS = { eq: '=', ne: '≠', lt: '<', le: '≤', gt: '>', ge: '≥', between: 'a–b' };

  function conditionOf(rule) {
    const op = String(rule?.op ?? 'eq');
    const when = String(rule?.when ?? '');
    if (op === 'between') return `${when}–${String(rule?.when2 ?? '')}`;
    return `${OPS[op] ?? '='} ${when}`;
  }

  /** Two rows of text for a layout, drawn by the renderer's own composer. */
  function thumbLines(layout) {
    if (kind !== 'lcd') return [];
    return composeLayout(layout.items, grid.unitsY, grid.unitsX, () => null).slice(0, 3);
  }

  /** For a pixel layout there is no text to compose, so the thumbnail is the element rects. */
  function thumbRects(layout) {
    if (kind !== 'pixel') return [];
    return layout.items.slice(0, 24).map((item) => {
      const rect = rectOf(item, 'pixel');
      return {
        left: (rect.x / grid.unitsX) * 100,
        top: (rect.y / grid.unitsY) * 100,
        width: Math.max(2, (rect.w / grid.unitsX) * 100),
        height: Math.max(6, (rect.h / grid.unitsY) * 100),
      };
    });
  }

  function beginDrag(index, event) {
    if (rules.length < 2) return;
    event.preventDefault();
    dragIndex = index;
    dropIndex = index;
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function moveDrag(event) {
    if (dragIndex < 0) return;
    const boxes = rowEls.filter(Boolean).map((el) => el.getBoundingClientRect());
    if (!boxes.length) return;
    let next = boxes.length - 1;
    for (let i = 0; i < boxes.length; i += 1) {
      if (event.clientY < boxes[i].top + boxes[i].height / 2) { next = i; break; }
    }
    dropIndex = Math.max(0, Math.min(rules.length - 1, next));
  }

  function endDrag() {
    if (dragIndex >= 0 && dropIndex >= 0 && dragIndex !== dropIndex) onreorder(dragIndex, dropIndex);
    dragIndex = -1;
    dropIndex = -1;
  }
</script>

<div class="pages">
  <div class="list" role="listbox" tabindex="-1" aria-label="Pages">
    {#each layouts as layout (layout.id)}
      <div
        class="prow"
        class:on={layout.id === selectedLayoutId}
        role="option"
        tabindex="0"
        aria-selected={layout.id === selectedLayoutId}
        onclick={() => onpick(layout.id)}
        onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onpick(layout.id); } }}
      >
        <span class="pn">{layout.name}</span>
        <span class="pc">{layout.items.length}</span>
        <span class="thumb">
          {#if kind === 'lcd'}
            {#each thumbLines(layout) as line (line)}<i>{line}</i>{/each}
          {:else}
            {#each thumbRects(layout) as r, i (i)}
              <u style="left:{r.left}%;top:{r.top}%;width:{r.width}%;height:{r.height}%"></u>
            {/each}
          {/if}
        </span>
      </div>
    {/each}
  </div>

  {#if rules.length}
    <div class="rhead">
      Rules
      <span class="test">
        <label for="screen-test">try</label>
        <input id="screen-test" type="text" value={testValue} placeholder="value"
               oninput={(event) => ontest(event.currentTarget.value)} />
      </span>
    </div>

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="rules" onpointermove={moveDrag} onpointerup={endDrag} onpointercancel={endDrag}>
      {#each rules as rule, index (index)}
        {@const shadow = shadowedRuleIndex(rules, index)}
        <div
          class="rule"
          class:live={index === live}
          class:shadowed={shadow >= 0}
          class:dragging={index === dragIndex}
          bind:this={rowEls[index]}
          title={shadow >= 0
            ? `Rule ${shadow + 1} already matches this value, so this rule can never be reached`
            : 'Drag to reorder — the first matching rule wins'}
        >
          {#if dragIndex >= 0 && dropIndex === index && dragIndex !== index}
            <span class="dropline" aria-hidden="true"></span>
          {/if}
          <span class="grip" role="presentation" onpointerdown={(event) => beginDrag(index, event)}>
            <GripVertical size={10} aria-hidden="true" />
          </span>
          <span class="cond">{conditionOf(rule)}</span>
          <span class="arrow">→</span>
          <span class="to">{layoutNameById.get(String(rule?.layoutId ?? '')) ?? '(none)'}</span>
          {#if index === live}<span class="tag live">LIVE</span>{/if}
          {#if shadow >= 0}<span class="tag warn">↑{shadow + 1}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .pages { display: flex; flex-direction: column; min-width: 0; }

  .list {
    background: #12171A;
    border: 1px solid #2E3540;
    border-radius: 4px;
    overflow: hidden auto;
    max-height: 168px;
    outline: none;
  }

  .prow {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 6px;
    border-bottom: 1px solid #242A30;
    cursor: pointer;
    outline: none;
  }
  .prow:last-child { border-bottom: 0; }
  .prow:hover { background: #1A2126; }
  .prow:focus-visible { box-shadow: inset 0 0 0 1px #5B9BD5; }
  .prow.on { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }

  .pn {
    flex: 1;
    min-width: 0;
    font: 500 10px/1.2 'IBM Plex Sans', system-ui, sans-serif;
    color: #B9C8D4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .prow.on .pn { color: #EAF5FF; }
  .pc { font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace; color: #616C75; }

  .thumb {
    position: relative;
    flex: 0 0 76px;
    height: 24px;
    border: 1px solid #223038;
    border-radius: 2px;
    background: #07120C;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 2px 3px;
    gap: 1px;
    overflow: hidden;
  }
  .thumb i {
    display: block;
    font: 500 5.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    color: #2BE86A;
    white-space: pre;
    font-style: normal;
    letter-spacing: 0.3px;
  }
  .thumb u { position: absolute; background: #2BE86A; opacity: 0.75; text-decoration: none; border-radius: 1px; }

  .rhead {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 9px 0 5px;
    font: 600 8.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    letter-spacing: 0.13em;
    text-transform: uppercase;
    color: #616C75;
  }
  .test { margin-left: auto; display: flex; align-items: center; gap: 4px; text-transform: none; letter-spacing: 0; }
  .test input {
    width: 54px;
    height: 20px;
    box-sizing: border-box;
    padding: 0 5px;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font: 400 10px/1 'IBM Plex Mono', ui-monospace, monospace;
    outline: none;
  }
  .test input:focus { border-color: #5B9BD5; }

  .rules { background: #12171A; border: 1px solid #2E3540; border-radius: 4px; overflow: hidden; }

  .rule {
    position: relative;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 5px;
    border-bottom: 1px solid #242A30;
    font: 400 9.5px/1.3 'IBM Plex Mono', ui-monospace, monospace;
    color: #B9C8D4;
  }
  .rule:last-child { border-bottom: 0; }
  .rule.live { background: #0B2320; box-shadow: inset 2px 0 0 #14B8A6; }
  .rule.shadowed { opacity: 0.55; }
  .rule.dragging { background: #0B2320; }

  .dropline {
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: #14B8A6;
    border-radius: 1px;
  }

  .grip { flex: 0 0 10px; color: #4B545C; display: flex; cursor: grab; touch-action: none; }
  .grip:active { cursor: grabbing; }
  .cond { flex: 0 0 auto; color: #C3D0DA; }
  .arrow { color: #616C75; }
  .to { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .tag {
    font: 600 7.5px/1 'IBM Plex Mono', ui-monospace, monospace;
    border-radius: 2px;
    padding: 2px 4px;
    flex: 0 0 auto;
  }
  .tag.live { color: #8FEDE3; border: 1px solid #0E7C70; }
  .tag.warn { color: #E5A029; border: 1px solid #4A3A1C; background: #241d10; }
</style>
