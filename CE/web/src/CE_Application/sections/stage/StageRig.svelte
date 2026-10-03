<script>
  /**
   * The rig on stage: every playing part with its level, live, muted or soloed at a glance, and
   * the rack's macros as faders a finger can move. A part a stuck note is sounding on is marked.
   */
  import { hostMeters } from '../../stores/hostMeters.js';
  import { setMacroValue } from '../../stores/instrumentHost.js';
  import { meterPercent } from '../../utils/mixerMeters.js';

  let { parts = [], macros = [], troubledParts = new Set(), show = 'both' } = $props();

  const partName = (part) => part.pluginName || part.midiOutputName || 'Unresolved part';
  const level = (part, side) => meterPercent($hostMeters.channels[part.partId]?.levels?.[side] ?? -Infinity);

  // A fader follows the finger; the macro hears every move and is told when the gesture ends.
  let dragging = $state(null);   // { macroId, value }
  function fader(event, macro) {
    event.preventDefault();
    const track = event.currentTarget;
    track.setPointerCapture?.(event.pointerId);
    const at = (ev) => {
      const r = track.getBoundingClientRect();
      return Math.round(Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)) * 1000) / 1000;
    };
    dragging = { macroId: macro.macroId, value: at(event) };
    setMacroValue(macro.macroId, dragging.value);
    const move = (ev) => { dragging = { macroId: macro.macroId, value: at(ev) }; setMacroValue(macro.macroId, dragging.value); };
    const up = () => {
      track.removeEventListener('pointermove', move);
      track.removeEventListener('pointerup', up);
      track.removeEventListener('pointercancel', up);
      setMacroValue(macro.macroId, dragging.value, true);
      dragging = null;
    };
    track.addEventListener('pointermove', move);
    track.addEventListener('pointerup', up);
    track.addEventListener('pointercancel', up);
  }
  function faderKey(event, macro) {
    const step = event.shiftKey ? 0.01 : 0.05;
    const delta = event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    setMacroValue(macro.macroId, Math.max(0, Math.min(1, macro.value + delta)), true);
  }
  const shown = (macro) => (dragging?.macroId === macro.macroId ? dragging.value : macro.value);
</script>

{#if show !== 'macros'}
  <section class="stage-panel parts-panel" aria-label="Active parts" data-testid="stage-parts">
    <div class="panel-head"><span class="eyebrow">Parts</span>
      <span class="count">{parts.filter((p) => p.enabled && !p.mute).length} live</span></div>
    <div class="parts">
      {#each parts as part (part.partId)}
        <article class="stage-part" class:muted={part.mute || !part.enabled} class:solo={part.solo}
                 class:troubled={troubledParts.has(part.partId)} data-testid="stage-part">
          <span class="part-state">{!part.enabled ? 'OFF' : troubledParts.has(part.partId) ? 'STUCK NOTE'
            : part.mute ? 'MUTE' : part.solo ? 'SOLO' : 'LIVE'}</span>
          <strong>{partName(part)}</strong>
          <span class="preset">{part.presetName || (part.hardware ? part.hardwarePatchName : '') || '—'}</span>
          <div class="meter" aria-hidden="true">
            <i style={`height:${level(part, 0)}%`}></i><i style={`height:${level(part, 1)}%`}></i>
          </div>
        </article>
      {/each}
      {#if parts.length === 0}<div class="empty">No active parts. Load an instrument in Build.</div>{/if}
    </div>
  </section>
{/if}

{#if show !== 'parts' && macros.length > 0}
  <section class="stage-panel macros-panel" aria-label="Macros" data-testid="stage-macros">
    <div class="panel-head"><span class="eyebrow">Macros</span></div>
    <div class="faders">
      {#each macros.slice(0, 8) as macro (macro.macroId)}
        <div class="fader">
          <span class="fv">{Math.round(shown(macro) * 100)}</span>
          <div class="track" role="slider" tabindex="0" aria-label={macro.name} aria-valuemin="0" aria-valuemax="100"
               aria-valuenow={Math.round(shown(macro) * 100)} data-testid="stage-macro"
               onpointerdown={(e) => fader(e, macro)} onkeydown={(e) => faderKey(e, macro)}>
            <i style={`height:${shown(macro) * 100}%`}></i>
          </div>
          <span class="fn">{macro.name}</span>
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .eyebrow { font: 700 11px var(--stage-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--stage-dim); }
  .count { font: 12px var(--stage-mono); color: var(--stage-dim); }
  .parts-panel, .macros-panel { display: flex; flex-direction: column; min-height: 0; }
  .parts { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; margin-top: 8px; overflow-y: auto; min-height: 0; }
  .stage-part { display: flex; flex-direction: column; gap: 3px; padding: 8px; border-radius: 8px; background: var(--stage-raised);
                border: 1px solid var(--stage-line-soft); border-left: 3px solid var(--stage-live); min-width: 0; }
  .stage-part.muted { border-left-color: var(--stage-line-strong); opacity: .7; }
  .stage-part.solo { border-left-color: var(--stage-now); }
  .stage-part.troubled { border-color: var(--stage-warn); }
  .part-state { font: 700 10px var(--stage-mono); letter-spacing: .1em; color: var(--stage-live); }
  .muted .part-state { color: var(--stage-dim); }
  .troubled .part-state { color: var(--stage-warn); }
  .stage-part strong { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .preset { font: 11px var(--stage-mono); color: var(--stage-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .meter { display: flex; gap: 3px; align-items: flex-end; height: 56px; margin-top: 2px; }
  .meter i { flex: 1; min-height: 2px; border-radius: 2px; background: linear-gradient(0deg, var(--stage-live) 65%, var(--stage-warn) 85%, var(--stage-panic)); }
  .empty { color: var(--stage-dim); font-size: 13px; }
  .faders { display: flex; gap: 12px; flex: 1; min-height: 120px; margin-top: 8px; }
  .fader { flex: 0 1 110px; display: flex; flex-direction: column; align-items: center; gap: 6px; min-width: 0; }
  .track { position: relative; flex: 1; max-height: 300px; width: 46px; border-radius: 7px; background: var(--stage-field); border: 1px solid var(--stage-line);
           cursor: ns-resize; touch-action: none; }
  .track:focus-visible { outline: 2px solid var(--stage-next); outline-offset: 2px; }
  .track i { position: absolute; left: 0; right: 0; bottom: 0; border-radius: 6px; background: linear-gradient(0deg, var(--stage-now-deep), var(--stage-now)); }
  .fn { font-size: 12px; font-weight: 600; color: var(--stage-soft); max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .fv { font: 700 14px var(--stage-mono); }
</style>
