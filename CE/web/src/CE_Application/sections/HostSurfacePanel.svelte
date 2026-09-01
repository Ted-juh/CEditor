<script>
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
  import {
    hostSurface, hostSurfaceLayout, requestSurfaceLayout, hostState, hostMidiActivity,
    hostParamDrag, assignControlSlot, clearControlSlot, hostParameters, requestParameters,
    filterParameters, surfaceControlSlot, assignSurfaceControl, learnSurfaceControl,
    setControlSlotOptions,
    setUserSurface, clearUserSurface, learnUserSurface, finishUserSurfaceLearn,
  } from '../stores/instrumentHost.js';

  let zoom = $state('');        // '' = the whole instrument, else a region id
  let asked = $state(false);

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
    wheel: 'Wheel', keys: 'Keys', display: 'Screen',
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

  // A control the runtime can reach: an encoder, a fader or a pad the layout gave an index.
  // Encoders have a slot from the day the page was made; a fader or a pad gets one minted
  // the first time something lands on it, so "no slot yet" is not "cannot be assigned".
  const addressable = (control) =>
    control.index >= 0 && ['encoder', 'fader', 'pad'].includes(control.kind);

  // The knob you are turning, lit — or the pad you are hitting. The frontend does the
  // matching because it already holds what every slot is bound to; the native side just
  // says which controller (or note) moved.
  let litSlotId = $state('');
  let litAt = 0;
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
    setTimeout(() => { if (litAt === seq) litSlotId = ''; }, 350);
  });

  function title(control) {
    const what = kindLabel[control.kind] ?? control.kind;
    const named = control.label ? `${what} ${control.label}` : what;
    if (control.index < 0) return `${named} — on the keyboard, but CEditor does not map it`;

    const slot = slotFor(control);
    const bound = slot?.midiNote >= 0 ? ` · note ${slot.midiNote}` : slot?.midiCc >= 0 ? ` · CC ${slot.midiCc}` : '';
    if (slot?.assigned)
      return `${named} — ${slot.displayName}${slot.partName ? ` (${slot.partName})` : ''}${bound}`
             + (slot.resolved ? '' : ' — the part no longer has this parameter')
             + (slot.toggle ? (slot.latched ? ' — latching, ON' : ' — latching, off') : '')
             + '\nDrop a parameter here to reassign it, click to clear it, Alt-click to MIDI-learn it'
             + (control.kind === 'pad' ? `, right-click to make it ${slot.toggle ? 'momentary' : 'latching'}` : '');
    if (addressable(control))
      return `${named} — unassigned. Drag a parameter from the Params tab onto it, or Alt-click to MIDI-learn it.`;
    return `${named} — CEditor addresses this as ${control.kind} ${control.index}`;
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
  let focusedPart = $derived($hostState.rack.parts.find(
    (p) => p.partId === $hostState.rack.focusedPartId) ?? null);
  let parameters = $derived(filterParameters($hostParameters.parameters, paramQuery));

  $effect(() => {
    // Follow the focused part, so the column is always the instrument you are looking at.
    const partId = focusedPart?.partId ?? '';
    if (partId && $hostParameters.partId !== partId) requestParameters(partId);
  });
</script>

<div class="surface" data-testid="host-surface-panel">
  <div class="surface-head">
    {#if zoom}
      <button type="button" class="ghost" data-testid="surface-back"
              onclick={() => (zoom = '')}>← Whole instrument</button>
    {/if}
    <strong>{layout.displayName || 'No controller profile'}</strong>
    {#if layout.vendor}<span class="dim">{layout.vendor}</span>{/if}
    <button type="button" class="ghost" data-testid="surface-describe"
            title="Any controller works — CEditor just needs to know what is on yours"
            onclick={() => (describing = !describing)}>{layout.userSurface ? 'Edit controller' : 'Describe controller'}</button>
    {#if pages.length > 0}
      <!-- Which page the drawing is showing. Eight knobs mean eight assignments, and which
           eight depends entirely on the page — a drawing that did not say which would be
           showing one set of labels and implying another. -->
      <select data-testid="surface-page" aria-label="Control page shown on the drawing"
              value={page?.pageId ?? ''}
              onchange={(e) => (pageId = e.currentTarget.value)}>
        {#each pages as p (p.pageId)}
          <option value={p.pageId}>{p.name}</option>
        {/each}
      </select>
    {/if}
    <!-- The drag prompt lives HERE, in a row of fixed height, and NOT down beside the
         drawing. Put in the note under the plate it read better and broke the feature: the
         sentence wrapped to a different number of lines, the panel above it resized, and the
         knob you were aiming at moved out from under the pointer mid-drag. Anything that
         changes size when a drag starts is a target that runs away. -->
    <span class="dim surface-state">{$hostParamDrag.parameterId
      ? `Drop ${$hostParamDrag.name} on a knob`
      : $hostSurface.state === 'connected'
        ? `connected · ${$hostSurface.device || 'surface'}`
        : $hostSurface.state}</span>
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
          <button type="button" class="ghost danger" data-testid="surface-describe-clear"
                  title="Go back to the built-in profile for a connected controller"
                  onclick={() => { clearUserSurface(); describing = false; }}>Forget it</button>
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
        {#if !focusedPart?.hasInstrument}
          <div class="empty-hint">Focus a part with an instrument to see its parameters.</div>
        {:else}
          <input type="search" placeholder="Search parameters…" bind:value={paramQuery}
                 aria-label="Search this instrument's parameters" />
          <div class="param-scroll">
            {#each parameters as parameter (parameter.id)}
              <!-- svelte-ignore a11y_no_static_element_interactions -->
              <div class="param-chip" draggable="true"
                   class:dragging={$hostParamDrag.parameterId === parameter.id}
                   data-testid="surface-param"
                   title={`${parameter.name} — drag onto a knob`}
                   ondragstart={(e) => {
                     hostParamDrag.set({ partId: focusedPart.partId, parameterId: parameter.id,
                                         name: parameter.name });
                     e.dataTransfer?.setData('text/plain', parameter.name);
                     if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
                   }}
                   ondragend={() => hostParamDrag.set({ partId: '', parameterId: '', name: '' })}>
                {parameter.name}
              </div>
            {/each}
            {#if parameters.length === 0}
              <div class="empty-hint">No parameter matches.</div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- The unit's own proportions, narrowed to whatever slice is on screen: zooming is one
           viewBox, not a second drawing. Height leads and width follows, so the whole
           controller fits the dock rather than running off the bottom of it. -->
      <div class="surface-plate" style={`aspect-ratio:${visibleAspect}`}>
        {#each layout.controls as control (control.controlId)}
          {@const slot = slotFor(control)}
          <button type="button"
                  class={`ctl ${control.kind}`}
                  class:mapped={control.index >= 0}
                  class:assigned={slot?.assigned}
                  class:unresolved={slot?.assigned && !slot.resolved}
                  class:lit={slot && litSlotId === slot.slotId}
                  class:target={hoveredId === control.controlId}
                  data-testid={`surface-${control.controlId}`}
                  title={title(control)}
                  aria-label={title(control)}
                  class:latched={slot?.toggle && slot?.latched}
                  ondragover={(e) => dragOver(e, control)}
                  ondrop={(e) => dropOn(e, control)}
                  onclick={(e) => {
                    // Alt-click learns; a plain click clears. Not double-click for learn:
                    // a double-click is two clicks first, and the first of them cleared the
                    // assignment before the learn ever armed.
                    if (e.altKey) {
                      if (addressable(control)) learnSurfaceControl(page?.pageId ?? '', control.kind, control.index);
                      return;
                    }
                    if (slot?.assigned) clearControlSlot(page.pageId, slot.slotId);
                  }}
                  oncontextmenu={(e) => {
                    // A pad is momentary or latching; the right button is where that lives,
                    // because the left one is already taken by clear and the drawing has no
                    // room for a checkbox per pad.
                    if (control.kind !== 'pad' || !slot?.assigned) return;
                    e.preventDefault();
                    setControlSlotOptions(page.pageId, slot.slotId, { toggle: !slot.toggle });
                  }}
                  style={`left:${((control.x - view.x) / view.w) * 100}%;
                          top:${((control.y - view.y) / view.h) * 100}%;
                          width:${(control.w / view.w) * 100}%;
                          height:${(control.h / view.h) * 100}%`}>
            <!-- What the knob DOES, when it does anything: the whole reason for drawing it
                 rather than listing it. The physical label stays underneath for the ones
                 that drive nothing. -->
            {#if slot?.assigned}
              <span class="ctl-assigned">{slot.displayName}</span>
            {:else}
              <span class="ctl-label">{control.label}</span>
            {/if}
          </button>
        {/each}
      </div>
    </div>

    <div class="surface-regions">
      {#each layout.regions as r (r.id)}
        <button type="button" class="toggle" class:on={zoom === r.id}
                data-testid={`surface-region-${r.id}`}
                title={r.addressable === r.count
                         ? `${r.count} ${r.label.toLowerCase()}, all mapped`
                         : `${r.count} ${r.label.toLowerCase()}, ${r.addressable} mapped`}
                onclick={() => (zoom = zoom === r.id ? '' : r.id)}>
          {r.label}
          <span class="region-count" class:none={r.addressable === 0}>{r.addressable}/{r.count}</span>
        </button>
      {/each}
      <span class="dim surface-note">
        Drag a parameter onto a knob to assign it · click an assigned knob to clear it · faint
        controls are on the keyboard but CEditor does not map them.
      </span>
    </div>
  {/if}
</div>

<style>
  .surface { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
  .surface-head { display: flex; align-items: center; gap: 8px; }
  .dim { color: #7d8894; font-size: 11px; }
  .surface-state { margin-left: auto; white-space: nowrap; }

  .describe { display: flex; flex-direction: column; gap: 6px; padding: 8px;
              border: 1px solid #3b4652; border-radius: 6px; background: #1a1f25; }
  .describe p { margin: 0; }
  .describe-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
  .describe label { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #a8b4c0; }
  .describe input[type='number'] { width: 62px; }

  .surface-body {
    flex: 1;
    min-height: 120px;
    display: flex;
    gap: 8px;
    justify-content: center;
  }
  .param-column {
    flex: none;
    width: 150px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  .param-column input { width: 100%; box-sizing: border-box; font-size: 11px; }
  .param-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 2px; }
  .param-chip {
    padding: 2px 6px;
    border: 1px solid #2c343d;
    border-radius: 4px;
    background: #1c2126;
    color: #b9c3cd;
    font-size: 11px;
    cursor: grab;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .param-chip:hover { border-color: #5b9bd5; color: #d6dbe0; }
  .param-chip.dragging { opacity: 0.45; }
  .surface-plate {
    position: relative;
    height: 100%;
    max-width: 100%;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #101418;
    overflow: hidden;
  }

  /* .ctl.mapped further down sets a background at EQUAL specificity, so a plain .ctl.assigned
     rule loses to it on source order and every assigned knob stays the unassigned blue —
     visible only by looking at one. Out-specified rather than reordered, because a rule that
     depends on where it sits in the file breaks again the next time somebody tidies. This is
     the fourth colour in this project eaten that way; the first three were .ghost. */
  .ctl.mapped.assigned { border-color: #5f9e79; background: #22362a; color: #d6ecdd; }
  .ctl.mapped.assigned:hover { border-color: #7fc79b; background: #2a4434; }
  .ctl.mapped.assigned.unresolved { border-color: #7f5050; background: #2a1d1d; color: #e4b3b3; }
  /* The drop target and the knob you are turning. Both are outlines rather than fills: the
     assigned colour already means something, and a second fill on top would fight it. */
  .ctl.target { outline: 2px solid #5b9bd5; outline-offset: 1px; }
  .ctl.lit { outline: 2px solid #e0c060; outline-offset: 1px; }
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
    border: 1px solid #333d47;
    border-radius: 2px;
    background: #1b2127;
    color: #5f6a75;
    font: inherit;
    font-size: 9px;
    overflow: hidden;
    cursor: default;
  }
  /* Mapped controls carry weight; the rest are visibly on the box and visibly not ours. */
  .ctl.mapped { border-color: #4d7fae; background: #22303c; color: #b8c6d2; cursor: pointer; }
  .ctl.mapped:hover { border-color: #7fb4e0; background: #2a3c4b; }

  .ctl.encoder { border-radius: 50%; }
  .ctl.pad { border-radius: 3px; }
  .ctl.fader { border-radius: 1px; background: #171c21; }
  /* A latched pad is a pad that is ON, and it has to say so from across a room — the LED on
     the real one does. Out-specified like .assigned, for the same source-order reason. */
  .surface-plate .ctl.mapped.assigned.latched { background: #d8a24a; color: #1a1408; }
  .ctl.wheel { border-radius: 40%; background: #171c21; }
  .ctl.keys { background: #2a2f34; border-color: #3b4652; }
  .ctl.display { background: #16202a; border-color: #3f5162; }

  .ctl-label { pointer-events: none; white-space: nowrap; }

  .surface-regions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .region-count { margin-left: 4px; color: #8fc4a8; font-size: 10px; }
  .region-count.none { color: #7d8894; }
  .surface-note { margin-left: auto; max-width: 320px; }
</style>
