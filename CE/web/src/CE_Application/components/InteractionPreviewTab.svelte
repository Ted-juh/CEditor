<script>
  import { selectedControl } from '../stores/controls.js';
  import { activePanel } from '../stores/panels.js';
  import { getDefaultInteractionPreviewSession, dumpSelectedInteractionDebug } from '../stores/interactionPreview.js';
  import InteractiveSelectGroupSurface from './InteractiveSelectGroupSurface.svelte';
  import InteractiveTestSurface from './InteractiveTestSurface.svelte';
  import { findExclusiveSelectGroupControls, isExclusiveSelectBehavior, normalizeExclusiveSelectDefaults } from '../utils/selectGroupUtils.js';
  import { normalizeEnumValues, resolveEnumDefaultValue } from '../utils/enumBehavior.js';
  import { resolveInteractiveControl, serializeInteractionRuntime } from '../utils/interactionRuntime.js';
  import { adjustRangeValue, getCurrentRangeValue, getRangeMax, getRangeMin, snapRangeValue } from '../utils/rangeBehavior.js';
  import { numberOr } from '../utils/primitives.js';
  import {
    formatSliderNumericValue,
    getSliderValueMode,
    parseSliderInputValue,
    snapSliderValue,
  } from '../utils/sliderBehavior.js';
  import {
    getCustomValueChannels,
    normalizeCustomChannelValue,
    seedCustomValues,
    snapCustomChannelValue,
  } from '../utils/customComponentInteraction.js';

  function getValueRows(control) {
    const rows = control?._children?.Value?.rows;
    return Array.isArray(rows) ? rows.filter((row) => row?.enabled !== false) : [];
  }

  function createPreviewSession(control) {
    const next = getDefaultInteractionPreviewSession();
    if (String(control?._children?.Core?.controlType ?? '') === 'CustomComponent') {
      next.customValues = seedCustomValues(control);
      next.customNormalizedValue = normalizeCustomChannelValue(
        control?._children?.ValueChannels?._children?.mainValue,
        next.customValues?.mainValue
      );
      return next;
    }

    const behavior = control?._children?.Behavior ?? null;
    if (!behavior) return next;

    if (String(behavior?.valueType ?? '') === 'bool' || String(behavior?.family ?? '') === 'select') {
      next.checked = behavior?.defaultValue === true;
    }

    if (String(behavior?.family ?? '') === 'range' && String(behavior?.role ?? '') === 'slider') {
      next.activeHandle = String(behavior?.valueMode ?? '') === 'range' ? 'start' : 'current';
      next.valueInputRole = next.activeHandle;
    }

    return next;
  }

  function createPreviewSessions(controls, preferredControlId = '') {
    const normalizedControls = normalizeExclusiveSelectDefaults(
      Array.isArray(controls) ? controls : [],
      preferredControlId ? [preferredControlId] : []
    );

    return normalizedControls.reduce((sessions, control) => {
      const nextControlId = control?._children?.Core?.id;
      if (!nextControlId) return sessions;
      sessions[nextControlId] = createPreviewSession(control);
      return sessions;
    }, {});
  }

  let control = $derived($selectedControl);
  let controlId = $derived(control?._children?.Core?.id ?? '');
  let behavior = $derived(control?._children?.Behavior ?? null);
  let isCustomComponent = $derived(String(control?._children?.Core?.controlType ?? '') === 'CustomComponent');
  let panelControls = $derived($activePanel?.controls ?? []);
  let groupPreviewControls = $derived.by(() =>
    controlId ? findExclusiveSelectGroupControls(panelControls, controlId) : []
  );
  let showGroupPreview = $derived(groupPreviewControls.length > 1);
  let previewControls = $derived(showGroupPreview ? groupPreviewControls : (control ? [control] : []));
  let previewControlMap = $derived.by(() => {
    const map = new Map();
    for (const previewControl of previewControls) {
      const nextControlId = previewControl?._children?.Core?.id;
      if (!nextControlId) continue;
      map.set(nextControlId, previewControl);
    }
    return map;
  });
  let previewSignature = $derived.by(() =>
    previewControls.map((previewControl) => {
      const previewBehavior = previewControl?._children?.Behavior ?? null;
      const previewControlId = previewControl?._children?.Core?.id ?? '';
      return [
        previewControlId,
        previewBehavior?.defaultValue === true ? '1' : '0',
        String(previewBehavior?.family ?? ''),
        String(previewBehavior?.role ?? ''),
        String(previewBehavior?.valueType ?? ''),
        String(previewBehavior?.groupId ?? ''),
      ].join(':');
    }).join('|')
  );
  let hasInteractiveModel = $derived(
    !!behavior
    || Object.keys(control?._children?.Parts?._children ?? {}).length > 0
    || Object.keys(control?._children?.Bindings?._children ?? {}).length > 0
    || Object.keys(control?._children?.States?._children ?? {}).length > 0
    || Object.keys(control?._children?.Animations?._children ?? {}).length > 0
  );

  let sessionsById = $state({});
  let lastSessionSeed = $state('');

  $effect(() => {
    if (!controlId) {
      lastSessionSeed = '';
      sessionsById = {};
      return;
    }

    const nextSeed = `${controlId}|${previewSignature}`;
    if (nextSeed !== lastSessionSeed) {
      lastSessionSeed = nextSeed;
      sessionsById = createPreviewSessions(previewControls, controlId);
    }
  });

  let session = $derived(sessionsById?.[controlId] ?? createPreviewSession(control));
  let previewOverrides = $derived(session?.enabled === false ? {} : session);
  let resolved = $derived(control ? resolveInteractiveControl(control, previewOverrides) : null);
  let runtime = $derived(resolved ? serializeInteractionRuntime(resolved.runtime) : null);
  let buttonType = $derived(String(behavior?.buttonType ?? ''));
  let showChecked = $derived(behavior?.family === 'select' && behavior?.valueType === 'bool');
  let showMixed = $derived(behavior?.allowMixed === true && behavior?.valueType === 'bool');
  let isSliderPreview = $derived(String(behavior?.family ?? '') === 'range' && String(behavior?.role ?? '') === 'slider');
  let sliderValueMode = $derived(getSliderValueMode(behavior));
  let sliderRoles = $derived.by(() => (
    sliderValueMode === 'range'
      ? ['start', 'end']
      : (sliderValueMode === 'band' ? ['start', 'current', 'end'] : ['current'])
  ));
  let showRangeValue = $derived(!isSliderPreview && (behavior?.family === 'range' || behavior?.valueType === 'int' || behavior?.valueType === 'float'));
  let showEnumValue = $derived(behavior?.valueType === 'enum' || buttonType === 'cyclic' || buttonType === 'radio');
  let customChannelEntries = $derived.by(() => Object.entries(getCustomValueChannels(control)));
  let enumValues = $derived(normalizeEnumValues(behavior?.enumValues ?? []));
  let valueRows = $derived(getValueRows(control));
  let previewValueOptions = $derived.by(() =>
    valueRows.length
      ? valueRows.map((row) => ({ value: String(row?.internalValue ?? row?.id ?? ''), label: row?.displayText ?? String(row?.internalValue ?? row?.id ?? '') }))
      : enumValues.map((option) => ({ value: option, label: option }))
  );
  let defaultPreviewValue = $derived.by(() => {
    if (valueRows.length) {
      const defaultRow = valueRows.find((row) => row?.selectedByDefault === true) ?? valueRows[0] ?? null;
      return String(defaultRow?.internalValue ?? defaultRow?.id ?? '');
    }
    return resolveEnumDefaultValue(enumValues, behavior?.defaultValue ?? '');
  });
  let enumPreviewValue = $derived(
    session?.valueOverrideEnabled === true
      ? String(session?.valueOverride ?? defaultPreviewValue)
      : defaultPreviewValue
  );
  let sliderRuntimeValues = $derived({
    start: runtime?.signals?.startValueRaw ?? 0,
    current: runtime?.signals?.currentValueRaw ?? runtime?.signals?.valueRaw ?? 0,
    end: runtime?.signals?.endValueRaw ?? 0,
  });

  function patchControlSession(targetControlId, patch = {}) {
    const targetControl = previewControlMap.get(targetControlId) ?? null;
    if (!targetControl) return;

    sessionsById = {
      ...sessionsById,
      [targetControlId]: {
        ...createPreviewSession(targetControl),
        ...(sessionsById?.[targetControlId] ?? {}),
        ...patch,
      },
    };
  }

  function patchSession(patch = {}) {
    if (!controlId) return;
    patchControlSession(controlId, patch);
  }

  function setExclusivePreviewSelection(targetControlId, nextChecked = true) {
    const targetControl = previewControlMap.get(targetControlId) ?? null;
    if (!targetControl) return;

    const targetBehavior = targetControl?._children?.Behavior ?? null;
    if (!isExclusiveSelectBehavior(targetBehavior)) {
      patchControlSession(targetControlId, {
        checked: nextChecked,
        mixed: false,
        valueOverrideEnabled: false,
      });
      return;
    }

    if (!nextChecked && targetBehavior?.uncheckOnClick !== true) {
      return;
    }

    const nextSessions = { ...sessionsById };

    if (nextChecked) {
      for (const groupedControl of groupPreviewControls) {
        const groupedControlId = groupedControl?._children?.Core?.id;
        if (!groupedControlId) continue;

        nextSessions[groupedControlId] = {
          ...createPreviewSession(groupedControl),
          ...(sessionsById?.[groupedControlId] ?? {}),
          checked: groupedControlId === targetControlId,
          mixed: false,
          valueOverrideEnabled: false,
        };
      }
    } else {
      nextSessions[targetControlId] = {
        ...createPreviewSession(targetControl),
        ...(sessionsById?.[targetControlId] ?? {}),
        checked: false,
        mixed: false,
        valueOverrideEnabled: false,
      };
    }

    sessionsById = nextSessions;
  }

  function resetSession() {
    sessionsById = createPreviewSessions(previewControls, controlId);
  }

  function handleToggle(key, event) {
    const nextValue = event.currentTarget.checked;
    if (key === 'checked' && showGroupPreview && isExclusiveSelectBehavior(behavior)) {
      setExclusivePreviewSelection(controlId, nextValue);
      return;
    }

    patchSession({ [key]: nextValue });
  }

  function handleValueChange(event) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: snapRangeValue(behavior, Number(event.currentTarget.value)),
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function handleSliderActiveHandleChange(event) {
    patchSession({
      activeHandle: String(event.currentTarget.value ?? 'current'),
      valueInputRole: String(event.currentTarget.value ?? 'current'),
    });
  }

  function handleSliderValueChange(role, event) {
    const parsed = parseSliderInputValue(behavior, event.currentTarget.value);
    if (parsed === null) return;
    patchSession({
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: parsed,
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function handleSliderRoleStep(role, direction) {
    patchSession({
      activeHandle: role,
      valueInputRole: role,
      [`${role}ValueOverrideEnabled`]: true,
      [`${role}ValueOverride`]: snapSliderValue(
        behavior,
        Number(sliderRuntimeValues?.[role] ?? 0) + (direction * numberOr(behavior?.step, 0.01))
      ),
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function handleRangeStep(direction) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: adjustRangeValue(behavior, getCurrentRangeValue(behavior, session), direction),
      valueInputActive: false,
      valueInputBuffer: '',
    });
  }

  function handleEnumValueChange(event) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: String(event.currentTarget.value ?? ''),
    });
  }

  function customChannelValue(channelName, channel) {
    return session?.customValues?.[channelName] ?? channel?.currentValue ?? channel?.defaultValue ?? '';
  }

  function handleCustomChannelChange(channelName, channel, event) {
    const type = String(channel?.type ?? 'float').trim().toLowerCase();
    const rawValue = type === 'bool'
      ? event.currentTarget.checked
      : (type === 'enum' ? String(event.currentTarget.value ?? '') : Number(event.currentTarget.value));
    const nextValue = snapCustomChannelValue(channel, rawValue);
    const nextValues = {
      ...seedCustomValues(control),
      ...(session?.customValues ?? {}),
      [channelName]: nextValue,
    };
    patchSession({
      customValues: nextValues,
      customNormalizedValue: channelName === 'mainValue'
        ? normalizeCustomChannelValue(channel, nextValue)
        : session?.customNormalizedValue,
      valueOverrideEnabled: channelName === 'mainValue',
      valueOverride: channelName === 'mainValue' ? nextValue : session?.valueOverride,
      activeCustomBehavior: '',
      activeCustomHitZone: '',
    });
  }

  function customChannelOptions(channel) {
    const values = Array.isArray(channel?.values) ? channel.values : (Array.isArray(channel?.options) ? channel.options : []);
    const normalized = values
      .map((entry) => ({ value: String(entry?.value ?? entry?.id ?? entry ?? ''), label: String(entry?.label ?? entry?.value ?? entry?.id ?? entry ?? '') }))
      .filter((entry) => entry.value);
    return normalized.length ? normalized : ['A', 'B'].map((entry) => ({ value: entry, label: entry }));
  }

  function handleGroupCommit(targetControlId) {
    const targetSession = sessionsById?.[targetControlId];
    const isChecked = targetSession?.checked === true;
    const targetBehavior = previewControlMap.get(targetControlId)?._children?.Behavior ?? null;
    const nextChecked = isChecked && targetBehavior?.uncheckOnClick === true ? false : true;
    setExclusivePreviewSelection(targetControlId, nextChecked);
  }

  function dumpResolvedPayload() {
    if (!control || !runtime) return;
    dumpSelectedInteractionDebug({
      controlId,
      type: control?._children?.Core?.controlType ?? '',
      previewSession: session,
      runtime,
      resolvedControl: resolved?.control ?? null,
    });
  }
