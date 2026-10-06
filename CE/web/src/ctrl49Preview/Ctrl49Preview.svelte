<script>
  /**
   * The HoSTage CTRL49 screen, without the keyboard.
   *
   * Runs tools/ctrl49/Hostage_MultiKnob.lua — the file the app embeds and uploads, not a copy —
   * on the firmware draw-API shim, fed with payloads built the way the C++ builds them. Save the
   * Lua and the screen redraws. Open with `npm run dev`, then /ctrl49.html.
   *
   * What it cannot tell you: the device's own fonts (the shim approximates fonts 9/10), colour
   * depth, RAM for uploaded images, and how fast the link redraws. Those still need the keyboard.
   */
  import { onDestroy } from 'svelte';
  import pageLua from '../../../../tools/ctrl49/Hostage_MultiKnob.lua?raw';
  import knobStripUrl from '../../../../tools/ctrl49/knob_strip.png?url';
  import logoUrl from '../../../../tools/ctrl49/hostage_logo.png?url';
  import { createCtrl49Screen } from '../CE_Application/screen/ctrl49Runtime.js';
  import {
    rackLabelPayload, rackStatePayload, performanceLabelPayload, performanceStatePayload, browseSlotViews,
    browseStatePayload, browseLineForDisplay,
    layersPayload, soundcheckPayload, discoverPayload, cuePayload, changesPayload,
  } from '../CE_Application/screen/ctrl49Payloads.js';
  import { parseCalls } from './callScript.js';
  import { preview } from './previewState.svelte.js';

  // The object ids the host uploads before binding (Ctrl49SurfaceBroker's options).
  const ASSETS = { 0x0200: knobStripUrl, 0x0210: logoUrl };

  const SCENES = [
    { id: 'splash', label: 'Splash' },
    { id: 'control', label: 'Control page' },
    { id: 'performance', label: 'Performance' },
    { id: 'browse', label: 'Browser' },
    { id: 'layers', label: 'Layers' },
    { id: 'soundcheck', label: 'Soundcheck' },
    { id: 'discover', label: 'Discover' },
    { id: 'cue', label: 'Cue' },
    { id: 'changes', label: 'Changes' },
    { id: 'custom', label: 'Custom calls' },
  ];

  let canvas = $state();
  let screen = $state(null);
  let error = $state('');
  let sent = $state([]);

  // One Lua state per page source, as on the device: the page is uploaded once and then called.
  $effect(() => {
    if (!canvas) return;
    let cancelled = false;
    let made = null;
    error = '';
    createCtrl49Screen(canvas, { lua: pageLua, assets: ASSETS, redrawOnAsk: true })
      .then((s) => { if (cancelled) s.dispose(); else { made = s; screen = s; } })
      .catch((e) => { if (!cancelled) error = `Lua: ${e.message ?? e}`; });
    return () => { cancelled = true; made?.dispose(); screen = null; };
  });

  onDestroy(() => screen?.dispose());

  function callsForScene() {
    const p = preview;
    switch (p.scene) {
      case 'splash':
        return [{ name: 'set_mode', bytes: [0] }];
      case 'control': {
        const slots = p.control.slots;
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_labels', bytes: rackLabelPayload(p.control.title, slots) },
          { name: 'set_values', bytes: rackStatePayload(p.control.active, slots, { number: p.control.page, count: p.control.pages }) },
        ];
      }
      case 'performance':
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_labels', bytes: performanceLabelPayload(p.performance.transport, p.performance.clips) },
          // with the transport, as the broker sends it: the page then knows it is the performance page
          { name: 'set_values', bytes: performanceStatePayload(p.performance.active, p.performance.clips, p.performance.transport) },
        ];
      case 'browse': {
        // "name | detail", one per line; "!" first for one that cannot load
        const rows = p.browse.names.split(/\r?\n/).filter((n) => n.trim()).slice(0, 8).map((line) => {
          const available = !line.startsWith('!');
          const [name, detail = ''] = (available ? line : line.slice(1)).split('|').map((t) => t.trim());
          return { name, detail, available };
        });
        const views = browseSlotViews(rows, p.browse.cursor, p.browse.columns);
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_labels', bytes: rackLabelPayload(p.browse.title, views) },
          // as the broker sends it: the page knows it is the browser, so no numbers on the rings
          { name: 'set_values', bytes: browseStatePayload(p.browse.cursor, views,
                                                           rows[p.browse.cursor] ? browseLineForDisplay(rows[p.browse.cursor]) : '') },
        ];
      }
      case 'layers': {
        // "note velocity, note velocity": the notes held, as the host sends them.
        const held = p.layers.held.split(',').map((pair) => pair.trim().split(/\s+/).map(Number))
          .filter(([note, velocity]) => Number.isFinite(note) && Number.isFinite(velocity))
          .map(([note, velocity]) => ({ note, velocity }));
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_layers', bytes: layersPayload({ parts: p.layers.parts, focused: p.layers.focused, held }) },
        ];
      }
      case 'soundcheck': {
        const songs = p.soundcheck.songs.map((s) => ({ ...s, problems: s.problems.length }));
        const song = p.soundcheck.songs[p.soundcheck.selected];
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_check', bytes: soundcheckPayload({ songs, selected: p.soundcheck.selected, current: p.soundcheck.current,
            basis: p.soundcheck.basis, problems: song?.problems ?? [], seconds: p.soundcheck.seconds,
            preloadOff: p.soundcheck.preloadOff }) },
        ];
      }
      case 'changes':
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_changes', bytes: changesPayload(p.changes) },
        ];
      case 'cue': {
        const v = p.cue.view;
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_cue', bytes: cuePayload({ ...v, section: p.cue.sections ? v.section : '',
                                                 picked: p.cue.picked ? v.picked : v.current }) },
        ];
      }
      case 'discover':
        return [
          { name: 'set_mode', bytes: [1] },
          { name: 'set_discover', bytes: discoverPayload(p.discover) },
        ];
      default:
        return [{ name: 'set_mode', bytes: [p.custom.mode & 0xff] }, ...parseCalls(p.custom.calls)];
    }
  }

  // Redraw on every change. $state.snapshot reads the whole tree, so any field edited anywhere
  // counts as a dependency without listing them.
  $effect(() => {
    $state.snapshot(preview);
    if (!screen) return;
    try {
      const calls = callsForScene();
      screen.call('init', []);
      for (const c of calls) screen.call(c.name, c.bytes);
      screen.call('draw', []);
      sent = calls;
      error = '';
    } catch (e) {
      error = e.message ?? String(e);
    }
  });

  const hex = (bytes) => bytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
  const selectAll = (e) => e.currentTarget.select();
  const int = (value, min, max) => Math.max(min, Math.min(max, Math.trunc(Number(value) || 0)));

  function savePng() {
    const a = document.createElement('a');
    a.href = canvas.toDataURL('image/png');
    a.download = `ctrl49-${preview.scene}.png`;
    a.click();
  }
