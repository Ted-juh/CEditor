<script>
  /**
   * Every animation of the control on one axis: milliseconds from the moment its trigger fires.
   *
   * The Delay and Duration boxes say each number on its own; this says how they sit together — the
   * press squish that is over before the glow starts, the two that overlap, the one with a delay
   * nobody meant. Animations answering the same change start together at 0, so the trigger is
   * written beside each name.
   *
   * Drag a bar to move its start (the delay), its right edge to change one cycle's length (the
   * duration); the keyboard does the same with the arrows. A drag writes once, when it is let go —
   * one undo step, not one per pixel. A repeating keyframe animation draws its later cycles faint,
   * and a loop runs off the end. utils/animationModel.js (timelineOf, retime) does the arithmetic.
   */
  import { timelineOf, retime } from '../../utils/animationModel.js';

  let {
    rows = [],
    selectedName = '',
    fired = null,
    onselect = () => {},
    onretime = () => {},
  } = $props();

  let model = $derived(timelineOf(rows));

  // The drag in progress, drawn but not yet written. The axis does not rescale under the pointer:
  // it is computed from the rows, which do not change until the drag is let go.
  let drag = $state(null);   // { name, mode, startX, width, item, delay, duration }

  const pct = (ms) => `${(Math.max(0, ms) / model.span) * 100}%`;
  const shown = (item) => (drag?.name === item.name ? { ...item, delay: drag.delay, duration: drag.duration } : item);

  /** The later cycles of a repeating animation, faint, after the first. */
  function repeats(item) {
    const count = Number.isFinite(item.iterations) ? item.iterations - 1 : 0;
    return Array.from({ length: Math.min(count, 12) }, (_, i) => item.delay + item.duration * (i + 1));
  }

  function begin(event, item, mode) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const track = event.currentTarget.closest('.tl-track');
    if (!track) return;
    onselect(item.name);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    drag = { name: item.name, mode, startX: event.clientX, width: track.getBoundingClientRect().width || 1, item, delay: item.delay, duration: item.duration };
  }

  function move(event) {
    if (!drag) return;
    const ms = ((event.clientX - drag.startX) / drag.width) * model.span;
    drag = { ...drag, ...retime(drag.item, drag.mode, ms) };
  }

  function end() {
    if (!drag) return;
    const { name, item, delay, duration } = drag;
    drag = null;
    if (delay !== item.delay || duration !== item.duration) onretime(name, { delay, duration });
  }

  /** Left/right move the start; up/down lengthen or shorten a cycle. Shift takes bigger steps. */
  function key(event, item) {
    const step = event.shiftKey ? 100 : 10;
    const moves = { ArrowLeft: ['move', -step], ArrowRight: ['move', step], ArrowDown: ['resize', -step], ArrowUp: ['resize', step] };
    const action = moves[event.key];
    if (!action) return;
    event.preventDefault();
    const next = retime(item, action[0], action[1]);
    if (next.delay !== item.delay || next.duration !== item.duration) onretime(item.name, next);
  }

  const label = (ms) => (ms >= 1000 ? `${Math.round(ms / 100) / 10}s` : `${Math.round(ms)}ms`);
</script>

