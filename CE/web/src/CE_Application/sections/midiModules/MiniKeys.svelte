<script>
  /**
   * A small keyboard picture for the note modules: which keys sound, which are mapped, which
   * range a layer covers. Keys can be clicked (onkey) to pick one. `marks` colours a key by
   * name ('on' for a sounding note, 'mapped' for a key-map key, 'root'), `labels` writes a
   * short word above a key, `range` shades [low, high].
   */
  import { isBlack, keySpan, whiteCount } from '../../utils/pianoGeometry.js';
  import { noteLabel } from '../../utils/chordBuilder.js';

  let {
    low = 36, high = 96, marks = {}, labels = {}, range = null, selected = -1,
    onkey = null, label = 'Keyboard', testid = undefined,
  } = $props();

  const KEY_W = 14, WHITE_H = 54, BLACK_H = 34;
  const TOP = $derived(Object.keys(labels).length ? 26 : 2);
  // Labels on neighbouring keys take turns on two rows, so "C" and "Dm7" never overprint.
  const labelRows = $derived.by(() => {
    const rows = {};
    let last = -99, lastRow = 1;
    for (const n of Object.keys(labels).map(Number).sort((a, b) => a - b)) {
      rows[n] = n - last <= 3 && lastRow === 0 ? 1 : 0;
      last = n; lastRow = rows[n];
    }
    return rows;
  });
  const keyClass = (n, colour) => [colour, marks[n] ?? '', inRange(n) ? '' : 'out', n === selected ? 'selected' : '']
    .filter(Boolean).join(' ');
  const width = $derived(whiteCount(low, high) * KEY_W);
  const notes = $derived(Array.from({ length: high - low + 1 }, (_, i) => low + i));
  const whites = $derived(notes.filter((n) => !isBlack(n)));
  const blacks = $derived(notes.filter((n) => isBlack(n)));
  const x = (n) => keySpan(n, low)[0] * KEY_W;
  const w = (n) => (keySpan(n, low)[1] - keySpan(n, low)[0]) * KEY_W;
  const inRange = (n) => !range || (n >= range[0] && n <= range[1]);
</script>

<svg class="keys" viewBox={`0 0 ${width} ${TOP + WHITE_H + 1}`} role="group" aria-label={label}
     data-testid={testid} style:max-width={`${width * 1.6}px`}>
  {#each whites as n (n)}
    <rect x={x(n)} y={TOP} width={w(n) - 1} height={WHITE_H} rx="2" data-note={n}
          class={keyClass(n, 'white')}
          role={onkey ? 'button' : undefined} tabindex={onkey ? -1 : undefined}
          aria-label={noteLabel(n)} onclick={() => onkey?.(n)}
          onkeydown={(e) => { if (e.key === 'Enter') onkey?.(n); }} />
    {#if n % 12 === 0}<text x={x(n) + 3} y={TOP + WHITE_H - 4} class="c-label">{noteLabel(n)}</text>{/if}
  {/each}
  {#each blacks as n (n)}
    <rect x={x(n)} y={TOP} width={w(n)} height={BLACK_H} rx="1.5" data-note={n}
          class={keyClass(n, 'black')}
          role={onkey ? 'button' : undefined} tabindex={onkey ? -1 : undefined}
          aria-label={noteLabel(n)} onclick={() => onkey?.(n)}
          onkeydown={(e) => { if (e.key === 'Enter') onkey?.(n); }} />
  {/each}
  {#each Object.entries(labels) as [n, text] (n)}
    <text x={x(Number(n)) + w(Number(n)) / 2} y={labelRows[n] ? 21 : 10} class="key-label" text-anchor="middle">{text}</text>
  {/each}
</svg>

<style>
  .keys { width: 100%; display: block; user-select: none; }
  .white { fill: #d8dde2; stroke: #0e1216; stroke-width: 1; cursor: pointer; }
  .black { fill: #1d2329; stroke: #0e1216; stroke-width: 1; cursor: pointer; }
  .white.out { fill: #8b949c; }
  .black.out { fill: #2a2f35; }
  .white.on, .black.on { fill: var(--host-accent, #5b9bd5); }
  .white.root, .black.root { fill: var(--host-accent-strong, #79b9ee); }
  .white.mapped, .black.mapped { fill: #ff9408; }
  .white.selected, .black.selected { stroke: #fff; stroke-width: 2; }
  .c-label { font: 8px var(--host-font-mono, monospace); fill: #4a535c; pointer-events: none; }
  .key-label { font: 600 9px var(--host-font, sans-serif); fill: var(--host-text-soft, #aab5be); pointer-events: none; }
</style>
