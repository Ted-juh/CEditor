<script>
  /**
   * Device insight zone — right side of the top Look bar (two rows tall).
   *
   * Row 1: profile › parameter (type) + compatibility badge.
   * Row 2: the literal hardware address (Roland DT1/RQ1 hex, or CC#) when resolvable,
   *        plus jump buttons → Properties (Device Bindings) and DPD (the profile).
   * Unbound bindable controls get a quick Bind… picker instead.
   *
   * Device bindings are single-selection only, so the zone hides on multi-select.
   */
  import { selectedControl, getSection, updateControlProperty } from '../stores/controls.js';
  import { selectedComponentIds } from '../stores/panels.js';
  import { openStandaloneDeviceProfileTab } from '../stores/panels.js';
  import {
    deviceProfiles,
    deviceRoleMappings,
    profileParameters,
    deviceRuntimeState,
    refreshProfileParameters,
  } from '../stores/deviceProfiles.js';
  import { getBindableComponentPorts, getPreferredPort, getBindingCompatibility } from '../models/componentPorts.js';
  import { resolveDeviceAddress } from '../utils/deviceAddress.js';
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
  let parameter = $derived(primary ? params.find((entry) => String(entry?.id ?? '') === String(primary.parameterId)) : null);
  let paramType = $derived(String(parameter?.type ?? primary?.parameterType ?? ''));
  let range = $derived(parameter?.range ?? null);
  let choices = $derived(Array.isArray(parameter?.choices) ? parameter.choices : []);
  let liveValue = $derived($deviceRuntimeState?.[deviceRole]?.[String(primary?.parameterId ?? '')]);
  let address = $derived(primary?.parameterId ? resolveDeviceAddress(profile, primary.parameterId) : null);

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

  const requested = new Set();
  function ensureParams() {
    if (!profileId || params.length > 0 || requested.has(profileId)) return;
    requested.add(profileId);
    refreshProfileParameters(profileId, deviceRole);
  }
  $effect(() => {
    if (primary && profileId) ensureParams();
  });

  let pickerOpen = $state(false);
  function openPicker() {
    ensureParams();
    pickerOpen = !pickerOpen;
  }

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
      dryRun: true,
      feedback: { receiveUpdates: true, ignoreOwnEchoes: true, echoWindowMs: 250 },
    };
    const next = [...bindings, binding];
    if (deviceBindings) {
      updateControlProperty(core.id, 'DeviceBindings.bindings', next);
    } else {
      updateControlProperty(core.id, 'DeviceBindings', { _type: 'DeviceBindings', enabled: true, debug: false, bindings: next });
    }
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
    <div class="device-zone">
      {#if primary && primary.parameterId}
        <div class="dev-row">
          <span class="dev-chip">DEVICE</span>
          <span class="dev-profile" title={`Profile: ${profileName}`}>{profileName || '—'}</span>
          <span class="dev-sep">›</span>
          <span class="dev-param" title={`Parameter: ${primary.parameterId}`}>{primary.parameterId}</span>
          {#if paramType}<span class="dev-pill">{paramType}</span>{/if}
          {#if rangeText}<span class="dev-range">{rangeText}</span>{/if}
          {#if badgeGlyph}
            <span class={['dev-badge', compatibility?.status]} title={compatibility?.warning || compatibility?.status}>{badgeGlyph}</span>
          {/if}
          {#if bindings.length > 1}<span class="dev-more" title={`${bindings.length} bindings`}>+{bindings.length - 1}</span>{/if}
        </div>
        <div class="dev-row dev-row-2">
          {#if address}
            <span class="dev-addr" title="Hardware address (from the device profile)">{address}</span>
          {:else}
            <span class="dev-addr muted" title="Address lives in the device profile — open the DPD to see it">addr → DPD</span>
          {/if}
          {#if liveValue !== undefined && liveValue !== null && liveValue !== ''}
            <span class="dev-live" title="Live device value">= {liveValue}</span>
          {/if}
          <span class="dev-actions">
            <button class="dev-jump" title="Edit this binding in Properties → Device Bindings" onclick={openInProperties}>Properties</button>
            <button class="dev-jump" title="Open this profile in the Device Profile Designer" onclick={openInDpd}>DPD</button>
          </span>
        </div>
      {:else}
        <div class="dev-row">
          <span class="dev-chip">DEVICE</span>
          <span class="dev-unbound">Unbound</span>
        </div>
        <div class="dev-row dev-row-2">
          {#if acceptsText}<span class="dev-accepts" title="Parameter types this control accepts">accepts {acceptsText}</span>{/if}
          <button class="dev-bind-btn" onclick={openPicker}>Bind&hellip;</button>
        </div>
      {/if}
    </div>

    {#if pickerOpen}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div class="dev-picker-backdrop" onmousedown={() => (pickerOpen = false)}></div>
      <div class="dev-picker">
        <div class="dev-picker-head">{profileName || profileId || 'Device profile'}</div>
        {#if params.length === 0}
          <div class="dev-picker-empty">No parameters loaded. Open this profile in the Device Profile Designer to load its parameter list.</div>
        {:else}
          <div class="dev-picker-list">
            {#each params.slice(0, 200) as param (param.id)}
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
    margin-left: 14px;
    padding-left: 14px;
    border-left: 1px solid #565656;
  }

  .device-zone {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    max-width: 400px;
    min-width: 0;
    font-size: 11px;
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

  .dev-range,
  .dev-accepts {
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
    color: #C9A06A;
    font-weight: 700;
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

  .dev-bind-btn {
    flex: 0 0 auto;
    height: 20px;
    padding: 0 8px;
    border-radius: 3px;
    border: 1px solid #335371;
    background: #142538;
    color: #DCEBFA;
    font-size: 10px;
    font-weight: 700;
    font-family: inherit;
    cursor: pointer;
  }
  .dev-bind-btn:hover { border-color: #5B9BD5; background: #1B3147; color: #FFF; }

  .dev-picker-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1400;
  }

  .dev-picker {
    position: absolute;
    right: 0;
    top: calc(100% + 8px);
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