<div class="tl">
  <div class="tl-row tl-axis" aria-hidden="true">
    <span class="tl-name"></span>
    <div class="tl-track">
      {#each model.ticks as tick (tick)}
        <span class="tl-tick" style="left:{pct(tick)}">{label(tick)}</span>
      {/each}
    </div>
  </div>
  {#each model.items as base (base.name)}
    {@const item = shown(base)}
    <div class="tl-row" class:sel={item.name === selectedName} class:off={!item.enabled}>
      <button type="button" class="tl-name" onclick={() => onselect(item.name)} title={`${item.name} — ${item.when}`}>
        <span class="tl-nm">
          {#if fired?.names?.includes(item.name)}{#key fired.seq}<i class="tl-lamp" aria-hidden="true"></i>{/key}{/if}{item.name}
        </span>
        <span class="tl-when">{item.when}</span>
      </button>
      <div class="tl-track">
        {#each model.ticks as tick (tick)}<span class="tl-grid" style="left:{pct(tick)}"></span>{/each}
        {#if item.delay > 0}<span class="tl-wait" style="width:{pct(item.delay)}"></span>{/if}
        {#each repeats(item) as start (start)}
          <span class="tl-ghost" style="left:{pct(start)}; width:{pct(item.duration)}"></span>
        {/each}
        {#if !Number.isFinite(item.iterations)}
          <span class="tl-loop" style="left:{pct(item.delay + item.duration)}" title="Loops"></span>
        {/if}
        <!-- A button, not a slider: the numbers are edited in the Delay and Duration cells (the tab
             has no sliders, by rule); this is the drawing of them, which can be nudged. -->
        <button type="button" class="tl-bar" class:keyframes={item.kind === 'keyframes'} class:dragging={drag?.name === item.name}
             style="left:{pct(item.delay)}; width:{pct(item.duration)}"
             aria-label={`${item.name}: starts at ${item.delay}ms, runs ${item.duration}ms`}
             aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
             title={`${item.delay}ms delay · ${item.duration}ms${Number.isFinite(item.iterations) && item.iterations > 1 ? ` × ${item.iterations}` : ''}${Number.isFinite(item.iterations) ? '' : ', looping'} — drag to move, drag the right edge to resize; arrows do the same`}
             onpointerdown={(event) => begin(event, base, 'move')}
             onpointermove={move} onpointerup={end} onpointercancel={end}
             onkeydown={(event) => key(event, base)}>
          <span class="tl-len">{item.duration}ms</span>
          <span class="tl-grip" aria-hidden="true" onpointerdown={(event) => begin(event, base, 'resize')}></span>
        </button>
      </div>
    </div>
  {/each}
  {#if !model.items.length}<p class="tl-none">No animations to lay out.</p>{/if}
</div>

<style>
  .tl {
    border: 1px solid #2E3540;
    border-radius: 4px;
    background: #12171A;
    padding: 4px 0;
    user-select: none;
  }
  .tl-row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    padding: 2px 8px;
  }
  .tl-row.sel { background: #173449; box-shadow: inset 2px 0 0 #5B9BD5; }
  .tl-row.off { opacity: 0.45; }
  .tl-name {
    min-width: 0; display: flex; flex-direction: column; gap: 2px; align-items: flex-start;
    padding: 0; border: 0; background: transparent; cursor: pointer; text-align: left;
  }
  .tl-nm {
    max-width: 100%; font: 500 10px/1.2 'IBM Plex Sans', system-ui, sans-serif; color: #C3D0DA;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tl-when {
    max-width: 100%; font: 400 8.5px/1.1 'IBM Plex Sans', system-ui, sans-serif; color: #69737B;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tl-track { position: relative; height: 22px; }
  .tl-axis .tl-track { height: 14px; }
  .tl-tick {
    position: absolute; top: 1px; transform: translateX(-50%);
    font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace; color: #4B545C; white-space: nowrap;
  }
  .tl-tick:first-child { transform: none; }
  .tl-tick:last-child { transform: translateX(-100%); }
  .tl-grid { position: absolute; top: 0; bottom: 0; width: 1px; background: #1E242A; }
  .tl-wait {
    position: absolute; left: 0; top: 10px; height: 2px;
    background: repeating-linear-gradient(90deg, #3A434A 0 3px, transparent 3px 6px);
  }
  .tl-ghost {
    position: absolute; top: 4px; height: 14px; box-sizing: border-box;
    border: 1px dashed #2F5B57; border-radius: 3px; background: #0F2624;
  }
  .tl-loop {
    position: absolute; top: 4px; right: 0; height: 14px;
    background: repeating-linear-gradient(90deg, #0F2624 0 10px, #12171A 10px 14px);
    border-radius: 3px; opacity: 0.8;
  }
  .tl-bar {
    position: absolute; top: 3px; height: 16px; min-width: 6px; box-sizing: border-box;
    border: 1px solid #2A6FA8; border-radius: 3px; background: #173A57;
    cursor: grab; outline: none; overflow: hidden; padding: 0; font: inherit;
  }
  .tl-bar.keyframes { border-color: #0E7C70; background: #0B2E2A; }
  .tl-bar:focus-visible { box-shadow: 0 0 0 1px #5B9BD5; }
  .tl-bar.dragging { cursor: grabbing; border-color: #8FEDE3; }
  .tl-row.sel .tl-bar { border-color: #5B9BD5; }
  .tl-len {
    position: absolute; left: 4px; top: 3px;
    font: 400 8px/1 'IBM Plex Mono', ui-monospace, monospace; color: #9FB4C4; white-space: nowrap;
    pointer-events: none;
  }
  .tl-grip {
    position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: ew-resize;
    background: linear-gradient(90deg, transparent, rgba(143, 237, 227, 0.35));
  }
  .tl-lamp {
    display: inline-block; width: 6px; height: 6px; margin-right: 4px; border-radius: 50%;
    vertical-align: 1px; background: #F5C451; box-shadow: 0 0 6px #F5C451;
    animation: lamp-fade 1.2s ease-out forwards;
  }
  @keyframes lamp-fade { 0% { opacity: 1; } 60% { opacity: 0.8; } 100% { opacity: 0; } }
  .tl-none { margin: 6px 8px; font: 400 10px/1.4 'IBM Plex Sans', system-ui, sans-serif; color: #69737B; }
</style>
