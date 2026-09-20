<script>
  import { onMount, untrack } from 'svelte';
  import { STARTER_CONTROL_SETS } from '../models/controlSetCoverage.js';
  import { createControlSetStarter } from '../models/controlSetStarter.js';
  import { getControlSet } from '../models/controlSets.js';
  import { buildSolidStyle } from '../utils/backgroundCSS.js';
  import PanelPreviewSurface from '../editor/PanelPreviewSurface.svelte';
  import { addPanel } from '../stores/panels.js';
  import { setActivePanelControlSet } from '../stores/controlSets.js';
  let { initialId = 'graphite', onclose = () => {} } = $props();
  let selected = $state(untrack(() => getControlSet(initialId) ? initialId : 'graphite'));
  let dialog;
  let grayscale = $state(false);
  let sample = $derived(createControlSetStarter(selected));
  let design = $derived(getControlSet(selected));
  let direction = $derived(STARTER_CONTROL_SETS.find(s => s.id === selected));
  onMount(() => { dialog.showModal(); });
  function openStarter() { addPanel(createControlSetStarter(selected)); onclose(); }
</script>

<dialog bind:this={dialog} onclose={onclose} oncancel={(e) => { e.preventDefault(); onclose(); }} onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onclose(); } }} aria-label="Control set gallery">
  <header><div><small>CEDITOR / CONTROL LIBRARY</small><h2>Twelve ways to start.</h2></div><button class="close" aria-label="Close gallery" onclick={onclose}>×</button></header>
  <div class="body">
    <nav aria-label="Starter designs">
      {#each STARTER_CONTROL_SETS as entry, index}
        <button class:chosen={selected === entry.id} aria-pressed={selected === entry.id} onclick={() => selected = entry.id}>
          <span class="index">{String(index + 1).padStart(2, '0')}</span><span><b>{getControlSet(entry.id).name}</b><small>{entry.title}</small></span>
        </button>
      {/each}
    </nav>
    <section class="preview">
      <div class="intro"><h3>{design.name}</h3><p>{direction?.detail ?? design.description}</p></div>
      <label class="compare"><input type="checkbox" bind:checked={grayscale} /> Compare shapes in grayscale</label>
      <div class="viewport" class:grayscale inert><div class="sample">
        {#key selected}<PanelPreviewSurface panel={sample} scale={1} bgLayers={{ solid: buildSolidStyle(sample) }} gridStyle="" />{/key}
      </div></div>
      <p class="hint">Open a starter to play and copy controls. Core → Form edits the mechanism, size, depth, scale divisions and inks. Original parts restores the Parts renderer.</p>
      <p class="hint">Apply changes controls set to “Follow panel”. Pinned designs and your property edits stay in place.</p>
      <footer><button onclick={() => { setActivePanelControlSet(selected); onclose(); }}>Apply to current panel</button><button class="primary" onclick={openStarter}>Open editable starter →</button></footer>
    </section>
  </div>
</dialog>

<style>
  .grayscale { filter:grayscale(1); } .compare { display:flex;align-items:center;gap:8px;font-size:12px;margin:0 0 12px;color:#ddd; }
  dialog { width:1120px; max-width:96vw; max-height:94vh; padding:0; background:#17191c; color:#ece9e2; border:1px solid #42454b; border-radius:14px; box-shadow:0 24px 90px #000b; font-family:'Segoe UI',sans-serif; }
  dialog::backdrop { background:#000a; }
  header { display:flex; justify-content:space-between; align-items:center; padding:22px 26px; border-bottom:1px solid #36383d; }
  h2 { font-size:26px; letter-spacing:-.7px; margin:5px 0 0; } header small { font-size:10px; letter-spacing:2px; color:#d1b881; }
  button { font:inherit; cursor:pointer; color:inherit; border:1px solid #484b51; background:#26292e; border-radius:7px; padding:10px 14px; }
  button:focus-visible { outline:2px solid #e3c991; outline-offset:2px; }
  .close { font-size:26px; padding:0 10px; background:transparent; border:0; }
  .body { display:grid; grid-template-columns:242px 1fr; }
  nav { padding:12px; border-right:1px solid #36383d; overflow:auto; max-height:650px; }
  nav button { display:flex; gap:13px; text-align:left; width:100%; border-color:transparent; background:transparent; margin-bottom:3px; padding:8px 10px; }
  nav button:hover { background:#24272b; } nav button.chosen { background:#30322e; border-color:#776c50; }
  .index { color:#9d9279; font-size:11px; padding-top:2px; font-variant-numeric:tabular-nums; }
  nav b { font-size:13px; } nav small { display:block; color:#acadb0; font-size:10px; margin-top:4px; }
  .preview { padding:20px 24px; min-width:0; } h3 { margin:0; font-size:22px; } p { color:#b8b8b9; font-size:12px; line-height:1.6; }
  .viewport { width:748px; height:541px; max-width:100%; overflow:hidden; border:1px solid #42454b; border-radius:5px; background:#252525; }
  .sample { width:880px; height:636px; position:relative; transform:scale(.85); transform-origin:top left; }
  .hint { font-size:11px; margin:12px 0; } footer { display:flex; justify-content:flex-end; gap:10px; }
  .primary { background:#dec99a; color:#23231f; border-color:#dec99a; font-weight:600; }
  @media (max-width:950px) { .body { grid-template-columns:190px 1fr; } .viewport { height:395px; } .sample { transform:scale(.62); } }
</style>
