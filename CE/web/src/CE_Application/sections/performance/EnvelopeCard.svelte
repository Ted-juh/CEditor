<script>
  /**
   * One envelope generator, set by dragging its picture: the attack peak sideways, the decay
   * corner sideways (time) and up or down (sustain), the release end sideways, and the small
   * diamond on the falling curve up or down to bend every stage. The drag is a draft; the host
   * hears it once, on release. Times are on the same log scale the sliders used, so the first
   * second has most of the room.
   */
  import { setEnvelope, resetEnvelope, removeEnvelope } from '../../stores/instrumentHost.js';
  import Segmented from '../../components/controls/Segmented.svelte';
  import ScrubValue from '../../components/controls/ScrubValue.svelte';
  import ModulatorCard from './ModulatorCard.svelte';
  import {
    envelopeBendFromDrag, envelopeBox, envelopeDragFields, envelopeGeometry, formatEnvelopeTime,
  } from '../../utils/modulatorShapes.js';
  import { noteLabel } from '../../utils/chordBuilder.js';

  let { envelope, setEnvelopeAuditionHeld = () => {}, onroute = () => {} } = $props();

  const HEIGHT_PX = 170;
  let widthPx = $state(0);
  // The drawing is 124 units high at 170 px; its width in units follows the card.
  const BOX = $derived(envelopeBox(widthPx ? (widthPx * 124) / HEIGHT_PX : 360));
  let draft = $state(null);
  const shown = $derived({ ...envelope, ...(draft ?? {}) });
  const g = $derived(envelopeGeometry(shown, BOX));
  const set = (fields) => setEnvelope(envelope.envelopeId, fields);
  const CHANNELS = [[0, 'Omni'], ...Array.from({ length: 16 }, (_, i) => [i + 1, String(i + 1)])];

  function toSvg(svg, event) {
    const m = svg.getScreenCTM()?.inverse();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(m);
    return { x: p.x, y: p.y };
  }
  function drag(event, handle) {
    event.preventDefault();
    const target = event.currentTarget;
    const svg = target.ownerSVGElement;
    target.setPointerCapture?.(event.pointerId);
    const start = { geometry: g, box: BOX, y: event.clientY, curve: shown.curve };
    draft = {};
    const move = (ev) => {
      draft = handle === 'bend'
        ? { curve: envelopeBendFromDrag(start.curve, ev.clientY - start.y) }
        : { ...draft, ...envelopeDragFields(handle, toSvg(svg, ev), start.geometry, start.box) };
    };
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      const fields = draft;
      draft = null;
      if (fields && Object.keys(fields).length) set(fields);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }
  // Arrow keys on a focused handle: sideways is time (a twentieth of the scale), up and down is
  // the sustain level or the bend.
  function key(event, handle) {
    const fine = event.shiftKey;
    const dx = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const dy = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    if (handle === 'bend') { if (dy) set({ curve: envelopeBendFromDrag(envelope.curve, dy * (fine ? 1.2 : 6)) }); return; }
    const at = g[handle];
    const px = BOX.segment / (fine ? 100 : 20);
    const fields = envelopeDragFields(handle, { x: at.x + dx * px, y: at.y + dy * (fine ? 1 : 5) }, g, BOX);
    if (handle === 'decay') set(dx ? { decayMs: fields.decayMs } : { sustain: fields.sustain });
    else if (dx) set(fields);
  }
</script>

