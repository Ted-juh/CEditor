<script>
  import HostConfirmButton from './HostConfirmButton.svelte';
  import HostPickupIndicator from './HostPickupIndicator.svelte';
  /**
   * HostSurfacePanel.svelte — the controller as a picture (rack-canvas plan, the surface note).
   *
   * Assigning hardware is spatial work. "This knob, third from the left" is a position, and a
   * list of eight text rows is the wrong shape for it. So the dock draws the surface the
   * profile describes, you click a section to zoom into it, and a back button returns you to
   * the whole instrument.
   *
   * The drawing is DATA, from SurfaceProfile — never a picture of one controller baked into
   * this file, because the whole reason the profile registry exists is that support is claimed
   * by conformance rather than by special-casing a device in the UI. A profile with no layout
   * gets a generic drawing built from its capability counts; a session with no profile at all
   * gets a sentence saying so.
   *
   * A control the runtime cannot reach is drawn and labelled and visibly inert. That is not a
   * gap: the picture is of the instrument in front of you, not of the subset we drive, and a
   * fader that quietly looked mappable would be the lie worth avoiding.
   */
  import { onDestroy } from 'svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import Search from 'lucide-svelte/icons/search';
  import GripVertical from 'lucide-svelte/icons/grip-vertical';
  import SlidersHorizontal from 'lucide-svelte/icons/sliders-horizontal';
  import Radio from 'lucide-svelte/icons/radio';
  import HostPartPicker from './HostPartPicker.svelte';
  import {
    hostSurface, hostSurfaceLayout, requestSurfaceLayout, hostState, hostMidiActivity,
    hostMidiLearn, cancelMidiLearn, clearControlSlotMidi,
    hostParamDrag, clearControlSlot, hostParameters, requestParameters,
    filterParameters, parameterShortlist, surfaceControlSlot, assignSurfaceControl, learnSurfaceControl,
    padLayers, padColourCss, surfaceSlotId, setPadLayers, setPadActiveLayer, MAX_PAD_LAYERS,
    setFaderLayers, setFaderActiveLayer,
    setControlSlotOptions, focusRackPart,
    setUserSurface, clearUserSurface, learnUserSurface, finishUserSurfaceLearn,
  } from '../stores/instrumentHost.js';

  let zoom = $state('');        // '' = the whole instrument, else a region id
  let asked = $state(false);
  let defaultedLayout = '';
  let selectedControlId = $state('');
  let selectedParameterId = $state('');
  let clearArmed = $state(false);
  let clearTimer;

  let layout = $derived($hostSurfaceLayout);
  let region = $derived(layout.regions.find((r) => r.id === zoom) ?? null);

  // The viewBox: the whole unit, or the box around the region you picked. One number pair
  // drives everything below, which is why zooming needs no second drawing.
  let view = $derived(region ? region : { x: 0, y: 0, w: 1, h: 1 });
  let visibleAspect = $derived(((layout.aspect || 2.3) * view.w) / view.h);

  $effect(() => {
    // Ask once, the first time anybody looks. The layout is static per profile.
    if (!asked) { asked = true; requestSurfaceLayout(); }
  });

  $effect(() => {
    // Start where the useful controls are rather than showing a postage-stamp overview of
    // the entire keyboard. Remember a user's later zoom choice until the drawing changes.
    if (layout.controls.length === 0) return;
    const stamp = `${layout.profileId}:${layout.own}:${layout.controls.length}`;
    if (stamp === defaultedLayout) return;
    defaultedLayout = stamp;
    zoom = ['encoders', 'faders', 'pads']
      .map((id) => layout.regions.find((candidate) => candidate.id === id
                                      && candidate.addressable > 0))
      .find(Boolean)?.id ?? '';
    selectedControlId = '';
  });

  // --- describing a controller nobody wrote a profile for ---------------------------------
  //
  // Control never needed one. MIDI learn binds whatever moves, from any device, so every
  // keyboard already drives the slots — a profile only ever added the picture, the page size,
  // and the device's own screen. Two of those come from three numbers, which is all this asks
  // for; the third is the only thing an authored profile is still needed for.
  let describing = $state(false);
  let ownName = $state('');
  let ownEncoders = $state(8);
  let ownFaders = $state(0);
  let ownPads = $state(0);

  $effect(() => {
    // Prefill from whatever is already described, so opening the form is never a blank slate
    // that silently discards what you told it last time.
    if (layout.userSurface) {
      ownName = layout.userSurface;
      ownEncoders = layout.userEncoders;
      ownFaders = layout.userFaders;
      ownPads = layout.userPads;
    }
  });

  const kindLabel = {
    encoder: 'Encoder', pad: 'Pad', fader: 'Fader', button: 'Button',
    wheel: 'Wheel', keys: 'Keys', display: 'Screen', dial: 'Dial',
  };

  // --- what each control currently does ------------------------------------------------
  //
  // The drawing was a picture and nothing more: it showed which knobs exist and which ones
  // CEditor can reach, and left you to work out what any of them DO from a list of eight text
  // rows somewhere else. That is the list the picture was drawn to replace.
  //
  // The join is one number. A control page has eight slots; the profile gives its encoders
  // index 0..7 (SurfaceProfile.cpp, "Ctrl49Reducer: encoderSlot 0..7"), and the runtime
  // addresses slot N with encoder N. So encoder index N shows page slot N — and nothing here
  // has to know anything else about the hardware.
  let pageId = $state('');
  let pages = $derived($hostState.rack.pages);
  // Follows the rack when the chosen page disappears, rather than showing an empty drawing
  // and no explanation for it.
  let page = $derived(pages.find((p) => p.pageId === pageId) ?? pages[0] ?? null);

  const slotFor = (control) => surfaceControlSlot(page, control);
  let selectedControl = $derived(
    layout.controls.find((control) => control.controlId === selectedControlId) ?? null);
  let selectedSlot = $derived(selectedControl ? slotFor(selectedControl) : null);

  // A control the runtime can reach: an encoder, a fader, a pad or a button the layout gave an
  // index. Encoders have a slot from the day the page was made; the rest get one minted the
  // first time something lands on them, so "no slot yet" is not "cannot be assigned".
  const addressable = (control) =>
    control.index >= 0 && ['encoder', 'fader', 'pad', 'button'].includes(control.kind);
  // Pressed rather than moved: momentary or latching.
  const pressable = (control) => control.kind === 'pad' || control.kind === 'button';

  // A pad's layers on this page (count, and the one it is playing); one layer for any other.
  // The faders share one set of layers, stepped together by Bank ◀ ▶.
  const layersOf = (control) => control.kind === 'pad' ? padLayers(page, control.index)
    : control.kind === 'fader' ? (page?.faderLayers ?? { count: 1, active: 0 }) : { count: 1, active: 0 };
  let faderLayerCount = $derived(page?.faderLayers?.count ?? 1);
  let faderLayerActive = $derived(page?.faderLayers?.active ?? 0);

  const learningControl = (control) => $hostMidiLearn.armed
    && $hostMidiLearn.pageId === (page?.pageId ?? '')
    && ($hostMidiLearn.slotId === slotFor(control)?.slotId
      || $hostMidiLearn.slotId === surfaceSlotId(control.kind, control.index, layersOf(control).active));

  // A pad is lit in its layer's colour — the colour chosen for it, or the layer's default —
  // exactly as the host lights the real one (InstrumentHostService::padLight), so the drawing
  // and the keyboard agree about which layer every pad is on. Left to the state classes when
  // there is something they must say instead: the pad you are hitting, or an assignment gone.
  function padStyle(control, slot) {
    if (control.kind !== 'pad' || control.index < 0) return '';
    if (slot && litSlotId === slot.slotId) return '';
    const layers = layersOf(control);
    if (slot?.assigned) return slot.resolved ? `--led:${padColourCss(slot, layers.active)};` : '';
    return layers.count > 1 ? `--led:${padColourCss(null, layers.active)};` : '';
  }
  // One pip per layer, in that layer's colour, the one playing drawn full.
  const layerPips = (control) => Array.from({ length: layersOf(control).count }, (_, layer) => ({
    layer,
    active: layer === layersOf(control).active,
    colour: padColourCss(surfaceControlSlot(page, control, layer), layer),
  }));
  let mappedCount = $derived(layout.controls.filter((control) => addressable(control)
    && slotFor(control)?.assigned && slotFor(control)?.resolved).length);

  // The knob you are turning, lit — or the pad you are hitting. The frontend does the
  // matching because it already holds what every slot is bound to; the native side just
  // says which controller (or note) moved.
  let litSlotId = $state('');
  let litAt = 0;
  let litTimer;
  $effect(() => {
    const activity = $hostMidiActivity;
    if ((activity.cc < 0 && activity.note < 0) || !page) return;
    const hit = page.slots.find((s) => (s.midiChannel === 0 || s.midiChannel === activity.channel)
                                       && ((activity.cc >= 0 && s.midiCc === activity.cc)
                                           || (activity.note >= 0 && s.midiNote === activity.note)));
    if (!hit) return;
    litSlotId = hit.slotId;
    litAt = activity.seq;
    const seq = activity.seq;
    // Held briefly rather than latched: a knob that stays lit after you let go is a knob you
    // stop believing.
    clearTimeout(litTimer);
    litTimer = setTimeout(() => { if (litAt === seq) litSlotId = ''; }, 350);
  });

  function title(control) {
    const what = kindLabel[control.kind] ?? control.kind;
    const named = control.label ? `${what} ${control.label}` : what;
    if (control.index < 0) return `${named} — on the keyboard, but CEditor does not map it`;
    const layers = layersOf(control);
    const onLayer = layers.count > 1 ? ` (layer ${layers.active + 1} of ${layers.count})` : '';

    const slot = slotFor(control);
    const bound = slot?.midiNote >= 0 ? ` · note ${slot.midiNote}` : slot?.midiCc >= 0 ? ` · CC ${slot.midiCc}` : '';
    if (slot?.assigned)
      return `${named}${onLayer} — ${slot.displayName}${slot.partName ? ` (${slot.partName})` : ''}${bound}`
             + (slot.resolved ? '' : ' — the part no longer has this parameter')
             + (slot.toggle ? (slot.latched ? ' — latching, ON' : ' — latching, off') : '')
             + '\nClick to inspect, or drop a parameter here to reassign it.';
    if (addressable(control))
      return `${named}${onLayer} — unassigned. Click to inspect, or drag a parameter onto it.`;
    return `${named} — CEditor addresses this as ${control.kind} ${control.index}`;
  }

  // --- what the controls look like ------------------------------------------------------
  //
  // Each kind is drawn as the hardware it is: a knurled knob with an LED arc, a rubber pad
  // with a backlit edge, a fader cap in its slot, a keybed with black keys. The look is per
  // KIND, never per device, so every profile (and every controller somebody describes) gets
  // it from the same layout data, and nothing here knows it is drawing a CTRL49.
  //
  // The keybed is the one control whose face depends on more than its box: the label carries
  // the key count ("49 keys"), and a layout that says nothing gets the commonest one. It
  // starts on C because nearly every controller keybed does; the drawing is for recognising
  // your keyboard, not for reading pitches off it.
  const BLACK_KEYS = new Set([1, 3, 6, 8, 10]);
  function keybed(control) {
    const count = Math.max(12, Math.min(128, Number(control.label.match(/\d+/)?.[0]) || 49));
    let whites = 0;
    const blacks = [];
    for (let note = 0; note < count; note += 1) {
      if (BLACK_KEYS.has(note % 12)) blacks.push(whites);
      else whites += 1;
    }
    const width = 100 / whites;
    return { width, blacks: blacks.map((before) => before * width - width * 0.3) };
  }

  // Declared before the handlers that write it. Svelte 5 hoists nothing here for you, and a
  // rune assigned above its own declaration is a class that never appears and no error.
  let hoveredId = $state('');

  function dropOn(event, control) {
    if (!addressable(control) || !$hostParamDrag.parameterId) return;
    event.preventDefault();
    // By control, not by slot: a fader or a pad has no slot until this very drop. And by
    // page if there is one — with none, the drop mints it, so the drawing works from the
    // first minute rather than after a trip to the pages list.
    assignSurfaceControl(page?.pageId ?? '', control.kind, control.index,
                         $hostParamDrag.partId, $hostParamDrag.parameterId);
    selectedControlId = control.controlId;
    clearArmed = false;
    hostParamDrag.set({ partId: '', parameterId: '', name: '' });
  }

  function dragOver(event, control) {
    if (!addressable(control) || !$hostParamDrag.parameterId) return;
    event.preventDefault();
    // Must match the source's effectAllowed or the browser cancels the drop in silence.
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    hoveredId = control.controlId;
  }

  $effect(() => { if (!$hostParamDrag.parameterId) hoveredId = ''; });

  // --- the parameters you drag from ------------------------------------------------------
  //
  // They have to live HERE, beside the drawing. The Params tab and this one are both dock
  // tabs, so only one of them is ever on screen: a drag that starts in Params and ends on a
  // knob is a gesture the dock makes impossible. Rendering found that, and nothing else
  // would have — the code was correct and unusable.
  //
  // A slim column rather than the full Params view: enough to find a parameter and pick it
  // up, with the real editing left where it already is.
  let paramQuery = $state('');
  let parameterFilter = $state('all');
  const parameterFilters = [
    { id: 'all', label: 'All' }, { id: 'favourites', label: 'Favourites' }, { id: 'recent', label: 'Recently touched' },
  ];
  let focusedPart = $derived($hostState.rack.parts.find(
    (p) => p.partId === $hostState.rack.focusedPartId) ?? null);
  let parameterSubset = $derived.by(() => {
    if ($hostParameters.partId !== focusedPart?.partId) return [];
    if (parameterFilter === 'all') return $hostParameters.parameters;
    // These are separate filters: recently touched must include favourites as well.
    const shortlist = parameterShortlist($hostParameters.parameters,
      parameterFilter === 'favourites' ? $hostParameters.favourites : [], $hostParameters.touched);
    return parameterFilter === 'favourites' ? shortlist.pinned : shortlist.recent;
  });
  let parameters = $derived(filterParameters(parameterSubset, paramQuery));
  let selectedParameter = $derived(
    parameters.find((parameter) => parameter.id === selectedParameterId) ?? null);

  $effect(() => {
    // Follow the focused part, so the column is always the instrument you are looking at.
    const partId = focusedPart?.partId ?? '';
    if (partId && $hostParameters.partId !== partId) requestParameters(partId);
  });

  $effect(() => {
    if (selectedParameterId && !parameters.some((parameter) => parameter.id === selectedParameterId))
      selectedParameterId = '';
  });

  function assignSelected() {
    if (!selectedControl || !selectedParameter || !focusedPart
        || !addressable(selectedControl)) return;
    assignSurfaceControl(page?.pageId ?? '', selectedControl.kind, selectedControl.index,
                         focusedPart.partId, selectedParameter.id);
  }

  function learnSelected() {
    if (!selectedControl || !addressable(selectedControl)) return;
    if ($hostMidiLearn.armed) cancelMidiLearn();
    else learnSurfaceControl(page?.pageId ?? '', selectedControl.kind, selectedControl.index,
                             ['pad', 'fader'].includes(selectedControl.kind) ? layersOf(selectedControl).active : undefined);
  }

  function clearSelected() {
    if (!page || !selectedSlot?.assigned) return;
    if (!clearArmed) {
      clearArmed = true;
      clearTimeout(clearTimer);
      clearTimer = setTimeout(() => (clearArmed = false), 5000);
      return;
    }
    clearTimeout(clearTimer);
    clearArmed = false;
    clearControlSlot(page.pageId, selectedSlot.slotId);
  }

  function updateSelectedOptions(fields) {
    if (!page || !selectedSlot) return;
    setControlSlotOptions(page.pageId, selectedSlot.slotId, fields);
  }

  onDestroy(() => {
    clearTimeout(clearTimer);
    clearTimeout(litTimer);
  });
