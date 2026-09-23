<script>
  import { onDestroy } from 'svelte';
  import LcdGraphicCanvas from './LcdGraphicCanvas.svelte';
  import LcdDisplayRenderer from './LcdDisplayRenderer.svelte';
  let { model, control, allControls, width, height } = $props();
  let info = $derived(model.ui.info), pinned = $derived(model.ui.pinned), pinnedId = $derived(model.ui.pinnedId);
  let editing = $state(false), draft = $state(''), error = $state('');
  let drag = null;
  let selected = $derived(model.items.find(i => i.id === (pinned ? pinnedId : model.activeId)) ?? model.items[0]);
  let accent = $derived(selected?.accent ?? '#76c9ff');
  let graph = $derived(model.graphs.find(g => g.sources.includes(selected?.id)));
  const priority = ['cutoff','resonance','envDepth','cutoffKeyfollow','envVelocitySens','pitch','detune','wave','waveVariation','pulseWidth','pulseWidthModDepth','level','pan','levelVelocitySens','rate','shape','tempoSyncSwitch','tempoSyncNote','keyTrigger'];
  const rank = item => graph?.sources.includes(item.id) ? -1 : priority.includes(item.parameterId.split('.').at(-1)) ? priority.indexOf(item.parameterId.split('.').at(-1)) : 100;
  let related = $derived(model.items.filter(i => i.group === selected?.group && i.id !== selected?.id)
    .sort((a,b) => rank(a)-rank(b)).slice(0,6));
  let recent = $derived(model.recent.map(id => model.items.find(i => i.id === id)).filter(Boolean));
  let fraction = $derived(selected && selected.max > selected.min ? Math.max(0, Math.min(1, (Number(selected.value)-selected.min)/(selected.max-selected.min))) : 0);
  let digits = $derived(selected?.choices.length ? String(selected.choices.find(c=>String(c.value)===String(selected.value))?.label ?? selected.value) : String(Number.isFinite(selected?.displayNumber) ? Number(selected.displayNumber.toFixed(2)) : selected?.value ?? '—'));
  let context = $derived((selected?.group ?? 'PARAMETER').replace(/^tone(\d)\./, 'TONE $1 / ').toUpperCase());
  let previousId = '';
  $effect(() => {
    if (selected?.id !== previousId) {
      end(true);
      previousId = selected?.id;
      editing = false;
      error = '';
    }
  });
  onDestroy(() => end(true));
  const stop = event => event.stopPropagation();
  function select(id) { editing = false; if (pinned) model.updateUi({ pinnedId: id }); model.select(id); }
  function pin() { model.updateUi({ pinnedId: selected?.id ?? '', pinned: !pinned }); }
  function down(event) {
    if (selected?.disabled || selected?.choices.length || editing || event.button !== 0) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag = { id: selected.id, value: Number(selected.value), y: event.clientY, span: selected.max-selected.min,
      target: event.currentTarget, pointerId: event.pointerId,
      height: event.currentTarget.getBoundingClientRect().height, next: Number(selected.value) };
  }
  function move(event) {
    if (!drag) return;
    drag.next = drag.value + (drag.y-event.clientY) / Math.max(80,drag.height) * drag.span * (event.shiftKey ? .1 : 1);
    model.write(drag.id, drag.next, true);
  }
  function end(cancel = false) {
    if (!drag) return;
    const finishing = drag;
    drag = null;
    model.write(finishing.id, cancel ? finishing.value : finishing.next, false);
    try {
      if (finishing.target?.hasPointerCapture?.(finishing.pointerId)) {
        finishing.target.releasePointerCapture(finishing.pointerId);
      }
    } catch { /* The node or capture may already have been released by the browser. */ }
  }
  function startEntry() {
    if (!selected || selected.disabled || selected.choices.length) return;
    draft = String(selected.displayNumber); error = ''; editing = true;
  }
  function commit() {
    if (!editing) return;
    const n = Number(draft);
    if (!draft.trim() || !Number.isFinite(n)) { error = 'Enter a number'; return; }
    const span = selected.displayMax-selected.displayMin;
    model.write(selected.id, span ? selected.min+(n-selected.displayMin)/span*(selected.max-selected.min) : n);
    editing = false; error = '';
  }
  function key(event) {
    if (event.key === 'Escape') { end(true); editing = false; error = ''; event.preventDefault(); }
    if (editing || !selected || selected.choices.length) return;
    if (event.key === 'Enter') { startEntry(); event.preventDefault(); }
    const direction = ['ArrowUp','ArrowRight'].includes(event.key) ? 1 : ['ArrowDown','ArrowLeft'].includes(event.key) ? -1 : 0;
    if (direction) { model.write(selected.id, Number(selected.value)+direction*selected.step); event.preventDefault(); }
  }
  function focusInput(node) { node.focus(); node.select(); }
  const plot = points => points.map(p => `${12+p.x*156},${106-p.y*86}`).join(' ');
  const recentTitle = item => (item.parameterId.match(/^tone(\d)\./)?.[1] ? `T${item.parameterId.match(/^tone(\d)\./)[1]} · ` : '') + item.title;
