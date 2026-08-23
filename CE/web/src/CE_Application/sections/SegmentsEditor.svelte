<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { segmentEditScope } from '../stores/segmentEditScope.js';
  import BorderCornerWidget from '../properties/BorderCornerWidget.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import { BASE_STATE_TARGET } from '../utils/stateTargets.js';
  import {
    ALL_SEGMENT_TARGET,
    buildSegmentTargetOptions,
    normalizeSegmentTargetIds,
  } from '../utils/segmentTargets.js';
  import {
    setSegmentEditScopeAll,
    toggleSegmentEditScopeSegment,
  } from '../stores/segmentEditScope.js';
  import { deepClone } from '../utils/deepClone.js';
  import {
    createEmptyRadioSegmentStyle,
    RADIO_INDICATOR_SHAPE_OPTIONS,
    RADIO_SEGMENT_PART_OPTIONS,
    resolveRadioSegmentStyle,
  } from '../utils/radioSegmentStyle.js';

  const MIXED_VALUE = '__mixed__';

  const PART_FIELDS = {
    whole: [
      { key: 'fillColour', label: 'Fill', type: 'color' },
      { key: 'paddingX', label: 'Padding X', type: 'number', step: 1, min: 0 },
      { key: 'paddingY', label: 'Padding Y', type: 'number', step: 1, min: 0 },
      { key: 'indicatorGap', label: 'Indicator Gap', type: 'number', step: 1, min: 0 },
    ],
    indicatorOuter: [
      { key: 'visible', label: 'Visible', type: 'toggle' },
      { key: 'shape', label: 'Shape', type: 'select', options: RADIO_INDICATOR_SHAPE_OPTIONS },
      { key: 'width', label: 'Width', type: 'number', step: 1, min: 0 },
      { key: 'height', label: 'Height', type: 'number', step: 1, min: 0 },
      { key: 'radius', label: 'Radius', type: 'number', step: 1, min: 0 },
      { key: 'fillColour', label: 'Fill', type: 'color' },
      { key: 'borderColour', label: 'Border', type: 'color' },
      { key: 'borderWidth', label: 'Border Width', type: 'number', step: 1, min: 0 },
    ],
    indicatorInner: [
      { key: 'visible', label: 'Visible', type: 'toggle' },
      { key: 'selectedOnly', label: 'Selected Only', type: 'toggle' },
      { key: 'shape', label: 'Shape', type: 'select', options: RADIO_INDICATOR_SHAPE_OPTIONS },
      { key: 'width', label: 'Width', type: 'number', step: 1, min: 0 },
      { key: 'height', label: 'Height', type: 'number', step: 1, min: 0 },
      { key: 'radius', label: 'Radius', type: 'number', step: 1, min: 0 },
      { key: 'fillColour', label: 'Fill', type: 'color' },
      { key: 'borderColour', label: 'Border', type: 'color' },
      { key: 'borderWidth', label: 'Border Width', type: 'number', step: 1, min: 0 },
    ],
    label: [
      { key: 'colour', label: 'Colour', type: 'color' },
      { key: 'fontSize', label: 'Size', type: 'number', step: 1, min: 1 },
      { key: 'fontWeight', label: 'Weight', type: 'number', step: 100, min: 100 },
      { key: 'letterSpacing', label: 'Letter Spacing', type: 'number', step: 0.1 },
    ],
  };

  let { control = null, stateTargetKey = BASE_STATE_TARGET } = $props();

  let activePartId = $state('whole');

  let core = $derived(getSection(control, 'Core'));
  let behavior = $derived(getSection(control, 'Behavior'));
  let background = $derived(getSection(control, 'Background'));
  let text = $derived(getSection(control, 'Text'));
  let valueSection = $derived(getSection(control, 'Value'));
  let statesSection = $derived(getSection(control, 'States'));
  let multiEdit = $derived($selectedComponentIds.size > 1);
  let buttonType = $derived(String(behavior?.buttonType ?? '').trim().toLowerCase());
  let rows = $derived(Array.isArray(valueSection?.rows) ? valueSection.rows : []);
  let activeSegmentScope = $derived($segmentEditScope);
  let activeStateName = $derived(
    stateTargetKey && stateTargetKey !== BASE_STATE_TARGET
      ? String(stateTargetKey)
      : ''
  );
  let activeStateNode = $derived(activeStateName ? statesSection?._children?.[activeStateName] ?? null : null);
  let editingCheckedState = $derived(
    normalizeKey(activeStateName) === 'selected'
    || normalizeKey(activeStateName) === 'checked'
    || activeStateNode?.when?.checked === true
  );
  let selectedSegmentIds = $derived(
    activeSegmentScope?.mode === 'segments'
      ? normalizeSegmentTargetIds(valueSection, activeSegmentScope?.segmentIds ?? [])
      : []
  );
  let segmentTargets = $derived(buildSegmentTargetOptions(valueSection));
  let isEditingAllSegments = $derived(selectedSegmentIds.length === 0);
  let targetRows = $derived(
    isEditingAllSegments
      ? []
      : rows.filter((row) => selectedSegmentIds.includes(String(row?.id ?? '')))
  );
  let currentFieldList = $derived(PART_FIELDS[activePartId] ?? PART_FIELDS.whole);
  let scopeSummary = $derived.by(() => {
    const stateLabel = activeStateName || 'Base';
    const segmentLabel = isEditingAllSegments
      ? 'All Segments'
      : targetRows.map((row, index) => getRowLabel(row, index)).join(' + ');
    const partLabel = RADIO_SEGMENT_PART_OPTIONS.find((part) => part.id === activePartId)?.label ?? 'Whole Item';
    return `${stateLabel} | ${segmentLabel || 'All Segments'} | ${partLabel}`;
  });
  let stateLayerLabel = $derived(activeStateName || 'Base');
  let segmentLayerLabel = $derived.by(() => (
    isEditingAllSegments
      ? 'All Segments'
      : targetRows.map((row, index) => getRowLabel(row, index)).join(' + ')
  ));

  function normalizeKey(value) {
    return String(value ?? '').trim().toLowerCase();
  }

  function getRowLabel(row, index = 0) {
    return String(row?.displayText ?? row?.internalValue ?? row?.id ?? `Option ${index + 1}`);
  }

  function handleSegmentTargetClick(targetId) {
    if (!targetId || targetId === ALL_SEGMENT_TARGET) {
      setSegmentEditScopeAll();
      return;
    }

    toggleSegmentEditScopeSegment(targetId);
  }

  function objectPathValue(source, path = '') {
    if (!source || !path) return source;
    return String(path)
      .split('.')
      .reduce((current, part) => (current && current[part] !== undefined ? current[part] : undefined), source);
  }

  function setObjectPath(target, path = '', value) {
    const parts = String(path ?? '').split('.').filter(Boolean);
    if (!parts.length || !target || typeof target !== 'object') return;

    let current = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
        current[key] = {};
      }
      current = current[key];
    }

    current[parts[parts.length - 1]] = value;
  }

  function deleteObjectPath(target, path = '') {
    const parts = String(path ?? '').split('.').filter(Boolean);
    if (!parts.length || !target || typeof target !== 'object') return;

    let current = target;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const key = parts[index];
      if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) return;
      current = current[key];
    }

    delete current[parts[parts.length - 1]];
  }

  function pruneEmptyObjects(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;

    for (const key of Object.keys(value)) {
      const child = value[key];
      if (pruneEmptyObjects(child)) {
        delete value[key];
      }
    }

    return Object.keys(value).length === 0;
  }

  function createStyleObject() {
    return deepClone(valueSection?.segmentStyle ?? createEmptyRadioSegmentStyle());
  }

  function createStatePatchObject(stateName = activeStateName) {
    return deepClone(statesSection?._children?.[stateName]?.patches?.segments ?? createEmptyRadioSegmentStyle());
  }

  function currentSelectedFlag(rowId = '') {
    if (!editingCheckedState) return false;
    return isEditingAllSegments || selectedSegmentIds.includes(String(rowId ?? ''));
  }

  function resolveEditorStyle(
    row,
    {
      includeRowBaseOverrides = true,
      includeStateRowOverrides = true,
      includeActiveState = true,
      sharedOnly = false,
    } = {},
  ) {
    return resolveRadioSegmentStyle({
      row: sharedOnly ? (rows[0] ?? row ?? null) : row,
      behavior,
      background,
      text,
      valueSection,
      statesSection,
      selected: currentSelectedFlag(row?.id),
      activeStateNames: includeActiveState && activeStateName ? [activeStateName] : [],
      includeRowBaseOverrides,
      includeStateRowOverrides,
    });
  }

  let sharedCurrentStyle = $derived(resolveEditorStyle(rows[0] ?? null, {
    includeRowBaseOverrides: false,
    includeStateRowOverrides: false,
    includeActiveState: !!activeStateName,
    sharedOnly: true,
  }));
  let sharedInheritedStyle = $derived(resolveEditorStyle(rows[0] ?? null, {
    includeRowBaseOverrides: false,
    includeStateRowOverrides: false,
    includeActiveState: false,
    sharedOnly: true,
  }));
  let rowCurrentStyleMap = $derived.by(() => {
    const map = new Map();
    for (const row of rows) {
      map.set(String(row?.id ?? ''), resolveEditorStyle(row, {
        includeRowBaseOverrides: true,
        includeStateRowOverrides: true,
        includeActiveState: !!activeStateName,
      }));
    }
    return map;
  });
  let rowInheritedStyleMap = $derived.by(() => {
    const map = new Map();
    for (const row of rows) {
      map.set(String(row?.id ?? ''), resolveEditorStyle(row, {
        includeRowBaseOverrides: !!activeStateName,
        includeStateRowOverrides: false,
        includeActiveState: !!activeStateName,
      }));
    }
    return map;
  });
  let wholeShellValues = $derived.by(() => {
    if (isEditingAllSegments) {
      return [sharedCurrentStyle?.whole ?? null];
    }
    return targetRows.map((row) => rowCurrentStyleMap.get(String(row?.id ?? ''))?.whole ?? null);
  });
  let wholeShellMixed = $derived.by(() => {
    const values = wholeShellValues.filter(Boolean);
    if (values.length <= 1) return false;
    const [first, ...rest] = values;
    return rest.some((value) => !compareValues(value?.border, first?.border) || !compareValues(value?.corners, first?.corners));
  });
  let wholeShellEditorValue = $derived.by(() => {
    const firstValue = wholeShellValues.find(Boolean);
    return deepClone(firstValue ?? sharedCurrentStyle?.whole ?? { border: {}, corners: {} });
  });

  function compareValues(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function fieldState(field) {
    const values = isEditingAllSegments
      ? [sharedCurrentStyle?.[activePartId]?.[field.key]]
      : targetRows.map((row) => rowCurrentStyleMap.get(String(row?.id ?? ''))?.[activePartId]?.[field.key]);

    if (!values.length) {
      return { mixed: false, value: undefined };
    }

    const firstValue = values[0];
    const mixed = values.some((value) => !compareValues(value, firstValue));
    return {
      mixed,
      value: mixed ? undefined : firstValue,
    };
  }

  function normalizeFieldValue(field, rawValue) {
    if (rawValue === null) return null;

    if (field.type === 'toggle') {
      return rawValue === true;
    }

    const textValue = String(rawValue ?? '').trim();
    if (!textValue) return null;

    if (field.type === 'number') {
      const numeric = Number(textValue);
      if (!Number.isFinite(numeric)) return null;
      if (field.min != null && numeric < field.min) return field.min;
      return numeric;
    }

    return textValue;
  }

  function targetRowIdsForWrite() {
    return isEditingAllSegments
      ? [null]
      : targetRows.map((row) => String(row?.id ?? '')).filter(Boolean);
  }

  function inheritedFieldValue(rowId, field) {
    if (!rowId) {
      return sharedInheritedStyle?.[activePartId]?.[field.key];
    }

    return rowInheritedStyleMap.get(String(rowId))?.[activePartId]?.[field.key];
  }

  function cleanupStyleContainer(container) {
    if (!container || typeof container !== 'object') return;

    for (const partId of Object.keys(container.shared ?? {})) {
      pruneEmptyObjects(container.shared?.[partId]);
      if (Object.keys(container.shared?.[partId] ?? {}).length === 0) {
        delete container.shared[partId];
      }
    }

    for (const [rowId, rowParts] of Object.entries(container.rows ?? {})) {
      for (const partId of Object.keys(rowParts ?? {})) {
        pruneEmptyObjects(rowParts?.[partId]);
        if (Object.keys(rowParts?.[partId] ?? {}).length === 0) {
          delete rowParts[partId];
        }
      }
      if (Object.keys(rowParts ?? {}).length === 0) {
        delete container.rows[rowId];
      }
    }

    if (!container.shared || typeof container.shared !== 'object') container.shared = {};
    if (!container.rows || typeof container.rows !== 'object') container.rows = {};
  }

  function ensurePartBucket(container, rowId, partId) {
    if (!container.shared || typeof container.shared !== 'object') container.shared = {};
    if (!container.rows || typeof container.rows !== 'object') container.rows = {};

    if (!rowId) {
      if (!container.shared[partId] || typeof container.shared[partId] !== 'object') {
        container.shared[partId] = {};
      }
      return container.shared[partId];
    }

    if (!container.rows[rowId] || typeof container.rows[rowId] !== 'object') {
      container.rows[rowId] = {};
    }
    if (!container.rows[rowId][partId] || typeof container.rows[rowId][partId] !== 'object') {
      container.rows[rowId][partId] = {};
    }
    return container.rows[rowId][partId];
  }

  function wholeInheritedValue(rowId, path = '') {
    const source = !rowId
      ? sharedInheritedStyle?.whole
      : rowInheritedStyleMap.get(String(rowId))?.whole;
    return objectPathValue(source, path);
  }

  function captureWholeShellTarget(relativePath) {
    const targetIds = targetRowIdsForWrite();
    const stateName = activeStateName;
    return {
      type: 'callback',
      apply: (value) => writeWholeShellValue(relativePath, value, { targetIds, stateName }),
    };
  }

  function writeWholeShellValue(relativePath, nextValue, { targetIds = targetRowIdsForWrite(), stateName = activeStateName } = {}) {
    if (!core?.id || !relativePath) return;

    const nextContainer = stateName
      ? createStatePatchObject(stateName)
      : createStyleObject();

    for (const rowId of targetIds) {
      const bucket = ensurePartBucket(nextContainer, rowId, 'whole');
      const inheritedValue = wholeInheritedValue(rowId, relativePath);

      if (nextValue === null || compareValues(nextValue, inheritedValue)) {
        deleteObjectPath(bucket, relativePath);
      } else {
        setObjectPath(bucket, relativePath, deepClone(nextValue));
      }
    }

    cleanupStyleContainer(nextContainer);

    if (stateName) {
      updateControlProperty(core.id, `States.${stateName}.patches.segments`, nextContainer);
      return;
    }

    updateControlProperty(core.id, 'Value.segmentStyle', nextContainer);
  }

  function writeFieldValue(field, nextRawValue) {
    if (!core?.id) return;

    const nextValue = normalizeFieldValue(field, nextRawValue);
    const targetIds = targetRowIdsForWrite();
    const nextContainer = activeStateName
      ? createStatePatchObject()
      : createStyleObject();

    for (const rowId of targetIds) {
      const bucket = ensurePartBucket(nextContainer, rowId, activePartId);
      const inheritedValue = inheritedFieldValue(rowId, field);

      if (nextValue === null || compareValues(nextValue, inheritedValue)) {
        delete bucket[field.key];
      } else {
        bucket[field.key] = nextValue;
      }
    }

    cleanupStyleContainer(nextContainer);

    if (activeStateName) {
      updateControlProperty(core.id, `States.${activeStateName}.patches.segments`, nextContainer);
      return;
    }

    updateControlProperty(core.id, 'Value.segmentStyle', nextContainer);
  }

  function resetField(field) {
    writeFieldValue(field, null);
  }

  function buildWholeShellColorTarget({ path }) {
    return captureWholeShellTarget(path);
  }

  function buildWholeShellGradientTarget({ path }) {
    return captureWholeShellTarget(`${path}.gradient`);
  }
</script>

{#if multiEdit}
  <div class="placeholder">Segment styling is single-selection only.</div>
{:else if buttonType !== 'radio'}
  <div class="placeholder">Segment styling is available for radio groups.</div>
{:else if rows.length === 0}
  <div class="placeholder">Add value rows first so the segment editor has segments to target.</div>
{:else}
  <PropertySection title="Scope">
    <PropertyCell label="Editing" span={4} hint="States and Segments in the top bar define which portion of the radio group these properties affect.">
      <div class="scope-stack">
        <div class="scope-banner">
          <span class="scope-label">State Layer</span>
          <strong>{stateLayerLabel}</strong>
          <span class="scope-separator">/</span>
          <span class="scope-label">Segment Target</span>
          <strong>{segmentLayerLabel || 'All Segments'}</strong>
          <span class="scope-separator">/</span>
          <span class="scope-label">Part</span>
          <strong>{RADIO_SEGMENT_PART_OPTIONS.find((part) => part.id === activePartId)?.label ?? 'Whole Item'}</strong>
        </div>
        <div class="scope-help">
          Base means the normal state layer. The segment chips below decide whether you are editing all options or specific radio options.
        </div>
      </div>
    </PropertyCell>
    <PropertyCell label="Segments" span={4} hint="Choose the radio option(s) these segment style edits target.">
      <div class="segment-target-grid">
        {#each segmentTargets as target (target.id)}
          <button
            class="segment-target-chip"
            class:active={target.id === ALL_SEGMENT_TARGET ? selectedSegmentIds.length === 0 : selectedSegmentIds.includes(target.id)}
            type="button"
            title={target.id === ALL_SEGMENT_TARGET ? 'Edit all radio options' : `Edit ${target.label}`}
            onclick={() => handleSegmentTargetClick(target.id)}
          >
            {target.label}
          </button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="Part" span={4} hint="Choose which part of the segment you want to style.">
      <div class="part-strip">
        {#each RADIO_SEGMENT_PART_OPTIONS as part (part.id)}
          <button
            class="part-chip"
            class:active={activePartId === part.id}
            onclick={() => activePartId = part.id}
          >
            {part.label}
          </button>
        {/each}
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title={RADIO_SEGMENT_PART_OPTIONS.find((part) => part.id === activePartId)?.label ?? 'Segment'}>
    {#each currentFieldList as field (field.key)}
      {@const state = fieldState(field)}
      <PropertyCell
        label={field.label}
        span={field.type === 'toggle' ? 2 : 2}
        hint={`${field.label} for the currently targeted ${RADIO_SEGMENT_PART_OPTIONS.find((part) => part.id === activePartId)?.label?.toLowerCase() ?? 'segment part'}.`}
      >
        <div class="field-row">
          {#if field.type === 'toggle'}
            <button
              class="toggle-field"
              class:on={!state.mixed && state.value === true}
              class:mixed={state.mixed}
              onclick={() => writeFieldValue(field, state.mixed ? true : !(state.value === true))}
            >
              {state.mixed ? 'Mixed' : state.value === true ? 'On' : 'Off'}
            </button>
          {:else if field.type === 'select'}
            <select
              class="val"
              value={state.mixed ? MIXED_VALUE : String(state.value ?? '')}
              onchange={(event) => {
                const nextValue = event.currentTarget.value;
                if (nextValue === MIXED_VALUE) return;
                writeFieldValue(field, nextValue);
              }}
            >
              {#if state.mixed}
                <option value={MIXED_VALUE}>Mixed</option>
              {/if}
              {#each field.options ?? [] as option}
                <option value={option.value}>{option.label}</option>
              {/each}
            </select>
          {:else}
            <input
              class="val"
              type="text"
              value={state.mixed ? '' : (state.value ?? '')}
              placeholder={state.mixed ? 'Mixed' : ''}
              onchange={(event) => writeFieldValue(field, event.currentTarget.value)}
            />
          {/if}

          <button class="reset-btn" title="Reset to inherited value" onclick={() => resetField(field)}>
            Reset
          </button>
        </div>
      </PropertyCell>
    {/each}
  </PropertySection>

  {#if activePartId === 'whole'}
    <PropertySection title="Shell Border">
      {#if wholeShellMixed}
        <PropertyCell label="Scope" span={4} hint="The selected segments have different border or corner settings. Editing below writes to all of them.">
          <div class="note-card mixed-note">
            The selected segments currently differ. Editing this shell border writes the new values to all targeted segments.
          </div>
        </PropertyCell>
      {/if}
      <PropertyCell label="Shell" span={4} hint="This is the full border and corner editor for the segment shell, just like the main component border editor.">
        <div class="shell-editor">
          <BorderCornerWidget
            border={wholeShellEditorValue?.border ?? {}}
            corners={wholeShellEditorValue?.corners ?? {}}
            linked={wholeShellEditorValue?.corners?.linked ?? wholeShellEditorValue?.border?.linked ?? true}
            borderPath="border"
            cornersPath="corners"
            buildColorTarget={buildWholeShellColorTarget}
            buildGradientTarget={buildWholeShellGradientTarget}
            onupdate={(path, value) => writeWholeShellValue(path, value)}
          />
        </div>
      </PropertyCell>
    </PropertySection>
  {/if}

  <PropertySection title="Notes">
    <PropertyCell label="Behavior" span={4} hint="How segment overrides stack and what happens with multi-select editing.">
      <div class="note-card">
        `All` edits the shared layer for the whole group. Selecting individual segment names edits only those segments, and `Mixed` means the selected segments currently differ.
      </div>
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .placeholder {
    padding: 16px;
    color: #666;
    font-size: 11px;
  }

  .scope-banner {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid #303030;
    border-radius: 4px;
    background: #171717;
    color: #D7D7D7;
    font-size: 11px;
  }

  .scope-stack {
    width: 100%;
    display: grid;
    gap: 5px;
  }

  .scope-label {
    color: #8F8F8F;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.25px;
    text-transform: uppercase;
  }

  .scope-separator {
    color: #555;
  }

  .scope-help {
    color: #8E8E8E;
    font-size: 10px;
    line-height: 1.35;
  }

  .segment-target-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }

  .segment-target-chip {
    flex: 0 0 auto;
    min-width: 54px;
    border: 1px solid #454545;
    border-radius: 999px;
    background: #232323;
    color: #B6B6B6;
    cursor: pointer;
    font-size: 10px;
    font-weight: 700;
    font-family: inherit;
    line-height: 1;
    padding: 6px 10px;
  }

  .segment-target-chip:hover {
    background: #313131;
    border-color: #5A5A5A;
    color: #F2F2F2;
  }

  .segment-target-chip.active {
    background: #0E3F2A;
    border-color: #2E8B57;
    color: #FFF;
    box-shadow: 0 0 0 1px rgba(46, 139, 87, 0.25);
  }

  .part-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    width: 100%;
  }

  .part-chip {
    background: #202020;
    border: 1px solid #373737;
    border-radius: 999px;
    color: #BEBEBE;
    font-size: 11px;
    padding: 5px 10px;
    cursor: pointer;
    font-family: inherit;
  }

  .part-chip:hover {
    border-color: #5B9BD5;
    color: #F4F4F4;
  }

  .part-chip.active {
    background: #15364A;
    border-color: #2E617F;
    color: #FFF;
  }

  .field-row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
  }

  .val,
  .toggle-field {

    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    width: 100%;
    background: #1A1A1A;
    border: 1px solid #333;
    border-radius: 3px;
    color: #DDD;
    font-size: 11px;
    padding: 4px 6px;
    font-family: inherit;
    outline: none;
    height: 26px;
  }

  .val:focus {
    border-color: var(--pp-field-focus, #5B9BD5);
  }

  .toggle-field {
    cursor: pointer;
    text-align: left;
  }

  .toggle-field.on {
    background: #094771;
    border-color: #0B6EB5;
    color: #FFF;
  }

  .toggle-field.mixed {
    color: #F0B84D;
    border-color: #6B5522;
  }

  .reset-btn {
    flex: 0 0 auto;
    min-width: 46px;
    height: 26px;
    background: #242424;
    border: 1px solid #393939;
    border-radius: 3px;
    color: #CFCFCF;
    font-size: 10px;
    cursor: pointer;
    font-family: inherit;
  }

  .reset-btn:hover {
    border-color: #5B9BD5;
  }

  .note-card {
    width: 100%;
    border: 1px solid #303030;
    border-radius: 4px;
    background: #171717;
    color: #BEBEBE;
    font-size: 11px;
    line-height: 1.4;
    padding: 8px;
  }

  .mixed-note {
    border-color: #6B5522;
    color: #F0D08A;
  }

  .shell-editor {
    width: 100%;
    padding: 6px;
    border: 1px solid #303030;
    border-radius: 4px;
    background: #151515;
    box-sizing: border-box;
  }
</style>
