<script>
  /**
   * A custom easing, drawn by hand: the curve with its two control points, which you drag.
   *
   * The named curves are four numbers each (utils/easing.js). This edits those four numbers for one
   * animation, writing `easing: 'custom'` and `bezier: [x1, y1, x2, y2]`. A handle's x is kept in
   * [0, 1], because CSS refuses a curve whose time runs backwards; its y may leave [0, 1], which is
   * how a curve overshoots, within the view's margin. The four numbers are cells as well, for when
   * you know the curve you want.
   *
   * The drag draws live and writes once, on release, so one drag is one undo step and not sixty.
   */
  import NumberCell from '../../properties/NumberCell.svelte';
  import { moveBezierHandle, BEZIER_VIEW } from '../../utils/animationModel.js';
  import { cubicBezierEase, cleanBezier, CUSTOM_DEFAULT } from '../../utils/easing.js';

  let {
    points = CUSTOM_DEFAULT,
    width = 236,
    height = 156,
    onchange = () => {},
  } = $props();

  const PAD = 10;
  let draft = $state(null);          // the points while a handle is held
  let held = $state(0);              // 1 or 2 while dragging
  let svg = $state(null);

  let shown = $derived(draft ?? cleanBezier(points) ?? [...CUSTOM_DEFAULT]);
  const w = $derived(width - PAD * 2);
  const h = $derived(height - PAD * 2);
  const sx = (x) => PAD + x * w;
  const sy = (y) => PAD + ((BEZIER_VIEW.yMax - y) / (BEZIER_VIEW.yMax - BEZIER_VIEW.yMin)) * h;

  let curve = $derived.by(() => {
    const [x1, y1, x2, y2] = shown;
    const out = [];
    for (let i = 0; i <= 64; i += 1) {
      const t = i / 64;
      out.push(`${i ? 'L' : 'M'}${sx(t).toFixed(2)} ${sy(cubicBezierEase(t, x1, y1, x2, y2)).toFixed(2)}`);
    }
    return out.join(' ');
  });

  function toUnit(event) {
    const box = svg.getBoundingClientRect();
    const x = ((event.clientX - box.left) * (width / box.width) - PAD) / w;
    const y = BEZIER_VIEW.yMax - (((event.clientY - box.top) * (height / box.height) - PAD) / h) * (BEZIER_VIEW.yMax - BEZIER_VIEW.yMin);
    return { x, y };
  }

  function grab(handle, event) {
    event.preventDefault();
    held = handle;
    draft = [...shown];
    try { event.currentTarget.setPointerCapture?.(event.pointerId); } catch { /* not capturable */ }
  }

  function move(event) {
    if (!held) return;
    const { x, y } = toUnit(event);
    draft = moveBezierHandle(draft, held, x, y);
  }

  function release() {
    if (!held) return;
    const next = draft;
    held = 0;
    draft = null;
    if (next) onchange(next);
  }

  function setCell(index, value) {
    const next = [...shown];
    next[index] = value;
    const handle = index < 2 ? 1 : 2;
    onchange(moveBezierHandle(shown, handle, next[handle === 1 ? 0 : 2], next[handle === 1 ? 1 : 3]));
  }
</script>

<div class="bezier">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <svg bind:this={svg} {width} {height} viewBox="0 0 {width} {height}" role="img" aria-label="Custom easing curve"
       onpointermove={move} onpointerup={release} onpointercancel={release}>
    <rect x={PAD} y={sy(1)} width={w} height={sy(0) - sy(1)} class="unit" />
    <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} class="diag" />
    <line x1={sx(0)} y1={sy(0)} x2={sx(shown[0])} y2={sy(shown[1])} class="arm" />
    <line x1={sx(1)} y1={sy(1)} x2={sx(shown[2])} y2={sy(shown[3])} class="arm" />
    <path d={curve} class="curve" />
    <circle cx={sx(0)} cy={sy(0)} r="2.5" class="end" />
    <circle cx={sx(1)} cy={sy(1)} r="2.5" class="end" />
    <!-- Pointer-only on purpose: the four cells below are the keyboard and screen-reader way in. -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <circle cx={sx(shown[0])} cy={sy(shown[1])} r="5.5" class="handle h1" class:held={held === 1}
            aria-hidden="true" onpointerdown={(event) => grab(1, event)} />
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <circle cx={sx(shown[2])} cy={sy(shown[3])} r="5.5" class="handle h2" class:held={held === 2}
            aria-hidden="true" onpointerdown={(event) => grab(2, event)} />
  </svg>
  <div class="cells">
    {#each ['x1', 'y1', 'x2', 'y2'] as label, index (label)}
      <div class="cell"><NumberCell {label} value={shown[index]} step={0.01}
        min={index % 2 === 0 ? 0 : BEZIER_VIEW.yMin} max={index % 2 === 0 ? 1 : BEZIER_VIEW.yMax}
        onchange={(value) => setCell(index, value)} /></div>
    {/each}
  </div>
</div>

<style>
  .bezier { display: flex; flex-direction: column; gap: 6px; margin-top: 7px; }
  svg { display: block; border: 1px solid #2A3038; border-radius: 3px; background: #0C0F12; touch-action: none; }
  .unit { fill: #12171A; stroke: #232A31; stroke-width: 1; }
  .diag { stroke: #2E3540; stroke-width: 1; stroke-dasharray: 2 3; }
  .arm { stroke: #4B545C; stroke-width: 1; }
  .curve { fill: none; stroke: #8FEDE3; stroke-width: 2; stroke-linecap: round; }
  .end { fill: #4B545C; }
  .handle { fill: #173449; stroke: #5B9BD5; stroke-width: 1.5; cursor: grab; }
  .handle.held { fill: #5B9BD5; cursor: grabbing; }
  .cells { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 4px; }
  .cell { min-width: 0; display: flex; }
</style>
