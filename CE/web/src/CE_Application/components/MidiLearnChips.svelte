<script>
  /**
   * Wiggle a control on the synth, drag the chip onto a control on screen.
   *
   * MIDI learn existed and reached exactly one place — the Router's modulation source — because a
   * raw CC cannot say what it is. Two things fixed that. The inbound index names the parameter a
   * message belongs to, so a candidate arrives with a name rather than a controller number. And the
   * drag-to-bind path in CanvasControl (drop handler, compatibility preview, surface highlight, the
   * whole `deviceParameterDrag` store) turned out to have no drag source in the app at all. This is
   * that source, so a complete subsystem stops being unreachable.
   *
   * A chip the profile cannot name is still draggable: it binds as the message rather than as a name
   * (midiControlBindings.js), which is what a generic fader box needs — and, since the binding kinds
   * were widened, what a keyboard's pressure and dynamics need too. Every kind the learn reducer can
   * produce now has somewhere to go, so no chip is inert; one still says when the profile could not
   * name it, because binding by number and binding by name are different promises.
   */
  // Per-icon imports, not the `lucide-svelte` barrel. Tree-shaking is off (see the comment on
  // `treeshake: false` in vite.config.js), so a barrel import is not trimmed back to the two
  // icons it names — it drags lucide's whole ~1800-icon index in behind it. This one did, and
  // because every icon module carries a full licence banner that the minifier must preserve,
  // the MidiMonitorTab chunk that renders these chips came out at 5.8 MB, 99.7% of it the same
  // notice repeated 1702 times. That is the exact failure vite.config.js warns about.
  import Eraser from 'lucide-svelte/icons/eraser';
  import Radio from 'lucide-svelte/icons/radio';
  import {
    deviceRoleMappings,
    latestMidiInputMessage,
    latestSysexInputMessage,
    profileSources,
    selectedDeviceProfileId,
  } from '../stores/deviceProfiles.js';
  import { requestProfileSource } from '../stores/deviceProfiles.js';
  import { isJuceAvailable } from '../bridge/bridge.js';
  import { inboundIndexFor } from '../stores/inboundIndexCache.js';
  import { DEFAULT_DEVICE_ROLE } from '../stores/deviceConstants.js';
  import { clearDeviceParameterDrag, startDeviceParameterDrag } from '../stores/deviceParameterDrag.js';
  import { CHIP_LIMIT, EMPTY_CHIP_STATE, applyChipHex, chipDragPayload, chipList } from '../utils/midiLearnChips.js';

  let state = $state(EMPTY_CHIP_STATE);
  let lastInbound = null;
  let lastSysex = null;

  let profileId = $derived($selectedDeviceProfileId ?? '');
  let indexed = $derived(inboundIndexFor(profileId, $profileSources?.[profileId]?.source));

  // The profile source is what the index is built from, and it is fetched over the bridge. The
  // Device tab asks for it too; the request is idempotent.
  $effect(() => {
    if (profileId && isJuceAvailable()) requestProfileSource(profileId);
  });

  // Whichever device is set up against this profile — the chips describe an instrument, and a
  // binding has to name the device it belongs to. Falls back to the unscoped role.
  let deviceRole = $derived(
    Object.entries($deviceRoleMappings ?? {}).find(([, m]) => String(m?.profileId ?? '') === profileId)?.[0]
      ?? DEFAULT_DEVICE_ROLE
  );

  // Subscribed rather than read as $latestMidiInputMessage, and that is not a style choice: an
  // $effect flushes once per microtask, so two messages arriving in the same tick collapse and the
  // earlier one is never folded — move two knobs at once and one of them never gets a chip. A store
  // subscription fires per set. startNoteInputListener subscribes for the same reason.
  //
  // The effect body reads nothing reactive, so it subscribes once; the index is read at message
  // time, which is also what lets the CC side work before the profile source has arrived.
  $effect(() => {
    const stopInbound = latestMidiInputMessage.subscribe((payload) => {
      if (!payload?.hex || payload === lastInbound) return;
      lastInbound = payload;
      state = applyChipHex(state, payload.hex, indexed?.index ?? null);
    });
    const stopSysex = latestSysexInputMessage.subscribe((payload) => {
      if (!payload?.hex || payload === lastSysex) return;
      lastSysex = payload;
      state = applyChipHex(state, payload.hex, indexed?.index ?? null);
    });
    return () => { stopInbound(); stopSysex(); };
  });

  let chips = $derived(chipList(state, { index: indexed?.index ?? null, parameterById: indexed?.parameterById ?? {} }));

  function onDragStart(event, chip) {
    const payload = chipDragPayload(chip, deviceRole);
    if (!payload) { event.preventDefault(); return; }
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-ceditor-device-parameter', JSON.stringify(payload));
    startDeviceParameterDrag(payload);
  }