</script>

<main>
  <section class="screen-column">
    <header>
      <h1>CTRL49 screen preview</h1>
      <span class="source">tools/ctrl49/Hostage_MultiKnob.lua · live</span>
    </header>

    <div class="bezel" style:width="{480 * preview.scale}px" style:height="{272 * preview.scale}px">
      <canvas bind:this={canvas} width="480" height="272" data-testid="ctrl49-canvas"
              style:width="{480 * preview.scale}px" style:height="{272 * preview.scale}px"></canvas>
    </div>

    <div class="row">
      <div class="toggles" role="group" aria-label="Zoom">
        {#each [1, 2, 3] as s}
          <button type="button" class:on={preview.scale === s} onclick={() => (preview.scale = s)}>{s}×</button>
        {/each}
      </div>
      <button type="button" onclick={savePng}>Save PNG</button>
    </div>

    {#if error}
      <p class="error" role="alert" data-testid="ctrl49-error">{error}</p>
    {/if}

    <div class="sent" data-testid="ctrl49-sent">
      <h2>Calls sent, in order</h2>
      <div class="call"><b>init</b></div>
      {#each sent as c}
        <div class="call"><b>{c.name}</b><code>{hex(c.bytes)}</code></div>
      {/each}
      <div class="call"><b>draw</b></div>
    </div>
  </section>

  <section class="controls">
    <div class="toggles scenes" role="group" aria-label="Scene">
      {#each SCENES as s}
        <button type="button" class:on={preview.scene === s.id} data-scene={s.id}
                onclick={() => (preview.scene = s.id)}>{s.label}</button>
      {/each}
    </div>

    {#if preview.scene === 'splash'}
      <p class="hint">Mode 0: what the page draws during the session's loading dwell, before
        <code>set_mode(1)</code>.</p>

    {:else if preview.scene === 'control'}
      <label class="field">Page name
        <input type="text" bind:value={preview.control.title} onfocus={selectAll} /></label>
      <div class="row wrap">
        <label class="field small">Page <input type="number" min="1" value={preview.control.page} onfocus={selectAll}
          oninput={(e) => (preview.control.page = int(e.currentTarget.value, 1, 127))} /></label>
        <label class="field small">of <input type="number" min="1" value={preview.control.pages} onfocus={selectAll}
          oninput={(e) => (preview.control.pages = int(e.currentTarget.value, 1, 127))} /></label>
      </div>
      <div class="grid slots">
        <span></span><span>Label</span><span>Value</span><span>Shown as</span><span>Bound</span><span>Found</span>
        {#each preview.control.slots as s, i}
          <button type="button" class="slot-no" class:on={preview.control.active === i}
                  title="Make this the active encoder" onclick={() => (preview.control.active = i)}>{i + 1}</button>
          <input type="text" bind:value={s.label} onfocus={selectAll} aria-label={`Slot ${i + 1} label`} />
          <input type="number" min="0" max="127" value={s.position} onfocus={selectAll}
                 aria-label={`Slot ${i + 1} value`} oninput={(e) => (s.position = int(e.currentTarget.value, 0, 127))} />
          <input type="text" bind:value={s.valueText} onfocus={selectAll} aria-label={`Slot ${i + 1} shown as`}
                 title="The value as the plug-in writes it; empty shows the 0-127 position" />
          <button type="button" class="flag" class:on={s.assigned} onclick={() => (s.assigned = !s.assigned)}
                  title="Unbound slots show no label">{s.assigned ? 'yes' : 'no'}</button>
          <button type="button" class="flag" class:on={s.resolved} onclick={() => (s.resolved = !s.resolved)}
                  title="A binding whose target is missing is marked with !">{s.resolved ? 'yes' : 'no'}</button>
        {/each}
      </div>

    {:else if preview.scene === 'performance'}
      {@const t = preview.performance.transport}
      <div class="row wrap">
        <button type="button" class="flag" class:on={t.playing} onclick={() => (t.playing = !t.playing)}>{t.playing ? 'Playing' : 'Stopped'}</button>
        <label class="field small">Bar <input type="number" min="1" value={t.bar} onfocus={selectAll} oninput={(e) => (t.bar = int(e.currentTarget.value, 1, 9999))} /></label>
        <label class="field small">Beat <input type="number" min="1" value={t.beat} onfocus={selectAll} oninput={(e) => (t.beat = int(e.currentTarget.value, 1, 16))} /></label>
        <label class="field small">Tempo <input type="number" min="20" max="300" value={t.tempo} onfocus={selectAll} oninput={(e) => (t.tempo = Number(e.currentTarget.value) || 0)} /></label>
        <button type="button" class="flag" class:on={t.externalClock} onclick={() => (t.externalClock = !t.externalClock)}>Ext clock</button>
        <button type="button" class="flag" class:on={t.clockLost} onclick={() => (t.clockLost = !t.clockLost)}>Clock lost</button>
      </div>
      <div class="grid clips">
        <span></span><span>Clip</span><span>Phase</span><span>Running</span><span>Queued</span>
        {#each preview.performance.clips as c, i}
          <button type="button" class="slot-no" class:on={preview.performance.active === i}
                  onclick={() => (preview.performance.active = i)}>{i + 1}</button>
          <input type="text" bind:value={c.name} onfocus={selectAll} aria-label={`Clip ${i + 1} name`} />
          <input type="number" min="0" max="1" step="0.05" value={c.phase} onfocus={selectAll}
                 aria-label={`Clip ${i + 1} phase`} oninput={(e) => (c.phase = Math.max(0, Math.min(1, Number(e.currentTarget.value) || 0)))} />
          <button type="button" class="flag" class:on={c.active} onclick={() => (c.active = !c.active)}>{c.active ? 'yes' : 'no'}</button>
          <button type="button" class="flag" class:on={c.pending} onclick={() => (c.pending = !c.pending)}>{c.pending ? 'yes' : 'no'}</button>
        {/each}
      </div>

    {:else if preview.scene === 'browse'}
      <label class="field">Title <input type="text" bind:value={preview.browse.title} onfocus={selectAll} /></label>
      <div class="row">
        <label class="field small">Cursor row <input type="number" min="0" max="7" value={preview.browse.cursor} onfocus={selectAll}
               oninput={(e) => (preview.browse.cursor = int(e.currentTarget.value, 0, 7))} /></label>
        <label class="field small">Columns <input type="number" min="1" max="40" value={preview.browse.columns} onfocus={selectAll}
               oninput={(e) => (preview.browse.columns = int(e.currentTarget.value, 1, 40))} /></label>
      </div>
      <label class="field">Results, one per line: name | detail (start with ! for one that cannot load)
        <textarea rows="9" bind:value={preview.browse.names}></textarea></label>

    {:else if preview.scene === 'layers'}
      <div class="row">
        <label class="field small">Part the encoders edit <input type="number" min="0" max={preview.layers.parts.length - 1}
               value={preview.layers.focused} onfocus={selectAll}
               oninput={(e) => (preview.layers.focused = int(e.currentTarget.value, 0, preview.layers.parts.length - 1))} /></label>
        <label class="field">Notes held: note velocity, ... <input type="text" bind:value={preview.layers.held} onfocus={selectAll} /></label>
      </div>
      <div class="grid zones">
        <span>Part</span><span>Low</span><span>High</span><span>Vel low</span><span>Vel high</span><span>Transpose</span>
        {#each preview.layers.parts as part, i}
          <input type="text" bind:value={part.name} onfocus={selectAll} aria-label={`Part ${i + 1} name`} />
          {#each ['keyLow', 'keyHigh', 'velocityLow', 'velocityHigh'] as key}
            <input type="number" min="0" max="127" value={part[key]} onfocus={selectAll} aria-label={`Part ${i + 1} ${key}`}
                   oninput={(e) => (part[key] = int(e.currentTarget.value, 0, 127))} />
          {/each}
          <input type="number" min="-48" max="48" value={part.transpose} onfocus={selectAll} aria-label={`Part ${i + 1} transpose`}
                 oninput={(e) => (part.transpose = int(e.currentTarget.value, -48, 48))} />
        {/each}
      </div>

    {:else if preview.scene === 'soundcheck'}
      <div class="row">
        <label class="field small">Song shown <input type="number" min="0" max={preview.soundcheck.songs.length - 1}
               value={preview.soundcheck.selected} onfocus={selectAll}
               oninput={(e) => (preview.soundcheck.selected = int(e.currentTarget.value, 0, preview.soundcheck.songs.length - 1))} /></label>
        <label class="field small">Song on stage <input type="number" min="-1" max={preview.soundcheck.songs.length - 1}
               value={preview.soundcheck.current} onfocus={selectAll}
               oninput={(e) => (preview.soundcheck.current = int(e.currentTarget.value, -1, preview.soundcheck.songs.length - 1))} /></label>
      </div>
      <div class="grid songs">
        <span>Song</span><span>Checked</span><span>Problems</span>
        {#each preview.soundcheck.songs as song, i}
          <input type="text" bind:value={song.name} onfocus={selectAll} aria-label={`Song ${i + 1} name`} />
          <button type="button" class="flag" class:on={song.checked} onclick={() => (song.checked = !song.checked)}>{song.checked ? 'yes' : 'no'}</button>
          <span class="count">{song.problems.length}</span>
        {/each}
      </div>

    {:else if preview.scene === 'changes'}
      <div class="row wrap">
        {#each [['A problem', 0], ['Nothing changed', 1], ['Changed', 2]] as [label, state]}
          <button type="button" class="flag" class:on={preview.changes.state === state}
                  onclick={() => (preview.changes.state = state)}>{label}</button>
        {/each}
      </div>
      <div class="row wrap">
        <label class="field small">Listen % <input type="number" min="0" max="100" value={preview.changes.listen} onfocus={selectAll}
               oninput={(e) => (preview.changes.listen = int(e.currentTarget.value, 0, 100))} /></label>
        <label class="field small">Selected <input type="number" min="0" value={preview.changes.selected} onfocus={selectAll}
               oninput={(e) => (preview.changes.selected = int(e.currentTarget.value, 0, preview.changes.rows.length - 1))} /></label>
        <label class="field small">Put back <input type="number" min="0" value={preview.changes.putBack} onfocus={selectAll}
               oninput={(e) => (preview.changes.putBack = int(e.currentTarget.value, 0, 255))} /></label>
        <label class="field">Against <input type="text" bind:value={preview.changes.against} onfocus={selectAll} /></label>
      </div>

    {:else if preview.scene === 'cue'}
      {@const v = preview.cue.view}
      <div class="row wrap">
        <button type="button" class="flag" class:on={preview.cue.sections} onclick={() => (preview.cue.sections = !preview.cue.sections)}>Sections playing</button>
        <button type="button" class="flag" class:on={preview.cue.picked} onclick={() => (preview.cue.picked = !preview.cue.picked)}>E1 picked a song</button>
        <button type="button" class="flag" class:on={v.loading} onclick={() => (v.loading = !v.loading)}>Loading</button>
      </div>
      <div class="row wrap">
        <label class="field">Song <input type="text" bind:value={v.song} onfocus={selectAll} /></label>
        <label class="field small">Tempo <input type="number" value={v.tempo} onfocus={selectAll} oninput={(e) => (v.tempo = Number(e.currentTarget.value) || 0)} /></label>
        <label class="field small">Song s <input type="number" min="0" value={v.songSeconds} onfocus={selectAll} oninput={(e) => (v.songSeconds = int(e.currentTarget.value, 0, 65535))} /></label>
        <label class="field small">Planned s <input type="number" min="0" value={v.plannedSeconds} onfocus={selectAll} oninput={(e) => (v.plannedSeconds = int(e.currentTarget.value, 0, 65535))} /></label>
        <label class="field small">Bar <input type="number" min="1" value={v.sectionBar} onfocus={selectAll} oninput={(e) => (v.sectionBar = int(e.currentTarget.value, 1, 255))} /></label>
        <label class="field small">Next ready % <input type="number" min="-1" max="100" value={v.nextReady} onfocus={selectAll} oninput={(e) => (v.nextReady = int(e.currentTarget.value, -1, 100))} /></label>
      </div>

    {:else if preview.scene === 'discover'}
      <div class="row wrap">
        {#each [['Not enough to go on', 0], ['Suggestions', 1], ['Nothing new', 2]] as [label, state]}
          <button type="button" class="flag" class:on={preview.discover.state === state}
                  onclick={() => (preview.discover.state = state)}>{label}</button>
        {/each}
      </div>
      <div class="row">
        <label class="field small">Selected <input type="number" min="0" max={preview.discover.sounds.length - 1}
               value={preview.discover.selected} onfocus={selectAll}
               oninput={(e) => (preview.discover.selected = int(e.currentTarget.value, 0, preview.discover.sounds.length - 1))} /></label>
        <label class="field small">Kind <input type="text" bind:value={preview.discover.kind} onfocus={selectAll} /></label>
        <label class="field small">Never opened <input type="number" min="0" value={preview.discover.neverOpened} onfocus={selectAll}
               oninput={(e) => (preview.discover.neverOpened = int(e.currentTarget.value, 0, 65535))} /></label>
      </div>
      <div class="grid songs">
        <span>Sound</span><span>Kept</span><span>Like %</span>
        {#each preview.discover.sounds as sound, i}
          <input type="text" bind:value={sound.name} onfocus={selectAll} aria-label={`Sound ${i + 1} name`} />
          <button type="button" class="flag" class:on={sound.kept} onclick={() => (sound.kept = !sound.kept)}>{sound.kept ? 'yes' : 'no'}</button>
          <input type="number" min="0" max="100" value={sound.percent} onfocus={selectAll} aria-label={`Sound ${i + 1} percent`}
                 oninput={(e) => (sound.percent = int(e.currentTarget.value, 0, 100))} />
        {/each}
      </div>

    {:else}
      <label class="field small">Mode byte for set_mode <input type="number" min="0" max="255" value={preview.custom.mode} onfocus={selectAll}
             oninput={(e) => (preview.custom.mode = int(e.currentTarget.value, 0, 255))} /></label>
      <label class="field">Calls, one per line: a function name, then bytes
        <textarea rows="10" spellcheck="false" class="mono" bind:value={preview.custom.calls} data-testid="ctrl49-calls"></textarea></label>
      <p class="hint">Numbers are bytes (<code>12</code>, <code>0x7f</code>). <code>s"text"</code> is a
        length-prefixed string, as the labels use; <code>"text"</code> is the bytes alone. Lines
        starting with <code>--</code> are skipped. <code>init</code> runs first and
        <code>draw</code> last, as the host does.</p>
    {/if}
  </section>
</main>

<style>
  :global(body) { margin: 0; background: #111418; color: #d7dde6; font: 13px/1.4 "Segoe UI", system-ui, sans-serif; }
  main { display: flex; flex-wrap: wrap; gap: 24px; padding: 20px; align-items: flex-start; }
  header { display: flex; align-items: baseline; gap: 12px; margin-bottom: 10px; }
  h1 { font-size: 15px; font-weight: 600; margin: 0; }
  h2 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; color: #7d8898; margin: 0 0 6px; }
  .source { color: #7d8898; font-size: 12px; }
  .bezel { padding: 10px; background: #050608; border: 1px solid #2a3038; border-radius: 10px; box-sizing: content-box; }
  canvas { display: block; image-rendering: pixelated; }
  .screen-column { min-width: 0; }
  .controls { flex: 1 1 420px; max-width: 620px; display: flex; flex-direction: column; gap: 12px; }
  .row { display: flex; gap: 10px; align-items: flex-end; margin-top: 10px; }
  .row.wrap { flex-wrap: wrap; margin-top: 0; }
  .toggles { display: inline-flex; gap: 2px; background: #1a1e24; border-radius: 6px; padding: 2px; }
  .scenes { flex-wrap: wrap; }
  button, input, textarea { font: inherit; color: inherit; background: #1d2229; border: 1px solid #2d343e; border-radius: 5px; padding: 4px 8px; }
  button { cursor: pointer; }
  button:hover { border-color: #ff9408; }
  .toggles button { border-color: transparent; background: transparent; }
  button.on, .toggles button.on { background: #352a18; border-color: #ff9408; color: #ffd08a; }
  .field { display: flex; flex-direction: column; gap: 4px; color: #9aa4b2; font-size: 12px; }
  .field.small input { width: 80px; }
  .grid { display: grid; gap: 4px 6px; align-items: center; font-size: 12px; color: #7d8898; }
  .slots { grid-template-columns: 34px 1fr 64px 1fr 52px 52px; }
  .clips { grid-template-columns: 34px 1fr 72px 52px 52px; }
  .zones { grid-template-columns: 1fr repeat(5, 62px); }
  .songs { grid-template-columns: 1fr 52px 62px; }
  .count { text-align: center; color: #d7dde6; }
  .slot-no { padding: 4px 0; }
  .flag { padding: 4px 0; font-size: 12px; }
  textarea { resize: vertical; }
  .mono, code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 12px; }
  .hint { color: #8791a0; margin: 0; }
  .error { color: #ffb4b4; background: #3a1d20; border: 1px solid #6a2e33; border-radius: 6px; padding: 8px 10px; margin: 10px 0 0; white-space: pre-wrap; max-width: 960px; }
  .sent { margin-top: 14px; max-width: 980px; }
  .call { display: flex; gap: 10px; font-size: 12px; padding: 2px 0; }
  .call b { font-weight: 600; min-width: 80px; color: #c9d1dc; }
  .call code { color: #8fa3bf; word-break: break-all; }
</style>
