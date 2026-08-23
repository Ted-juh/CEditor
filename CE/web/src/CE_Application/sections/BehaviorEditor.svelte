<script>
  import { getSection, updateControlProperty, updateSelectedProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { createDefaultInteractiveSections } from '../models/interactionDefaults.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import FlagStrip from '../properties/FlagStrip.svelte';
  import Segmented from '../properties/Segmented.svelte';
  import Repeat from 'lucide-svelte/icons/repeat';
  import Blend from 'lucide-svelte/icons/blend';
  import Focus from 'lucide-svelte/icons/focus';
  import Keyboard from 'lucide-svelte/icons/keyboard';
  import MousePointerClick from 'lucide-svelte/icons/mouse-pointer-click';
  import Activity from 'lucide-svelte/icons/activity';
  import Settings2 from 'lucide-svelte/icons/settings-2';
  import Hash from 'lucide-svelte/icons/hash';
  import Zap from 'lucide-svelte/icons/zap';
  import ToggleRight from 'lucide-svelte/icons/toggle-right';
  import CircleDot from 'lucide-svelte/icons/circle-dot';
  import RotateCw from 'lucide-svelte/icons/rotate-cw';
  import ChevronsUpDown from 'lucide-svelte/icons/chevrons-up-down';
  import Clock from 'lucide-svelte/icons/clock';
  import Target from 'lucide-svelte/icons/target';
  import Play from 'lucide-svelte/icons/play';
  import Gauge from 'lucide-svelte/icons/gauge';
  import { VALUE_FLOW, valueFlowOf } from '../utils/displayMode.js';

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
  // Range = two-value min/max control (spinner OR slider variant); Number = the
  // single-value stepper. isTwoValueRange holds across both Range variants so the
  // Value inspector (and the variant selector) stays reachable after switching.
  let isRangeFamily = $derived(String(behavior?.family ?? '').trim().toLowerCase() === 'range');
  let isTwoValueRange = $derived(
    isRangeFamily && String(behavior?.valueMode ?? 'single').trim().toLowerCase() === 'range'
  );
  let rangeVariant = $derived(
    String(behavior?.variant ?? (String(behavior?.role ?? '').trim().toLowerCase() === 'slider' ? 'slider' : 'spinner'))
  );
  let showValueSection = $derived(isRangeSpinbox || isTwoValueRange);
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

  // Switch a two-value Range between the boxed spinner and the dual-handle
  // slider. Both share the range engine, so we regenerate the interactive
  // sections for the target rendering (spinbox parts vs slider parts) while
  // carrying the value config (bounds, step, low/high, int) across.
  function setVariant(variant) {
    if (!core?.id) return;
    const target = variant === 'slider' ? 'slider' : 'spinner';
    if (rangeVariant === target) return;

    const b = behavior ?? {};
    const preserved = {
      variant: target,
      valueMode: 'range',
      valueType: b.valueType ?? 'int',
      min: numberOr(b.min, 0),
      max: numberOr(b.max, 100),
      step: numberOr(b.step, 1),
      defaultStartValue: numberOr(b.defaultStartValue, numberOr(b.min, 0)),
      defaultEndValue: numberOr(b.defaultEndValue, numberOr(b.max, 100)),
    };

    // 'Slider' gives role:'slider' + slider parts; 'Range' gives the spinbox
    // spinner. Merge the preserved value config on top of the generated behavior.
    const sections = createDefaultInteractiveSections(target === 'slider' ? 'Slider' : 'Range');
    updateControlProperty(core.id, 'Behavior', { ...sections.Behavior, ...preserved });
    updateControlProperty(core.id, 'Parts', sections.Parts);
    updateControlProperty(core.id, 'Bindings', sections.Bindings);
    updateControlProperty(core.id, 'States', sections.States);
    updateControlProperty(core.id, 'Animations', sections.Animations);
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
  <PropertySection title="Value flow" icon={Gauge}>
    <PropertyCell
      label="Direction"
      span={4}
      hint="Two-way is a normal control: the device moves it and moving it sends. Display is read-only — it shows an inbound value and takes no input, which is what a meter, a bound LCD field or a lit pad is. Input sends but is not moved by feedback."
    >
      <Segmented
        ariaLabel="Value flow"
        value={valueFlowOf(behavior)}
        options={[
          { value: VALUE_FLOW.twoWay, label: 'Two-way' },
          { value: VALUE_FLOW.display, label: 'Display' },
          { value: VALUE_FLOW.input, label: 'Input' },
        ]}
        onchange={(next) => set('valueFlow', next)}
      />
    </PropertyCell>
    {#if valueFlowOf(behavior) === VALUE_FLOW.display}
      <PropertyCell label="Read-only" span={4} hint="A display takes no drag, wheel, keyboard or focus, and exports no host parameter — a DAW lane on it would be overwritten by the next feedback frame.">
        <span class="val" style="opacity:.75">Input off · not a tab stop · no host parameter</span>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Behavior" icon={Settings2}>
    <PropertyCell label="Type" span={showSubtypeSelector ? 2 : 4} hint="Behavior is defined by the inserted button type.">
      <input class="val" type="text" value={buttonType} readonly />
    </PropertyCell>
    {#if showSubtypeSelector && String(behavior.valueType ?? '') !== 'text'}
      <PropertyCell label="Subtype" span={2} hint="Choose the exact behavior variant for this button type.">
        <select class="val" value={behavior.subtype ?? subtypeOptions[0]} onchange={(event) => handleSubtypeChange(event.target.value)}>
          {#each subtypeOptions as option}
            <option value={option}>{option}</option>
          {/each}
        </select>
      </PropertyCell>
    {/if}
    {#if String(behavior.valueType ?? '') === 'text'}
      <PropertyCell label="Initial text" span={4} hint="The field's starting value (Text section holds the empty-state placeholder).">
        <input class="val" type="text" value={behavior.defaultValue ?? ''} oninput={(event) => set('defaultValue', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Editable" span={1} hint="Allow keyboard text entry in preview / player.">
        <PropertyToggle value={behavior.keyboardEnabled !== false} onchange={(next) => set('keyboardEnabled', next)} />
      </PropertyCell>
      <PropertyCell label="Focusable" span={1} hint="Can receive keyboard focus (Tab).">
        <PropertyToggle value={behavior.focusable !== false} onchange={(next) => set('focusable', next)} />
      </PropertyCell>
    {/if}
  </PropertySection>

  {#if showValueSection}
    <PropertySection title="Value" icon={Hash}>
      {#if isTwoValueRange}
        <PropertyCell label="Variant" span={4} hint="Spinner = boxed [low] [− +] [high]; Slider = dual-handle min/max track.">
          <select class="val" value={rangeVariant} onchange={(event) => setVariant(event.target.value)}>
            <option value="spinner">Spinner (boxed)</option>
            <option value="slider">Slider (dual handle)</option>
          </select>
        </PropertyCell>
      {/if}
      <PropertyCell label="Min" span={1} compact hint="Lower bound the values are clamped to.">
        <NumberCell label="Min" value={behavior.min ?? 0} defaultValue={0} step={1} onchange={(value) => set('min', value)} />
      </PropertyCell>
      <PropertyCell label="Max" span={1} compact hint="Upper bound the values are clamped to.">
        <NumberCell label="Max" value={behavior.max ?? 100} defaultValue={100} step={1} onchange={(value) => set('max', value)} />
      </PropertyCell>
      <PropertyCell label="Step" span={1} compact hint="Increment per step / stepper click.">
        <NumberCell label="Step" value={behavior.step ?? 1} defaultValue={1} step={1} min={0} onchange={(value) => set('step', value)} />
      </PropertyCell>
      <PropertyCell label="Integer" span={1} hint="Round values to whole numbers.">
        <PropertyToggle value={String(behavior.valueType ?? '') === 'int'} onchange={() => set('valueType', String(behavior.valueType ?? '') === 'int' ? 'float' : 'int')} />
      </PropertyCell>
      {#if isTwoValueRange}
        <PropertyCell label="Low" span={1} compact hint="Default low (min) value of the range.">
          <NumberCell label="Low" value={behavior.defaultStartValue ?? behavior.min ?? 0} defaultValue={behavior.min ?? 0} step={1} onchange={(value) => setStartValue(value)} />
        </PropertyCell>
        <PropertyCell label="High" span={1} compact hint="Default high (max) value of the range.">
          <NumberCell label="High" value={behavior.defaultEndValue ?? behavior.max ?? 100} defaultValue={behavior.max ?? 100} step={1} onchange={(value) => setEndValue(value)} />
        </PropertyCell>
      {/if}
      {#if isRangeSpinbox}
        <PropertyCell label="Font Size" span={1} compact hint="Height (px) of the value and ± glyphs.">
          <NumberCell label="Size" value={valueFontSize} defaultValue={12} step={1} min={4} onchange={(value) => setValueFontSize(value)} />
        </PropertyCell>
      {/if}
    </PropertySection>
  {/if}

  {#if buttonType === 'momentary'}
    <PropertySection title="Momentary" icon={Zap}>
      {#if momentarySubtype === 'action'}
        <PropertyCell label="Fire On" span={4} hint="Choose whether the action triggers on press start or on release.">
          <Segmented
            ariaLabel="Fire on"
            value={behavior.fireOn ?? 'onRelease'}
            options={[
              { value: 'onPressStart', label: 'onPressStart' },
              { value: 'onRelease', label: 'onRelease' },
            ]}
            onchange={(v) => set('fireOn', v)}
          />
        </PropertyCell>
      {:else if momentarySubtype === 'repeating'}
        <PropertyCell label="Mode" span={4} hint="Repeating buttons keep firing while the button is held.">
          <div class="behavior-note">Repeats while held.</div>
        </PropertyCell>
        <PropertyCell label="Delay" span={1} compact hint="Delay before repeating starts.">
          <NumberCell label="Delay" value={behavior.repeatDelay ?? 300} defaultValue={300} step={10} min={0} onchange={(value) => set('repeatDelay', value)} />
        </PropertyCell>
        <PropertyCell label="Interval" span={1} compact hint="Repeat interval while the button is held.">
          <NumberCell label="Intvl" value={behavior.repeatInterval ?? 120} defaultValue={120} step={10} min={10} onchange={(value) => set('repeatInterval', value)} />
        </PropertyCell>
      {:else if momentarySubtype === 'press_to_talk'}
        <PropertyCell label="Mode" span={4} hint="Press-to-talk stays active only while the button is held.">
          <div class="behavior-note">Active only while held.</div>
        </PropertyCell>
      {/if}
    </PropertySection>
  {:else if buttonType === 'toggle'}
    <PropertySection title="Toggle" icon={ToggleRight}>
      <PropertyCell label="Allow Off" span={1} hint="Permit the active state to be switched back off.">
        <PropertyToggle value={behavior.allowUncheck !== false} onchange={() => set('allowUncheck', !(behavior.allowUncheck !== false))} />
      </PropertyCell>
      <PropertyCell label="Default On" span={1} hint="Start this toggle in the active state.">
        <PropertyToggle value={behavior.defaultValue === true} onchange={() => set('defaultValue', !(behavior.defaultValue === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'radio'}
    <PropertySection title="Radio Group" icon={CircleDot}>
      <PropertyCell label="Style" span={2} hint="Choose the visual style for the group items.">
        <Segmented
          ariaLabel="Visual style"
          value={radioVisualStyle}
          options={[
            { value: 'radio', label: 'radio' },
            { value: 'segmented', label: 'segmented' },
            { value: 'tab', label: 'tab' },
          ]}
          onchange={(v) => set('visualStyle', v)}
        />
      </PropertyCell>
      <PropertyCell label="Layout" span={1} hint="Horizontal lays items in rows, vertical stacks them in one column by default.">
        <select class="val" value={behavior.orientation ?? 'horizontal'} onchange={(event) => set('orientation', event.target.value)}>
          <option value="horizontal">horizontal</option>
          <option value="vertical">vertical</option>
        </select>
      </PropertyCell>
      <PropertyCell label="Columns" span={1} compact hint="Set to 0 for auto layout, or 2 for a 2 x 2 grid with four items.">
        <NumberCell label="Cols" value={behavior.itemColumns ?? 0} defaultValue={0} step={1} min={0} onchange={(value) => set('itemColumns', Math.max(0, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Select" span={2} hint="Single keeps one item active, multi allows several at once.">
        <Segmented
          ariaLabel="Selection mode"
          value={behavior.selectionMode ?? 'single'}
          options={[
            { value: 'single', label: 'single' },
            { value: 'multi', label: 'multi' },
          ]}
          onchange={(v) => set('selectionMode', v)}
        />
      </PropertyCell>
      <PropertyCell label="Deselect" span={1} hint="Allow the selected item to be turned off again.">
        <PropertyToggle value={behavior.allowDeselect === true} onchange={() => handleToggle('allowDeselect')} />
      </PropertyCell>
      <PropertyCell label="Group ID" span={2} hint="Optional logical group id for external routing.">
        <input class="val" type="text" value={behavior.groupId ?? ''} onchange={(event) => set('groupId', event.target.value)} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'cyclic'}
    <PropertySection title="Cyclic" icon={RotateCw}>
      <PropertyCell label="Allow" span={2} hint="Wrap to the first row after the last state, allow a mixed state. Hover a chip for its name.">
        <FlagStrip
          flags={[
            { key: 'wrap', title: 'Wrap — wrap to the first row after the last state', on: behavior.wrapBehavior !== false, icon: Repeat },
            { key: 'mixed', title: 'Mixed — allow a mixed state where the design calls for it', on: behavior.allowMixed === true, icon: Blend },
          ]}
          ontoggle={(key) => {
            if (key === 'wrap') set('wrapBehavior', !(behavior.wrapBehavior !== false));
            else if (key === 'mixed') handleToggle('allowMixed');
          }}
        />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'combobox'}
    <PropertySection title="Combobox" icon={ChevronsUpDown}>
      <PropertyCell label="Mode" span={2} hint="Dropdown uses the value rows as selectable options.">
        <Segmented
          ariaLabel="Combobox mode"
          value={behavior.subtype ?? 'dropdown'}
          options={[
            { value: 'dropdown', label: 'dropdown' },
            { value: 'searchable', label: 'searchable' },
          ]}
          onchange={(v) => handleSubtypeChange(v)}
        />
      </PropertyCell>
      <PropertyCell label="Default" span={2} hint="Internal value selected when the panel opens.">
        <input class="val" type="text" value={behavior.defaultValue ?? ''} onchange={(event) => set('defaultValue', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Group ID" span={2} hint="Optional logical group id for external routing.">
        <input class="val" type="text" value={behavior.groupId ?? ''} onchange={(event) => set('groupId', event.target.value)} />
      </PropertyCell>
      <PropertyCell label="Emit Value" span={1} hint="Expose selected value changes to the future scripting/runtime layer.">
        <PropertyToggle value={behavior.emitValueChange === true} onchange={() => set('emitValueChange', !(behavior.emitValueChange === true))} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'timed'}
    <PropertySection title="Timed" icon={Clock}>
      <PropertyCell label="Hold ms" span={1} compact hint="Required hold time for hold-to-confirm buttons.">
        <NumberCell label="Hold" value={behavior.holdDuration ?? 1200} defaultValue={1200} step={50} min={0} onchange={(value) => set('holdDuration', value)} />
      </PropertyCell>
      <PropertyCell label="Clicks" span={1} compact hint="Required clicks for multi-click buttons.">
        <NumberCell label="Clicks" value={behavior.requiredClicks ?? 2} defaultValue={2} step={1} min={1} onchange={(value) => set('requiredClicks', Math.max(1, Math.round(value)))} />
      </PropertyCell>
      <PropertyCell label="Window" span={1} compact hint="Allowed time window between required clicks.">
        <NumberCell label="Win" value={behavior.clickWindow ?? 350} defaultValue={350} step={10} min={50} onchange={(value) => set('clickWindow', value)} />
      </PropertyCell>
    </PropertySection>
  {:else if buttonType === 'one_shot'}
    <PropertySection title="One-Shot" icon={Target}>
      <PropertyCell label="Disable" span={1} hint="Disable the button after the first successful use.">
        <PropertyToggle value={behavior.disableAfterUse !== false} onchange={() => set('disableAfterUse', !(behavior.disableAfterUse !== false))} />
      </PropertyCell>
      <PropertyCell label="Lockout" span={1} compact hint="Temporary lockout duration after firing. Zero keeps it disabled.">
        <NumberCell label="Lock" value={behavior.lockoutDuration ?? 0} defaultValue={0} step={50} min={0} onchange={(value) => set('lockoutDuration', value)} />
      </PropertyCell>
    </PropertySection>
  {/if}

  <PropertySection title="Runtime" icon={Play}>
    <PropertyCell label="Input" span={2} hint="Keyboard focus, keyboard activation. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'focusable', title: 'Focusable — allow the control to receive keyboard focus in preview/runtime', on: behavior.focusable !== false, icon: Focus },
          { key: 'keyboard', title: 'Keyboard — enable keyboard activation', on: behavior.keyboardEnabled !== false, icon: Keyboard },
        ]}
        ontoggle={(key) => {
          if (key === 'focusable') set('focusable', !(behavior.focusable !== false));
          else if (key === 'keyboard') set('keyboardEnabled', !(behavior.keyboardEnabled !== false));
        }}
      />
    </PropertyCell>
    <PropertyCell label="Emit" span={2} hint="Emit click events and state changes. Hover a chip for its name.">
      <FlagStrip
        flags={[
          { key: 'click', title: 'Emit Click — expose click events to the future scripting/runtime layer', on: behavior.emitClick !== false, icon: MousePointerClick },
          { key: 'state', title: 'Emit State — expose state changes to the future scripting/runtime layer', on: behavior.emitStateChange !== false, icon: Activity },
        ]}
        ontoggle={(key) => {
          if (key === 'click') set('emitClick', !(behavior.emitClick !== false));
          else if (key === 'state') set('emitStateChange', !(behavior.emitStateChange !== false));
        }}
      />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
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