</script>

<section class="learn">
  <header>
    <Radio size={13} />
    <strong>Moved on the input</strong>
    <span class="hint">
      {#if chips.length}
        Drag one onto a control to bind it.
      {:else}
        Turn a knob on the instrument and it appears here.
      {/if}
    </span>
    <button
      type="button"
      onclick={() => { state = EMPTY_CHIP_STATE; }}
      disabled={!chips.length}
      title="Forget everything seen so far"
    ><Eraser size={12} /> Clear</button>
  </header>

  {#if !profileId}
    <p class="note">No device profile selected, so nothing can be named. Pick one in the Device tab.</p>
  {:else if !indexed}
    <p class="note">Reading the profile…</p>
  {/if}

  <ul>
    {#each chips as chip (chip.key)}
      {@const draggable = !!chipDragPayload(chip, deviceRole)}
      <li
        class:bindable={draggable}
        class:named={!!chip.parameter}
        {draggable}
        ondragstart={(event) => onDragStart(event, chip)}
        ondragend={clearDeviceParameterDrag}
        title={chip.parameter
          ? `${chip.parameterId} · moved ${chip.span} over ${chip.count} messages · drag onto a control`
          : `${chip.label} — ${chip.reason}`}
      >
        <span class="name">{chip.label}</span>
        <span class="meta">{chip.detail}</span>
        {#if chip.last !== null}<span class="value">{chip.last}</span>{/if}
      </li>
    {/each}
  </ul>
  {#if chips.length >= CHIP_LIMIT}
    <p class="note">Showing the {CHIP_LIMIT} most recent.</p>
  {/if}
</section>

<style>
  .learn { border-bottom: 1px solid #2a2a2a; padding: 6px 8px 8px; }
  header { display: flex; align-items: center; gap: 6px; color: #ddd; font-size: 11px; }
  header strong { font-weight: 600; }
  .hint { color: #888; flex: 1; }
  header button {
    display: inline-flex; align-items: center; gap: 4px;
    background: #232323; color: #ccc; border: 1px solid #383838; border-radius: 4px;
    padding: 2px 6px; font-size: 11px; cursor: pointer;
  }
  header button:disabled { opacity: 0.4; cursor: default; }
  ul { list-style: none; display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0 0; padding: 0; }
  li {
    display: inline-flex; align-items: baseline; gap: 5px;
    border: 1px solid #383838; border-radius: 10px; padding: 2px 8px;
    background: #202020; color: #666; font-size: 11px; cursor: default;
  }
  /* Only a chip that can be dragged looks like it can. Named and raw are distinguished, because
     binding by name and binding by CC number are different promises: the first survives a profile
     that renumbers its controllers, the second does not. */
  li.bindable { background: #2b2b22; border-color: #5c5637; color: #ece6cd; cursor: grab; }
  li.bindable.named { background: #263041; border-color: #3d5578; color: #dce6f5; }
  li.bindable:active { cursor: grabbing; }
  .name { font-weight: 600; }
  .meta { color: inherit; opacity: 0.65; font-size: 10px; }
  .value { font-variant-numeric: tabular-nums; opacity: 0.8; }
  .note { color: #888; font-size: 11px; margin: 6px 0 0; }
</style>
