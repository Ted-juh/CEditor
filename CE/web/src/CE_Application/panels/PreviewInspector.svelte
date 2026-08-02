<script>
  import { activePanel } from '../stores/panels.js';
  import {
    panelPreviewSessions,
    panelPreviewDebugEnabled,
    previewInspection,
    updatePanelPreviewSession,
    resetPanelPreviewSessions,
    dumpPreviewInspectionDebug,
  } from '../stores/interactionPreview.js';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import { numberOr } from '../utils/primitives.js';

  function boolLabel(value) {
    return value ? 'On' : 'Off';
  }

  function readout(value, fallback = '—') {
    if (value === undefined || value === null || value === '') return fallback;
    return String(value);
  }

  function handleSessionToggle(key, nextValue) {
    const inspection = $previewInspection;
    if (!inspection?.controlId) return;
    updatePanelPreviewSession(inspection.controlId, { [key]: nextValue });
  }

  function handleResetAll() {
    resetPanelPreviewSessions($activePanel?.controls ?? []);
  }

  function toggleDebugInspector() {
    panelPreviewDebugEnabled.set(!($panelPreviewDebugEnabled === true));
  }

  let inspection = $derived($previewInspection);
  let control = $derived(inspection?.control ?? null);
  let runtime = $derived(inspection?.runtime ?? null);
  let session = $derived(inspection?.session ?? null);
  let activeStates = $derived(Array.isArray(runtime?.activeStates) ? runtime.activeStates : []);
  let normalizedValue = $derived(numberOr(runtime?.signals?.valueNormalized, 0).toFixed(3));

  function controlIdOf(entry) {
    return String(entry?._children?.Core?.id ?? '');
  }

  function isCustomComponent(entry) {
    return String(entry?._children?.Core?.controlType ?? '') === 'CustomComponent';
  }

  function valueRowsFor(entry, entrySession) {
    if (!isCustomComponent(entry)) return [];
    const channels = entry?._children?.ValueChannels?._children ?? {};
    return Object.entries(channels).map(([name, channel]) => ({
      name,
      type: String(channel?.type ?? 'float'),
      value: entrySession?.customValues?.[name] ?? channel?.currentValue ?? channel?.defaultValue ?? '',
    }));
  }

  function parseRouteTarget(link) {
    const explicitControlId = String(link?.targetControlId ?? link?.targetComponentId ?? '').trim();
    const explicitPort = String(link?.targetPort ?? link?.targetInput ?? '').trim();
    if (explicitControlId && explicitPort) return { controlId: explicitControlId, port: explicitPort };

    const target = String(link?.target ?? '').trim();
    const match = target.match(/^([^.:/]+)[.:/]([^.:/]+)$/);
    return match ? { controlId: match[1], port: match[2] } : null;
  }

  function resolveTargetChannel(entry, port) {
    const inputs = entry?._children?.PublishedProperties?.inputs ?? {};
    const input = inputs?.[port] ?? Object.values(inputs).find((candidate) => String(candidate?.channel ?? '') === port);
    return String(input?.channel || port);
  }

  function routeRowsFor(entry, panel, sessions) {
    if (!isCustomComponent(entry)) return [];
    const selectedId = controlIdOf(entry);
    const controls = Array.isArray(panel?.controls) ? panel.controls : [];
    const controlMap = new Map(controls.map((candidate) => [controlIdOf(candidate), candidate]));
    const rows = [];

    for (const sourceControl of controls) {
      if (!isCustomComponent(sourceControl)) continue;
      const sourceId = controlIdOf(sourceControl);
      const sourceSession = sessions?.[sourceId] ?? {};
      const links = sourceControl?._children?.Links;
      if (links?.enabled === false) continue;

      for (const [name, link] of Object.entries(links?._children ?? {})) {
        if (!link || link.enabled === false) continue;
        const type = String(link?.type ?? '').trim().toLowerCase();
        if (!['external-output', 'route-value', 'mirror'].includes(type)) continue;

        const target = parseRouteTarget(link);
        if (!target) continue;
        const targetControl = controlMap.get(target.controlId);
        if (!isCustomComponent(targetControl)) continue;
        if (sourceId !== selectedId && target.controlId !== selectedId) continue;

        const source = String(link?.source ?? '').trim();
        const targetChannel = resolveTargetChannel(targetControl, target.port);
        const targetSession = sessions?.[target.controlId] ?? {};
        rows.push({
          name,
          direction: sourceId === selectedId ? 'Out' : 'In',
          type: String(link?.type ?? 'external-output'),
          sourceLabel: `${sourceControl?._children?.Core?.name ?? sourceId}.${source}`,
          targetLabel: `${targetControl?._children?.Core?.name ?? target.controlId}.${targetChannel}`,
          sourceValue: sourceSession?.customValues?.[source],
          targetValue: targetSession?.customValues?.[targetChannel],
        });
      }
    }

    return rows;
  }

  let customRows = $derived(valueRowsFor(control, session));
  let routeRows = $derived(routeRowsFor(control, $activePanel, $panelPreviewSessions));
  let debugEnabled = $derived($panelPreviewDebugEnabled === true);
