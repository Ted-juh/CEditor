<script>
  // Screen Builder: edit a CTRL49 screen document (pages of encoder-slot -> parameter
  // bindings) with a live, pixel-faithful preview. The preview runs the SAME Lua page that
  // ships to the keyboard against the draw-API shim, so what you see is what the hardware
  // shows. Export emits the assignment JSON the native host consumes.
  import { onMount } from 'svelte';
  import {
    screenDocuments,
    setScreenSlot,
    setScreenPageTitle,
    addScreenPage,
    removeScreenPage,
    setScreenDocumentField,
    exportAssignment,
  } from '../stores/screenBuilder.js';
  import { createScreenPreview } from '../screen/screenPreview.js';

  let { documentId } = $props();

  const doc = $derived($screenDocuments.find((d) => d.id === documentId) ?? null);

  let pageIndex = $state(0);
  let activeSlot = $state(0);
  let testValues = $state([100, 64, 20, 90, 48, 72, 30, 110]);
  let showExport = $state(false);

  const page = $derived(doc?.pages?.[pageIndex] ?? null);
  const labels = $derived(page ? page.slots.map((s) => s.label || s.param || '') : []);
  const exportJson = $derived(doc ? JSON.stringify(exportAssignment(doc), null, 2) : '');

  let canvasEl;
  let preview = null;
  let previewError = $state('');

  onMount(() => {
    let disposed = false;
    createScreenPreview(canvasEl)
      .then((p) => {
        if (disposed) { p.dispose(); return; }
        preview = p;
        previewReady = true;  // flips the render effect on
      })
      .catch((err) => { previewError = String(err?.message ?? err); });
    return () => { disposed = true; preview?.dispose(); preview = null; };
  });

  let previewReady = $state(false);

  // Re-render whenever the document, page, values, or active slot change. Reading each
  // reactive value directly in the effect body guarantees Svelte tracks it as a dependency.
  $effect(() => {
    const ready = previewReady;
    const title = page?.title ?? '';
    const currentLabels = labels;
    const values = testValues.slice();
    const active = activeSlot;
    if (!ready || !preview || !page) return;
    preview.render({ title, labels: currentLabels, values, active });
  });

  function selectPage(i) {
    pageIndex = i;
    if (activeSlot > 7) activeSlot = 0;
  }

  function onLabel(i, value) { setScreenSlot(documentId, pageIndex, i, { label: value }); }
  function onParam(i, value) { setScreenSlot(documentId, pageIndex, i, { param: value }); }
  function onTestValue(i, value) {
    const v = Math.max(0, Math.min(127, Number(value) | 0));
    testValues = testValues.map((x, idx) => (idx === i ? v : x));
    activeSlot = i;
  }

  const selectAll = (e) => e.target.select();
</script>

