<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberInput from './NumberInput.svelte';

  let { control = null } = $props();

  const SUBTYPE_OPTIONS = {
    momentary: ['action', 'repeating', 'press_to_talk'],
    toggle: ['toggle', 'sticky'],
    radio: ['segmented', 'radio', 'tab'],
    cyclic: ['cycle', 'tri_state'],
    combobox: ['dropdown', 'searchable'],
    timed: ['hold_to_confirm', 'double_click'],
    one_shot: ['single_use'],
  };

  let core = $derived(getSection(control, 'Core'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let buttonType = $derived(String(behavior?.buttonType ?? inferButtonType(core?.controlType)));
  let subtypeOptions = $derived(SUBTYPE_OPTIONS[buttonType] ?? ['custom']);
  let showSubtypeSelector = $derived(buttonType !== 'radio' && buttonType !== 'combobox');
  let momentarySubtype = $derived(String(behavior?.subtype ?? 'action'));
  let radioVisualStyle = $derived(String(behavior?.visualStyle ?? behavior?.subtype ?? 'radio'));
  let isRangeSpinbox = $derived(
    String(behavior?.family ?? '').trim().toLowerCase() === 'range'
    && String(behavior?.role ?? '').trim().toLowerCase() === 'spinbox'
  );
  // Range = two-value min/max spinner; Number = single-value stepper.
  let isTwoValueRange = $derived(
    isRangeSpinbox && String(behavior?.valueMode ?? 'single').trim().toLowerCase() === 'range'
  );
  let parts = $derived(getSection(control, 'Parts'));
  // The value glyph size lives on whichever value part the control uses
  // (valueField for Number, lowField for the two-value Range).
  let valueFontSize = $derived(numberOr(
    parts?._children?.valueField?._children?.Text?._children?.Font?.size
    ?? parts?._children?.lowField?._children?.Text?._children?.Font?.size,
    12
  ));

  function inferButtonType(controlType = '') {
    switch (String(controlType ?? '')) {
      case 'ToggleButton': return 'toggle';
      case 'RadioButtonGroup': return 'radio';
      case 'CyclicButton': return 'cyclic';
      case 'Combobox': return 'combobox';
      case 'TimedButton': return 'timed';
      case 'OneShotButton': return 'one_shot';
      default: return 'momentary';
    }
  }

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function set(prop, value) {
    if (!core?.id) return;
    const path = `Behavior.${prop}`;
    if ($selectedComponentIds.size > 1) {
      updateSelectedProperty(path, value);
    } else {
      updateControlProperty(core.id, path, value);
    }
  }

  // The spinbox glyphs live in separate parts (valueField/decrement/increment
  // for Number; lowField/highField/decrement/increment for Range). Keeping them
  // a single uniform size is the sensible default; drive whichever exist from
  // one cell.
  function setValueFontSize(value) {
    if (!core?.id) return;
    const size = Math.max(4, numberOr(value, 12));
    const present = parts?._children ?? {};
    for (const partName of ['decrement', 'valueField', 'increment', 'lowField', 'highField']) {
      if (present[partName]) {
        updateControlProperty(core.id, `Parts.${partName}.Text.Font.size`, size);
      }
    }
  }

  // Editing a two-value default also refreshes the static field text so the
  // editor (design view, where live bindings don't run) shows the new value.
  function setStartValue(value) {
    if (!core?.id) return;
    const next = numberOr(value, 0);
    set('defaultStartValue', next);
    if (parts?._children?.lowField) {
      updateControlProperty(core.id, 'Parts.lowField.Text.content', String(next));
    }
  }

  function setEndValue(value) {
    if (!core?.id) return;
    const next = numberOr(value, 0);
    set('defaultEndValue', next);
    if (parts?._children?.highField) {
      updateControlProperty(core.id, 'Parts.highField.Text.content', String(next));
    }
  }

  function handleToggle(prop) {
    set(prop, !(behavior?.[prop] === true));
  }

  function handleSubtypeChange(nextSubtype) {
    const normalizedSubtype = String(nextSubtype ?? '').trim();
    set('subtype', normalizedSubtype);

    if (buttonType !== 'momentary') return;

    if (normalizedSubtype === 'repeating') {
      set('repeatEnabled', true);
      set('activeWhileHeld', false);
      return;
    }

    if (normalizedSubtype === 'press_to_talk') {
      set('activeWhileHeld', true);
      set('repeatEnabled', false);
      set('fireOn', 'onPressStart');
      return;
    }

    set('activeWhileHeld', false);
    set('repeatEnabled', false);
  }
</script>

{#if behavior}
  <PropertySection title="Behavior">
    <PropertyCell label="Type" span={showSubtypeSelector ? 2 : 4} hint="Behavior is defined by the inserted button type.">
      <input class="val" type="text" value={buttonType} readonly />
    </PropertyCell>
    {#if showSubtypeSelector}
      <PropertyCell label="Subtype" span={2} hint="Choose the exact behavior variant for this button type.">
        <select class="val" value={behavior.subtype ?? subtypeOptions[0]} onchange={(event) => handleSubtypeChange(event.target.value)}>
          {#each subtypeOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
    {/if}
  </PropertySection>

  {#if isRangeSpinbox}
    <PropertySection title="Value">
      <PropertyCell label="Min" span={2} hint="Lower bound the values are clamped to.">
        <NumberInput value={behavior.min ?? 0} step={1} onchange={(value) => set('min', value)} />
      </PropertyCell>
      <PropertyCell label="Max" span={2} hint="Upper bound the values are clamped to.">
        <NumberInput value={behavior.max ?? 100} step={1} onchange={(value) => set('max', value)} />
      </PropertyCell>
      <PropertyCell label="Step" span={2} hint="Increment per step / stepper click.">
        <NumberInput value={behavior.step ?? 1} step={1} min={0} onchange={(value) => set('step', value)} />
      </PropertyCell>
      <PropertyCell label="Integer" span={2} hint="Round values to whole numbers.">
        <PropertyToggle value={String(behavior.valueType ?? '') === 'int'} onchange={() => set('valueType', String(behavior.valueType ?? '') === 'int' ? 'float' : 'int')} />
      </PropertyCell>
      {#if isTwoValueRange}
        <PropertyCell label="Low" span={2} hint="Default low (min) value of the range.">
          <NumberInput value={behavior.defaultStartValue ?? behavior.min ?? 0} step={1} onchange={(value) => setStartValue(value)} />
        </PropertyCell>
        <PropertyCell label="High" span={2} hint="Default high (max) value of the range.">
          <NumberInput value={behavior.defaultEndValue ?? behavior.max ?? 100} step={1} onchange={(value) => setEndValue(value)} />
        </PropertyCell>
      {/if}
      <PropertyCell label="Font Size" span={2} hint="Height (px) of the value and ± glyphs.">
        <NumberInput value={valueFontSize} step={1} min={4} onchange={(value) => setValueFontSize(value)} />
      </PropertyCell>
    </PropertySection>
  {/if}

  {#if buttonType === 'momentary'}
    <PropertySection title="Momentary">
      {#if momentarySubtype === 'action'}
        <PropertyCell label="Fire On" span={4} hint="Choose whether the action triggers on press start or on release.">
          <select class="val" value={behavior.fireOn ?? 'onRelease'} onchange={(event) => set('fireOn', event.target.value)}>
            <option value="onPressStart">onPressStart</option>
            <option value="onRelease">onRelease</option>
          </select>
        </PropertyCell>
      {:else if momentarySubtype === 'repeating'}
        <PropertyCell label="Mode" span={4} hint="Repeating buttons keep firing while the button is held.">
          <div class="behavior-note">Repeats while held.</div>
        </PropertyCell>
        <PropertyCell label="Delay" span={2} hint="Delay before repeating starts.">
          <NumberInput value={behavior.repeatDelay ?? 300} step={10} min={0} onchange={(value) => set('repeatDelay', value)} />
        </PropertyCell>
        <PropertyCell label="Interval" span={2} hint="Repeat interval while the button is held.">
          <NumberInput value={behavior.repeatInterval ?? 120} step={10} min={10} onchange={(value) => set('repeatInterval', value)} />
        </PropertyCell>
      {:else if momentarySubtype === 'press_to_talk'}
        <PropertyCell label="Mode" span={4} hint="Press-to-talk stays active only while the button is held.">
          <div class="behavior-note">Active only while held.</div>
        </PropertyCell>
      {/if}
    </PropertySection>
  {:else if buttonType === 'toggle'}
    <PropertySection title="Toggle">
      <PropertyCell label="Allow Off" span={2} hint="Permit the active state to be switched back off.">
        <PropertyToggle value={behavior.allowUncheck !== false} onchange={() => set('allowUncheck', !(behavior.allowUncheck !== false))} />
      </PropertyCell>
      <PropertyCell label="Default On" span={2} hint="Start this toggle in the active state.">
        <PropertyToggle value={behavior.defaultValue === true} onchange={() => set('defaultValue', !(behavior.defaultValue === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'radio'}
    <PropertySection title="Radio Group">
      <PropertyCell label="Style" span={2} hint="Choose the visual style for the group items.">
        <select class="val" value={radioVisualStyle} onchange={(event) => set('visualStyle', event.target.value)}>
          <option value="radio">radio</option>
          <option value="segmented">segmented</option>
          <option value="tab">tab</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Layout" span={1} hint="Horizontal lays items in rows, vertical stacks them in one column by default.">
        <select class="val" value={behavior.orientation ?? 'horizontal'} onchange={(event) => set('orientation', event.target.value)}>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Columns" span={1} hint="Set to 0 for auto layout, or 2 for a 2 x 2 grid with four items.">
        <NumberInput value={behavior.itemColumns ?? 0} step={1} min={0} onchange={(value) => set('itemColumns', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Select" span={2} hint="Single keeps one item active, multi allows several at once.">
        <select class="val" value={behavior.selectionMode ?? 'single'} onchange={(event) => set('selectionMode', event.target.value)}>
          <option value="single">single</option>
          <option value="multi">multi</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Deselect" span={2} hint="Allow the selected item to be turned off again.">
        <PropertyToggle value={behavior.allowDeselect === true} onchange={() => handleToggle('allowDeselect')} />
      </PropertyCell>
      <PropertyCell label="Group ID" span={2} hint="Optional logical group id for external routing.">
        <input class="val" type="text" value={behavior.groupId ?? ''} onchange={(event) => set('groupId', event.target.value)} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'cyclic'}
    <PropertySection title="Cyclic">
      <PropertyCell label="Wrap" span={2} hint="Wrap to the first row after the last state.">
        <PropertyToggle value={behavior.wrapBehavior !== false} onchange={() => set('wrapBehavior', !(behavior.wrapBehavior !== false))} />
      </PropertyCell>
      <PropertyCell label="Mixed" span={2} hint="Allow a mixed state where the design calls for it.">
        <PropertyToggle value={behavior.allowMixed === true} onchange={() => handleToggle('allowMixed')} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'combobox'}
    <PropertySection title="Combobox">
      <PropertyCell label="Mode" span={2} hint="Dropdown uses the value rows as selectable options.">
        <select class="val" value={behavior.subtype ?? 'dropdown'} onchange={(event) => handleSubtypeChange(event.target.value)}>
          <option value="dropdown">dropdown</option>
          <option value="searchable">searchable</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Default" span={2} hint="Internal value selected when the panel opens.">
        <input class="val" type="text" value={behavior.defaultValue ?? ''} onchange={(event) => set('defaultValue', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Group ID" span={2} hint="Optional logical group id for external routing.">
        <input class="val" type="text" value={behavior.groupId ?? ''} onchange={(event) => set('groupId', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Emit Value" span={2} hint="Expose selected value changes to the future scripting/runtime layer.">
        <PropertyToggle value={behavior.emitValueChange === true} onchange={() => set('emitValueChange', !(behavior.emitValueChange === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'timed'}
    <PropertySection title="Timed">
      <PropertyCell label="Hold ms" span={2} hint="Required hold time for hold-to-confirm buttons.">
        <NumberInput value={behavior.holdDuration ?? 1200} step={50} min={0} onchange={(value) => set('holdDuration', value)} />
      </PropertyCell>
      <PropertyCell label="Clicks" span={1} hint="Required clicks for multi-click buttons.">
        <NumberInput value={behavior.requiredClicks ?? 2} step={1} min={1} onchange={(value) => set('requiredClicks', Math.max(1, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Window" span={1} hint="Allowed time window between required clicks.">
        <NumberInput value={behavior.clickWindow ?? 350} step={10} min={50} onchange={(value) => set('clickWindow', value)} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'one_shot'}
    <PropertySection title="One-Shot">
      <PropertyCell label="Disable" span={2} hint="Disable the button after the first successful use.">
        <PropertyToggle value={behavior.disableAfterUse !== false} onchange={() => set('disableAfterUse', !(behavior.disableAfterUse !== false))} />
      </PropertyCell>
      <PropertyCell label="Lockout" span={2} hint="Temporary lockout duration after firing. Zero keeps it disabled.">
        <NumberInput value={behavior.lockoutDuration ?? 0} step={50} min={0} onchange={(value) => set('lockoutDuration', value)} />
      </PropertyCell>
    </PropertySection>
  {/if}

  <PropertySection title="Runtime">
    <PropertyCell label="Focusable" span={2} hint="Allow the control to receive keyboard focus in preview/runtime.">
      <PropertyToggle value={behavior.focusable !== false} onchange={() => set('focusable', !(behavior.focusable !== false))} />
    </PropertyCell>
    <PropertyCell label="Keyboard" span={2} hint="Enable keyboard activation.">
      <PropertyToggle value={behavior.keyboardEnabled !== false} onchange={() => set('keyboardEnabled', !(behavior.keyboardEnabled !== false))} />
    </PropertyCell>
    <PropertyCell label="Emit Click" span={2} hint="Expose click events to the future scripting/runtime layer.">
      <PropertyToggle value={behavior.emitClick !== false} onchange={() => set('emitClick', !(behavior.emitClick !== false))} />
    </PropertyCell>
    <PropertyCell label="Emit State" span={2} hint="Expose state changes to the future scripting/runtime layer.">
      <PropertyToggle value={behavior.emitStateChange !== false} onchange={() => set('emitStateChange', !(behavior.emitStateChange !== false))} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val {
    width: 100%;
    min-width: 0;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
  }

  .val:focus {
    border-color: #5B9BD5;
  }

  .behavior-note {
    width: 100%;
    min-height: 26px;
    display: flex;
    align-items: center;
    padding: 0 8px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #B8B8B8;
    font-size: 11px;
  }
</style>
