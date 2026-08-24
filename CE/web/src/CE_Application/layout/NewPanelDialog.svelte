<script>
  /**
   * New Panel dialog — name, size (presets or custom), and a starter
   * template with a schematic preview. Replaces the old New Panel behaviour
   * of instantly dropping the user on a bare grey 600×400 rectangle with
   * zero guidance.
   */
  import { newPanelDialogOpen, closeNewPanelDialog } from '../stores/newPanelDialog.js';
  import { PANEL_SIZE_PRESETS, PANEL_TEMPLATES, buildPanelFromTemplate } from '../models/panelTemplates.js';
  import { addPanel } from '../stores/panels.js';
  import { recentFiles, recentFileKey, recentFileLabel } from '../stores/recentFiles.js';
  import { openRecentFile } from '../stores/recentFileActions.js';
  import NumberCell from '../properties/NumberCell.svelte';

  let name = $state('');
  let templateId = $state('blank');

  // The four most recent panels, which is as many as fit on one row without the dialog growing
  // a scrollbar for what is a shortcut, not a file browser. File > Open Recent has the full list.
  let recentPanels = $derived($recentFiles.filter((entry) => entry.kind === 'panel').slice(0, 4));

  function reopen(entry) {
    closeNewPanelDialog();
    openRecentFile(entry);
  }
  let width = $state(600);
  let height = $state(400);

  // Schematic previews: each template's controls as scaled shapes. Built once
  // per dialog open (minting preview ids is harmless — ids are only unique,
  // never dense).
  let previews = $state({});

  $effect(() => {
    if (!$newPanelDialogOpen) return;
    // Reset per open
    name = '';
    templateId = 'blank';
    width = 600;
    height = 400;
    const out = {};
    for (const template of PANEL_TEMPLATES) {
      out[template.id] = template.build().map((control) => {
        const t = control._children?.Transform ?? {};
        const type = control._children?.Core?.controlType ?? '';
        return {
          x: t.x ?? 0, y: t.y ?? 0, w: t.width ?? 10, h: t.height ?? 10,
          round: type === 'Knob' || type === 'Macro',
          faint: type === 'Background',
        };
      });
    }
    previews = out;
  });

  function chooseTemplate(template) {
    templateId = template.id;
    width = template.width;
    height = template.height;
  }

  function choosePreset(preset) {
    width = preset.width;
    height = preset.height;
  }

  function create() {
    const panel = buildPanelFromTemplate({ name: name.trim(), width, height, templateId });
    addPanel(panel);
    closeNewPanelDialog();
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); closeNewPanelDialog(); }
    else if (e.key === 'Enter' && e.target?.tagName !== 'BUTTON') { e.preventDefault(); create(); }
  }
</script>