<div class="screen-builder">
  <header class="sb-header">
    <div class="sb-title">
      <span class="sb-eyebrow">Screen Builder</span>
      <strong>{doc?.name ?? 'Screen'}</strong>
    </div>
    <div class="sb-actions">
      <label class="sb-field">
        <span>Role</span>
        <input value={doc?.deviceRole ?? ''} onfocus={selectAll}
               oninput={(e) => setScreenDocumentField(documentId, 'deviceRole', e.target.value)} />
      </label>
      <label class="sb-field sb-field-wide">
        <span>Profile</span>
        <input value={doc?.profilePath ?? ''} onfocus={selectAll}
               oninput={(e) => setScreenDocumentField(documentId, 'profilePath', e.target.value)} />
      </label>
      <button type="button" class:active={showExport} onclick={() => (showExport = !showExport)}>Export</button>
    </div>
  </header>

  <div class="sb-body">
    <div class="sb-edit">
      <div class="sb-pages">
        {#each doc?.pages ?? [] as p, i (i)}
          <button type="button" class="sb-page-tab" class:active={i === pageIndex} onclick={() => selectPage(i)}>
            {p.title || `PAGE ${i + 1}`}
          </button>
        {/each}
        <button type="button" class="sb-page-add" title="Add page" onclick={() => addScreenPage(documentId)}>+</button>
      </div>

      {#if page}
        <label class="sb-field sb-field-block">
          <span>Page title</span>
          <input value={page.title} onfocus={selectAll}
                 oninput={(e) => setScreenPageTitle(documentId, pageIndex, e.target.value)} />
        </label>

        <div class="sb-slots">
          {#each page.slots as slot, i (i)}
            <div class="sb-slot" class:active={i === activeSlot} role="button" tabindex="0"
                 onpointerdown={() => (activeSlot = i)}
                 onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') activeSlot = i; }}>
              <span class="sb-slot-num">{i + 1}</span>
              <input class="sb-slot-label" placeholder="LABEL" value={slot.label} onfocus={selectAll}
                     oninput={(e) => onLabel(i, e.target.value)} />
              <input class="sb-slot-param" placeholder="param.id" value={slot.param} onfocus={selectAll}
                     oninput={(e) => onParam(i, e.target.value)} />
              <input class="sb-slot-test" type="range" min="0" max="127" value={testValues[i]}
                     oninput={(e) => onTestValue(i, e.target.value)} title="Preview value" />
              <span class="sb-slot-val">{testValues[i]}</span>
            </div>
          {/each}
        </div>

        {#if (doc?.pages?.length ?? 0) > 1}
          <button type="button" class="sb-page-remove" onclick={() => { removeScreenPage(documentId, pageIndex); pageIndex = 0; }}>
            Remove page
          </button>
        {/if}
      {/if}
    </div>

    <div class="sb-preview">
      <div class="sb-screen-frame">
        <canvas bind:this={canvasEl} width="480" height="272"></canvas>
      </div>
      <div class="sb-preview-note">
        {#if previewError}
          <span class="sb-error">Preview error: {previewError}</span>
        {:else}
          Live preview — the exact Lua page that ships to the CTRL49 (480×272).
        {/if}
      </div>
    </div>
  </div>

  <div class="sb-export" style:display={showExport ? 'block' : 'none'}>
    <div class="sb-export-head">Assignment JSON (save as a <code>.assignment.json</code> for the native host)</div>
    <textarea readonly onfocus={selectAll}>{exportJson}</textarea>
  </div>
</div>

<style>
  .screen-builder { display: flex; flex-direction: column; width: 100%; height: 100%; background: #0e1116; color: #cbd2dc; }
  .sb-header { display: flex; align-items: center; justify-content: space-between; gap: 16px;
    height: 40px; padding: 0 14px; border-bottom: 1px solid #1e2430; flex: 0 0 auto; }
  .sb-title { display: flex; flex-direction: column; line-height: 1.1; }
  .sb-eyebrow { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7482; }
  .sb-title strong { font-size: 14px; color: #e8ecf1; }
  .sb-actions { display: flex; align-items: center; gap: 10px; }
  .sb-field { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #8b94a2; }
  .sb-field input { background: #161b23; border: 1px solid #262d3a; color: #d6dce4; border-radius: 4px;
    padding: 3px 6px; font-size: 12px; }
  .sb-field-wide input { width: 280px; }
  .sb-field-block { flex-direction: column; align-items: stretch; gap: 3px; margin: 10px 0; }
  .sb-field-block input { width: 100%; }
  .sb-actions button, .sb-page-remove { background: #1a212c; border: 1px solid #2a3341; color: #cbd2dc;
    border-radius: 4px; padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .sb-actions button.active { border-color: #ff9408; color: #ff9408; }
  .sb-body { display: flex; flex: 1 1 auto; min-height: 0; }
  .sb-edit { width: 460px; flex: 0 0 auto; padding: 12px 14px; overflow-y: auto; border-right: 1px solid #1e2430; }
  .sb-pages { display: flex; gap: 6px; flex-wrap: wrap; }
  .sb-page-tab { background: #161b23; border: 1px solid #262d3a; color: #aab2bf; border-radius: 4px;
    padding: 4px 10px; font-size: 12px; cursor: pointer; }
  .sb-page-tab.active { border-color: #ff9408; color: #ff9408; }
  .sb-page-add { background: #161b23; border: 1px solid #262d3a; color: #8b94a2; border-radius: 4px;
    width: 26px; cursor: pointer; }
  .sb-slots { display: flex; flex-direction: column; gap: 4px; margin-top: 4px; }
  .sb-slot { display: grid; grid-template-columns: 18px 1fr 1.2fr 90px 30px; align-items: center; gap: 6px;
    padding: 4px; border: 1px solid transparent; border-radius: 4px; }
  .sb-slot.active { border-color: #2f3a4b; background: #131922; }
  .sb-slot-num { color: #6b7482; font-size: 11px; text-align: center; }
  .sb-slot-label, .sb-slot-param { background: #161b23; border: 1px solid #262d3a;
    color: #d6dce4; border-radius: 4px; padding: 3px 6px; font-size: 12px; min-width: 0; }
  .sb-slot-val { font-size: 11px; color: #8b94a2; text-align: right; }
  .sb-preview { flex: 1 1 auto; display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 12px; padding: 16px; min-width: 0; }
  .sb-screen-frame { border: 1px solid #2a3341; border-radius: 6px; padding: 8px; background: #05070a; }
  .sb-screen-frame canvas { width: 720px; height: 408px; image-rendering: pixelated; display: block; }
  .sb-preview-note { font-size: 11px; color: #6b7482; }
  .sb-error { color: #ff6b6b; }
  .sb-export { flex: 0 0 auto; border-top: 1px solid #1e2430; padding: 10px 14px; }
  .sb-export-head { font-size: 11px; color: #8b94a2; margin-bottom: 6px; }
  .sb-export code { color: #ff9408; }
  .sb-export textarea { width: 100%; height: 150px; background: #05070a; border: 1px solid #262d3a; color: #cbd2dc;
    border-radius: 4px; padding: 8px; font-family: ui-monospace, monospace; font-size: 12px; resize: vertical; }
</style>