</script>

{#if !$activePanel}
  <div class="preview-empty">
    Open a panel to use Preview.
  </div>
{:else}
  <div class="preview-inspector">
    <div class="preview-header">
      <div class="preview-title-group">
        <div class="preview-title">Panel Preview</div>
        <div class="preview-subtitle">
          {#if debugEnabled && control}
            {control?._children?.Core?.name ?? inspection?.controlId} · {control?._children?.Core?.controlType ?? 'Control'}
          {:else if debugEnabled}
            Click a control on the canvas to inspect runtime debug data.
          {:else}
            Running the panel as an output preview.
          {/if}
        </div>
      </div>
      <div class="toolbar-spacer"></div>
      <button class="toolbar-btn" onclick={handleResetAll}>Reset All</button>
      <button class="toolbar-btn" class:active={debugEnabled} onclick={toggleDebugInspector}>
        Debug inspector
      </button>
      {#if debugEnabled}
        <button class="toolbar-btn primary" onclick={dumpPreviewInspectionDebug} disabled={!control}>Dump</button>
      {/if}
    </div>

    <div class="preview-scroll">
      {#if !debugEnabled}
        <div class="preview-empty inner normal-preview">
          <strong>Normal preview is running.</strong>
          <span>Use the panel controls directly on the canvas. Debug details stay hidden unless you enable the inspector.</span>
        </div>
      {:else if !control}
        <div class="preview-empty inner">
          Debug inspector is active. Click a control on the canvas to inspect its runtime data.
        </div>
      {:else}
        <PropertySection title="Target">
          <PropertyCell label="Name" span={2} hint="Currently inspected control">
            <div class="readout">{readout(control?._children?.Core?.name, inspection?.controlId)}</div>
          </PropertyCell>
          <PropertyCell label="Type" span={2} hint="Control type from the panel document">
            <div class="readout">{readout(control?._children?.Core?.controlType)}</div>
          </PropertyCell>
          <PropertyCell label="Id" span={4} hint="Internal control id">
            <div class="readout mono">{readout(inspection?.controlId)}</div>
          </PropertyCell>
          <PropertyCell label="Interactive" span={4} hint="Whether this control uses the interaction runtime">
            <div class="readout" class:muted={!inspection?.hasInteractiveModel}>
              {inspection?.hasInteractiveModel ? 'This control has behavior, states, bindings, or animations.' : 'This control is rendered as-is with no interactive runtime yet.'}
            </div>
          </PropertyCell>
        </PropertySection>

        <PropertySection title="Preview">
          <PropertyCell label="Enabled" span={2} hint="Turn preview behavior on or off for this control">
            <PropertyToggle value={session?.enabled !== false} onchange={(nextValue) => handleSessionToggle('enabled', nextValue)} />
          </PropertyCell>
          <PropertyCell label="Animations" span={2} hint="Allow runtime transitions while previewing this control">
            <PropertyToggle value={session?.animationsEnabled !== false} onchange={(nextValue) => handleSessionToggle('animationsEnabled', nextValue)} />
          </PropertyCell>
          <PropertyCell label="Auto Debug" span={2} hint="Show the runtime state badge on the control itself">
            <PropertyToggle value={session?.autoDebug === true} onchange={(nextValue) => handleSessionToggle('autoDebug', nextValue)} />
          </PropertyCell>
          <PropertyCell label="Disabled" span={2} hint="Force the control into its disabled runtime state">
            <PropertyToggle value={session?.disabled === true} onchange={(nextValue) => handleSessionToggle('disabled', nextValue)} />
          </PropertyCell>
        </PropertySection>

        <PropertySection title="Signals">
          <PropertyCell label="Hover" span={1} hint="Pointer is currently over the control">
            <div class="readout bool">{boolLabel(runtime?.signals?.hover === true)}</div>
          </PropertyCell>
          <PropertyCell label="Pressed" span={1} hint="Control is currently pressed">
            <div class="readout bool">{boolLabel(runtime?.signals?.pressed === true)}</div>
          </PropertyCell>
          <PropertyCell label="Focused" span={1} hint="Control currently has keyboard focus">
            <div class="readout bool">{boolLabel(runtime?.signals?.focused === true)}</div>
          </PropertyCell>
          <PropertyCell label="Dragging" span={1} hint="Control is actively dragging">
            <div class="readout bool">{boolLabel(runtime?.signals?.dragging === true)}</div>
          </PropertyCell>
          <PropertyCell label="Pending" span={1} hint="Timed controls are waiting for hold or multi-click completion">
            <div class="readout bool">{boolLabel(runtime?.signals?.pending === true)}</div>
          </PropertyCell>
          <PropertyCell label="Executed" span={1} hint="Trigger-style controls have just completed their action">
            <div class="readout bool">{boolLabel(runtime?.signals?.executed === true)}</div>
          </PropertyCell>
          <PropertyCell label="Checked" span={2} hint="Logical checked state for select controls">
            <div class="readout bool">{boolLabel(runtime?.signals?.checked === true)}</div>
          </PropertyCell>
          <PropertyCell label="Mixed" span={1} hint="Mixed state for tri-state controls">
            <div class="readout bool">{boolLabel(runtime?.signals?.mixed === true)}</div>
          </PropertyCell>
          <PropertyCell label="Disabled" span={1} hint="Resolved disabled signal after preview overrides">
            <div class="readout bool">{boolLabel(runtime?.signals?.disabled === true)}</div>
          </PropertyCell>
        </PropertySection>

        <PropertySection title="Runtime">
          <PropertyCell label="Family" span={2} hint="Interaction family used by the runtime">
            <div class="readout">{readout(runtime?.signals?.family)}</div>
          </PropertyCell>
          <PropertyCell label="Role" span={2} hint="Specific runtime role for this control">
            <div class="readout">{readout(runtime?.signals?.role)}</div>
          </PropertyCell>
          <PropertyCell label="Value Type" span={2} hint="How the runtime interprets the control value">
            <div class="readout">{readout(runtime?.signals?.valueType)}</div>
          </PropertyCell>
          <PropertyCell label="Animations" span={2} hint="Whether transitions are active for this runtime session">
            <div class="readout bool">{boolLabel(runtime?.signals?.animationsEnabled === true)}</div>
          </PropertyCell>
          <PropertyCell label="Raw Value" span={2} hint="Current raw runtime value">
            <div class="readout mono">{readout(runtime?.signals?.valueRaw)}</div>
          </PropertyCell>
          <PropertyCell label="Normalized" span={2} hint="Current value normalized to a 0–1 range">
            <div class="readout mono">{normalizedValue}</div>
          </PropertyCell>
          <PropertyCell label="Enum Value" span={4} hint="Current enum value when the runtime uses enumerated values">
            <div class="readout mono">{readout(runtime?.signals?.valueEnum)}</div>
          </PropertyCell>
        </PropertySection>

        {#if customRows.length}
          <PropertySection title="Custom Values">
            <div class="value-table">
              {#each customRows as row (row.name)}
                <div class="value-row">
                  <div class="value-name">{row.name}</div>
                  <div class="value-type">{row.type}</div>
                  <div class="value-current mono">{readout(row.value)}</div>
                </div>
              {/each}
            </div>
          </PropertySection>
        {/if}

        {#if routeRows.length}
          <PropertySection title="Panel Routes">
            <div class="route-table">
              {#each routeRows as row (row.name)}
                <div class="route-row">
                  <span class="route-pill">{row.direction}</span>
                  <div class="route-main">
                    <div class="route-title">{row.sourceLabel} → {row.targetLabel}</div>
                    <div class="route-detail mono">
                      {row.type}: {readout(row.sourceValue)} → {readout(row.targetValue)}
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </PropertySection>
        {/if}

        <PropertySection title="States">
          <div class="chip-group">
            {#if activeStates.length}
              {#each activeStates as stateName}
                <span class="runtime-chip">{stateName}</span>
              {/each}
            {:else}
              <span class="runtime-empty">No active states</span>
            {/if}
          </div>
        </PropertySection>
      {/if}
    </div>
  </div>
{/if}

<style>
  .preview-inspector {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: #171717;
    color: #D7D7D7;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid #303030;
    background: #1D1D1D;
    flex-shrink: 0;
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

  .toolbar-btn.active {
    border-color: #5B9BD5;
    background: #094771;
    color: #FFF;
  }

  .toolbar-btn.primary:hover {
    background: #094771;
    color: #FFF;
  }

  .toolbar-btn:disabled {
    opacity: 0.45;
    cursor: default;
    pointer-events: none;
  }

  .preview-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .preview-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    padding: 20px;
    color: #666;
    font-size: 12px;
    text-align: center;
  }

  .preview-empty.inner {
    min-height: 220px;
  }

  .normal-preview {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
    justify-content: flex-start;
    text-align: left;
    color: #A8A8A8;
    line-height: 1.45;
  }

  .normal-preview strong {
    color: #E6E6E6;
    font-size: 12px;
  }

  .readout {
    display: flex;
    align-items: center;
    min-height: 26px;
    padding: 4px 6px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #1A1A1A;
    color: #DDD;
    font-size: 11px;
    line-height: 1.35;
  }

  .readout.mono {
    font-family: Consolas, 'Courier New', monospace;
  }

  .readout.bool {
    justify-content: center;
  }

  .readout.muted {
    color: #888;
  }

  .chip-group {
    grid-column: span 4;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-top: 2px;
  }

  .runtime-chip {
    padding: 3px 7px;
    border-radius: 999px;
    background: rgba(91, 155, 213, 0.18);
    border: 1px solid rgba(91, 155, 213, 0.4);
    color: #CFE7FF;
    font-size: 10px;
  }

  .runtime-empty {
    color: #676767;
    font-size: 11px;
  }

  .value-table,
  .route-table {
    grid-column: span 4;
    display: grid;
    gap: 6px;
  }

  .value-row {
    display: grid;
    grid-template-columns: minmax(80px, 1fr) 64px minmax(72px, auto);
    gap: 8px;
    align-items: center;
    min-height: 28px;
    padding: 5px 7px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #1A1A1A;
  }

  .value-name,
  .route-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #DDD;
    font-size: 11px;
  }

  .value-type {
    color: #8F8F8F;
    font-size: 10px;
    text-transform: uppercase;
  }

  .value-current {
    justify-self: end;
    color: #CFE7FF;
    font-size: 11px;
  }

  .mono {
    font-family: Consolas, 'Courier New', monospace;
  }

  .route-row {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    padding: 6px 7px;
    border: 1px solid #343434;
    border-radius: 4px;
    background: #1A1A1A;
  }

  .route-pill {
    flex: 0 0 auto;
    min-width: 28px;
    padding: 2px 5px;
    border: 1px solid rgba(91, 155, 213, 0.4);
    border-radius: 999px;
    color: #CFE7FF;
    background: rgba(91, 155, 213, 0.12);
    font-size: 9px;
    text-align: center;
  }

  .route-main {
    min-width: 0;
    flex: 1;
  }

  .route-detail {
    margin-top: 2px;
    color: #8F8F8F;
    font-size: 10px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
