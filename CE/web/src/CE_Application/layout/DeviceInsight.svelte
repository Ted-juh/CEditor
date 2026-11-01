<script>
  /**
   * Device button in the bar above the canvas (ContextBar): "Device Unbound ▾", or the bound
   * parameter with its compatibility mark.
   *
   * It was a block two rows tall that kept its width, beside a bar that then ran under it. The
   * details are one click away now, in a panel under the button: profile › parameter, type,
   * range, the literal hardware address (Roland DT1/RQ1 hex, or CC#) when resolvable, the live
   * value, and the jumps to Properties (Device Bindings) and the DPD (the profile). The tooltip
   * says the same in a line. Unbound, the button opens the Bind… list straight away.
   *
   * Device bindings are single-selection only, so the button hides on multi-select.
   */
  import { floating } from '../utils/floatingUi.js';
  import { selectedControl, getSection, updateControlProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { openStandaloneDeviceProfileTab } from '../stores/panels.js';
  import {
    deviceProfiles,
    deviceRoleMappings,
    profileParameters,
    profileParameterPages,
    deviceRuntimeState,
    refreshProfileParameters,
  } from '../stores/deviceProfiles.js';
  import { getBindableComponentPorts, getPreferredPort, getBindingCompatibility } from '../models/componentPorts.js';
  import { resolveDeviceAddress } from '../utils/deviceAddress.js';
  import { adoptParameterMetadata } from '../utils/parameterAdoption.js';
  import { requestPropertiesTab } from '../stores/propertiesTab.js';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';

  let control = $derived($selectedControl);
  let core = $derived(getSection(control, 'Core'));
  let multiSelect = $derived($selectedComponentIds.size > 1);
  let ports = $derived(control ? getBindableComponentPorts(control) : []);
  let bindable = $derived(ports.length > 0);

  let deviceBindings = $derived(getSection(control, 'DeviceBindings'));
  let bindings = $derived(Array.isArray(deviceBindings?.bindings) ? deviceBindings.bindings : []);
  let primary = $derived(bindings[0] ?? null);

  let deviceRole = $derived(String(primary?.deviceRole ?? DEFAULT_DEVICE_ROLE));
  let roleMapping = $derived($deviceRoleMappings?.[deviceRole] ?? null);
  let profileId = $derived(String(roleMapping?.profileId ?? ''));
  let profile = $derived($deviceProfiles.find((entry) => String(entry?.id ?? '') === profileId) ?? null);
  let profileName = $derived(profile?.name ?? profileId ?? '');
  let params = $derived(Array.isArray($profileParameters?.[profileId]) ? $profileParameters[profileId] : []);
  let parameterPage = $derived($profileParameterPages?.[profileId] ?? null);
  let parameter = $derived(primary ? params.find((entry) => String(entry?.id ?? '') === String(primary.parameterId)) : null);
  let paramType = $derived(String(parameter?.type ?? primary?.parameterType ?? ''));
  let range = $derived(parameter?.range ?? null);
  let choices = $derived(Array.isArray(parameter?.choices) ? parameter.choices : []);
  let liveValue = $derived($deviceRuntimeState?.[deviceRole]?.[String(primary?.parameterId ?? '')]);
  // The address is read from the profile's runtime, which is loaded the first time one is asked
  // of it (deviceAddress.js): undefined while it loads, so the line does not claim there is none.
  let address = $state(null);
  $effect(() => {
    const parameterId = primary?.parameterId;
    const of = profile;
    if (!parameterId) { address = null; return; }
    let current = true;
    address = undefined;
    resolveDeviceAddress(of, parameterId).then((found) => { if (current) address = found; });
    return () => { current = false; };
  });

  let compatibility = $derived.by(() => {
    if (!control || !primary || !primary.parameterId) return null;
    const probe = parameter ?? { type: paramType, range: range ?? {}, choices };
    return getBindingCompatibility(control, probe);
  });

  let rangeText = $derived.by(() => {
    if (paramType === 'choice' || paramType === 'enum') return choices.length ? `${choices.length} choices` : '';
    if (range && (range.min != null || range.max != null)) return `${range.min ?? 0}–${range.max ?? '?'}`;
    return '';
  });

  let acceptsText = $derived((ports[0]?.accepts ?? []).slice(0, 3).join('/'));
  let badgeGlyph = $derived.by(() => {
    const status = compatibility?.status;
    if (status === 'compatible') return '✓';
    if (status === 'warning') return '⚠';
    if (status === 'incompatible') return '✗';
    return '';
  });

  const requestedPages = new Set();
  function requestParameterPage(offset = 0, { retry = false } = {}) {
    if (!profileId) return;
    const normalizedOffset = Math.max(0, Number(offset) || 0);
    const key = `${profileId}:${normalizedOffset}`;
    if (retry) requestedPages.delete(key);
    if (requestedPages.has(key)) return;
    requestedPages.add(key);
    refreshProfileParameters(profileId, deviceRole, { offset: normalizedOffset });
  }
  function ensureParams() {
    if (!profileId || params.length > 0) return;
    requestParameterPage(0);
  }
  function loadMoreParams() {
    requestParameterPage(parameterPage?.loaded ?? params.length, { retry: true });
  }
  $effect(() => {
    if (primary && profileId) ensureParams();
  });

  let pickerOpen = $state(false);
  let pickerAnchor = $state(null);
  function openPicker(event) {
    ensureParams();
    pickerAnchor = event?.currentTarget ?? null;
    pickerOpen = !pickerOpen;
  }

  let detailsOpen = $state(false);
  let detailsAnchor = $state(null);
  function openDetails(event) {
    detailsAnchor = event?.currentTarget ?? null;
    detailsOpen = !detailsOpen;
  }

  // Another control selected: what was open was about the last one. By the id, not the control,
  // so an edit to this one (a rebind, a new value) leaves the panel open and up to date.
  let controlId = $derived(core?.id ?? null);
  $effect(() => {
    void controlId;
    pickerOpen = false;
    detailsOpen = false;
  });

  // Escape closes, and stops there: the canvas would otherwise take it as "clear the selection".
  $effect(() => {
    if (!pickerOpen && !detailsOpen) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      pickerOpen = false;
      detailsOpen = false;
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  let unboundTitle = $derived(`Not bound to a device parameter${acceptsText ? `. Accepts ${acceptsText}` : ''}. Click to bind one.`);
  let boundTitle = $derived([
    `${profileName || 'Device'} › ${primary?.parameterId ?? ''}`,
    [paramType, rangeText].filter(Boolean).join(', '),
    address ? `address ${address}` : '',
    liveValue !== undefined && liveValue !== null && liveValue !== '' ? `now ${liveValue}` : '',
    String(compatibility?.warning ?? '').replace(/\.$/, ''),
  ].filter(Boolean).join(' · ') + '. Click for the binding, Properties and DPD.');

  function bindTo(param) {
    if (!core?.id || !param) return;
    const port = getPreferredPort(control, param.type) ?? ports[0];
    if (!port) return;
    const binding = {
      kind: 'deviceParameter',
      port: port.id,
      deviceRole,
      parameterId: String(param.id ?? ''),
      parameterType: String(param.type ?? ''),
      adoptMetadata: true,
      dryRun: false,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    };
    const next = [...bindings, binding];
    if (deviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', next);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', { _type: 'DeviceBindings', enabled: true, debug: false, bindings: next });
    }
    adoptParameterMetadata(core.id, core.controlType, param);
    pickerOpen = false;
  }

  function openInProperties() {
    requestPropertiesTab('devicebindings');
  }
  function openInDpd() {
    if (profileId) openStandaloneDeviceProfileTab({ id: profileId, name: profileName });
  }
</script>

{#if bindable && !multiSelect}
  <div class="device-wrap">
    {#if primary && primary.parameterId}
      <button class="dev-chip-btn" title={boundTitle} aria-haspopup="dialog" aria-expanded={detailsOpen} onclick={openDetails}>
        <span class="dev-chip">Device</span>
        <span class="dev-param">{primary.parameterId}</span>
        {#if badgeGlyph}<span class={['dev-badge', compatibility?.status]}>{badgeGlyph}</span>{/if}
        {#if bindings.length > 1}<span class="dev-more">+{bindings.length - 1}</span>{/if}
        <span class="dev-caret" aria-hidden="true">▾</span>
      </button>
    {:else}
      <button class="dev-chip-btn dev-bind-btn" title={unboundTitle} aria-haspopup="dialog" aria-expanded={pickerOpen} onclick={openPicker}>
        <span class="dev-chip">Device</span>
        <span class="dev-unbound">Unbound</span>
        <span class="dev-caret" aria-hidden="true">▾</span>
      </button>
    {/if}

    {#if detailsOpen && primary?.parameterId}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dev-picker-backdrop" onmousedown={() => (detailsOpen = false)}></div>
      <div class="dev-details" role="dialog" aria-label="Device binding" use:floating={{ anchor: detailsAnchor, placement: 'bottom-end', offset: 6, fallbackPlacements: ['top-end', 'bottom-start', 'top-start'] }}>
        <div class="dev-row">
          <span class="dev-profile" title={`Profile: ${profileName}`}>{profileName || '—'}</span>
          <span class="dev-sep">›</span>
          <span class="dev-param" title={`Parameter: ${primary.parameterId}`}>{primary.parameterId}</span>
          {#if paramType}<span class="dev-pill">{paramType}</span>{/if}
          {#if rangeText}<span class="dev-range">{rangeText}</span>{/if}
          {#if badgeGlyph}
            <span class={['dev-badge', compatibility?.status]} title={compatibility?.warning || compatibility?.status}>{badgeGlyph}</span>
          {/if}
        </div>
        {#if compatibility?.warning}<div class="dev-note">{compatibility.warning}</div>{/if}
        {#if bindings.length > 1}<div class="dev-note">{bindings.length} bindings; this is the first. Properties lists them all.</div>{/if}
        <div class="dev-row">
          {#if address}
            <span class="dev-addr" title="Hardware address (from the device profile)">{address}</span>
          {:else if address !== undefined}
            <span class="dev-addr muted" title="Address lives in the device profile — open the DPD to see it">addr → DPD</span>
          {/if}
          {#if liveValue !== undefined && liveValue !== null && liveValue !== ''}
            <span class="dev-live" title="Live device value">= {liveValue}</span>
          {/if}
          <span class="dev-actions">
            <button class="dev-jump" title="Edit this binding in Properties → Device Bindings" onclick={() => { detailsOpen = false; openInProperties(); }}>Properties</button>
            <button class="dev-jump" title="Open this profile in the Device Profile Designer" onclick={() => { detailsOpen = false; openInDpd(); }}>DPD</button>
          </span>
        </div>
      </div>
    {/if}

    {#if pickerOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dev-picker-backdrop" onmousedown={() => (pickerOpen = false)}></div>
      <div class="dev-picker" use:floating={{ anchor: pickerAnchor, placement: 'bottom-end', offset: 8, fallbackPlacements: ['top-end', 'bottom-start', 'top-start'] }}>
        <div class="dev-picker-head">{profileName || profileId || 'Device profile'}</div>
        {#if params.length === 0}
          <div class="dev-picker-empty">
            <span>No parameters loaded.</span>
            <button class="dev-retry" onclick={() => requestParameterPage(0, { retry: true })}>Retry</button>
          </div>
        {:else}
          <div class="dev-picker-list">
            {#each params as param (param.id)}
              {@const compat = getBindingCompatibility(control, param)}
              <button
                class="dev-picker-item"
                disabled={compat.status === 'incompatible'}
                title={compat.warning || compat.status}
                onclick={() => bindTo(param)}
              >
                <span class="pi-id">{param.id}</span>
                <span class="pi-type">{param.type}</span>
                <span class={['pi-badge', compat.status]}>{compat.status === 'compatible' ? '✓' : compat.status === 'warning' ? '⚠' : '✗'}</span>
              </button>
            {/each}
            {#if parameterPage?.hasMore}
              <button class="dev-load-more" onclick={loadMoreParams}>
                Load more ({params.length} of {parameterPage.total})
              </button>
            {/if}
          </div>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .device-wrap {
    position: relative;
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .dev-chip-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 22px;
    max-width: 240px;
    padding: 0 8px;
    border: 1px solid #3A3A3A;
    border-radius: 3px;
    background: #1E1E1E;
    color: #DDD;
    font-family: inherit;
    font-size: 11px;
    white-space: nowrap;
    cursor: pointer;
  }
  .dev-chip-btn:hover,
  .dev-chip-btn[aria-expanded='true'] { border-color: #5B9BD5; background: #1B3147; color: #FFF; }
  .dev-chip-btn .dev-param { max-width: 140px; }
  .dev-caret { flex: 0 0 auto; color: #8F8F8F; font-size: 10px; }

  .dev-details {
    z-index: 1401;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 240px;
    max-width: 380px;
    padding: 8px 10px;
    background: #232323;
    border: 1px solid #3A3A3A;
    border-radius: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    font-size: 11px;
  }

  .dev-note {
    color: #B9A27A;
    font-size: 10px;
    line-height: 1.35;
  }

  .dev-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .dev-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .dev-chip {
    flex: 0 0 auto;
    color: #6FA8C7;
    font-size: 10px;
    font-weight: 700;
  }

  .dev-profile,
  .dev-param {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dev-profile { color: #9FB6C9; max-width: 130px; }
  .dev-param { color: #E6E6E6; font-weight: 600; max-width: 160px; }
  .dev-sep { color: #555; }

  .dev-pill {
    flex: 0 0 auto;
    padding: 1px 5px;
    border-radius: 3px;
    border: 1px solid #3A3A3A;
    background: #1A1A1A;
    color: #8F8F8F;
    font-size: 10px;
    font-weight: 700;
  }

  .dev-range {
    flex: 0 0 auto;
    color: #8A8A8A;
    font-size: 10px;
    white-space: nowrap;
  }

  .dev-addr {
    flex: 0 0 auto;
    color: #9FD0C7;
    font-family: Consolas, 'Courier New', monospace;
    font-size: 10px;
    white-space: nowrap;
  }
  .dev-addr.muted { color: #707070; font-family: inherit; }

  .dev-live {
    flex: 0 0 auto;
    color: #6FCF97;
    font-weight: 700;
    white-space: nowrap;
  }

  .dev-unbound {
    flex: 0 0 auto;
    color: #DDD;
  }

  .dev-badge {
    flex: 0 0 auto;
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
  }
  .dev-badge.compatible { color: #6FCF97; }
  .dev-badge.warning { color: #E5A029; }
  .dev-badge.incompatible { color: #D56B6B; }

  .dev-more { flex: 0 0 auto; color: #8A8A8A; font-size: 10px; }

  .dev-jump {
    flex: 0 0 auto;
    height: 22px;
    padding: 0 8px;
    border-radius: 3px;
    border: 1px solid #444;
    background: #333;
    color: #999;
    font-size: 10px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
  }
  .dev-jump:hover { background: #444; color: #DDD; }

  .dev-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
  }

  .dev-picker {
    z-index: 1401;
    width: 320px;
    max-height: 340px;
    display: flex;
    flex-direction: column;
    background: #232323;
    border: 1px solid #3A3A3A;
    border-radius: 6px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .dev-picker-head {
    flex: 0 0 auto;
    padding: 7px 10px;
    border-bottom: 1px solid #333;
    color: #9FB6C9;
    font-size: 11px;
    font-weight: 700;
  }

  .dev-picker-empty {
    padding: 12px;
    color: #8A8A8A;
    font-size: 11px;
    line-height: 1.4;
  }

  .dev-picker-empty span { display: block; margin-bottom: 8px; }
  .dev-retry,
  .dev-load-more {
    border: 1px solid #444;
    border-radius: 3px;
    background: #333;
    color: #CCC;
    font: inherit;
    cursor: pointer;
  }
  .dev-retry { padding: 3px 8px; }
  .dev-load-more { width: 100%; padding: 7px 10px; }
  .dev-retry:hover,
  .dev-load-more:hover { border-color: #5B9BD5; color: #FFF; }

  .dev-picker-list {
    overflow-y: auto;
    min-height: 0;
  }

  .dev-picker-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 10px;
    background: none;
    border: none;
    border-bottom: 1px solid #2A2A2A;
    color: #DDD;
    font-size: 11px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
  }
  .dev-picker-item:hover:not(:disabled) { background: #094771; color: #FFF; }
  .dev-picker-item:disabled { opacity: 0.4; cursor: default; }

  .pi-id { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .pi-type { flex: 0 0 auto; color: #8F8F8F; font-size: 10px; }
  .pi-badge { flex: 0 0 auto; width: 14px; text-align: center; }
  .pi-badge.compatible { color: #6FCF97; }
  .pi-badge.warning { color: #E5A029; }
  .pi-badge.incompatible { color: #D56B6B; }
</style>
