<script>
  /**
   * The closed device profile picker: the chosen profile, and a button that opens the picker to
   * change it. Replaces the plain dropdown, which listed ninety-odd profiles by internal id.
   *
   * `compact` is the Device tool's one-line form, for a narrow dock; Settings uses the full one.
   */
  import { deviceProfiles } from '../stores/deviceProfiles.js';
  import { openProfilePicker } from '../stores/deviceProfilePicker.js';
  import { catalogEntry } from '../utils/profileCatalog.js';

  let {
    profileId = '',
    role = '',
    panelProfileIds = [],
    compact = false,
    onChange = () => {},
  } = $props();

  let profile = $derived(($deviceProfiles ?? []).find((entry) => entry?.id === profileId) ?? null);
  let entry = $derived(profile ? catalogEntry(profile) : null);
  let name = $derived(entry?.name || profileId || 'No profile');
  let sub = $derived(
    !profileId ? 'Choose the instrument this device is'
      : !entry ? 'Not loaded'
        : entry.hidden ? 'Older version'
          : entry.maker === 'Generic' ? 'Any instrument that takes CCs'
            : entry.family ? `${entry.family} family` : entry.maker
  );

  function open() {
    openProfilePicker({
      title: 'Device profile',
      subtitle: role ? `for ${role}` : '',
      selectedId: profileId,
      panelProfileIds,
      actionLabel: role ? `Use for ${role}` : 'Use this profile',
      onPick: (id) => onChange(id),
    });
  }
</script>

<button
  type="button"
  class="trigger"
  class:compact
  aria-label="Device profile"
  aria-haspopup="dialog"
  title={compact ? `Device profile: ${name}` : undefined}
  onclick={open}
>
  <span class="text">
    <span class="name">{name}</span>
    {#if !compact}<span class="sub">{sub}</span>{/if}
  </span>
  {#if !compact && Number.isInteger(entry?.parameterCount)}
    <span class="count">{entry.parameterCount.toLocaleString('en-US')} parameters</span>
  {/if}
  {#if entry?.kind}<span class="kind kind-{entry.kind.toLowerCase()}">{entry.kind}</span>{/if}
  {#if compact}
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5L6 7.5 9 4.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
  {:else}
    <span class="change">Change…</span>
  {/if}
</button>

<style>
  .trigger {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 7px 12px;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #202326;
    color: #d8e0e8;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .trigger:hover, .trigger:focus-visible { border-color: #5b9bd5; background: #1f2b37; }
  .trigger.compact { gap: 6px; padding: 3px 8px; border-color: #30343a; min-height: 26px; }
  .text { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
  .name { font-size: 13px; font-weight: 600; color: #e8eef3; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .compact .name { font-size: 12px; font-weight: 400; }
  .sub { font-size: 11px; color: #93a3af; }
  .count { font-size: 11px; color: #93a3af; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .change { font-size: 12px; color: #7fb4e3; white-space: nowrap; }
  .compact svg { flex: none; color: #93a3af; }
  .kind {
    font-size: 10.5px; font-weight: 600; padding: 2px 6px; border-radius: 4px;
    min-width: 40px; text-align: center; box-sizing: border-box; flex: none;
  }
  .compact .kind { min-width: 0; font-size: 10px; padding: 1px 5px; }
  .kind-sysex { background: #1f2e3d; color: #8fc1ec; }
  .kind-nrpn, .kind-rpn { background: #2e2a1f; color: #e2be7a; }
  .kind-cc { background: #2a2633; color: #c2b3ea; }
</style>