<ModulatorCard name={envelope.name} enabled={envelope.enabled} kind="envelope" identity={JSON.stringify([envelope.envelopeId])}
               readout={`${envelope.stage} · ${Math.round(envelope.value * 100)}%`} testid="envelope-card"
               onenable={(on) => set({ enabled: on })} onrename={(name) => set({ name })}
               onrestart={() => resetEnvelope(envelope.envelopeId)} restartLabel="Reset"
               onremove={() => removeEnvelope(envelope.envelopeId)}>
  <div class="adsr-wrap" bind:clientWidth={widthPx}>
  <svg class="adsr" viewBox={`0 0 ${BOX.width} ${BOX.height}`} role="group" data-testid="envelope-picture"
       aria-label={`${envelope.name}: drag the attack peak, the decay corner and the release end`}>
    <line class="base" x1={BOX.left} x2={BOX.width - 4} y1={BOX.bottom} y2={BOX.bottom} />
    <line class="stage" x1={g.attack.x} x2={g.attack.x} y1={BOX.top} y2={BOX.bottom} />
    <line class="stage" x1={g.decay.x} x2={g.decay.x} y1={g.decay.y} y2={BOX.bottom} />
    <line class="stage" x1={g.hold.x} x2={g.hold.x} y1={g.hold.y} y2={BOX.bottom} />
    <path class="curve" d={g.path} />
    <text class="tag" x={(BOX.left + g.attack.x) / 2} y={BOX.bottom + 10}>A</text>
    <text class="tag" x={(g.attack.x + g.decay.x) / 2} y={BOX.bottom + 10}>D</text>
    <text class="tag" x={(g.decay.x + g.hold.x) / 2} y={BOX.bottom + 10}>S</text>
    <text class="tag" x={(g.hold.x + g.release.x) / 2} y={BOX.bottom + 10}>R</text>
    {#if envelope.stage !== 'idle'}<circle class="marker" cx={g.marker.x} cy={g.marker.y} r="3.5" />{/if}
    <rect class="bend" x={g.bend.x - 4} y={g.bend.y - 4} width="8" height="8" transform={`rotate(45 ${g.bend.x} ${g.bend.y})`}
          role="slider" tabindex="0" aria-label="Bend: drag up or down" aria-valuenow={shown.curve} data-testid="envelope-bend"
          onpointerdown={(e) => drag(e, 'bend')} onkeydown={(e) => key(e, 'bend')}><title>Bend {shown.curve > 0 ? '+' : ''}{shown.curve.toFixed(2)}: drag up or down</title></rect>
    {#each [['attack', g.attack, 'Attack', formatEnvelopeTime(shown.attackMs)],
            ['decay', g.decay, 'Decay and sustain', `${formatEnvelopeTime(shown.decayMs)} · ${Math.round(shown.sustain * 100)}%`],
            ['release', g.release, 'Release', formatEnvelopeTime(shown.releaseMs)]] as [handle, at, name, value] (handle)}
      <circle class="handle" cx={at.x} cy={at.y} r="6" role="slider" tabindex="0" aria-label={`${name}: ${value}`}
              aria-valuetext={value} data-testid={`envelope-${handle}`}
              onpointerdown={(e) => drag(e, handle)} onkeydown={(e) => key(e, handle)}><title>{name} {value}: drag</title></circle>
    {/each}
  </svg>
  </div>
  <div class="times" data-testid="envelope-times">
    <span><b>A</b> {formatEnvelopeTime(shown.attackMs)}</span>
    <span><b>D</b> {formatEnvelopeTime(shown.decayMs)}</span>
    <span><b>S</b> {Math.round(shown.sustain * 100)}%</span>
    <span><b>R</b> {formatEnvelopeTime(shown.releaseMs)}</span>
    <span><b>Bend</b> {shown.curve > 0 ? '+' : ''}{shown.curve.toFixed(2)}</span>
  </div>

  <div class="controls">
    <div class="field"><span class="lbl">Velocity</span>
      <ScrubValue value={Math.round(envelope.velocityAmount * 100)} min={0} max={100} unit="%" label="How much velocity scales the envelope"
                  testid="envelope-velocity" onchange={(v) => set({ velocityAmount: v / 100 })} /></div>
    <div class="field"><span class="lbl">Channel</span>
      <ScrubValue value={envelope.channel} choices={CHANNELS} label="MIDI channel" pixelsPerStep={8}
                  testid="envelope-channel" onchange={(channel) => set({ channel })} /></div>
    <div class="field"><span class="lbl">Notes</span>
      <span class="pair">
        <ScrubValue value={envelope.noteLow} min={0} max={Math.max(0, envelope.noteHigh)} format={noteLabel} label="Lowest note"
                    testid="envelope-note-low" onchange={(noteLow) => set({ noteLow })} />
        <span class="to">to</span>
        <ScrubValue value={envelope.noteHigh} min={Math.min(127, envelope.noteLow)} max={127} format={noteLabel} label="Highest note"
                    testid="envelope-note-high" onchange={(noteHigh) => set({ noteHigh })} />
      </span></div>
    <div class="field"><span class="lbl">Held notes</span>
      <Segmented options={[{ value: true, label: 'Retrigger', title: 'Every new note starts the envelope again' },
                           { value: false, label: 'Legato', title: 'A note played while another is held carries on' }]}
                 value={envelope.retrigger} label="Held notes" onchange={(retrigger) => set({ retrigger })} /></div>
    <span class="spacer"></span>
    <button type="button" class="audition" disabled={!envelope.enabled}
            onpointerdown={() => setEnvelopeAuditionHeld(envelope.envelopeId, true)}
            onpointerup={() => setEnvelopeAuditionHeld(envelope.envelopeId, false)}
            onpointercancel={() => setEnvelopeAuditionHeld(envelope.envelopeId, false)}
            onpointerleave={() => setEnvelopeAuditionHeld(envelope.envelopeId, false)}>Hold to audition</button>
    <button type="button" class="route" onclick={onroute}>Route in matrix →</button>
  </div>
</ModulatorCard>

<style>
  .adsr-wrap { min-width: 0; }
  .adsr { display: block; width: 100%; height: 170px; background: #101417; border: 1px solid #2d343a;
          border-radius: 4px; touch-action: none; user-select: none; box-sizing: border-box; }
  .base { stroke: #2d343a; }
  .stage { stroke: #283138; stroke-dasharray: 3 3; }
  .curve { fill: #d7863b1a; stroke: #e39a55; stroke-width: 2; stroke-linejoin: round; }
  .tag { font: 9px var(--host-font-mono, monospace); fill: #68737d; text-anchor: middle; pointer-events: none; }
  .marker { fill: #ffd8b0; }
  .handle { fill: #181c20; stroke: #efad70; stroke-width: 2; cursor: grab; }
  .handle:hover, .handle:focus-visible { fill: #efad70; outline: none; }
  .handle:active { cursor: grabbing; }
  .bend { fill: #8f5a35; stroke: #efad70; cursor: ns-resize; }
  .bend:hover, .bend:focus-visible { fill: #efad70; outline: none; }
  .times { display: flex; gap: 14px; flex-wrap: wrap; font: 11px var(--host-font-mono, monospace); color: #aab4bd; }
  .times b { color: #77838d; font-weight: 600; margin-right: 3px; }
  .controls { display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; }
  .field { display: flex; flex-direction: column; gap: 4px; }
  .lbl { font: 600 10px var(--host-font-mono, monospace); letter-spacing: .08em; text-transform: uppercase; color: #8d969e; }
  .pair { display: inline-flex; align-items: center; gap: 6px; }
  .to { color: #77838d; font-size: 11px; }
  .spacer { flex: 1; }
  .audition { border-color: #7a5230; color: #e8b88a; }
  .audition:active { border-color: #dc8b43; background: #38271b; color: #ffd3aa; }
  .route { border-color: #9b5e31; color: #f0b47d; white-space: nowrap; }
</style>
