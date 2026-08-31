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
  import { hostSurface, hostSurfaceLayout, requestSurfaceLayout } from '../stores/instrumentHost.js';

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

  const kindLabel = {
    encoder: 'Encoder', pad: 'Pad', fader: 'Fader', button: 'Button',
    wheel: 'Wheel', keys: 'Keys', display: 'Screen',
  };

  function title(control) {
    const what = kindLabel[control.kind] ?? control.kind;
    const named = control.label ? `${what} ${control.label}` : what;
    return control.index >= 0
      ? `${named} — CEditor addresses this as ${control.kind} ${control.index}`
      : `${named} — on the keyboard, but CEditor does not map it`;
  }
</script>

<div class="surface" data-testid="host-surface-panel">
  <div class="surface-head">
    {#if zoom}
      <button type="button" class="ghost" data-testid="surface-back"
              onclick={() => (zoom = '')}>← Whole instrument</button>
    {/if}
    <strong>{layout.displayName || 'No controller profile'}</strong>
    {#if layout.vendor}<span class="dim">{layout.vendor}</span>{/if}
    <span class="dim surface-state">{$hostSurface.state === 'connected'
      ? `connected · ${$hostSurface.device || 'surface'}`
      : $hostSurface.state}</span>
  </div>

  {#if layout.controls.length === 0}
    <div class="empty-hint">
      No layout for this controller. Pages and MIDI learn still work — this drawing is the only
      thing missing, and it comes from the surface profile.
    </div>
  {:else}
    <div class="surface-body">
      <!-- The unit's own proportions, narrowed to whatever slice is on screen: zooming is one
           viewBox, not a second drawing. Height leads and width follows, so the whole
           controller fits the dock rather than running off the bottom of it. -->
      <div class="surface-plate" style={`aspect-ratio:${visibleAspect}`}>
        {#each layout.controls as control (control.controlId)}
          <button type="button"
                  class={`ctl ${control.kind}`}
                  class:mapped={control.index >= 0}
                  data-testid={`surface-${control.controlId}`}
                  title={title(control)}
                  aria-label={title(control)}
                  style={`left:${((control.x - view.x) / view.w) * 100}%;
                          top:${((control.y - view.y) / view.h) * 100}%;
                          width:${(control.w / view.w) * 100}%;
                          height:${(control.h / view.h) * 100}%`}>
            <span class="ctl-label">{control.label}</span>
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
        Solid controls are ones CEditor can address; the faint ones are on the keyboard but not
        mapped.
      </span>
    </div>
  {/if}
</div>

<style>
  .surface { flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0; min-height: 0; }
  .surface-head { display: flex; align-items: center; gap: 8px; }
  .dim { color: #7d8894; font-size: 11px; }
  .surface-state { margin-left: auto; }

  .surface-body {
    flex: 1;
    min-height: 120px;
    display: flex;
    justify-content: center;
  }
  .surface-plate {
    position: relative;
    height: 100%;
    max-width: 100%;
    border: 1px solid #3b4652;
    border-radius: 6px;
    background: #101418;
    overflow: hidden;
  }

  .ctl {
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
  .ctl.wheel { border-radius: 40%; background: #171c21; }
  .ctl.keys { background: #2a2f34; border-color: #3b4652; }
  .ctl.display { background: #16202a; border-color: #3f5162; }

  .ctl-label { pointer-events: none; white-space: nowrap; }

  .surface-regions { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .region-count { margin-left: 4px; color: #8fc4a8; font-size: 10px; }
  .region-count.none { color: #7d8894; }
  .surface-note { margin-left: auto; max-width: 320px; }
</style>
