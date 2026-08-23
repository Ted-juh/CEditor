<script>
  import { getSection, renameControl, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Eye from 'lucide-svelte/icons/eye';
  import CheckSquare from 'lucide-svelte/icons/square-check';
  import Lock from 'lucide-svelte/icons/lock';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));

  function set(prop, value) {
    if (!core?.id) return;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(`Core.${prop}`, value);
    } else {
      updateControlProperty(core.id, `Core.${prop}`, value);
    }
  }

  function handleInput(prop, e) {
    const el = e.target;
    let value = el.type === 'number' ? Number(el.value) : el.value;
    set(prop, value);
  }

  // `Core.name` never goes through `set`. Two reasons, and both are about it being the
  // script-addressable handle rather than an ordinary property:
  //
  //   - it has to be unique, and it has to survive being cleared, which is renameControl's job
  //     (stores/controls.js) — this field wrote it blind, exactly as the tree's rename used to;
  //   - it is never a multi-edit. `set` would call updateSelectedProperty for a multi-selection
  //     and give twelve controls one name in one keystroke, which is the bug in its purest form.
  //     A multi-selection shows the key object here, so the key object is what gets renamed.
  let nameNotice = $state('');

  function handleNameChange(e) {
    if (!core?.id) return;
    const typed = String(e.target.value ?? '').trim();
    const result = renameControl(core.id, e.target.value);
    const applied = result?.applied ?? typed;
    nameNotice = applied === typed
      ? ''
      : (typed ? `"${typed}" is taken — used "${applied}"` : `A component needs a name — used "${applied}"`);
    // The input is uncontrolled between renders, so put back whatever was actually applied.
    e.target.value = applied;
  }

  function handleToggle(prop) {
    set(prop, !core?.[prop]);
  }

  function selectAll(e) {
    e.target.select();
  }
</script>

{#if core}
  <div class="prop-card">
    <div class="prop-row">
      <span class="lbl">Name</span>
      <input class="val" type="text" value={core.name}
             onfocus={selectAll} onchange={handleNameChange} />
    </div>
    {#if nameNotice}
      <div class="name-notice" role="status">{nameNotice}</div>
    {/if}
    <div class="prop-row">
      <span class="lbl">Type</span>
      <span class="val readonly">{core.controlType}</span>
    </div>
    <div class="prop-row">
      <span class="lbl">Tooltip</span>
      <input class="val" type="text" value={core.tooltip ?? ''}
             onfocus={selectAll} onchange={(e) => handleInput('tooltip', e)} />
    </div>
    <div class="prop-row">
      <span class="lbl">A11y</span>
      <input class="val" type="text" value={core.screenReaderText ?? ''}
             onfocus={selectAll} onchange={(e) => handleInput('screenReaderText', e)} />
    </div>
    <!--
      `Core.stylePreset` was an editable text field on the most-visited card in the app, wired to
      a document field that NOTHING has ever read — no renderer, no exporter, no script API, no
      C++ side. Typing in it did nothing except dirty the panel. The input is gone rather than
      given a meaning it never had; card presets (properties/PresetFooter.svelte) are the real
      feature it looked like it was.

      The row survives for one case: a document saved while the field existed still carries the
      value, and deleting the author's text behind their back would be its own kind of dishonest.
      So a non-empty value is shown, marked for what it is, with a way to clear it — and once
      cleared the row is gone for good.
    -->
    {#if String(core.stylePreset ?? '').trim()}
      <div class="prop-row">
        <span class="lbl">Preset</span>
        <span class="val readonly legacy" title="Left over from a field that was never read by anything. Safe to clear.">{core.stylePreset}</span>
        <button class="clear-btn" title="Clear this unused value" onclick={() => set('stylePreset', '')}>Clear</button>
      </div>
    {/if}
    <div class="prop-row">
      <span class="lbl">State</span>
      <FlagStrip
        flags={[
          { key: 'visible', title: 'Visible', on: !!core.visible, icon: Eye },
          { key: 'enabled', title: 'Enabled', on: !!core.enabled, icon: CheckSquare },
          { key: 'locked', title: 'Locked', on: !!core.locked, icon: Lock },
        ]}
        ontoggle={(key) => handleToggle(key)}
      />
    </div>
    <div class="prop-row">
      <span class="lbl">Z-Index</span>
      <NumberCell value={core.zIndex} step={1} min={0} onchange={(v) => set('zIndex', v)} />
    </div>
    <div class="prop-row">
      <span class="lbl">Layer</span>
      <input class="val" type="text" value={core.layer}
             onfocus={selectAll} onchange={(e) => handleInput('layer', e)} />
    </div>
  </div>
{/if}

<style>
  .prop-card { display: flex; flex-direction: column; gap: 6px; }
  .prop-row { display: flex; align-items: center; gap: 8px; padding: 4px 6px; border-radius: 3px; }
  .prop-row:hover { background: #2A2A2A; }
  .lbl { color: #888; font-size: 11px; min-width: 54px; flex-shrink: 0; }
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .val:focus { border-color: var(--pp-field-focus, #5B9BD5); }
  .val.readonly { background: transparent; border-color: transparent; color: #666; }
  .val.legacy { font-style: italic; }
  .clear-btn { background: #2A2A2A; border: 1px solid #3A3A3A; border-radius: 3px; color: #999; font-size: 10px; font-family: inherit; padding: 3px 6px; cursor: pointer; flex-shrink: 0; }
  .clear-btn:hover { border-color: #5B9BD5; color: #DDD; }
  .name-notice { color: #E5A029; font-size: 10px; padding: 0 6px 2px 68px; }
</style>
