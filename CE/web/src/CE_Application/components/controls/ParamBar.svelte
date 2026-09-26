<script>
  /**
   * A plug-in parameter as one bar: the fill is the value. Drag sideways to change it (Shift for
   * fine), click the number to type what the plug-in itself would print, double-click the bar
   * for the default. A two-sided parameter (pan, detune, an envelope amount: `bipolar`) fills
   * from the centre, so "+" and "−" read at a glance.
   *
   * It speaks the host's parameter gesture: onstart when a drag begins, onchange on every move,
   * onend when it lets go, so automation and undo see one gesture, not a hundred writes.
   */
  let {
    value = 0, text = '', unit = '', label = '', bipolar = false, steps = 0,
    onstart = () => {}, onchange = () => {}, onend = () => {}, ontype = () => {}, onreset = () => {},
    testid = undefined,
  } = $props();

  let drag = null;
  let typing = $state(false);
  let draft = $state('');
  let local = $state(null);          // the value while dragging, before the host answers
  const shown = $derived(local ?? value);

  const snap = (v) => (steps > 1 ? Math.round(v * (steps - 1)) / (steps - 1) : v);

  function down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, v: value, width: e.currentTarget.clientWidth || 200, fine: e.shiftKey };
    local = value;
    onstart();
  }
  function move(e) {
    if (!drag) return;
    const scale = e.shiftKey ? 0.1 : 1;
    const v = Math.max(0, Math.min(1, drag.v + ((e.clientX - drag.x) / drag.width) * scale));
    // Shift mid-drag re-anchors, so fine control starts from where the value is, not a jump.
    if (e.shiftKey !== drag.fine) { drag = { ...drag, x: e.clientX, v: local ?? v, fine: e.shiftKey }; return; }
    local = snap(v);
    onchange(local);
  }
  function up() {
    if (!drag) return;
    drag = null;
    onend();
    local = null;
  }
  function key(e) {
    const step = steps > 1 ? 1 / (steps - 1) : e.shiftKey ? 0.001 : 0.01;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { onchange(Math.min(1, value + step)); e.preventDefault(); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { onchange(Math.max(0, value - step)); e.preventDefault(); }
    if (e.key === 'Enter') { draft = text; typing = true; }
  }
  function commit() {
    if (!typing) return;
    typing = false;
    if (draft.trim() && draft !== text) ontype(draft.trim());
  }
  const focusSelect = (node) => { node.focus(); node.select(); };
  const fill = $derived(bipolar
    ? { left: Math.min(shown, 0.5) * 100, width: Math.abs(shown - 0.5) * 100 }
    : { left: 0, width: shown * 100 });
</script>

<div class="param-bar" data-testid={testid}>
  <div class="track" class:bipolar role="slider" tabindex="0" aria-label={label}
       aria-valuemin="0" aria-valuemax="1" aria-valuenow={Number(shown.toFixed(4))} aria-valuetext={text}
       title="Drag sideways (Shift for fine) · double-click for the default"
       onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
       ondblclick={onreset} onkeydown={key}>
    <i style:left={`${fill.left}%`} style:width={`${fill.width}%`}></i>
    {#if bipolar}<b></b>{/if}
  </div>
  {#if typing}
    <input class="typed" type="text" bind:value={draft} use:focusSelect aria-label={`Type a value for ${label}`}
           onkeydown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') typing = false; }}
           onblur={commit} />
  {:else}
    <button type="button" class="ctl value" title="Click to type a value" data-testid={testid ? `${testid}-value` : undefined}
            onclick={() => { draft = text; typing = true; }}>{text}{unit ? ` ${unit}` : ''}</button>
  {/if}
</div>

<style>
  .param-bar { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 80px; }
  .track { position: relative; flex: 1; min-width: 60px; height: 20px; border-radius: 3px; cursor: ew-resize; touch-action: none;
           background: var(--host-field, #12171b); border: 1px solid var(--host-line-soft, #2c353e); overflow: hidden; }
  .track:hover { border-color: var(--host-line-strong, #526170); }
  .track:focus-visible { outline: 2px solid var(--host-accent-strong, #79b9ee); outline-offset: 1px; }
  .track i { position: absolute; top: 0; bottom: 0; background: linear-gradient(90deg, #2a4c6b, var(--host-accent, #5b9bd5)); }
  .track.bipolar i { background: var(--host-accent, #5b9bd5); }
  .track b { position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: var(--host-line-strong, #526170); }
  .value { flex: 0 0 96px; text-align: right; font: 600 12px var(--host-font-mono, monospace); color: var(--host-text-soft, #aab5be);
           background: none; border: 0; padding: 0; cursor: text; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .value:hover { color: var(--host-text, #d9e0e6); }
  .typed { flex: 0 0 96px; width: 96px; box-sizing: border-box; font: 12px var(--host-font-mono, monospace); text-align: right; }
</style>