</script>
<svelte:window onkeydown={(event) => { if (event.key === 'Escape') { clearTimeout(clearTimer); clearArmed = false; } }} />

<div class="surface" data-testid="host-surface-panel">
  <div class="workspace-title">
    <div class="workspace-heading"><SlidersHorizontal size={18} /><div><h2>MIDI learn</h2>
      <p>Drag a parameter onto a control, then learn its hardware binding.</p></div></div>
    <span class="connection-state" class:connected={$hostSurface.state === 'connected'}>
      <i></i>{$hostSurface.state === 'connected' ? ($hostSurface.device || 'Controller connected') : ($hostSurface.state || 'No controller connected')}
    </span>
  </div>
  <div class="surface-head">
    <span class="eyebrow">CONTROLLER</span>
    {#if layout.userSurface && layout.profiles.length > 0}
      <!-- Two drawings exist: the one you described and the built-in one. Which is shown is
           a choice on the tab, not a consequence of a form — describing a controller must
           never make the CTRL49's own picture unreachable. -->
      <select data-testid="surface-drawing" aria-label="Which controller drawing to show"
              value={layout.own ? 'user' : layout.profileId}
              onchange={(e) => requestSurfaceLayout(e.currentTarget.value === 'user' ? '' : e.currentTarget.value)}>
        <option value="user">{layout.userSurface} (described by you)</option>
        {#each layout.profiles as p (p.profileId)}
          <option value={p.profileId}>{p.displayName} (built in)</option>
        {/each}
      </select>
    {:else}
      <strong>{layout.displayName || 'No controller profile'}</strong>
      {#if layout.vendor}<span class="dim">{layout.vendor}</span>{/if}
    {/if}
    <button type="button" class="ghost" data-testid="surface-describe"
            title="Any controller works — CEditor just needs to know what is on yours"
            onclick={() => (describing = !describing)}>{layout.userSurface ? 'Edit controller' : 'Describe controller'}</button>
    {#if pages.length > 0}
      <!-- Which page the drawing is showing. Eight knobs mean eight assignments, and which
           eight depends entirely on the page — a drawing that did not say which would be
           showing one set of labels and implying another. -->
      <label class="page-picker">
        <span>CONTROL PAGE {Math.max(1, pages.indexOf(page) + 1)} / {pages.length}</span>
        <select data-testid="surface-page" aria-label="Control page shown on the drawing"
                value={page?.pageId ?? ''}
                onchange={(e) => (pageId = e.currentTarget.value)}>
          {#each pages as p (p.pageId)}
            <option value={p.pageId}>{p.name}</option>
          {/each}
        </select>
      </label>
    {/if}
  </div>

  {#if describing}
    <div class="describe" data-testid="surface-describe-form">
      <p class="dim">
        Every controller already works: MIDI learn binds whatever you move, whatever sent it.
        This is only so the drawing knows what is on yours.
      </p>
      <div class="describe-row">
        <label>Name <input type="text" bind:value={ownName} placeholder="Advance 49" /></label>
        <label>Knobs <input type="number" min="0" max="64" bind:value={ownEncoders} /></label>
        <label>Faders <input type="number" min="0" max="64" bind:value={ownFaders} /></label>
        <label>Pads <input type="number" min="0" max="64" bind:value={ownPads} /></label>
      </div>
      <div class="describe-row">
        <button type="button" data-testid="surface-describe-save"
                onclick={() => { setUserSurface(ownName, ownEncoders, ownFaders, ownPads);
                                 describing = false; }}>Use this</button>
        {#if layout.learning}
          <button type="button" class="toggle on" data-testid="surface-sweep-finish"
                  title="Stop counting and use what was heard"
                  onclick={() => finishUserSurfaceLearn(ownName)}>
            Heard {layout.heard} — finish
          </button>
        {:else}
          <button type="button" class="toggle" data-testid="surface-sweep"
                  title="Sweep every knob and fader you want to use, then finish"
                  onclick={() => learnUserSurface()}>Count them for me</button>
        {/if}
        {#if layout.userSurface}
          <HostConfirmButton identity="user-surface" data-testid="surface-describe-clear"
                  title="Go back to the built-in profile for a connected controller"
                  onclick={() => { clearUserSurface(); describing = false; }}>Forget it</HostConfirmButton>
        {/if}
      </div>
      {#if layout.learning}
        <!-- Said out loud rather than guessed: a knob and a fader are the same thing on the
             wire, so the count is of continuous controls and the split is the owner's to make. -->
        <p class="dim">
          Counting distinct controls. Knobs and faders look identical over MIDI, so they all
          come back as knobs — move them to the Faders box yourself if the picture matters.
        </p>
      {/if}
    </div>
  {/if}

  {#if layout.controls.length === 0}
    <div class="empty-hint">
      No drawing yet — CEditor has no built-in profile for what is connected. Pages and MIDI
      learn already work; press <strong>Describe controller</strong> and the picture follows.
    </div>
  {:else}
    <div class="surface-body">
      <!-- The drag source, beside the drawing rather than a tab away. -->
      <div class="param-column" data-testid="surface-parameters">
        <div class="panel-heading"><strong>Parameters</strong><span>{parameters.length}</span></div>
        <HostPartPicker parts={$hostState.rack.parts} partId={focusedPart?.partId ?? ''}
          label="INSTRUMENT" ariaLabel="Parameter source instrument"
          onchange={(id) => focusRackPart(id, { followEditor: false })} />
        {#if !focusedPart?.hasInstrument}
          <div class="empty-hint">Focus a part with an instrument to see its parameters.</div>
        {:else}
          <label class="parameter-search"><Search size={14} /><input type="search" placeholder="Search parameters…" bind:value={paramQuery}
                 aria-label="Search this instrument's parameters" /></label>
          <div class="parameter-filters" role="group" aria-label="Parameter filter">
            {#each parameterFilters as filter (filter.id)}
              <button type="button" aria-pressed={parameterFilter === filter.id}
                onclick={() => (parameterFilter = filter.id)}>{filter.label}</button>
            {/each}
          </div>
          <div class="param-scroll">
            {#each parameters as parameter (parameter.id)}
              <button type="button" class="param-chip" draggable="true"
                   class:dragging={$hostParamDrag.parameterId === parameter.id}
                   class:selected={selectedParameterId === parameter.id}
                   data-testid="surface-param"
                   title={`${parameter.name || parameter.id} — select or drag onto a control`}
                   onclick={() => (selectedParameterId = parameter.id)}
                   ondragstart={(e) => {
                     hostParamDrag.set({ partId: focusedPart.partId, parameterId: parameter.id,
                                         name: parameter.name });
                     e.dataTransfer?.setData('text/plain', parameter.name);
                     if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
                   }}
                   ondragend={() => hostParamDrag.set({ partId: '', parameterId: '', name: '' })}>
                <!-- A plug-in that reports no name for a parameter still has one to drag: its
                     id, which is at least the thing the plug-in itself calls it. -->
                <GripVertical size={13} /><span>{parameter.name || parameter.id || `#${parameter.index}`}</span>
              </button>
            {/each}
            {#if parameters.length === 0}
              <div class="empty-hint">{paramQuery.trim() ? 'No parameter matches.'
                : parameterFilter === 'favourites' ? 'No favourites.'
                : parameterFilter === 'recent' ? 'No recently touched parameters.' : 'No parameters.'}</div>
            {/if}
          </div>
          <p class="parameter-hint">Drag to map · or select and assign</p>
        {/if}
      </div>

      <!-- Fit the authored geometry within the available canvas; drag feedback never resizes it. -->
      <section class="controller-canvas" aria-label="Controller mapping">
        <div class="panel-heading"><strong>{region?.label || 'Whole controller'}</strong>
          <span>{mappedCount} mapped</span></div>
        <div class="region-tabs" aria-label="Controller regions">
          <button type="button" class:active={!zoom} data-testid="surface-back"
                  onclick={() => (zoom = '')}>Overview</button>
          {#each layout.regions as r (r.id)}
            <button type="button" class:active={zoom === r.id}
                    aria-pressed={zoom === r.id} data-testid={`surface-region-${r.id}`}
                    title={`${r.addressable} of ${r.count} controls can be assigned`}
                    onclick={() => (zoom = zoom === r.id ? '' : r.id)}>{r.label}</button>
          {/each}
        </div>
        <div class="canvas-stage">
      <div class="surface-plate" style={`--surface-aspect:${visibleAspect};aspect-ratio:${visibleAspect}`}>
        {#each layout.controls as control (control.controlId)}
          {@const slot = slotFor(control)}
          <button type="button"
                  class={`ctl ${control.kind}`}
                  class:mapped={control.index >= 0}
                  class:assigned={slot?.assigned}
                  class:unresolved={slot?.assigned && !slot.resolved}
                  class:lit={slot && litSlotId === slot.slotId}
                  class:selected={selectedControlId === control.controlId}
                  class:learning={learningControl(control)}
                  class:target={hoveredId === control.controlId}
                  data-testid={`surface-${control.controlId}`}
                  title={title(control)}
                  aria-label={title(control)}
                  aria-pressed={selectedControlId === control.controlId}
                  tabindex={region && (control.x < region.x || control.y < region.y
                    || control.x >= region.x + region.w || control.y >= region.y + region.h) ? -1 : 0}
                  class:latched={slot?.toggle && slot?.latched}
                  ondragover={(e) => dragOver(e, control)}
                  ondrop={(e) => dropOn(e, control)}
                  onclick={() => {
                    selectedControlId = control.controlId;
                    clearArmed = false;
                  }}
                  style={`left:${((control.x - view.x) / view.w) * 100}%;
                          top:${((control.y - view.y) / view.h) * 100}%;
                          width:${(control.w / view.w) * 100}%;
                          height:${(control.h / view.h) * 100}%;${padStyle(control, slot)}`}>
            <!-- The hardware face. Decoration only: state is on the button's classes and its
                 title, so nothing a screen reader or a test needs lives in here. -->
            <span class="hw" aria-hidden="true">
              {#if control.kind === 'encoder' || control.kind === 'dial'}
                <i class="arc"></i><i class="skirt"></i><i class="cap"></i>
              {:else if control.kind === 'fader'}
                <i class="scale"></i><i class="slot"></i><i class="cap"></i>
              {:else if control.kind === 'wheel'}
                <i class="well"></i><i class="roller"></i>
              {:else if control.kind === 'keys'}
                {@const bed = keybed(control)}
                <i class="whites" style={`--kw:${bed.width}%`}></i>
                {#each bed.blacks as left, i (i)}
                  <i class="black" style={`left:${left}%;width:${bed.width * 0.6}%`}></i>
                {/each}
              {:else if control.kind === 'display'}
                <i class="glass"><b>{page?.name || control.label}</b><small>{layout.displayName}{faderLayerCount > 1
                  ? ` · Faders L${faderLayerActive + 1}/${faderLayerCount}` : ''}</small></i>
              {:else}
                <i class="body"></i>
              {/if}
            </span>
            <!-- What the knob DOES, when it does anything: the whole reason for drawing it
                 rather than listing it. The physical label stays underneath for the ones
                 that drive nothing. The keybed and the screen draw their own faces. -->
            {#if slot?.assigned}
              <span class="ctl-assigned">{slot.displayName}</span>
              <HostPickupIndicator direction={slot.pickupDirection} />
            {:else if control.kind !== 'keys' && control.kind !== 'display'}
              <span class="ctl-label" class:glyph={[...control.label].length <= 2}>{control.label}</span>
            {/if}
            {#if control.kind === 'pad' && layersOf(control).count > 1}
              <!-- Which layer the pad is on, under its name: a pip per layer in that layer's
                   colour, the one it is playing drawn full. -->
              <span class="pad-layers" data-testid={`surface-layers-${control.controlId}`}
                    aria-hidden="true" data-active={layersOf(control).active + 1}>
                {#each layerPips(control) as pip (pip.layer)}
                  <i class:active={pip.active} style={`--pip:${pip.colour}`}></i>
                {/each}
              </span>
            {/if}
          </button>
        {/each}
      </div>
        </div>
        <div class="canvas-caption" role="status" title={$hostParamDrag.name}>
          {$hostParamDrag.parameterId ? `Drop ${$hostParamDrag.name || 'parameter'} onto a control`
            : 'Select a control to inspect · drop a parameter to map'}
        </div>
        <div class="surface-regions">
          <span class="state-key"><i class="empty"></i>Empty</span>
          <span class="state-key"><i class="mapped"></i>Mapped</span>
          <span class="state-key"><i class="problem"></i>Unresolved</span>
          <span class="state-key"><i class="moving"></i>Moving</span>
        </div>
      </section>

      <aside class="control-inspector" data-testid="surface-control-inspector"
             aria-label="Selected controller assignment">
        <div class="panel-heading"><strong>Assignment</strong></div>
        {#if selectedControl}
          <div class="inspector-head">
            <div>
              <span class="eyebrow">HARDWARE CONTROL</span>
              <strong>{kindLabel[selectedControl.kind] ?? selectedControl.kind} {selectedControl.label}</strong>
            </div>
            <span class="state-pill" class:assigned={selectedSlot?.assigned}
                  class:problem={selectedSlot?.assigned && !selectedSlot.resolved}>
              {selectedControl.index < 0 ? 'UNAVAILABLE'
                : selectedSlot?.assigned ? (selectedSlot.resolved ? 'MAPPED' : 'UNRESOLVED') : 'EMPTY'}
            </span>
          </div>

          {#if selectedControl.index < 0}
            <p class="empty-hint">This control is shown because it exists on the hardware, but the current profile cannot address it.</p>
          {:else}
            {#if selectedControl.kind === 'fader'}
              <!-- The faders' layers: one set for the whole bank. Choosing one here is what
                   Bank ◀ ▶ does on the keyboard, and the faders pick their new parameters up
                   where they are rather than jumping them. -->
              <div class="pad-layer-editor" data-testid="surface-fader-layers">
                <label>Fader layers
                  <select aria-label="Number of fader layers" value={faderLayerCount}
                          data-testid="surface-fader-layer-count"
                          onchange={(e) => setFaderLayers(page?.pageId ?? '', Number(e.currentTarget.value))}>
                    {#each Array.from({ length: MAX_PAD_LAYERS }, (_, i) => i + 1) as count (count)}
                      <option value={count}>{count === 1 ? '1 (no layers)' : count}</option>
                    {/each}
                  </select>
                </label>
                {#if faderLayerCount > 1}
                  <div class="layer-tabs" role="group" aria-label="Layer the faders play">
                    {#each Array.from({ length: faderLayerCount }, (_, i) => i) as layer (layer)}
                      <button type="button" aria-pressed={layer === faderLayerActive}
                              data-testid={`surface-fader-layer-${layer + 1}`} style="--pip: var(--host-accent)"
                              onclick={() => setFaderActiveLayer(page?.pageId ?? '', layer)}>L{layer + 1}</button>
                    {/each}
                  </div>
                  <p class="dim layer-hint">Bank ◀ ▶ on the keyboard steps every fader to its previous or next layer.</p>
                {/if}
              </div>
            {/if}
            {#if selectedControl.kind === 'pad'}
              {@const layers = layersOf(selectedControl)}
              <!-- A pad's layers. Choosing one here is choosing what the pad plays — the same
                   state a long press on the small button above the pad steps through — so the
                   assignment below is always the one you would hear. -->
              <div class="pad-layer-editor" data-testid="surface-pad-layers">
                <label>Layers
                  <select aria-label="Number of layers on this pad" value={layers.count}
                          data-testid="surface-pad-layer-count"
                          onchange={(e) => setPadLayers(page?.pageId ?? '', selectedControl.index,
                                                        Number(e.currentTarget.value))}>
                    {#each Array.from({ length: MAX_PAD_LAYERS }, (_, i) => i + 1) as count (count)}
                      <option value={count}>{count === 1 ? '1 (no layers)' : count}</option>
                    {/each}
                  </select>
                </label>
                {#if layers.count > 1}
                  <div class="layer-tabs" role="group" aria-label="Layer this pad plays">
                    {#each layerPips(selectedControl) as pip (pip.layer)}
                      <button type="button" aria-pressed={pip.active} data-testid={`surface-pad-layer-${pip.layer + 1}`}
                              style={`--pip:${pip.colour}`}
                              onclick={() => setPadActiveLayer(page?.pageId ?? '', selectedControl.index, pip.layer)}>
                        <i></i>L{pip.layer + 1}
                      </button>
                    {/each}
                  </div>
                  <p class="dim layer-hint">Hold the small button above the pad to step through its layers.</p>
                {/if}
                <label class="colour-row">Pad colour
                  <span>
                    <input type="color" aria-label="Pad colour on this layer" data-testid="surface-pad-colour"
                           disabled={!selectedSlot}
                           value={padColourCss(selectedSlot, layers.active)}
                           onchange={(e) => updateSelectedOptions({ colour: parseInt(e.currentTarget.value.slice(1), 16) })} />
                    {#if selectedSlot && selectedSlot.colour >= 0}
                      <button type="button" class="ghost" onclick={() => updateSelectedOptions({ colour: -1 })}>Default</button>
                    {/if}
                  </span>
                </label>
                {#if !selectedSlot}
                  <p class="dim layer-hint">Assign something to this layer to give it a colour of its own.</p>
                {/if}
              </div>
            {/if}
            <div class="assignment-summary">
              <strong>{selectedSlot?.assigned ? selectedSlot.displayName : 'No parameter assigned'}
                <HostPickupIndicator direction={selectedSlot?.pickupDirection} /></strong>
              <span>{selectedSlot?.partName || (selectedParameter
                ? `Ready to assign ${selectedParameter.name || selectedParameter.id}`
                : 'Select a parameter or drag one onto the control')}</span>
              {#if selectedSlot?.midiNote >= 0}
                <span>Hardware binding · note {selectedSlot.midiNote}</span>
              {:else if selectedSlot?.midiCc >= 0}
                <span>Hardware binding · CC {selectedSlot.midiCc}{selectedSlot.midiChannel ? ` · ch ${selectedSlot.midiChannel}` : ''}</span>
              {:else}
                <span>No MIDI binding learned</span>
              {/if}
            </div>

            <div class="inspector-actions">
              <button type="button" disabled={!selectedParameter || !focusedPart}
                      data-testid="surface-assign-selected" onclick={assignSelected}>Assign selected</button>
              <button type="button" class="toggle" class:on={$hostMidiLearn.armed}
                      data-testid="surface-learn-selected" onclick={learnSelected}>
                {$hostMidiLearn.armed ? 'Cancel learning' : 'Learn hardware'}
              </button>
            </div>
            {#if $hostMidiLearn.armed}
              <div class="learning-notice" role="status"><Radio size={16} /><span>
                <strong>Listening for MIDI…</strong>
                {learningControl(selectedControl) ? 'Move the knob, fader or pad you want to bind.'
                  : 'Learning is active on another control. Cancel it to start here.'}
              </span></div>
            {/if}

            {#if selectedSlot?.assigned}
              <div class="option-grid">
                <label>Minimum
                  <input type="number" min="0" max="1" step="0.01" value={selectedSlot.rangeMin}
                         onchange={(e) => updateSelectedOptions({ rangeMin: Number(e.currentTarget.value) })} />
                </label>
                <label>Maximum
                  <input type="number" min="0" max="1" step="0.01" value={selectedSlot.rangeMax}
                         onchange={(e) => updateSelectedOptions({ rangeMax: Number(e.currentTarget.value) })} />
                </label>
              </div>
              <div class="check-row">
                <span>Invert control direction</span>
                <PropertyToggle
                  compact
                  value={selectedSlot.inverted}
                  ariaLabel="Invert control direction"
                  onchange={(value) => updateSelectedOptions({ inverted: value })}
                />
              </div>
              {#if pressable(selectedControl)}
                <label>{selectedControl.kind === 'pad' ? 'Pad mode' : 'Button mode'}
                  <select value={selectedSlot.toggle ? 'latching' : 'momentary'}
                          onchange={(e) => updateSelectedOptions({ toggle: e.currentTarget.value === 'latching' })}>
                    <option value="momentary">Momentary</option>
                    <option value="latching">Latching</option>
                  </select>
                </label>
              {/if}
              {#if selectedSlot.midiCc >= 0 && selectedSlot.midiNote < 0 && !pressable(selectedControl) && !selectedSlot.toggle}
                <label>MIDI mode
                  <select aria-label="MIDI control mode" value={selectedSlot.midiRelative ? 'relative' : 'absolute'}
                          onchange={(e) => updateSelectedOptions({ midiRelative: e.currentTarget.value === 'relative' })}>
                    <option value="absolute">Absolute</option>
                    <option value="relative">Relative (1 / 127)</option>
                  </select>
                </label>
                {#if !selectedSlot.midiRelative}
                  <div class="check-row">
                    <span title="Wait until the physical control reaches the current software value">Pickup</span>
                    <PropertyToggle compact value={selectedSlot.midiPickup} ariaLabel="MIDI pickup"
                                    onchange={(value) => updateSelectedOptions({ midiPickup: value })} />
                  </div>
                {/if}
              {/if}
              <div class="inspector-actions secondary">
                {#if selectedSlot.midiCc >= 0 || selectedSlot.midiNote >= 0}
                  <HostConfirmButton identity={JSON.stringify([page.pageId, selectedSlot.slotId])} title="Clear MIDI binding" aria-label="Clear MIDI binding" type="button" class="ghost"
                          onclick={() => clearControlSlotMidi(page.pageId, selectedSlot.slotId)}>Clear MIDI binding</HostConfirmButton>
                {/if}
                <button type="button" class="ghost danger" class:confirming={clearArmed}
                        data-testid="surface-clear-selected" onclick={clearSelected}>
                  {clearArmed ? 'Confirm' : 'Clear assignment'}
                </button>
              </div>
            {/if}
          {/if}
        {:else}
          <div class="inspector-empty">
            <SlidersHorizontal size={26} />
            <strong>Select a control</strong>
            <p>Choose a knob, fader, pad or button on the controller to assign a parameter and learn MIDI.</p>
          </div>
        {/if}
      </aside>
    </div>

  {/if}
</div>

<style>
  .surface { flex: 1; display: flex; flex-direction: column; gap: 12px; min-width: 0; min-height: 0; overflow: auto; container-type: inline-size; }
  button, input, select { font: inherit; }
  button, select, input { border: 1px solid var(--host-line); border-radius: var(--host-radius-control); background: var(--host-surface-raised); color: var(--host-text); min-height: 30px; padding: 5px 8px; box-sizing: border-box; }
  button { cursor: pointer; }
  button:hover:not(:disabled) { border-color: var(--host-accent); background: var(--host-accent-surface); }
  button:disabled { opacity: .4; cursor: default; }
  button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid var(--host-accent); outline-offset: 2px; }
  button.ghost { background: transparent; }
  button.danger { color: #e6aaaa; }
  button.on { border-color: #d4ad61; color: #f1ce87; background: #352d1e; }
  .workspace-title, .workspace-heading { display: flex; align-items: center; gap: 10px; }
  .workspace-title { justify-content: space-between; flex-wrap: wrap; }
  .workspace-heading > :global(svg) { color: var(--host-accent); flex: none; }
  h2 { margin: 0; font-size: 17px; font-weight: 650; }
  .workspace-heading p { margin: 3px 0 0; color: var(--host-text-dim); font-size: 12px; }
  .connection-state { display: inline-flex; align-items: center; gap: 6px; color: var(--host-text-dim); font-size: 11px; }
  .connection-state i { width: 6px; height: 6px; border-radius: 50%; background: var(--host-text-dim); }
  .connection-state.connected i { background: #80ba99; }
  .surface-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 12px; border: 1px solid var(--host-line); border-radius: var(--host-radius-panel); background: var(--host-surface); }
  .dim { color: var(--host-text-dim); font-size: 12px; }
  .page-picker { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; margin-left: auto; }
  .page-picker > span, .eyebrow { color: #81acd0; font-size: 9px; font-weight: 700; letter-spacing: 0.12em; }
  .page-picker select { min-width: 150px; font-weight: 650; }

  .describe { display: flex; flex-direction: column; gap: 6px; padding: 8px;
              border: 1px solid var(--host-line); border-radius: var(--host-radius-panel); background: var(--host-surface); }
  .describe p { margin: 0; }
  .describe-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  .describe label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #b5c0c9; }
  .describe input[type='number'] { width: 62px; }

  .surface-body {
    flex: 1;
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(180px, 230px) minmax(240px, 1fr) minmax(230px, 280px);
    gap: 12px;
  }
  .param-column {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    min-width: 0;
    padding: 12px;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
  }
  .panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 20px; }
  .panel-heading strong { font-size: 12px; font-weight: 650; }
  .panel-heading > span { font-size: 11px; color: var(--host-text-dim); }
  .param-column input { width: 100%; box-sizing: border-box; font-size: 12px; }
  .parameter-search { position: relative; display: flex; align-items: center; color: var(--host-text-dim); }
  :global(.host-workspace.host-workspace) .surface .param-column .parameter-search input[type='search'] { min-width: 0; padding-left: 28px; }
  .parameter-search > :global(svg) { position: absolute; left: 8px; pointer-events: none; }
  .parameter-filters { display: flex; flex-wrap: wrap; gap: 4px; }
  :global(.host-workspace.host-workspace) .surface .param-column .parameter-filters button {
    min-height: 28px; padding: 3px 5px; font-size: 11px; white-space: nowrap;
  }
  :global(.host-workspace.host-workspace) .surface .param-column .parameter-filters button[aria-pressed='true'] {
    color: var(--host-text); background: var(--host-accent-surface); border-color: var(--host-accent);
  }
  .param-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .parameter-hint { margin: 0; font-size: 10px; color: var(--host-text-dim); }
  .empty-hint { padding: 12px; font-size: 12px; color: var(--host-text-dim); line-height: 1.5; }
  :global(.host-workspace.host-workspace) .surface .param-column button.param-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    min-height: 30px;
    padding: 5px 6px;
    border: 1px solid transparent;
    border-radius: var(--host-radius-control);
    background: transparent;
    color: var(--host-text-soft);
    font-size: 12px;
    cursor: grab;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .param-chip > :global(svg) { flex: none; color: var(--host-text-dim); opacity: .6; }
  .param-chip > span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .param-chip:hover { border-color: #5b9bd5; color: #d6dbe0; }
  .param-chip.dragging { opacity: 0.45; }
  :global(.host-workspace.host-workspace) .surface .param-column button.param-chip.selected { border-color: var(--host-accent); background: var(--host-accent-surface); color: var(--host-text); }
  .surface-plate {
    position: relative;
    flex: none;
    width: min(100cqw, calc(100cqh * var(--surface-aspect)));
    border: 1px solid #000;
    border-radius: var(--host-radius-panel);
    /* The chassis: matte black, lit from above, with a sheen along the front edge. */
    background:
      linear-gradient(180deg, #ffffff14 0, #ffffff05 1.5%, transparent 6%),
      radial-gradient(120% 90% at 50% 0%, #2a2d31 0%, #1a1c1f 55%, #111214 100%);
    box-shadow: inset 0 1px 0 #ffffff1f, inset 0 -2px 0 #00000080, 0 10px 24px #0008;
    overflow: hidden;
  }
  .controller-canvas { min-width: 0; min-height: 0; display: flex; flex-direction: column; gap: 12px; padding: 12px; border: 1px solid var(--host-line); border-radius: var(--host-radius-panel); background: var(--host-surface); }
  .region-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
  :global(.host-workspace.host-workspace) .surface .region-tabs button { font-size: 11px; min-height: 28px; background: transparent; border-color: transparent; padding: 4px 7px; }
  :global(.host-workspace.host-workspace) .surface .region-tabs button.active { background: var(--host-accent-surface); border-color: var(--host-accent); }
  .canvas-stage { flex: 1; min-height: 120px; min-width: 0; container-type: size; display: flex; justify-content: center; align-items: center; }
  /* This line never wraps: starting a drag must not move the target under the pointer. */
  .canvas-caption { flex: none; height: 18px; line-height: 18px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--host-text-dim); }

  /* State is one colour, --led, and each hardware face decides where its light is: the arc
     round a knob, the backlit edge of a pad, the cap of a button. .ctl.mapped further down
     sets it at EQUAL specificity, so a plain .ctl.assigned rule would lose on source order and
     every assigned knob would stay the unassigned blue — visible only by looking at one.
     Out-specified rather than reordered, because a rule that depends on where it sits in the
     file breaks again the next time somebody tidies. This is the fourth colour in this
     project eaten that way; the first three were .ghost. */
  .ctl.mapped.assigned { --led: #5fcf8c; color: #e4f4ea; }
  .ctl.mapped.assigned.unresolved { --led: #e06868; color: #f2c4c4; }
  /* The knob you are turning, over whatever it already says. */
  .surface-plate .ctl.mapped.lit { --led: #ffd15c; }
  /* The drop target and the knob you are turning. Both are outlines rather than fills: the
     assigned colour already means something, and a second fill on top would fight it. */
  .ctl.target { outline: 2px solid #5b9bd5; outline-offset: 1px; }
  .ctl.lit { outline: 2px solid #e0c060; outline-offset: 1px; }
  .ctl.selected { outline: 3px solid #79b9ee; outline-offset: 2px; z-index: 2; }
  .ctl.learning { animation: learn-pulse 0.75s ease-in-out infinite alternate; }
  @keyframes learn-pulse { from { box-shadow: 0 0 0 0 #e0b65e66; } to { box-shadow: 0 0 0 7px #e0b65e22; } }
  /* The label has to be readable at BOTH sizes, and the two differ by a factor of eight: a
     knob is ~17px in the whole-instrument view and ~130px zoomed into its region. A fixed
     font size is illegible at one end or overflowing at the other, so it scales with the
     control itself — which is what container query units are for, and the only thing in this
     file that needs them. */
  .ctl-assigned {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: clamp(7px, 15cqw, 15px);
    line-height: 1.1;
    padding: 0 1px;
  }

  .ctl {
    container-type: size;
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    min-height: 0;
    border: 0;
    border-radius: 2px;
    background: transparent;
    color: #8d969f;
    font: inherit;
    font-size: 10px;
    overflow: hidden;
    cursor: default;
    /* No light at all on a control CEditor cannot reach: it is on the box and not ours. */
    --led: transparent;
  }
  /* Mapped controls carry a light; the rest are visibly on the box and visibly not ours. */
  .ctl.mapped { --led: #4f8cc4; color: #d3dce4; cursor: pointer; }
  .ctl.mapped:hover .hw { filter: brightness(1.18); }
  /* The global button hover paints a background; the face is the control here, not the box. */
  .surface-plate .ctl:hover:not(:disabled) { background: transparent; }

  .ctl-assigned, .ctl-label, .ctl :global([data-testid='pickup-direction']) {
    position: relative; z-index: 1; text-shadow: 0 1px 2px #000;
  }
  .ctl-label { pointer-events: none; white-space: nowrap; font-size: clamp(7px, 15cqw, 14px); }

  /* --- the hardware faces. Every size is a share of the control's own box (cqw/cqh), so a
         knob is the same knob at 17px in the overview and 130px zoomed into its region. --- */
  .hw, .hw > i { position: absolute; pointer-events: none; box-sizing: border-box; }
  .hw { inset: 0; }
  .hw > i { display: block; }

  /* Encoder: the LED arc (270°, like the scale printed round a real one), then a knurled
     skirt, then the domed cap with its pointer. */
  /* The data dial is the same knob without the arc: it has no slot of its own to show. */
  .ctl.encoder, .ctl.dial { border-radius: 50%; }
  .ctl.encoder .hw, .ctl.dial .hw { inset: auto; width: min(100cqw, 100cqh); aspect-ratio: 1; }
  .ctl.dial .arc { display: none; }
  .ctl.dial .ctl-label { display: none; }
  .ctl.encoder .arc {
    inset: 0; border-radius: 50%;
    background: conic-gradient(from 225deg, var(--led) 0 270deg, transparent 270deg);
    -webkit-mask: radial-gradient(circle, transparent 63.5%, #000 65%, #000 69.5%, transparent 71%);
            mask: radial-gradient(circle, transparent 63.5%, #000 65%, #000 69.5%, transparent 71%);
    filter: drop-shadow(0 0 2px var(--led));
  }
  .ctl.encoder:not(.mapped) .arc {
    background: conic-gradient(from 225deg, #2c3035 0 270deg, transparent 270deg);
    filter: none;
  }
  .ctl.encoder .skirt, .ctl.dial .skirt {
    inset: 16%; border-radius: 50%;
    background:
      radial-gradient(circle at 50% 40%, transparent 55%, #0009 100%),
      repeating-conic-gradient(#303338 0 5deg, #16171a 5deg 10deg);
    box-shadow: 0 2px 4px #000c, 0 0 0 1px #000;
  }
  .ctl.encoder .cap, .ctl.dial .cap {
    inset: 25%; border-radius: 50%;
    background: radial-gradient(circle at 38% 30%, #54585e 0%, #2a2d31 45%, #16181a 100%);
    box-shadow: inset 0 1px 1px #ffffff2e, inset 0 -2px 3px #0009;
  }
  .ctl.encoder .cap::after, .ctl.dial .cap::after {
    content: ''; position: absolute; left: 50%; top: 6%; width: max(1.5px, 6%); height: 34%;
    transform: translateX(-50%); border-radius: 1px; background: #e9ecef; box-shadow: 0 0 2px #fff6;
  }

  /* Pad: translucent silicone over an RGB LED, the way the real ones are built — the whole
     pad glows in its colour, dimly at rest and at full brightness when it is ON. The colour
     is the pad's state, the same --led every other face uses, so the key under the drawing
     reads for pads as it does for knobs. A pad CEditor cannot reach stays unlit. */
  .ctl.pad .body {
    inset: 3%; border-radius: 9%;
    background:
      radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--led) 42%, #1a1c1f) 0%,
                                         color-mix(in srgb, var(--led) 22%, #141518) 70%,
                                         color-mix(in srgb, var(--led) 12%, #0f1012) 100%),
      #141518;
    box-shadow: inset 0 1px 0 #ffffff2a, inset 0 -3px 6px #0009, 0 2px 3px #000b,
                inset 0 0 max(2px, 10cqw) color-mix(in srgb, var(--led) 35%, transparent),
                0 0 max(2px, 5cqw) color-mix(in srgb, var(--led) 30%, transparent);
  }
  /* The glow is light spilling past the pad, so the box must not clip it into a square. */
  .ctl.pad { overflow: visible; }
  .ctl.pad:not(.mapped) .body {
    background: linear-gradient(165deg, #3a3d42 0%, #2a2d31 55%, #222427 100%);
    box-shadow: inset 0 1px 0 #ffffff1a, inset 0 -3px 6px #0008, 0 2px 3px #000b;
  }
  /* ON: a latched pad that is latched, or the pad you are hitting. It has to say so from
     across a room — the real one does, and so the whole pad lights at full strength in its
     own colour rather than switching to some other one. Out-specified like .assigned, for the
     same source-order reason. */
  .surface-plate .ctl.pad.mapped.assigned.latched .body, .surface-plate .ctl.pad.mapped.lit .body {
    background: radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--led) 45%, #fff) 0%,
                                                   var(--led) 55%,
                                                   color-mix(in srgb, var(--led) 70%, #000) 100%);
    box-shadow: inset 0 1px 0 #ffffff66, inset 0 -3px 6px #0005,
                0 0 max(4px, 14cqw) color-mix(in srgb, var(--led) 75%, transparent);
  }
  .surface-plate .ctl.pad.mapped.assigned.latched, .surface-plate .ctl.pad.mapped.lit { color: #101214; }
  .surface-plate .ctl.pad.mapped.assigned.latched .ctl-assigned,
  .surface-plate .ctl.pad.mapped.lit .ctl-assigned { text-shadow: 0 0 3px #fff8; }

  /* Fader: a scale, the slot, and a cap with its grip line. With no value to show, the cap
     sits where a fader at rest usually does. */
  .ctl.fader .scale {
    inset: 8% 8% 8% auto; width: 22%;
    background: repeating-linear-gradient(to bottom, #6d737a 0 1px, transparent 1px 12.5%);
    opacity: .7;
  }
  .ctl.fader .slot {
    left: 50%; top: 5%; bottom: 5%; width: max(2px, 12%); transform: translateX(-50%);
    border-radius: 3px; background: #050506; box-shadow: inset 0 1px 2px #000, 0 1px 0 #ffffff14;
  }
  .ctl.fader .cap {
    left: 8%; right: 8%; top: 52%; height: max(6px, 20%); border-radius: 12%;
    background: linear-gradient(180deg, #62666c 0%, #34373b 42%, #1c1e21 58%, #3b3e42 100%);
    box-shadow: 0 2px 3px #000c, inset 0 1px 0 #ffffff33;
  }
  .ctl.fader .cap::after {
    content: ''; position: absolute; left: 10%; right: 10%; top: calc(50% - 0.5px); height: 1px; background: #f2f2f2;
  }
  .ctl.fader.mapped .cap::after { background: var(--led); box-shadow: 0 0 3px var(--led); }
  .ctl.fader .ctl-label, .ctl.fader .ctl-assigned {
    position: absolute; bottom: -1px; font-size: clamp(6px, 34cqw, 12px);
  }

  /* Button: a raised rubber cap with its legend printed on it. */
  .ctl.button .body {
    inset: 6%; border-radius: max(2px, 18cqh);
    background: linear-gradient(180deg, #3a3d42 0%, #26282c 100%);
    box-shadow: inset 0 1px 0 #ffffff26, inset 0 -1px 2px #0009, 0 1px 2px #000c;
  }
  .ctl.button.mapped .body { box-shadow: inset 0 1px 0 #ffffff26, 0 1px 2px #000c, 0 0 0 1px var(--led); }
  .ctl.button .ctl-label { font-size: clamp(6px, 42cqh, 13px); color: #c5ccd2; letter-spacing: .02em; }
  /* A latching button that is ON lights its whole cap, as the unit's own LEDs do. */
  .surface-plate .ctl.button.mapped.assigned.latched .body {
    background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--led) 40%, #fff), var(--led));
    box-shadow: 0 0 max(3px, 20cqw) var(--led);
  }
  /* A small square button has no room for its legend, and the real unit does not try: it prints
     it on the panel beside the button. So a near-square one prints it underneath — unless it
     is a glyph (an arrow, a transport symbol, a digit), which is printed on the cap itself. */
  .ctl.button { overflow: visible; }
  @container (aspect-ratio < 1.6) {
    .ctl.button .ctl-assigned, .ctl.button .ctl-label:not(.glyph) {
      position: absolute; top: calc(100% + 1px); left: 50%; transform: translateX(-50%);
      font-size: clamp(6px, 55cqh, 12px); color: #aeb6bd; text-shadow: none;
    }
  }

  /* Wheel: a ribbed roller in its well, shaded as a cylinder. */
  .ctl.wheel .well {
    inset: 0; border-radius: max(3px, 22cqw);
    background: #08090a; box-shadow: inset 0 2px 5px #000, 0 1px 0 #ffffff1a;
  }
  .ctl.wheel .roller {
    inset: 10% 20%; border-radius: max(2px, 12cqw) / max(2px, 5cqh);
    background:
      linear-gradient(90deg, #000a 0%, transparent 32%, #ffffff12 50%, transparent 68%, #000a 100%),
      repeating-linear-gradient(180deg, #34373c 0 2px, #16181a 2px 5px);
    box-shadow: 0 0 0 1px #000;
  }
  .ctl.wheel .ctl-label { position: absolute; bottom: -1px; font-size: clamp(6px, 28cqw, 12px); }

  /* The keybed: white keys as one repeating gradient (one element, however many keys), the
     black keys over them, and the dark lip the keys disappear under. */
  .ctl.keys { border-radius: 0 0 4px 4px; }
  .ctl.keys .whites {
    inset: 0; border-radius: 0 0 3px 3px;
    background:
      linear-gradient(180deg, #000 0, #0009 2%, transparent 7%, transparent 94%, #0000001f 100%),
      repeating-linear-gradient(90deg, #f7f7f4 0, #ecece8 calc(var(--kw) - 1.5px),
                                       #8e8e8a calc(var(--kw) - 1.5px), #6e6e6a var(--kw));
    box-shadow: 0 0 0 2px #0b0b0c;
  }
  .ctl.keys .black {
    top: 0; height: 60%; border-radius: 0 0 2px 2px;
    background: linear-gradient(180deg, #111 0%, #262626 78%, #3c3c3c 86%, #0d0d0d 100%);
    box-shadow: 1px 2px 3px #0009, inset 0 -1px 0 #ffffff1a;
  }

  /* The screen: a bezel round a lit LCD, showing the page the drawing is set to. */
  .ctl.display .glass {
    inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 6%;
    padding: 6% 8%; border-radius: 3px; border: max(3px, 3cqw) solid #0a0b0c;
    background: radial-gradient(120% 90% at 30% 20%, #1d4a6b 0%, #0d2a40 55%, #071624 100%);
    box-shadow: 0 0 0 1px #2b2f34, inset 0 0 12px #000a;
    color: #bfe6ff; font-family: ui-monospace, 'Cascadia Mono', Consolas, monospace; text-align: left;
    overflow: hidden;
  }
  .ctl.display .glass b, .ctl.display .glass small {
    display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    text-shadow: 0 0 4px #6cc4ff99;
  }
  .ctl.display .glass b { font-size: clamp(7px, 11cqw, 20px); font-weight: 600; }
  .ctl.display .glass small { font-size: clamp(6px, 7cqw, 13px); opacity: .7; }

  .control-inspector {
    min-width: 0;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    box-sizing: border-box;
    border: 1px solid var(--host-line);
    border-radius: var(--host-radius-panel);
    background: var(--host-surface);
  }
  .inspector-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
  .inspector-head > div, .inspector-empty { display: flex; flex-direction: column; gap: 5px; }
  .inspector-head strong { font-size: 14px; }
  .state-pill { flex: none; padding: 3px 6px; border: 1px solid #59636c; border-radius: 4px; color: #9da8b1; font-size: 9px; letter-spacing: 0.08em; }
  .state-pill.assigned { border-color: #4f8b69; color: #a7d8bb; }
  .state-pill.problem { border-color: #8b5555; color: #e6aaaa; }
  .assignment-summary { display: flex; flex-direction: column; gap: 5px; padding: 10px; border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-control); background: var(--host-bg-deep); overflow-wrap: anywhere; }
  .assignment-summary span, .inspector-empty p { color: #9ba6af; font-size: 11px; line-height: 1.35; }
  .inspector-actions { display: grid; grid-template-columns: 1fr; gap: 6px; }
  .inspector-actions button { font-size: 12px; }
  .inspector-actions button:first-child:not(.ghost):not(:disabled) { background: var(--host-accent-surface); border-color: var(--host-accent); }
  .learning-notice { display: flex; gap: 8px; padding: 10px; border: 1px solid #776039; border-radius: var(--host-radius-control); color: #dfc18e; background: #30281c; font-size: 11px; line-height: 1.5; }
  .learning-notice > :global(svg) { flex: none; margin-top: 2px; }
  .learning-notice span { display: flex; flex-direction: column; gap: 3px; }
  .inspector-actions.secondary { display: flex; flex-wrap: wrap; }
  .option-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .option-grid label, .control-inspector > label { display: flex; flex-direction: column; gap: 4px; color: #aab5be; font-size: 11px; }
  .option-grid input { width: 100%; box-sizing: border-box; }
  .control-inspector .check-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 30px; color: #aab5be; font-size: 11px; }
  .control-inspector button.confirming { border-color: #c57575; background: #51282c; color: #ffd8d8; }
  .inspector-empty { margin: auto 0; text-align: center; align-items: center; padding: 12px; }
  .inspector-empty > :global(svg) { color: var(--host-text-dim); margin-bottom: 8px; }
  .inspector-empty p { margin: 4px 0; }

  /* The layer pips on a pad, under its name. */
  .pad-layers {
    position: absolute; left: 50%; bottom: 10%; transform: translateX(-50%); z-index: 1;
    display: flex; gap: max(2px, 5cqw); pointer-events: none;
  }
  .pad-layers i {
    width: max(3px, 8cqw); height: max(3px, 8cqw); border-radius: 50%;
    background: color-mix(in srgb, var(--pip) 35%, #000); box-shadow: 0 0 0 1px #0008;
  }
  .pad-layers i.active { background: var(--pip); box-shadow: 0 0 0 1px #000a, 0 0 4px var(--pip); transform: scale(1.3); }

  .pad-layer-editor { display: flex; flex-direction: column; gap: 8px; padding: 10px;
    border: 1px solid var(--host-line-soft); border-radius: var(--host-radius-control); }
  .pad-layer-editor > label { display: flex; flex-direction: column; gap: 4px; color: #aab5be; font-size: 11px; }
  .layer-tabs { display: flex; gap: 4px; }
  .layer-tabs button { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; font-size: 12px; }
  .layer-tabs button i { width: 8px; height: 8px; border-radius: 50%; background: var(--pip); }
  /* Out-specified to beat the host theme's own button rules, like the other chips here. */
  :global(.host-workspace.host-workspace) .surface .layer-tabs button[aria-pressed='true'] {
    border-color: var(--pip); color: var(--host-text);
    background: color-mix(in srgb, var(--pip) 24%, var(--host-surface-raised));
  }
  .layer-hint { margin: 0; font-size: 10px; }
  .colour-row > span { display: flex; align-items: center; gap: 6px; }
  .colour-row input[type='color'] { width: 44px; min-height: 30px; padding: 2px; }
  .surface-regions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .state-key { display: inline-flex; align-items: center; gap: 4px; color: #8f9ba5; font-size: 10px; }
  /* The same lights the faces use, so the key reads as the drawing does. */
  .state-key i { width: 8px; height: 8px; border-radius: 50%; background: #4f8cc4; box-shadow: 0 0 4px #4f8cc4; }
  .state-key i.mapped { background: #5fcf8c; box-shadow: 0 0 4px #5fcf8c; }
  .state-key i.problem { background: #e06868; box-shadow: 0 0 4px #e06868; }
  .state-key i.moving { background: #ffd15c; box-shadow: 0 0 4px #ffd15c; }
  @container (max-width: 900px) {
    .surface-body { flex: none; grid-template-columns: minmax(170px, .7fr) minmax(240px, 1.3fr); }
    .param-column, .controller-canvas { height: 330px; box-sizing: border-box; }
    .control-inspector { grid-column: 1 / -1; overflow: visible; }
    .inspector-actions { grid-template-columns: 1fr 1fr; }
    .page-picker { margin-left: 0; }
  }
  @container (max-width: 520px) {
    .surface-body { grid-template-columns: minmax(0, 1fr); }
    .param-column { height: 240px; }
    .controller-canvas { height: 300px; }
    .control-inspector { grid-column: 1; }
    .page-picker select { min-width: 0; max-width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ctl.learning { animation: none; outline: 2px solid #dfc18e; }
  }
</style>