</script>

<!-- The editor owns its inputs; Info keeps the original display's soft-key hit testing. -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="status-editor" class:info style={`--accent:${accent};width:${width}px;height:${height}px;pointer-events:${model.design ? 'none' : 'auto'}`}
  onpointerdown={event => { if (!info) stop(event); }} onwheel={event => { if (!info) stop(event); }}
  onkeydown={event => { if (!info) stop(event); }} onkeyup={event => { if (!info) stop(event); }}>
  {#if info}
    <LcdDisplayRenderer {control} {allControls} {width} {height} />
    <button class="back" onpointerdown={stop} onclick={event=>{stop(event);model.updateUi({info:false});}}>EDIT PARAMETER</button>
  {:else if selected}
    <header><strong>{context}</strong><span class="parameter-title">{selected.title}</span>
      <span class="feedback" style:color={selected.feedback.colour} title={selected.feedback.detail ?? ''}>● {selected.feedback.text}</span>
      <button onclick={()=>model.updateUi({info:true})}>INFO</button></header>
    <div class="body">
      <section class="value-tile">
        <div class="tile-heading"><span>VALUE</span><button aria-pressed={pinned} onclick={pin}>{pinned ? 'PINNED' : 'PIN'}</button></div>
        <div class="value" role="slider" tabindex={selected.disabled ? -1 : 0} aria-label={selected.title}
          aria-valuemin={selected.min} aria-valuemax={selected.max} aria-valuenow={Number(selected.value) || 0} aria-valuetext={selected.displayValue}
          onpointerdown={down} onpointermove={move} onpointerup={()=>end()} onpointercancel={()=>end(true)}
          onlostpointercapture={()=>end(true)}
          ondblclick={startEntry} onkeydown={key} data-parameter-value={selected.parameterId}>
          {#if editing}
            <input class="exact" aria-label="Exact parameter value" bind:value={draft} use:focusInput
              onpointerdown={stop} onkeydown={event=>{stop(event);if(event.key==='Enter')commit();if(event.key==='Escape'){editing=false;error='';}}} onblur={commit} />
          {:else}
            <LcdGraphicCanvas lines={[digits]} cols={Math.max(4,digits.length)} rows={1} litCss={accent} showGhost={false} width={196} height={55} />
          {/if}
        </div>
        {#if selected.choices.length}
          <select aria-label="Parameter choice" value={String(selected.value)} disabled={selected.disabled} onchange={event=>model.write(selected.id,event.currentTarget.value)}>
            {#each selected.choices as choice}<option value={String(choice.value)}>{choice.label}</option>{/each}
          </select>
        {:else}
          <div class="formatted">{selected.displayValue}</div>
          <div class="edit-hint">{error || 'DRAG · SHIFT = FINE · DOUBLE-CLICK = TYPE'}</div>
        {/if}
      </section>
      <section class="visual"><h3>{graph ? 'ENVELOPE' : 'VALUE RANGE'}</h3>
        <svg viewBox="0 0 180 126" aria-label={graph ? 'Envelope preview' : 'Parameter range'}>
          <path class="grid" d="M12 20H168 M12 63H168 M12 106H168 M12 20V106 M90 20V106 M168 20V106" />
          {#if graph}
            <polyline points={plot(graph.points)} fill="none" stroke={accent} stroke-width="2" />
            {#each graph.points as point}<circle cx={12+point.x*156} cy={106-point.y*86} r="3" fill={accent}/>{/each}
          {:else}
            <rect x="12" y="48" width={156*fraction} height="30" fill={accent} opacity=".3" />
            <path d={`M${12+156*fraction} 38V88`} stroke={accent} stroke-width="3" />
          {/if}
        </svg>
        <div class="limits"><span>{selected.displayMin}</span><span>{selected.displayMax}</span></div>
      </section>
      <section class="related"><h3>RELATED CONTROLS</h3><div class="related-grid">
        {#each related as item (item.id)}
          <div class="related-card" data-related-parameter={item.parameterId}>
            <button class="related-title" onclick={()=>select(item.id)} title={item.title}><span>{item.title}</span><b>{item.displayValue}</b></button>
            {#if item.choices.length}
              <select aria-label={item.title} value={String(item.value)} disabled={item.disabled} onchange={event=>model.write(item.id,event.currentTarget.value)}>
                {#each item.choices as choice}<option value={String(choice.value)}>{choice.label}</option>{/each}
              </select>
            {:else}
              <input type="range" aria-label={item.title} min={item.min} max={item.max} step={item.step} value={Number(item.value)} disabled={item.disabled}
                oninput={event=>model.write(item.id,Number(event.currentTarget.value))}/>
            {/if}
          </div>
        {/each}
      </div></section>
      <section class="recent"><h3>RECENT PARAMETERS</h3>
        {#each recent as item (item.id)}
          <button class:active={item.id===selected.id} onclick={()=>select(item.id)} style={`--item-accent:${item.accent}`} title={item.parameterId} data-recent-parameter={item.parameterId}>
            <span>{recentTitle(item)}</span><b>{item.displayValue}</b>
          </button>
        {:else}<p>Touch a synth control to start.</p>{/each}
      </section>
    </div>
  {/if}
</div>

<style>
  .status-editor { position:absolute;inset:0;box-sizing:border-box;pointer-events:auto;background:#10191f;border:1px solid #44515c;border-radius:6px;color:#b9c9d4;font:11px Arial,sans-serif;overflow:hidden; }
  header {height:32px;display:flex;align-items:center;gap:16px;padding:0 12px;border-bottom:1px solid #2e3e49;box-sizing:border-box;}
  strong {color:var(--accent);letter-spacing:1.5px;font-size:11px;} .parameter-title {font-size:12px;} .feedback {margin-left:auto;font-size:10px;letter-spacing:.6px;}
  button,select,input {font:inherit;color:inherit;box-sizing:border-box;} button {background:#1b2a35;border:1px solid #465563;border-radius:4px;cursor:pointer;padding:3px 10px;}
  button:hover {border-color:var(--accent);color:#fff;} button:focus-visible,input:focus-visible,select:focus-visible,.value:focus-visible {outline:2px solid var(--accent);outline-offset:1px;}
  button[aria-pressed=true] {background:#31434a;border-color:var(--accent);color:var(--accent);}
  .body {display:grid;grid-template-columns:220px 184px minmax(200px,1fr) 260px;gap:12px;padding:10px 12px;height:calc(100% - 32px);box-sizing:border-box;}
  section {min-width:0;} h3 {font-size:9px;letter-spacing:1.5px;color:#8099aa;margin:0 0 8px;}
  .value-tile {border:1px solid var(--accent);background:#12232c;border-radius:6px;padding:10px;box-sizing:border-box;}
  .tile-heading {display:flex;align-items:center;justify-content:space-between;color:var(--accent);font-size:9px;letter-spacing:1px;}
  .tile-heading button {font-size:9px;padding:3px 9px;} .value {height:65px;display:flex;align-items:center;cursor:ns-resize;touch-action:none;position:relative;margin:8px 0 3px;}
  .formatted {font:12px monospace;color:var(--accent);text-align:center;height:20px;} .edit-hint {font-size:7px;letter-spacing:.3px;color:#829cac;text-align:center;margin-top:8px;}
  .exact {width:100%;font:28px monospace;background:#0c171e;border:1px solid var(--accent);padding:6px;}
  .visual {padding:0 4px;} .visual svg {width:100%;height:135px;} .grid {stroke:#2c414c;stroke-width:.6;fill:none;}
  .limits {display:flex;justify-content:space-between;color:#829cac;font:10px monospace;}
  .related-grid {display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:48px;gap:5px 10px;}
  .related-card {background:#16232d;border:1px solid #2b3d49;border-radius:4px;padding:3px 8px;min-width:0;}
  .related-title {display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;background:none;padding:2px 0;font-size:10px;text-align:left;}
  .related-title span,.recent span {white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
  b {font:11px monospace;color:var(--accent);white-space:nowrap;} input[type=range] {width:100%;height:15px;margin:2px 0 0;accent-color:var(--accent);cursor:ew-resize;}
  select {width:100%;background:#15232b;border:1px solid #3c525e;border-radius:3px;height:20px;font-size:10px;} option {background:#15232b;}
  .recent {border-left:1px solid #2e3e49;padding-left:12px;}.recent button {display:flex;justify-content:space-between;gap:8px;width:100%;padding:5px 7px;margin-bottom:4px;border-left:3px solid var(--item-accent);text-align:left;font-size:10px;}
  .recent .active {background:#2a3a44;} .recent p {color:#829cac;font-size:11px;} .back {position:absolute;top:5px;right:8px;z-index:3;font-size:9px;}
  .info {background:#101415;}
</style>
