<script>
  // Setlist — a list, because a setlist that isn't drawn as a list is a puzzle.
  // The current scene is highlighted and kept in view with something after it,
  // so you can see what is coming. Visual only; the stepping, the footswitch and
  // the recall live in the preview surface, which shares this geometry (pad = 8).
  import {
    setlistConfig, setlistScenes, setlistIndex, setlistCount, setlistGeometry,
    visibleRange, rowRect, currentScene, setlistWraps,
  } from '../utils/setlistLayout.js';

  let { control = null, width = 0, height = 0 } = $props();

  const PAD = 8;
  function css(hex, fallback = 'rgba(255,255,255,0.9)') {
    const s = String(hex ?? '').replace(/^#/, '').trim();
    if (/^[0-9a-fA-F]{8}$/.test(s)) {
      const a = parseInt(s.slice(0, 2), 16) / 255;
      return `rgba(${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},${parseInt(s.slice(6, 8), 16)},${a})`;
    }
    if (/^[0-9a-fA-F]{6}$/.test(s)) return `rgba(${parseInt(s.slice(0, 2), 16)},${parseInt(s.slice(2, 4), 16)},${parseInt(s.slice(4, 6), 16)},1)`;
    return fallback;
  }
  function n(v, f = 0) { const x = Number(v); return Number.isFinite(x) ? x : f; }

  let cfg = $derived(setlistConfig(control));
  let scenes = $derived(setlistScenes(control));
  let index = $derived(setlistIndex(control));
  let count = $derived(setlistCount(control));
  let showHeader = $derived(cfg.showHeader !== false);
  let headerH = $derived(showHeader ? 20 : 0);
  let rowH = $derived(Math.max(12, Math.round(n(cfg.rowHeight, 18))));
  let geom = $derived(setlistGeometry(width, height, count, PAD, headerH, rowH));
  let range = $derived(visibleRange(geom, Math.max(0, index)));

  let faceCss = $derived(css(cfg.faceColour, 'rgba(20,20,32,1)'));
  let rowCss = $derived(css(cfg.rowColour, 'rgba(32,32,44,1)'));
  let currentCss = $derived(css(cfg.currentColour, 'rgba(86,204,242,1)'));
  let textCss = $derived(css(cfg.textColour, 'rgba(232,232,238,1)'));
  let labelCss = $derived(css(cfg.labelColour, 'rgba(185,185,185,1)'));

  let font = $derived(control?._children?.Text?._children?.Font ?? null);
  let fontFamily = $derived(String(font?.family ?? 'Arial'));

  let rows = $derived.by(() => {
    const out = [];
    for (let i = range.first; i <= range.last && i < count; i += 1) {
      const s = scenes[i];
      if (!s) continue;
      out.push({
        i, scene: s, rect: rowRect(geom, i, range.first),
        current: i === index,
        // The program number is worth showing: "which patch does this song
        // select" is the question a setlist exists to answer.
        badge: s.program === null ? '' : `PC ${s.program}`,
        tempo: s.bpm === null ? '' : `${Math.round(s.bpm)}`,
      });
    }
    return out;
  });

  let cur = $derived(currentScene(control));
  let posLabel = $derived(count ? `${index + 1}/${count}` : 'empty');
  let footLabel = $derived(cfg.footEnabled === false ? '' : `⌁ CC ${Math.round(n(cfg.footCc, 64))}`);
  let overflowLabel = $derived([
    range.first > 0 ? `▲${range.first}` : '',
    range.last < count - 1 ? `▼${count - 1 - range.last}` : '',
    footLabel,
  ].filter(Boolean).join(' · '));
</script>

<svg class="setlist" width={width} height={height} viewBox={`0 0 ${Math.max(1, width)} ${Math.max(1, height)}`} style={`font-family:${fontFamily};`}>
  <rect x={PAD - 4} y={PAD - 4} width={Math.max(8, width - PAD * 2 + 8)} height={Math.max(8, height - PAD * 2 + 8)}
        rx="6" fill={faceCss} stroke="rgba(42,42,54,1)" />

  {#if showHeader}
    <circle cx={PAD + 3} cy={PAD + 5} r="3.5" fill={count ? currentCss : 'rgba(90,90,100,1)'} />
    <text x={PAD + 12} y={PAD + 9} font-size="9.5" fill={labelCss} opacity="0.9">
      {posLabel}{cur ? ` · ${cur.name}` : ''}{setlistWraps(control) ? ' · loop' : ''}
    </text>
    <!-- how much is off-screen, in the header: a list that hides its length
         leaves you unable to tell whether you are near the end, and putting it
         on the rows themselves collides with the program badge -->
    <text x={width - PAD} y={PAD + 9} font-size="9" fill={labelCss} text-anchor="end" opacity="0.6">{overflowLabel}</text>
  {/if}

  {#if count === 0}
    <text x={width / 2} y={PAD + headerH + geom.h / 2} font-size="10" fill={labelCss}
          text-anchor="middle" opacity="0.45">no scenes yet</text>
  {/if}

  {#each rows as r (r.scene.id)}
    <rect x={r.rect.x} y={r.rect.y} width={r.rect.w} height={r.rect.h} rx="3"
          fill={r.current ? currentCss : (r.scene.colour ? css(r.scene.colour, 'rgba(32,32,44,1)') : rowCss)}
          opacity={r.scene.enabled === false ? 0.3 : r.current ? 0.9 : 0.75} />
    <!-- the running number: on stage you count songs, not names -->
    <text x={r.rect.x + 6} y={r.rect.y + r.rect.h * 0.5 + 3.2} font-size="8.5"
          fill={r.current ? 'rgba(10,10,16,0.75)' : labelCss} opacity="0.85">{r.i + 1}</text>
    <text x={r.rect.x + 22} y={r.rect.y + r.rect.h * 0.5 + 3.2} font-size="9.5"
          fill={r.current ? 'rgba(10,10,16,1)' : textCss}
          text-decoration={r.scene.enabled === false ? 'line-through' : 'none'}>{r.scene.name}</text>
    {#if r.tempo}
      <text x={r.rect.x + r.rect.w - 46} y={r.rect.y + r.rect.h * 0.5 + 3.2} font-size="8"
            fill={r.current ? 'rgba(10,10,16,0.75)' : labelCss} text-anchor="end" opacity="0.8">{r.tempo}</text>
    {/if}
    {#if r.badge}
      <text x={r.rect.x + r.rect.w - 6} y={r.rect.y + r.rect.h * 0.5 + 3.2} font-size="8"
            fill={r.current ? 'rgba(10,10,16,0.75)' : labelCss} text-anchor="end" opacity="0.8">{r.badge}</text>
    {/if}
  {/each}

</svg>

<style>
  .setlist { position: absolute; inset: 0; display: block; pointer-events: none; overflow: visible; }
</style>
