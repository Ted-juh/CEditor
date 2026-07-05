<script>
  // '?'-toggled help for the custom design surface: the shortcut cheatsheet
  // plus a plain-language glossary of the creator vocabulary. Extracted from
  // CustomDesignSurfaceEditor (§12.5 decomposition) — self-contained data,
  // markup, and styles.
  let { open = false, onclose = () => {} } = $props();

  let tab = $state('shortcuts');

  const SHORTCUT_CHEATSHEET = [
    { keys: 'V R U O G A C H T L', action: 'Draw tools: Select, Rectangle, Rounded, Ellipse, Ring, Arc, Capsule, Hit Zone, Text, Line' },
    { keys: 'Esc', action: 'Cancel draw → back to Select → clear selection (closes this overlay first)' },
    { keys: 'Tab / Shift+Tab', action: 'Cycle layers (Alt+Tab cycles hit zones)' },
    { keys: 'Arrows / Shift+Arrows', action: 'Nudge selection by 1px / 10px' },
    { keys: 'Ctrl+D', action: 'Duplicate selected layer(s)' },
    { keys: 'Ctrl+C / Ctrl+X / Ctrl+V', action: 'Copy / cut / paste layers, including hit zones that follow them (works across components)' },
    { keys: 'Delete / Backspace', action: 'Remove selected layer, hit zone, or kit' },
    { keys: 'Space + drag', action: 'Pan the surface' },
    { keys: 'Alt while dragging', action: 'Bypass grid and smart snapping' },
    { keys: 'Shift while resizing', action: 'Lock aspect ratio' },
    { keys: 'Shift while rotating', action: 'Snap rotation to 15° steps' },
    { keys: '1 2 3 4 5', action: 'Arpeggiator tools: Select, Draw, Move, Resize, Velocity' },
    { keys: '?', action: 'Toggle this overlay' },
  ];

  // Plain-language glossary for the creator's bespoke vocabulary.
  const GLOSSARY = [
    ['Part (layer)', 'One visual building block — a shape, text, or icon drawn on the artboard. Parts stack by z-order in the layer tree.'],
    ['Value Channel', 'A named value the component carries, like "cutoff" or "mode" — its range, step, default, and current value. Everything interactive reads or writes a channel.'],
    ['Array Channel', 'A channel holding N values at once (like 16 step levels). Step-bar generators draw one part per item, and each generated zone edits its own item.'],
    ['Behavior', 'How pointer input changes a channel: slider drags, dial rotation, button cycling, XY pads. A behavior connects gestures to a value channel.'],
    ['Hit Zone', 'The clickable/draggable area. It can be independent, cover the whole face, or follow a part (grown by an inflate margin) so a small handle still has a comfortable grab area.'],
    ['Generator', 'A rule that produces many parts at once — tick marks, LED rows, grids, piano keys, step bars, button banks, labels. Edit the generator, not the generated copies.'],
    ['Binding', 'A live wire from a value channel to a part property: "pointer rotation follows cutoff", "fill width follows level". Bindings re-apply whenever the channel changes.'],
    ['Link', 'A rule between channels or to a condition: "show this layer when mode == 2". Built with the condition builder.'],
    ['State', 'A named look variant (hover, on/off, enum values, or a channel rule). A state patches part properties while it is active; the State Coverage matrix shows what each state changes.'],
    ['Variant', 'A saved override set for a component instance — same component, different skin/values per placement.'],
    ['Public API', 'What a placed instance exposes to the panel: editable properties (inputs) and published values (outputs). Panels script against this, never the internals.'],
    ['Kit', 'A ready-made group (dial, scale, arpeggiator) inserted as one object. Expand it to edit internals; it stays selectable as a unit until then.'],
    ['Archetype (Make Interactive)', 'A one-action scaffold — Dial, Slider, Button, Toggle, XY, Range — that creates the channel, behavior, and hit zone pre-wired with sensible defaults.'],
    ['Test Bench / Live Test Surface', 'The runtime simulator: drag the component like a user, watch channels, zones, and states update live. The Live dock tab keeps it beside the canvas.'],
  ];
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="help-overlay" onclick={onclose}>
    <div class="help-panel" role="dialog" aria-label="Shortcuts and glossary" onclick={(event) => event.stopPropagation()}>
      <div class="help-header">
        <div class="help-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'shortcuts'} class:active={tab === 'shortcuts'} onclick={() => { tab = 'shortcuts'; }}>Shortcuts</button>
          <button type="button" role="tab" aria-selected={tab === 'glossary'} class:active={tab === 'glossary'} onclick={() => { tab = 'glossary'; }}>Glossary</button>
        </div>
        <button type="button" class="help-close" onclick={onclose} title="Close (Esc)">×</button>
      </div>
      {#if tab === 'shortcuts'}
        <div class="help-body">
          {#each SHORTCUT_CHEATSHEET as row (row.keys)}
            <div class="help-row">
              <kbd>{row.keys}</kbd>
              <span>{row.action}</span>
            </div>
          {/each}
        </div>
      {:else}
        <div class="help-body">
          {#each GLOSSARY as [term, explanation] (term)}
            <div class="help-row glossary">
              <strong>{term}</strong>
              <span>{explanation}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .help-overlay {
    position: absolute;
    inset: 0;
    z-index: 3200;
    display: grid;
    place-items: center;
    background: rgba(10, 12, 16, 0.55);
  }

  .help-panel {
    width: min(560px, calc(100% - 48px));
    max-height: min(520px, calc(100% - 48px));
    display: grid;
    grid-template-rows: auto 1fr;
    border-radius: 10px;
    background: rgba(28, 30, 38, 0.98);
    border: 1px solid rgba(120, 130, 150, 0.45);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .help-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    border-bottom: 1px solid rgba(120, 130, 150, 0.3);
  }

  .help-tabs {
    display: flex;
    gap: 4px;
  }

  .help-tabs button {
    padding: 3px 10px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: rgba(222, 228, 238, 0.8);
    font-size: 11px;
    cursor: pointer;
  }

  .help-tabs button.active {
    background: rgba(91, 155, 213, 0.24);
    border-color: rgba(91, 155, 213, 0.5);
    color: rgba(235, 242, 252, 0.98);
  }

  .help-close {
    width: 22px;
    height: 22px;
    border: none;
    border-radius: 5px;
    background: transparent;
    color: rgba(222, 228, 238, 0.75);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .help-close:hover {
    background: rgba(220, 90, 90, 0.3);
  }

  .help-body {
    overflow-y: auto;
    padding: 10px 12px;
    display: grid;
    gap: 6px;
    align-content: start;
  }

  .help-row {
    display: grid;
    grid-template-columns: 172px 1fr;
    gap: 10px;
    align-items: baseline;
    font-size: 11px;
    color: rgba(210, 218, 230, 0.9);
  }

  .help-row kbd {
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(60, 65, 78, 0.7);
    border: 1px solid rgba(120, 130, 150, 0.4);
    color: rgba(235, 242, 252, 0.95);
    font-family: inherit;
    font-size: 10px;
    justify-self: start;
  }

  .help-row.glossary strong {
    color: rgba(151, 199, 247, 0.95);
    font-size: 11px;
  }
</style>
