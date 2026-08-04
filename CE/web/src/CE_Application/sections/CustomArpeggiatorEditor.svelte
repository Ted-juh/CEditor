<script>
  // Arpeggiator pattern editor overlay for the custom-component design surface.
  // Extracted verbatim from CustomDesignSurfaceEditor.svelte: owns the grid
  // gestures (draw / move / resize / velocity) and pushes block changes up via
  // callback props; the parent owns the arpeggiator data and commits patches.
  import { numberOr } from '../utils/primitives.js';
  import { clampNumber } from '../utils/customDesignSurfaceGeometry.js';
  import { stopSelectionAction } from '../utils/customDesignSurfaceHelpers.js';
  import { noteNameFromMidi } from '../utils/customComponentArpeggiator.js';
  import { DragScrub, presets } from '../scrub/dragScrub';

  let {
    arpeggiatorEnabled = false,
    arpBlocks = [],
    arpStepCount = 32,
    arpViewNote = 60,
    arpSelectedBlock = '',
    arpTool = 'draw',
    onArpToolChange = () => {},
    setArpBlocks = () => {},
    selectArpBlock = () => {},
  } = $props();

  let arpVisibleNotes = $derived(Array.from({ length: 12 }, (_, index) => arpViewNote + 11 - index));
  let arpDraftBlock = $state(null);
  let interaction = null;

  function noteName(note) {
    return noteNameFromMidi(note);
  }

  function nextArpBlockId(blocks = arpBlocks) {
    let index = blocks.length + 1;
    const names = new Set(blocks.map((block) => block.id));
    while (names.has(`note${index}`)) index += 1;
    return `note${index}`;
  }

  function arpCellFromEvent(event) {
    const stage = event.currentTarget?.closest?.('.arp-grid-stage') ?? event.currentTarget;
    const rect = stage?.getBoundingClientRect?.();
    return arpCellFromRect(event, rect);
  }

  function arpCellFromRect(event, rect) {
    if (!rect) return { step: 0, note: arpViewNote };
    const x = clampNumber((event.clientX - rect.left) / Math.max(1, rect.width), 0, 0.999999);
    const y = clampNumber((event.clientY - rect.top) / Math.max(1, rect.height), 0, 0.999999);
    const step = Math.max(0, Math.min(arpStepCount - 1, Math.floor(x * arpStepCount)));
    const row = Math.max(0, Math.min(11, Math.floor(y * 12)));
    return { step, note: arpViewNote + 11 - row };
  }

  function arpBlockStyle(block) {
    const left = (block.step / arpStepCount) * 100;
    const width = (block.length / arpStepCount) * 100;
    const row = arpViewNote + 11 - block.note;
    const top = (row / 12) * 100;
    const height = 100 / 12;
    return `left:${left}%;top:${top}%;width:${width}%;height:${height}%;`;
  }

  function arpVelocityStyle(block) {
    return `height:${(clampNumber(numberOr(block?.velocity, 1), 1, 127) / 127) * 100}%;`;
  }

  function beginArpDraw(event) {
    if (arpTool !== 'draw' || !arpeggiatorEnabled || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const start = arpCellFromEvent(event);
    const block = {
      id: nextArpBlockId(),
      note: start.note,
      step: start.step,
      length: 1,
      velocity: 96,
    };
    arpDraftBlock = block;
    interaction = {
      type: 'arpDraw',
      start,
      block,
      stageRect: event.currentTarget?.getBoundingClientRect?.(),
    };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginArpBlockMove(block, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const start = arpCellFromEvent(event);
    selectArpBlock(block.id);
    interaction = {
      type: 'arpMove',
      id: block.id,
      start,
      block,
      stageRect: event.currentTarget?.closest?.('.arp-grid-stage')?.getBoundingClientRect?.(),
    };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function beginArpBlockResize(block, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const start = arpCellFromEvent(event);
    selectArpBlock(block.id);
    interaction = {
      type: 'arpResize',
      id: block.id,
      start,
      block,
      stageRect: event.currentTarget?.closest?.('.arp-grid-stage')?.getBoundingClientRect?.(),
    };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
  }

  function scrubSampleFromEvent(event) {
    return {
      x: event.clientX,
      y: event.clientY,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
    };
  }

  function beginArpVelocityDrag(block, event) {
    if (event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    selectArpBlock(block.id);
    // The grab element is the small handle but the mapping runs over the whole
    // block, so the core is driven directly with the block rect as bounds.
    const blockEl = event.currentTarget?.closest?.('.arp-block') ?? document.querySelector(`.arp-block[data-block-id="${block.id}"]`);
    const rect = blockEl?.getBoundingClientRect?.();
    if (!rect) return;
    const scrub = new DragScrub(
      { ...presets.linearVertical, min: 1, max: 127, step: 1 },
      clampNumber(numberOr(block.velocity, 96), 1, 127)
    );
    interaction = { type: 'arpVelocity', id: block.id, scrub };
    window.addEventListener('mousemove', handleInteractionMove);
    window.addEventListener('mouseup', handleInteractionEnd);
    applyArpVelocity(block.id, scrub.begin(scrubSampleFromEvent(event), { bounds: rect, jumpToPointer: true }));
  }

  function handleArpBlockPointer(block, event) {
    if (!block || event.button !== 0) return;
    if (arpTool === 'draw' || arpTool === 'select') {
      event.stopPropagation();
      selectArpBlock(block.id);
      return;
    }
    if (arpTool === 'resize') {
      beginArpBlockResize(block, event);
      return;
    }
    if (arpTool === 'velocity') {
      beginArpVelocityDrag(block, event);
      return;
    }
    beginArpBlockMove(block, event);
  }

  function applyArpVelocity(id, value) {
    if (value === null || value === undefined) return;
    const velocity = Math.round(value);
    setArpBlocks(arpBlocks.map((block) => block.id === id ? { ...block, velocity } : block), id);
  }

  function handleInteractionMove(event) {
    if (!interaction) return;
    if (interaction.type === 'arpDraw') {
      const current = arpCellFromRect(event, interaction.stageRect);
      const step = Math.min(interaction.start.step, current.step);
      const endStep = Math.max(interaction.start.step, current.step);
      arpDraftBlock = {
        ...interaction.block,
        note: current.note,
        step,
        length: Math.max(1, endStep - step + 1),
      };
      return;
    }
    if (interaction.type === 'arpMove') {
      const current = arpCellFromRect(event, interaction.stageRect);
      const stepDelta = current.step - interaction.start.step;
      const noteDelta = current.note - interaction.start.note;
      setArpBlocks(arpBlocks.map((block) => {
        if (block.id !== interaction.id) return block;
        const step = clampNumber(interaction.block.step + stepDelta, 0, Math.max(0, arpStepCount - interaction.block.length));
        const note = clampNumber(interaction.block.note + noteDelta, 0, 127);
        return { ...block, step, note };
      }), interaction.id);
      return;
    }
    if (interaction.type === 'arpResize') {
      const current = arpCellFromRect(event, interaction.stageRect);
      setArpBlocks(arpBlocks.map((block) => {
        if (block.id !== interaction.id) return block;
        const endStep = Math.max(block.step, current.step);
        return { ...block, length: clampNumber(endStep - block.step + 1, 1, arpStepCount - block.step) };
      }), interaction.id);
      return;
    }
    if (interaction.type === 'arpVelocity') {
      applyArpVelocity(interaction.id, interaction.scrub.move(scrubSampleFromEvent(event)));
      return;
    }
  }

  function handleInteractionEnd() {
    if (!interaction) return;
    window.removeEventListener('mousemove', handleInteractionMove);
    window.removeEventListener('mouseup', handleInteractionEnd);
    interaction.scrub?.end();

    if (interaction.type === 'arpDraw') {
      const block = arpDraftBlock;
      arpDraftBlock = null;
      if (block) setArpBlocks([...arpBlocks, block], block.id);
      interaction = null;
      return;
    }
    arpDraftBlock = null;
    interaction = null;
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="arp-editor" style={`--arp-steps:${arpStepCount};`} onmousedown={stopSelectionAction} onclick={stopSelectionAction}>
  <div class="arp-tool-strip" role="toolbar" aria-label="Arpeggiator edit tools">
    {#each ['select', 'draw', 'move', 'resize', 'velocity'] as tool, index}
      <button type="button" class:active={arpTool === tool} onclick={() => { onArpToolChange(tool); }} title={`Arpeggiator ${tool} tool (${index + 1})`}>
        {tool}
        <kbd>{index + 1}</kbd>
      </button>
    {/each}
  </div>
  <div class="arp-ruler">
    <span></span>
    {#each Array.from({ length: arpStepCount }, (_, index) => index) as step (step)}
      <strong class:bar-start={step % 4 === 0}>{step + 1}</strong>
    {/each}
  </div>
  <div class="arp-note-labels">
    {#each arpVisibleNotes as note (note)}
      <span class:black-key={noteName(note).includes('#')}>{noteName(note)}</span>
    {/each}
  </div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="arp-grid-stage"
    style={`--arp-steps:${arpStepCount};`}
    onmousedown={beginArpDraw}
    aria-label="Arpeggiator pattern grid"
  >
    {#each arpVisibleNotes as note (note)}
      <span class="arp-row" class:black-key={noteName(note).includes('#')}></span>
    {/each}
    {#each Array.from({ length: arpStepCount }, (_, index) => index) as step (step)}
      <span class="arp-step" class:bar-start={step % 4 === 0}></span>
    {/each}
    {#each arpBlocks.filter((block) => block.note >= arpViewNote && block.note < arpViewNote + 12) as block (block.id)}
      <button
        type="button"
        class="arp-block"
        class:selected={arpSelectedBlock === block.id}
        data-block-id={block.id}
        style={arpBlockStyle(block)}
        title={`${noteName(block.note)} · step ${block.step + 1} · length ${block.length} · velocity ${block.velocity}`}
        onmousedown={(event) => handleArpBlockPointer(block, event)}
        onclick={(event) => { event.stopPropagation(); selectArpBlock(block.id); }}
      >
        <span class="arp-velocity-fill" style={arpVelocityStyle(block)}></span>
        <strong>{noteName(block.note)}</strong>
        <em>{block.velocity}</em>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="arp-velocity-handle"
          title="Drag up/down for velocity"
          onmousedown={(event) => beginArpVelocityDrag(block, event)}
        ></span>
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <span
          class="arp-resize-handle"
          title="Drag to change duration"
          onmousedown={(event) => beginArpBlockResize(block, event)}
        ></span>
      </button>
    {/each}
    {#if arpDraftBlock && arpDraftBlock.note >= arpViewNote && arpDraftBlock.note < arpViewNote + 12}
      <div class="arp-block draft" style={arpBlockStyle(arpDraftBlock)}>
        <span class="arp-velocity-fill" style={arpVelocityStyle(arpDraftBlock)}></span>
        <strong>{noteName(arpDraftBlock.note)}</strong>
      </div>
    {/if}
  </div>
</div>

<style>
  .arp-editor {
    position: absolute;
    inset: 12px;
    z-index: 1850;
    display: grid;
    grid-template-columns: 46px 1fr;
    grid-template-rows: 28px 24px 1fr;
    overflow: hidden;
    border: 1px solid #344653;
    border-radius: 4px;
    background: #10151A;
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.025);
    color: #D9E7F0;
    user-select: none;
  }

  .arp-tool-strip {
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-bottom: 1px solid #2D3A43;
    background: #12191F;
  }

  .arp-tool-strip button {
    min-width: 0;
    border: 1px solid #2E3C46;
    border-radius: 3px;
    background: #1B252C;
    color: #AFC0CB;
    cursor: pointer;
    font: inherit;
    font-size: 10px;
    font-weight: 800;
    text-transform: capitalize;
  }

  .arp-tool-strip button.active,
  .arp-tool-strip button:hover {
    border-color: #5B9BD5;
    background: #173449;
    color: #FFFFFF;
  }

  .arp-tool-strip button kbd {
    margin-left: 3px;
    padding: 0 3px;
    border-radius: 2px;
    background: #2E3C46;
    color: #8FA5B4;
    font: inherit;
    font-size: 9px;
  }

  .arp-tool-strip button.active kbd {
    background: #2B577A;
    color: #E4F0FA;
  }

  .arp-ruler {
    grid-column: 1 / 3;
    display: grid;
    grid-template-columns: 46px repeat(var(--arp-steps, 32), minmax(12px, 1fr));
    border-bottom: 1px solid #2D3A43;
    background: #151C22;
  }

  .arp-ruler strong {
    display: grid;
    place-items: center;
    min-width: 0;
    border-left: 1px solid #24313A;
    color: #8498A8;
    font-size: 9px;
    font-weight: 700;
  }

  .arp-ruler strong.bar-start {
    color: #E5C06B;
    background: rgba(229, 192, 107, 0.08);
  }

  .arp-note-labels {
    display: grid;
    grid-template-rows: repeat(12, 1fr);
    border-right: 1px solid #2D3A43;
    background: #141A1F;
  }

  .arp-note-labels span {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 0 7px 0 3px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    color: #AABBC8;
    font-size: 10px;
    font-weight: 700;
  }

  .arp-note-labels span.black-key {
    background: #0F1418;
    color: #7F929F;
  }

  .arp-grid-stage {
    position: relative;
    display: grid;
    grid-template-columns: repeat(var(--arp-steps, 32), minmax(12px, 1fr));
    grid-template-rows: repeat(12, 1fr);
    overflow: hidden;
    cursor: crosshair;
    touch-action: none;
  }

  .arp-row,
  .arp-step {
    pointer-events: none;
  }

  .arp-row {
    grid-column: 1 / -1;
    border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  }

  .arp-row.black-key {
    background: rgba(0, 0, 0, 0.18);
  }

  .arp-step {
    grid-row: 1 / -1;
    border-left: 1px solid rgba(255, 255, 255, 0.045);
  }

  .arp-step.bar-start {
    border-left-color: rgba(229, 192, 107, 0.34);
    background: rgba(229, 192, 107, 0.025);
  }

  .arp-block {
    position: absolute;
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    min-width: 12px;
    margin: 1px;
    padding: 0 13px 0 7px;
    border: 1px solid rgba(125, 196, 243, 0.72);
    border-radius: 3px;
    background: rgba(45, 108, 146, 0.78);
    color: #F2FAFF;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.32);
    cursor: move;
    overflow: hidden;
    font: inherit;
    text-align: left;
    touch-action: none;
  }

  .arp-block.selected {
    border-color: #FFE08A;
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.75),
      0 0 0 4px rgba(229, 192, 107, 0.16),
      0 2px 8px rgba(0, 0, 0, 0.32);
  }

  .arp-block.draft {
    border-style: dashed;
    opacity: 0.82;
    pointer-events: none;
  }

  .arp-block strong,
  .arp-block em {
    position: relative;
    z-index: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 9px;
    line-height: 1;
  }

  .arp-block em {
    color: #CFEAFF;
    font-style: normal;
    font-weight: 700;
  }

  .arp-velocity-fill {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(0deg, rgba(229, 192, 107, 0.58), rgba(125, 196, 243, 0.1));
    pointer-events: none;
  }

  .arp-velocity-handle {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 8px;
    cursor: ns-resize;
    background: rgba(255, 255, 255, 0.08);
  }

  .arp-resize-handle {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 10px;
    cursor: ew-resize;
    background: rgba(255, 255, 255, 0.14);
  }
</style>
