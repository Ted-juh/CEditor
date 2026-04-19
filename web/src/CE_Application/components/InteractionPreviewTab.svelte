<script>
  import { selectedControl } from '../stores/controls.js';
  import { getDefaultInteractionPreviewSession, dumpSelectedInteractionDebug } from '../stores/interactionPreview.js';
  import { stateEditScope } from '../stores/stateEditScope.js';
  import InteractiveTestSurface from './InteractiveTestSurface.svelte';
  import { resolveInteractiveControl, serializeInteractionRuntime } from '../utils/interactionRuntime.js';

  function numberOr(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function createPreviewSession(control) {
    const next = getDefaultInteractionPreviewSession();
    const behavior = control?._children?.Behavior ?? null;
    if (!behavior) return next;

    if (String(behavior?.valueType ?? '') === 'bool' || String(behavior?.family ?? '') === 'select') {
      next.checked = behavior?.defaultValue === true;
    }

    return next;
  }

  function createScopeDrivenSession(control, scope) {
    const next = createPreviewSession(control);
    if (!control || scope?.mode !== 'state' || !scope?.stateName) return next;

    const state = control?._children?.States?._children?.[scope.stateName];
    const when = state?.when ?? {};
    const flags = ['hover', 'pressed', 'focused', 'dragging', 'disabled', 'checked', 'mixed'];
    for (const flag of flags) {
      next[flag] = when?.[flag] === true;
    }
    return next;
  }

  let control = $derived($selectedControl);
  let controlId = $derived(control?._children?.Core?.id ?? '');
  let behavior = $derived(control?._children?.Behavior ?? null);
  let editScope = $derived($stateEditScope);
  let hasInteractiveModel = $derived(
    !!behavior
    || Object.keys(control?._children?.Parts?._children ?? {}).length > 0
    || Object.keys(control?._children?.Bindings?._children ?? {}).length > 0
    || Object.keys(control?._children?.States?._children ?? {}).length > 0
    || Object.keys(control?._children?.Animations?._children ?? {}).length > 0
  );

  let session = $state(getDefaultInteractionPreviewSession());
  let lastControlId = $state('');

  $effect(() => {
    if (!controlId) {
      lastControlId = '';
      session = createScopeDrivenSession(control, editScope);
      return;
    }

    if (controlId !== lastControlId) {
      lastControlId = controlId;
      session = createScopeDrivenSession(control, editScope);
    }
  });

  $effect(() => {
    controlId;
    editScope?.mode;
    editScope?.stateName;

    if (!control) return;
    if (editScope?.mode !== 'state' || !editScope?.stateName) return;

    session = {
      ...session,
      ...createScopeDrivenSession(control, editScope),
    }
  });

  let previewOverrides = $derived(session?.enabled === false ? {} : session);
  let resolved = $derived(control ? resolveInteractiveControl(control, previewOverrides) : null);
  let runtime = $derived(resolved ? serializeInteractionRuntime(resolved.runtime) : null);
  let showChecked = $derived(behavior?.family === 'select');
  let showMixed = $derived(behavior?.allowMixed === true);
  let showRangeValue = $derived(behavior?.family === 'range' || behavior?.valueType === 'int' || behavior?.valueType === 'float');

  function patchSession(patch = {}) {
    session = {
      ...createPreviewSession(control),
      ...session,
      ...patch,
    };
  }

  function resetSession() {
    session = createPreviewSession(control);
  }

  function handleToggle(key, event) {
    patchSession({ [key]: event.currentTarget.checked });
  }

  function handleValueChange(event) {
    patchSession({
      valueOverrideEnabled: true,
      valueOverride: Number(event.currentTarget.value),
    });
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
    Select a button, toggle, slider, or another interactive control to test it here.
  </div>
{:else if !hasInteractiveModel}
  <div class="preview-empty">
    {control?._children?.Core?.controlType ?? 'This control'} does not use the interactive runtime yet.
  </div>
{:else}
  <div class="preview-tab">
    <div class="preview-toolbar">
      <div class="preview-title-group">
        <div class="preview-title">Interaction Preview</div>
        <div class="preview-subtitle">{control?._children?.Core?.name ?? controlId}</div>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="toolbar-btn" onclick={resetSession}>
        Reset
      </button>
      <button class="toolbar-btn primary" onclick={dumpResolvedPayload}>
        Debug
      </button>
    </div>

    <div class="preview-layout">
      <section class="preview-stage-card">
        <InteractiveTestSurface {control} {session} onpatchsession={patchSession} />
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
          {#if showRangeValue}
            <label class="toggle-row">
              <span>Override Value</span>
              <input type="checkbox" checked={session.valueOverrideEnabled === true} onchange={(event) => handleToggle('valueOverrideEnabled', event)} />
            </label>
            <input
              class="range-input"
              type="range"
              min={numberOr(behavior?.min, 0)}
              max={numberOr(behavior?.max, 1)}
              step={numberOr(behavior?.step, 0.01)}
              value={session.valueOverrideEnabled === true ? numberOr(session.valueOverride, numberOr(behavior?.defaultValue, 0)) : numberOr(behavior?.defaultValue, 0)}
              oninput={handleValueChange}
            />
            <input
              class="number-input"
              type="number"
              min={numberOr(behavior?.min, 0)}
              max={numberOr(behavior?.max, 1)}
              step={numberOr(behavior?.step, 0.01)}
              value={session.valueOverrideEnabled === true ? numberOr(session.valueOverride, numberOr(behavior?.defaultValue, 0)) : numberOr(behavior?.defaultValue, 0)}
              oninput={handleValueChange}
            />
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

  .preview-toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #303030;
    background: #1D1D1D;
  }

  .preview-title-group {
    min-width: 0;
  }

  .preview-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.45px;
  }

  .preview-subtitle {
    color: #7C7C7C;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toolbar-spacer {
    flex: 1;
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

  .range-input,
  .number-input {
    width: 100%;
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

  .value-readout,
  .runtime-empty {
    color: #676767;
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