</script>

{#if !control}
  <div class="preview-empty">
    Select a button, range, toggle, or another interactive control to test it here.
  </div>
{:else if !hasInteractiveModel}
  <div class="preview-empty">
    {control?._children?.Core?.controlType ?? 'This control'} does not use the interactive runtime yet.
  </div>
{:else}
  <div class="preview-tab">
    <div class="preview-layout">
      <section class="preview-stage-card">
        {#if showGroupPreview}
          <InteractiveSelectGroupSurface
            controls={groupPreviewControls}
            {sessionsById}
            selectedControlId={controlId}
            onpatchcontrolsession={patchControlSession}
            oncommitselect={handleGroupCommit}
          />
        {:else}
          <InteractiveTestSurface
            {control}
            resolvedControl={resolved?.control ?? control}
            resolvedRuntime={resolved?.runtime ?? null}
            {session}
            onpatchsession={patchSession}
          />
        {/if}
      </section>

      <div class="preview-sidebar">
        <section class="preview-section">
          <div class="section-title">Session</div>
          <label class="toggle-row">
            <span>Preview Enabled</span>
            <input type="checkbox" checked={session.enabled !== false} onchange={(event) => handleToggle('enabled', event)} />
          </label>
          <label class="toggle-row">
            <span>Animations</span>
            <input type="checkbox" checked={session.animationsEnabled !== false} onchange={(event) => handleToggle('animationsEnabled', event)} />
          </label>
          <label class="toggle-row">
            <span>Auto Debug Overlay</span>
            <input type="checkbox" checked={session.autoDebug === true} onchange={(event) => handleToggle('autoDebug', event)} />
          </label>
          <label class="toggle-row">
            <span>Reduced Motion</span>
            <input type="checkbox" checked={session.reducedMotion === true} onchange={(event) => handleToggle('reducedMotion', event)} />
          </label>
          <label class="toggle-row">
            <span>High Contrast</span>
            <input type="checkbox" checked={session.highContrast === true} onchange={(event) => handleToggle('highContrast', event)} />
          </label>
        </section>

        <section class="preview-section">
          <div class="section-title">Manual Overrides</div>
          <label class="toggle-row">
            <span>Hover</span>
            <input type="checkbox" checked={session.hover === true} onchange={(event) => handleToggle('hover', event)} />
          </label>
          <label class="toggle-row">
            <span>Pressed</span>
            <input type="checkbox" checked={session.pressed === true} onchange={(event) => handleToggle('pressed', event)} />
          </label>
          <label class="toggle-row">
            <span>Focused</span>
            <input type="checkbox" checked={session.focused === true} onchange={(event) => handleToggle('focused', event)} />
          </label>
          <label class="toggle-row">
            <span>Dragging</span>
            <input type="checkbox" checked={session.dragging === true} onchange={(event) => handleToggle('dragging', event)} />
          </label>
          <label class="toggle-row">
            <span>Pending</span>
            <input type="checkbox" checked={session.pending === true} onchange={(event) => handleToggle('pending', event)} />
          </label>
          <label class="toggle-row">
            <span>Executed</span>
            <input type="checkbox" checked={session.executed === true} onchange={(event) => handleToggle('executed', event)} />
          </label>
          <label class="toggle-row">
            <span>Disabled</span>
            <input type="checkbox" checked={session.disabled === true} onchange={(event) => handleToggle('disabled', event)} />
          </label>
          {#if showChecked}
            <label class="toggle-row">
              <span>Checked</span>
              <input type="checkbox" checked={session.checked === true} onchange={(event) => handleToggle('checked', event)} />
            </label>
          {/if}
          {#if showMixed}
            <label class="toggle-row">
              <span>Mixed</span>
              <input type="checkbox" checked={session.mixed === true} onchange={(event) => handleToggle('mixed', event)} />
            </label>
          {/if}
        </section>

        <section class="preview-section">
          <div class="section-title">Value</div>
          {#if isCustomComponent}
            {#if customChannelEntries.length}
              {#each customChannelEntries as [channelName, channel] (channelName)}
                {@const channelType = String(channel?.type ?? 'float').trim().toLowerCase()}
                <div class="slider-role-card">
                  <div class="meta-row">
                    <span>{channel?.label ?? channelName}</span>
                    <strong>{channelType}</strong>
                  </div>
                  {#if channelType === 'bool'}
                    <label class="toggle-row">
                      <span>Value</span>
                      <input
                        type="checkbox"
                        checked={customChannelValue(channelName, channel) === true}
                        onchange={(event) => handleCustomChannelChange(channelName, channel, event)}
                      />
                    </label>
                  {:else if channelType === 'enum'}
                    <select
                      class="select-input"
                      value={String(customChannelValue(channelName, channel) ?? '')}
                      onchange={(event) => handleCustomChannelChange(channelName, channel, event)}
                    >
                      {#each customChannelOptions(channel) as option (option.value)}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  {:else}
                    <div class="range-stepper">
                      <button type="button" class="step-btn" onclick={() => {
                        const next = Number(customChannelValue(channelName, channel)) - numberOr(channel?.step, 0.01);
                        handleCustomChannelChange(channelName, channel, { currentTarget: { value: next } });
                      }}>-</button>
                      <input
                        class="number-input"
                        type="number"
                        min={numberOr(channel?.min, 0)}
                        max={numberOr(channel?.max, 1)}
                        step={numberOr(channel?.step, 0.01)}
                        value={customChannelValue(channelName, channel)}
                        oninput={(event) => handleCustomChannelChange(channelName, channel, event)}
                      />
                      <button type="button" class="step-btn" onclick={() => {
                        const next = Number(customChannelValue(channelName, channel)) + numberOr(channel?.step, 0.01);
                        handleCustomChannelChange(channelName, channel, { currentTarget: { value: next } });
                      }}>+</button>
                    </div>
                  {/if}
                  <div class="slider-role-readout">
                    normalized {normalizeCustomChannelValue(channel, customChannelValue(channelName, channel)).toFixed(3)}
                  </div>
                </div>
              {/each}
            {:else}
              <div class="value-readout">
                Add value channels to make this custom component react in the preview.
              </div>
            {/if}
          {:else if isSliderPreview}
            {#if sliderRoles.length > 1}
              <label class="field-stack">
                <span class="field-label">Active Handle</span>
                <select class="select-input" value={session.activeHandle ?? sliderRoles[0]} onchange={handleSliderActiveHandleChange}>
                  {#each sliderRoles as role}
                    <option value={role}>{role}</option>
                  {/each}
                </select>
              </label>
            {/if}
            {#each sliderRoles as role}
              <div class="slider-role-card">
                <label class="toggle-row">
                  <span>Override {role}</span>
                  <input
                    type="checkbox"
                    checked={session?.[`${role}ValueOverrideEnabled`] === true}
                    onchange={(event) => handleToggle(`${role}ValueOverrideEnabled`, event)}
                  />
                </label>
                <div class="range-stepper">
                  <button type="button" class="step-btn" onclick={() => handleSliderRoleStep(role, -1)}>-</button>
                  <input
                    class="number-input"
                    type="number"
                    min={getRangeMin(behavior)}
                    max={getRangeMax(behavior)}
                    step={numberOr(behavior?.step, 0.01)}
                    value={Number(sliderRuntimeValues?.[role] ?? 0)}
                    oninput={(event) => handleSliderValueChange(role, event)}
                  />
                  <button type="button" class="step-btn" onclick={() => handleSliderRoleStep(role, 1)}>+</button>
                </div>
                <div class="slider-role-readout">{formatSliderNumericValue(behavior, Number(sliderRuntimeValues?.[role] ?? 0))}</div>
              </div>
            {/each}
            <div class="value-readout">
              Drag the live stage or use these role overrides to test `single`, `range`, and `band` slider behavior.
            </div>
          {:else if showRangeValue}
            <label class="toggle-row">
              <span>Override Value</span>
              <input type="checkbox" checked={session.valueOverrideEnabled === true} onchange={(event) => handleToggle('valueOverrideEnabled', event)} />
            </label>
            <div class="range-stepper">
              <button type="button" class="step-btn" onclick={() => handleRangeStep(-1)}>-</button>
              <input
              class="number-input"
              type="number"
              min={getRangeMin(behavior)}
              max={getRangeMax(behavior)}
              step={numberOr(behavior?.step, 0.01)}
              value={getCurrentRangeValue(behavior, session)}
              oninput={handleValueChange}
            />
              <button type="button" class="step-btn" onclick={() => handleRangeStep(1)}>+</button>
            </div>
            <div class="value-readout">
              Range preview supports step buttons, direct number entry, arrow keys, wheel, and scrub-dragging on the live stage.
            </div>
          {:else if showEnumValue}
            <label class="toggle-row">
              <span>Override Value</span>
              <input type="checkbox" checked={session.valueOverrideEnabled === true} onchange={(event) => handleToggle('valueOverrideEnabled', event)} />
            </label>
            {#if previewValueOptions.length}
              <select class="select-input" value={enumPreviewValue} onchange={handleEnumValueChange}>
                {#each previewValueOptions as option}
                  <option value={option.value}>{option.label}</option>
                {/each}
              </select>
            {:else}
              <div class="value-readout">
                Add enum values in Behavior to preview and override the enum state.
              </div>
            {/if}
          {:else}
            <div class="value-readout">
              Use the live stage to hover, press, and click this control.
            </div>
          {/if}
        </section>

        <section class="preview-section runtime">
          <div class="section-title">Runtime</div>
          <div class="meta-row">
            <span>Family</span>
            <strong>{runtime?.signals?.family ?? '-'}</strong>
          </div>
          <div class="meta-row">
            <span>Role</span>
            <strong>{runtime?.signals?.role ?? '-'}</strong>
          </div>
          <div class="meta-row">
            <span>Value</span>
            <strong>{String(runtime?.signals?.valueRaw ?? '-')}</strong>
          </div>
          <div class="meta-row">
            <span>Normalized</span>
            <strong>{numberOr(runtime?.signals?.valueNormalized, 0).toFixed(3)}</strong>
          </div>
          {#if isCustomComponent}
            <div class="meta-row">
              <span>Hit Zone</span>
              <strong>{session?.activeCustomHitZone || '-'}</strong>
            </div>
            <div class="meta-row">
              <span>Behavior</span>
              <strong>{session?.activeCustomBehavior || '-'}</strong>
            </div>
            {#each customChannelEntries as [channelName, channel] (channelName)}
              <div class="meta-row">
                <span>{channelName}</span>
                <strong>{String(customChannelValue(channelName, channel) ?? '-')}</strong>
              </div>
            {/each}
          {/if}
          {#if isSliderPreview}
            <div class="meta-row">
              <span>Geometry</span>
              <strong>{runtime?.signals?.geometry ?? '-'}</strong>
            </div>
            <div class="meta-row">
              <span>Mode</span>
              <strong>{runtime?.signals?.valueMode ?? '-'}</strong>
            </div>
            <div class="meta-row">
              <span>Active Handle</span>
              <strong>{runtime?.signals?.activeHandle ?? '-'}</strong>
            </div>
            <div class="meta-row">
              <span>Start</span>
              <strong>{String(runtime?.signals?.startValueRaw ?? '-')}</strong>
            </div>
            <div class="meta-row">
              <span>Current</span>
              <strong>{String(runtime?.signals?.currentValueRaw ?? '-')}</strong>
            </div>
            <div class="meta-row">
              <span>End</span>
              <strong>{String(runtime?.signals?.endValueRaw ?? '-')}</strong>
            </div>
            <div class="meta-row">
              <span>Dirty</span>
              <strong>{runtime?.signals?.isDirty === true ? 'yes' : 'no'}</strong>
            </div>
          {/if}
          <div class="chip-group">
            {#if runtime?.activeStates?.length}
              {#each runtime.activeStates as stateName}
                <span class="runtime-chip">{stateName}</span>
              {/each}
            {:else}
              <span class="runtime-empty">No active states</span>
            {/if}
          </div>
        </section>
      </div>
    </div>

    <div class="preview-footer">
      <div class="footer-spacer"></div>
      <div class="footer-actions">
        <button class="toolbar-btn" onclick={resetSession}>
          Reset
        </button>
        <button class="toolbar-btn primary" onclick={dumpResolvedPayload}>
          Debug
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .preview-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 20px;
    color: #555;
    font-size: 12px;
    text-align: center;
  }

  .preview-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #171717;
    color: #D7D7D7;
  }

  .toolbar-btn {
    border: 1px solid #424242;
    background: #252525;
    color: #D7D7D7;
    font-size: 10px;
    padding: 5px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-family: inherit;
  }

  .toolbar-btn:hover {
    background: #303030;
    border-color: #5A5A5A;
  }

  .toolbar-btn.primary {
    border-color: #5B9BD5;
  }

  .toolbar-btn.primary:hover {
    background: #094771;
    color: #FFF;
  }

  .preview-layout {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(360px, 1.4fr) minmax(280px, 0.9fr);
    gap: 10px;
    padding: 10px;
  }

  .preview-footer {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 10px 10px;
    flex-shrink: 0;
  }

  .footer-spacer {
    flex: 1;
  }

  .footer-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .preview-stage-card,
  .preview-section {
    border: 1px solid #2F2F2F;
    border-radius: 10px;
    background: #1E1E1E;
  }

  .preview-stage-card {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 10px;
  }

  .preview-sidebar {
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 10px;
    overflow: auto;
    align-content: start;
  }

  .preview-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    min-height: 0;
  }

  .section-title {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #8D8D8D;
  }

  .toggle-row,
  .meta-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 11px;
  }

  .toggle-row input[type="checkbox"] {
    accent-color: #5B9BD5;
  }

  .field-stack {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
  }

  .field-label {
    color: #9A9A9A;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.35px;
  }

  .number-input {
    width: 100%;
  }

  .range-stepper {
    display: grid;
    grid-template-columns: 36px 1fr 36px;
    gap: 8px;
    align-items: center;
  }

  .step-btn {
    border: 1px solid #3B3B3B;
    background: #252525;
    color: #E5E5E5;
    border-radius: 4px;
    height: 32px;
    cursor: pointer;
    font-size: 15px;
    font-weight: 700;
    font-family: inherit;
  }

  .step-btn:hover {
    border-color: #5B9BD5;
    background: #2C2C2C;
  }

  .number-input {
    border: 1px solid #3B3B3B;
    background: #131313;
    color: #E5E5E5;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 11px;
    font-family: inherit;
    box-sizing: border-box;
  }

  .select-input {
    border: 1px solid #3B3B3B;
    background: #131313;
    color: #E5E5E5;
    border-radius: 4px;
    padding: 6px 8px;
    font-size: 11px;
    font-family: inherit;
    width: 100%;
    box-sizing: border-box;
  }

  .value-readout,
  .runtime-empty {
    color: #676767;
    font-size: 11px;
  }

  .slider-role-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 8px;
    border: 1px solid #2E2E2E;
    border-radius: 8px;
    background: #171717;
  }

  .slider-role-readout {
    color: #A6D2FF;
    font-size: 11px;
  }

  .chip-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 2px;
  }

  .runtime-chip {
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(91, 155, 213, 0.18);
    border: 1px solid rgba(91, 155, 213, 0.4);
    color: #CFE7FF;
    font-size: 10px;
  }

  @media (max-width: 1100px) {
    .preview-layout {
      grid-template-columns: 1fr;
    }

    .preview-sidebar {
      overflow: visible;
    }
  }
</style>