{#if $newPanelDialogOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-backdrop" onmousedown={(e) => { if (e.target === e.currentTarget) closeNewPanelDialog(); }} onkeydown={handleKeydown}>
    <div class="dialog" role="dialog" aria-label="New Panel">
      <div class="dialog-title">New Panel</div>

      <label class="field">
        <span>Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={name} placeholder="Untitled Panel" autofocus />
      </label>

      <div class="field">
        <span>Start from</span>
        <div class="template-grid">
          {#each PANEL_TEMPLATES as template (template.id)}
            <button
              class="template-card"
              class:active={templateId === template.id}
              onclick={() => chooseTemplate(template)}
              title={template.description}
            >
              <svg viewBox="0 0 {template.width} {template.height}" preserveAspectRatio="xMidYMid meet">
                <rect x="1" y="1" width={template.width - 2} height={template.height - 2} rx="6" class="panel-outline" />
                {#each previews[template.id] ?? [] as shape}
                  {#if shape.round}
                    <circle cx={shape.x + shape.w / 2} cy={shape.y + shape.h / 2} r={Math.min(shape.w, shape.h) / 2} class="shape" />
                  {:else}
                    <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx="4" class="shape" class:faint={shape.faint} />
                  {/if}
                {/each}
              </svg>
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          {/each}
        </div>
      </div>

      <div class="field">
        <span>Size</span>
        <div class="size-row">
          {#each PANEL_SIZE_PRESETS as preset (preset.id)}
            <button
              class="size-chip"
              class:active={width === preset.width && height === preset.height}
              onclick={() => choosePreset(preset)}
            >
              {preset.label}
              <em>{preset.width}×{preset.height}</em>
            </button>
          {/each}
        </div>
        <div class="size-custom">
          <span class="nc-wrap"><NumberCell label="W" min={80} step={10} value={width} onchange={(value) => { width = value; }} /></span>
          <span class="x">×</span>
          <span class="nc-wrap"><NumberCell label="H" min={80} step={10} value={height} onchange={(value) => { height = value; }} /></span>
          <span class="unit">px</span>
        </div>
      </div>

      {#if recentPanels.length}
        <!-- "New panel" is very often the wrong answer to "I want to get back to what I was
             doing" — the review's E6 asks for recent documents here for exactly that reason.
             Panels only: this dialog makes panels, so offering a device profile alongside would
             be a second, differently-shaped command hiding in a Create dialog. -->
        <div class="field">
          <span>Or reopen</span>
          <div class="recent-row">
            {#each recentPanels as entry (recentFileKey(entry))}
              <button class="recent-chip" title={entry.path} onclick={() => reopen(entry)}>
                {recentFileLabel(entry)}
              </button>
            {/each}
          </div>
        </div>
      {/if}

      <div class="dialog-actions">
        <button class="btn ghost" onclick={closeNewPanelDialog}>Cancel</button>
        <button class="btn primary" onclick={create}>Create Panel</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1200;
    background: rgba(0, 0, 0, 0.55);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .dialog {
    width: 560px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 64px);
    overflow-y: auto;
    background: #242424;
    border: 1px solid #3A3A3A;
    border-radius: 8px;
    box-shadow: 0 12px 48px rgba(0, 0, 0, 0.55);
    padding: 18px 20px 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    color: #CCC;
    font-size: 12px;
  }

  .dialog-title {
    font-size: 14px;
    font-weight: 600;
    color: #EEE;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field > span {
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .field input[type="text"] {
    height: 26px;
    background: #1C1C1C;
    border: 1px solid #3A3A3A;
    border-radius: 4px;
    color: #DDD;
    font-size: 12px;
    font-family: inherit;
    padding: 0 8px;
    outline: none;
  }

  .field input[type="text"]:focus { border-color: #5B9BD5; }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .template-card {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 8px;
    background: #1E1E1E;
    border: 1px solid #363636;
    border-radius: 6px;
    cursor: pointer;
    font-family: inherit;
    text-align: left;
    color: #CCC;
  }

  .template-card:hover { border-color: #4A6E8E; }
  .template-card.active { border-color: #5B9BD5; background: #12212F; }

  .template-card svg {
    width: 100%;
    height: 64px;
    display: block;
    background: #161616;
    border-radius: 4px;
  }

  .panel-outline {
    fill: #202830;
    stroke: #33414E;
    stroke-width: 2;
  }

  .shape {
    fill: #3D5B77;
    stroke: #5B9BD5;
    stroke-width: 2;
  }

  .shape.faint {
    fill: #232B33;
    stroke: #2E3B47;
  }

  .template-card strong {
    font-size: 11px;
    color: #DDD;
  }

  .template-card span {
    font-size: 9.5px;
    color: #7C7C7C;
    line-height: 1.3;
  }

  .size-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recent-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .recent-chip {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .recent-chip,
  .size-chip {
    display: inline-flex;
    align-items: baseline;
    gap: 6px;
    height: 24px;
    padding: 0 10px;
    background: #1E1E1E;
    border: 1px solid #363636;
    border-radius: 12px;
    color: #BBB;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
  }

  .size-chip em {
    font-style: normal;
    color: #777;
    font-size: 10px;
  }

  .size-chip:hover { border-color: #4A6E8E; }
  .size-chip.active { border-color: #5B9BD5; background: #12212F; color: #DDD; }

  .size-custom {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .size-custom .nc-wrap {
    display: flex;
    width: 80px;
    flex: 0 0 auto;
  }

  .size-custom .x, .size-custom .unit { color: #777; font-size: 11px; }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 2px;
  }

  .btn {
    height: 26px;
    padding: 0 14px;
    border-radius: 4px;
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
  }

  .btn.ghost {
    background: #2A2A2A;
    border: 1px solid #3E3E3E;
    color: #AAA;
  }

  .btn.ghost:hover { background: #333; color: #DDD; }

  .btn.primary {
    background: #094771;
    border: 1px solid #5B9BD5;
    color: #FFF;
  }

  .btn.primary:hover { background: #0B5A8E; }
</style>
