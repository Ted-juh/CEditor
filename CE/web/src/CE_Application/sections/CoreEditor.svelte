<script>
  /**
   * Core — the identity card. The most-visited section in the panel.
   *
   * It was the last full-width inline-label holdout of any size: eight `.prop-row`s, one property
   * each, 394px for ten values, in a panel whose own 4-column grid fits four. The 2026-08-14
   * review measured it as the least dense idiom in the repo and it is now on the grid like
   * everything else — same cells, same labels, same hint plumbing, six rows instead of eight, and
   * the pairs that belong together (Type/Layer, State/Z-Index) sharing a row.
   */
  import { getSection, renameControl, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { BUILT_IN_CONTROL_SETS } from '../models/controlSets.js';
  import { anatomyOptions } from '../models/controlAnatomy.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyText from '../properties/PropertyText.svelte';
  import PropertyButton from '../properties/PropertyButton.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Eye from 'lucide-svelte/icons/eye';
  import CheckSquare from 'lucide-svelte/icons/square-check';
  import Lock from 'lucide-svelte/icons/lock';
  import Tag from 'lucide-svelte/icons/tag';
  import AudioLines from 'lucide-svelte/icons/audio-lines';

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

  // `Core.name` never goes through `set`. Two reasons, and both are about it being the
  // script-addressable handle rather than an ordinary property:
  //
  //   - it has to be unique, and it has to survive being cleared, which is renameControl's job
  //     (stores/controls.js) — this field wrote it blind, exactly as the tree's rename used to;
  //   - it is never a multi-edit. `set` would call updateSelectedProperty for a multi-selection
  //     and give twelve controls one name in one keystroke, which is the bug in its purest form.
  //     A multi-selection shows the key object here, so the key object is what gets renamed.
  let nameNotice = $state('');

  function handleNameChange(value, event) {
    if (!core?.id) return;
    const typed = String(value ?? '').trim();
    const result = renameControl(core.id, value);
    const applied = result?.applied ?? typed;
    nameNotice = applied === typed
      ? ''
      : (typed ? `"${typed}" is taken — used "${applied}"` : `A component needs a name — used "${applied}"`);
    // The input is uncontrolled between renders, so put back whatever was actually applied.
    if (event?.currentTarget) event.currentTarget.value = applied;
  }

  function selectAll(event) {
    event.currentTarget.select();
  }
</script>

{#if core}
  <PropertySection title="Control design" icon={Tag}>
    <PropertyCell label="Set" span={4} hint="Follow the panel, or pin a built-in design to this control so it keeps its look when copied to another panel. Your property edits take precedence.">
      <select class="val" value={core.controlSetId ?? ''} onchange={(e) => set('controlSetId', e.target.value)}>
        <option value="">Follow panel</option>
        {#each BUILT_IN_CONTROL_SETS as design}<option value={design.id}>{design.name}</option>{/each}
      </select>
    </PropertyCell>
    {#if anatomyOptions(core.controlType).length}
      <PropertyCell label="Form" span={4} hint="Changes the control's physical construction. Uses the existing control's value, input and MIDI behavior. Choose Original parts to use the Parts editor.">
        <select class="val" value={core.controlForm ?? ''} onchange={(e) => set('controlForm', e.target.value)}>
          <option value="">Follow set</option><option value="original">Original parts</option>
          {#each anatomyOptions(core.controlType) as [id, name]}<option value={id}>{name}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Size %" span={2} hint="Size of the mechanism within its control bounds."><NumberCell value={core.formSize ?? 100} min={60} max={115} step={5} onchange={(v) => set('formSize', v)} /></PropertyCell>
      <PropertyCell label="Depth %" span={2} hint="Highlight and pressed travel strength."><NumberCell value={core.formDepth ?? 60} min={0} max={100} step={5} onchange={(v) => set('formDepth', v)} /></PropertyCell>
      <PropertyCell label="Divisions" span={2} hint="Visual scale divisions. Does not quantize the value."><NumberCell value={core.formDivisions ?? 12} min={4} max={48} step={1} onchange={(v) => set('formDivisions', v)} /></PropertyCell>
      <PropertyCell label="Readout" span={2}><select class="val" value={core.formShowValue !== false ? 'yes' : 'no'} onchange={(e) => set('formShowValue', e.target.value === 'yes')}><option value="yes">Show</option><option value="no">Hide</option></select></PropertyCell>
      {#each [['formFaceColour','Face'],['formHousingColour','Housing'],['formInkColour','Ink'],['formLabelColour','Legends'],['formAccentColour','Indicator']] as [key, title]}
        <PropertyCell label={title} span={4} hint={'AARRGGBB colour or a set token such as {accent}.'}><PropertyText value={core[key] ?? ''} commit={(v) => set(key, v)} /></PropertyCell>
      {/each}
    {/if}
  </PropertySection>
  <PropertySection title="Identity" icon={Tag}>
    <PropertyCell label="Name" span={4} hint="The script-addressable handle. Must be unique; cleared names are filled in for you.">
      <PropertyText value={core.name} onfocus={selectAll} commit={handleNameChange} />
    </PropertyCell>
    {#if nameNotice}
      <PropertyCell label="" span={4} compact>
        <span class="name-notice" role="status">{nameNotice}</span>
      </PropertyCell>
    {/if}

    <PropertyCell label="Type" span={2} hint="The component type. Set when the component is created and not editable here.">
      <span class="readout">{core.controlType}</span>
    </PropertyCell>
    <PropertyCell label="Layer" span={2} hint="Free-text layer name, for organising the component tree.">
      <PropertyText value={core.layer} onfocus={selectAll} commit={(v) => set('layer', v)} />
    </PropertyCell>

    <PropertyCell label="Tooltip" span={4} hint="Hover text shown over the control in preview and in the player.">
      <PropertyText value={core.tooltip ?? ''} onfocus={selectAll} commit={(v) => set('tooltip', v)} />
    </PropertyCell>

    <PropertyCell label="A11y" span={4} hint="Screen-reader label, when the visible text is not descriptive enough.">
      <PropertyText value={core.screenReaderText ?? ''} onfocus={selectAll} commit={(v) => set('screenReaderText', v)} />
    </PropertyCell>

    <PropertyCell label="State" span={2} hint="Visible, enabled and locked, for this component on the canvas. The fourth chip makes its value automatable in a DAW when the panel is exported as a plugin; switch it off for settings a host should not move.">
      <FlagStrip
        flags={[
          { key: 'visible', title: 'Visible', on: !!core.visible, icon: Eye },
          { key: 'enabled', title: 'Enabled', on: !!core.enabled, icon: CheckSquare },
          { key: 'locked', title: 'Locked', on: !!core.locked, icon: Lock },
          // Absent means on: a control saved before the field existed was always exported.
          { key: 'hostAutomation', title: 'Automatable in DAW', on: core.hostAutomation !== false, icon: AudioLines },
        ]}
        ontoggle={(key, next) => set(key, next)}
      />
    </PropertyCell>
    <PropertyCell label="Z-Index" span={2} hint="Stacking order within the panel. Higher draws in front.">
      <NumberCell value={core.zIndex} step={1} min={0} onchange={(v) => set('zIndex', v)} />
    </PropertyCell>

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
      <PropertyCell label="Preset" span={3} hint="Left over from a field nothing ever read. Safe to clear.">
        <!-- A span, not a read-only input: an input says "this is a field you could type in", and
             the whole point of this row is that it is not one. -->
        <span class="readout legacy" title="Left over from a field that was never read by anything. Safe to clear.">{core.stylePreset}</span>
      </PropertyCell>
      <PropertyCell label="" span={1} compact>
        <PropertyButton label="Clear" title="Clear this unused value" onclick={() => set('stylePreset', '')} />
      </PropertyCell>
    {/if}
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .readout {
    display: flex;
    align-items: center;
    min-width: 0;
    height: var(--pp-field-height, 26px);
    padding: var(--pp-field-padding, 0 6px);
    color: #666;
    font-size: var(--pp-field-font, 11px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .readout.legacy {
    font-style: italic;
  }

  .name-notice {
    color: #E5A029;
    font-size: 10px;
    line-height: 1.3;
    align-self: center;
  }
</style>
