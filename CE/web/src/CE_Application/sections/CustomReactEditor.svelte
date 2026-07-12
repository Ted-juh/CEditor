<script>
  // React tab (restructure Stage D1): everything that answers "what happens
  // when a value or state changes" — one home with a sub-nav instead of four
  // tabs. First pass embeds the existing editors unchanged; a later polish
  // pass may unify their vocabulary.
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import BindingsEditor from './BindingsEditor.svelte';
  import CustomLinksEditor from './CustomLinksEditor.svelte';
  import StatesEditor from './StatesEditor.svelte';
  import AnimationsEditor from './AnimationsEditor.svelte';

  let { control = null } = $props();

  const PANES = [
    { id: 'bindings', label: 'Value → Part', hint: 'Live wires from channels to part properties (rotation follows cutoff, fill width follows level).' },
    { id: 'links', label: 'Value → Value', hint: 'Rules between channels: routing, conditions, expressions.' },
    { id: 'states', label: 'States', hint: 'Named look variants activated by flags or channel rules.' },
    { id: 'animations', label: 'Animations', hint: 'Transitions and keyframes triggered by state or value changes.' },
  ];

  let pane = $state('bindings');
  let paneMeta = $derived(PANES.find((entry) => entry.id === pane) ?? PANES[0]);

  let designer = $derived(getSection(control, 'Designer'));
  let coreId = $derived(getSection(control, 'Core')?.id ?? '');

  // Deep-link channel: writers set Designer.focusReactPane; consume one-shot.
  $effect(() => {
    const requested = String(designer?.focusReactPane ?? '').trim();
    if (!PANES.some((entry) => entry.id === requested)) return;
    pane = requested;
    if (coreId) updateControlProperty(coreId, 'Designer.focusReactPane', '');
  });
</script>

<div class="react-editor">
  <div class="react-nav" role="tablist" aria-label="React editor pane">
    {#each PANES as entry (entry.id)}
      <button
        type="button"
        role="tab"
        class:active={pane === entry.id}
        aria-selected={pane === entry.id}
        onclick={() => { pane = entry.id; }}
      >{entry.label}</button>
    {/each}
  </div>
  <p class="react-hint">{paneMeta.hint}</p>

  <!-- CSS display switching keeps the editors alive in the DOM. -->
  <div style:display={pane === 'bindings' ? 'block' : 'none'}>
    <BindingsEditor {control} />
  </div>
  <div style:display={pane === 'links' ? 'block' : 'none'}>
    <CustomLinksEditor {control} />
  </div>
  <div style:display={pane === 'states' ? 'block' : 'none'}>
    <StatesEditor {control} />
  </div>
  <div style:display={pane === 'animations' ? 'block' : 'none'}>
    <AnimationsEditor {control} />
  </div>
</div>

<style>
  .react-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .react-nav {
    display: inline-flex;
    align-self: flex-start;
    gap: 2px;
    padding: 2px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .react-nav button {
    padding: 5px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: rgba(229, 237, 246, 0.72);
    font: inherit;
    font-size: 11px;
    cursor: pointer;
  }

  .react-nav button:hover {
    color: #E5EDF6;
  }

  .react-nav button.active {
    background: rgba(91, 155, 213, 0.22);
    color: #E5EDF6;
    box-shadow: 0 0 0 1px rgba(91, 155, 213, 0.4);
  }

  .react-hint {
    margin: 0 0 2px;
    font-size: 11px;
    line-height: 1.4;
    color: rgba(205, 231, 246, 0.62);
  }
</style>
