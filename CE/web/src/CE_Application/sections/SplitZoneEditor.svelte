<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    splitZones, splitRange, zoneOverlaps, unclaimedNotes, splitUnmatched,
    VELOCITY_CURVES, VELOCITY_CURVE_LABELS, MIN_NOTE, MAX_NOTE,
    CC_MODES, CC_MODE_LABELS, SPLIT_PRESETS, splitPresetZones, zoneSwitchesOnVelocity,
    BEND_MODES, BEND_MODE_LABELS,
  } from '../utils/splitZoneLayout.js';
  import { midiNoteLabel } from '../utils/arpLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Piano from 'lucide-svelte/icons/piano';
  import SquareDashed from 'lucide-svelte/icons/square-dashed';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let s = $derived(getSection(control, 'SplitZone'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `SplitZone.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let zones = $derived.by(() => { try { return splitZones(control); } catch { return []; } });
  let range = $derived.by(() => { try { return splitRange(control); } catch { return { lowNote: 36, highNote: 96 }; } });
  let overlaps = $derived.by(() => { try { return zoneOverlaps(control); } catch { return []; } });
  let gaps = $derived.by(() => {
    try { return splitUnmatched(control) === 'drop' ? unclaimedNotes(control, range.lowNote, range.highNote) : []; }
    catch { return []; }
  });
  // Contiguous runs, so a gap reads as "C4–B4 silent" rather than a list of 12.
  let gapRuns = $derived.by(() => {
    const runs = [];
    for (const n of gaps) {
      const last = runs[runs.length - 1];
      if (last && n === last.hi + 1) last.hi = n;
      else runs.push({ lo: n, hi: n });
    }
    return runs;
  });

  // Velocity switching can leave a hole: two zones over the same keys covering
  // 1-60 and 80-127 means anything played at 61-79 is silent, which is the
  // hardest kind of bug to hear because it only happens sometimes.
  let velGaps = $derived.by(() => {
    const out = [];
    const active = zones.filter((z) => z.enabled && zoneSwitchesOnVelocity(z));
    if (!active.length) return out;
    for (const z of active) {
      // Any velocity this zone rejects that no OTHER zone over the same keys accepts.
      const rivals = zones.filter((o) => o !== z && o.enabled
        && o.lowNote <= z.highNote && o.highNote >= z.lowNote);
      const holes = [];
      for (let v = 1; v <= 127; v += 1) {
        const mine = v >= Math.min(z.velSwitchLow, z.velSwitchHigh) && v <= Math.max(z.velSwitchLow, z.velSwitchHigh);
        if (mine) continue;
        const covered = rivals.some((o) => v >= Math.min(o.velSwitchLow, o.velSwitchHigh)
          && v <= Math.max(o.velSwitchLow, o.velSwitchHigh));
        if (!covered) holes.push(v);
      }
      if (!holes.length) continue;
      const lo = holes[0]; const hi = holes[holes.length - 1];
      out.push(`${z.label}: velocity ${lo}–${hi} reaches no zone`);
    }
    return [...new Set(out)];
  });

  function setZone(i, key, value) {
    const list = zones.map((z) => ({ ...z }));
    if (!list[i]) return;
    list[i] = { ...list[i], [key]: value };
    set('zones', list);
  }
  function addZone() {
    const list = zones.map((z) => ({ ...z }));
    const n = list.length;
    list.push({
      id: `z${Date.now().toString(36)}`, label: `Zone ${n + 1}`,
      lowNote: 60, highNote: 72, channel: Math.min(16, n + 1), transpose: 0,
      curve: 'linear', velLow: 1, velHigh: 127, fixedVelocity: 100,
      velSwitchLow: 1, velSwitchHigh: 127, ccMode: 'all', ccList: [], sustain: true,
      bendMode: 'lastPlayed', pressureMode: 'lastPlayed', polyPressure: true,
      enabled: true,
      colour: ['FF5B9BD5', 'FF39D98A', 'FFF2994A', 'FFBB6BD9', 'FFEB5757'][n % 5],
    });
    set('zones', list);
  }
  function removeZone(i) { set('zones', zones.filter((_, j) => j !== i)); }
  // Presets are built from the CURRENT drawn range, so applying one to a 25-key
  // controller gives boundaries on the keys you actually have.
  function applyPreset(id) { set('zones', splitPresetZones(id, range.lowNote, range.highNote)); }
  // The CC list is typed as text — "1, 11, 74" — because a set of controller
  // numbers is a thing people already know how to write.
  function ccListText(z) { return (Array.isArray(z.ccList) ? z.ccList : []).join(', '); }
  function setCcList(i, text) {
    const list = [...new Set(String(text ?? '').split(/[^0-9]+/).filter(Boolean)
      .map((t) => clampInt(t, 0, 127, 0)))].sort((a, b) => a - b);
    setZone(i, 'ccList', list);
  }
  function moveZone(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= zones.length) return;
    const list = zones.map((z) => ({ ...z }));
    [list[i], list[j]] = [list[j], list[i]];
    set('zones', list);
  }
</script>

{#if s}
  <PropertySection title="Zone Splitter" icon={Piano}>
    <PropertyCell label="In channel" span={1} compact hint="Which MIDI channel to take notes from. 0 = omni (any channel).">
      <NumberCell label="Ch" min={0} max={16} step={1} value={num(s.inputChannel, 0)} defaultValue={0} onchange={(v) => set('inputChannel', clampInt(v, 0, 16, 0))} />
    </PropertyCell>
    <PropertyCell label="No zone" span={2} hint="What happens to a note no zone claims: drop it or pass it through.">
      <select class="val" value={String(s.unmatched ?? 'drop')} onchange={(e) => set('unmatched', e.target.value)}>
        <option value="drop">Drop (silent)</option>
        <option value="pass">Pass through</option>
      </select>
    </PropertyCell>
    {#if String(s.unmatched ?? 'drop') === 'pass'}
      <PropertyCell label="Pass ch" span={1} compact hint="The channel unclaimed notes are passed on.">
        <NumberCell label="Ch" min={1} max={16} step={1} value={num(s.passChannel, 1)} defaultValue={1} onchange={(v) => set('passChannel', clampInt(v, 1, 16, 1))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Show from" span={1} compact hint="Lowest note on the drawn keyboard. Snapped out to a white key, so it never starts on a floating black one.">
      <NumberCell label="From" min={MIN_NOTE} max={MAX_NOTE} step={1} value={num(s.lowNote, 36)} defaultValue={36} onchange={(v) => set('lowNote', clampInt(v, MIN_NOTE, MAX_NOTE, 36))} />
    </PropertyCell>
    <PropertyCell label="…to" span={1} compact hint="Highest note on the drawn keyboard.">
      <NumberCell label="To" min={MIN_NOTE} max={MAX_NOTE} step={1} value={num(s.highNote, 96)} defaultValue={96} onchange={(v) => set('highNote', clampInt(v, MIN_NOTE, MAX_NOTE, 96))} />
    </PropertyCell>
    <PropertyCell label="" span={2} hint="The range actually drawn, after snapping to whole white keys." compact>
      <div class="note">{midiNoteLabel(range.lowNote)} – {midiNoteLabel(range.highNote)}</div>
    </PropertyCell>
    <PropertyCell label="Preset" span={4} hint="Replace the zone list with a common arrangement, built from the drawn keyboard range. Overwrites what's there.">
      <div class="presets">
        {#each SPLIT_PRESETS as p (p.id)}
          <button type="button" class="preset" title={p.hint} onclick={() => applyPreset(p.id)}>{p.label}</button>
        {/each}
      </div>
    </PropertyCell>
    <PropertyCell label="Editable" span={1} hint="Drag split points on the keyboard in preview, and click a key to audition it.">
      <PropertyToggle value={s.editable !== false} onchange={() => set('editable', !(s.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="Show the 'Zone → channel' summary strip.">
      <PropertyToggle value={s.showHeader !== false} onchange={() => set('showHeader', !(s.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Zone names" span={1} hint="Draw each zone's name on its band.">
      <PropertyToggle value={s.showLabels !== false} onchange={() => set('showLabels', !(s.showLabels !== false))} />
    </PropertyCell>
    <PropertyCell label="Mark gaps" span={1} hint="Shade keys no zone claims.">
      <PropertyToggle value={s.showGaps !== false} onchange={() => set('showGaps', !(s.showGaps !== false))} />
    </PropertyCell>

    {#if gapRuns.length}
      <PropertyCell label="" span={4} hint="" compact>
        <div class="warn">
          Silent: {gapRuns.map((r) => (r.lo === r.hi ? midiNoteLabel(r.lo) : `${midiNoteLabel(r.lo)}–${midiNoteLabel(r.hi)}`)).join(', ')}
          — no zone claims {gapRuns.length === 1 && gapRuns[0].lo === gapRuns[0].hi ? 'that key' : 'those keys'}.
        </div>
      </PropertyCell>
    {/if}
    {#if velGaps.length}
      <PropertyCell label="" span={4} hint="" compact>
        <div class="warn">
          {velGaps.join('; ')} — a note played outside a zone's &ldquo;plays at&rdquo; window is not claimed by it,
          so if no other zone catches it the note is {String(s.unmatched ?? 'drop') === 'pass' ? 'passed through' : 'dropped'}.
        </div>
      </PropertyCell>
    {/if}
    {#if overlaps.length}
      <PropertyCell label="" span={4} hint="" compact>
        <div class="info">
          Layered: {overlaps.map((o) => `${midiNoteLabel(o.lowNote)}–${midiNoteLabel(o.highNote)}`).join(', ')}
          — those keys are sent by more than one zone. Deliberate, that's layering; accidental, it's the
          &ldquo;sounds thin and detuned&rdquo; bug.
        </div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Zones" icon={SquareDashed}>
    {#snippet tools()}
      <button type="button" class="hdr-btn" title="Add zone" onclick={addZone}>+ Add</button>
    {/snippet}
    <PropertyCell label="" span={4} hint="Zones may overlap — a note inside two is sent twice, on two channels. Drag the split points in preview." compact>
      <div class="tablewrap">
        <table class="zt">
          <thead>
            <tr>
              <th>On</th><th>Name</th><th>From</th><th>To</th><th>Ch</th><th>Transp</th>
              <th>Velocity</th><th>Range</th><th title="Only respond to notes in this velocity window">Plays at</th>
              <th title="Which controllers this zone forwards">CCs</th>
              <th title="Forward the sustain pedal (CC64) to this zone's channel">Ped</th>
              <th title="Which zones receive pitch bend">Bend</th>
              <th title="Which zones receive channel aftertouch">Press</th>
              <th title="Forward poly key pressure to this zone">Poly</th>
              <th>Col</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each zones as z, i (z.id)}
              <tr class:off={!z.enabled}>
                <td><PropertyToggle compact label="On" value={z.enabled} onchange={(next) => setZone(i, 'enabled', next)} ariaLabel={`Zone ${i + 1} enabled`} /></td>
                <td><input class="cell name" type="text" value={z.label} onchange={(e) => setZone(i, 'label', e.target.value)} /></td>
                <td>
                  <span class="n nc-wrap">
                    <NumberCell min={MIN_NOTE} max={MAX_NOTE} value={z.lowNote}
                                onchange={(v) => setZone(i, 'lowNote', clampInt(v, MIN_NOTE, MAX_NOTE, 0))} />
                  </span>
                  <span class="nl">{midiNoteLabel(z.lowNote)}</span>
                </td>
                <td>
                  <span class="n nc-wrap">
                    <NumberCell min={MIN_NOTE} max={MAX_NOTE} value={z.highNote}
                                onchange={(v) => setZone(i, 'highNote', clampInt(v, MIN_NOTE, MAX_NOTE, 127))} />
                  </span>
                  <span class="nl">{midiNoteLabel(z.highNote)}</span>
                </td>
                <td><span class="n nc-wrap"><NumberCell min={1} max={16} value={z.channel}
                           onchange={(v) => setZone(i, 'channel', clampInt(v, 1, 16, 1))} /></span></td>
                <td><span class="n nc-wrap"><NumberCell min={-48} max={48} value={z.transpose}
                           onchange={(v) => setZone(i, 'transpose', clampInt(v, -48, 48, 0))} /></span></td>
                <td>
                  <select class="cell sel" value={z.curve} onchange={(e) => setZone(i, 'curve', e.target.value)}>
                    {#each VELOCITY_CURVES as c (c)}<option value={c}>{VELOCITY_CURVE_LABELS[c] ?? c}</option>{/each}
                  </select>
                </td>
                <td>
                  {#if z.curve === 'fixed'}
                    <span class="n nc-wrap">
                      <NumberCell min={1} max={127} value={z.fixedVelocity}
                                  onchange={(v) => setZone(i, 'fixedVelocity', clampInt(v, 1, 127, 100))} />
                    </span>
                  {:else}
                    <span class="n nc-wrap">
                      <NumberCell min={1} max={127} value={z.velLow}
                                  onchange={(v) => setZone(i, 'velLow', clampInt(v, 1, 127, 1))} />
                    </span>
                    <span class="n nc-wrap">
                      <NumberCell min={1} max={127} value={z.velHigh}
                                  onchange={(v) => setZone(i, 'velHigh', clampInt(v, 1, 127, 127))} />
                    </span>
                  {/if}
                </td>
                <td class:switched={zoneSwitchesOnVelocity(z)}>
                  <span class="n nc-wrap">
                    <NumberCell min={1} max={127} value={z.velSwitchLow}
                                onchange={(v) => setZone(i, 'velSwitchLow', clampInt(v, 1, 127, 1))} />
                  </span>
                  <span class="n nc-wrap">
                    <NumberCell min={1} max={127} value={z.velSwitchHigh}
                                onchange={(v) => setZone(i, 'velSwitchHigh', clampInt(v, 1, 127, 127))} />
                  </span>
                </td>
                <td>
                  <select class="cell selsm" value={z.ccMode} onchange={(e) => setZone(i, 'ccMode', e.target.value)}>
                    {#each CC_MODES as m (m)}<option value={m}>{CC_MODE_LABELS[m] ?? m}</option>{/each}
                  </select>
                  {#if z.ccMode === 'list'}
                    <input class="cell cclist" type="text" placeholder="1, 11, 74" value={ccListText(z)}
                           onchange={(e) => setCcList(i, e.target.value)} />
                  {/if}
                </td>
                <td><PropertyToggle compact label="Sus" value={z.sustain !== false} onchange={(next) => setZone(i, 'sustain', next)} ariaLabel={`Zone ${i + 1} sustain`} /></td>
                <td>
                  <select class="cell selsm" value={z.bendMode} onchange={(e) => setZone(i, 'bendMode', e.target.value)}>
                    {#each BEND_MODES as m (m)}<option value={m}>{BEND_MODE_LABELS[m] ?? m}</option>{/each}
                  </select>
                </td>
                <td>
                  <select class="cell selsm" value={z.pressureMode} onchange={(e) => setZone(i, 'pressureMode', e.target.value)}>
                    {#each BEND_MODES as m (m)}<option value={m}>{BEND_MODE_LABELS[m] ?? m}</option>{/each}
                  </select>
                </td>
                <td><PropertyToggle compact label="Poly" value={z.polyPressure !== false} onchange={(next) => setZone(i, 'polyPressure', next)} ariaLabel={`Zone ${i + 1} poly pressure`} /></td>
                <td><SwatchCluster swatches={[
                  { key: `zoneColour_${z.id}`, label: 'Col', value: z.colour ?? 'FF5B9BD5', target: { type: 'callback', apply: (hex) => setZone(i, 'colour', hex) } },
                ]} /></td>
                <td class="acts">
                  <button type="button" title="Move up" onclick={() => moveZone(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" title="Move down" onclick={() => moveZone(i, 1)} disabled={i === zones.length - 1}>↓</button>
                  <button type="button" title="Remove" onclick={() => removeZone(i)}>✕</button>
                </td>
              </tr>
            {/each}
            {#if !zones.length}
              <tr><td colspan="16"><div class="note">No zones — every note is {String(s.unmatched ?? 'drop') === 'pass' ? 'passed through' : 'dropped'}.</div></td></tr>
            {/if}
          </tbody>
        </table>
      </div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">
        <b>Bend</b> and <b>Press</b> carry no note, so a rule picks the zones: <b>Last played</b> = whichever
        claimed the most recent note-on; <b>While sounding</b> = every zone currently holding a note.
      </div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Face, white keys, black keys, held key, unclaimed-key gap, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: s.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'SplitZone.faceColour' } },
        { key: 'whiteColour', label: 'White', value: s.whiteColour ?? 'FFE8E8EE', target: { type: 'control', controlId: core?.id, path: 'SplitZone.whiteColour' } },
        { key: 'blackColour', label: 'Black', value: s.blackColour ?? 'FF1A1A22', target: { type: 'control', controlId: core?.id, path: 'SplitZone.blackColour' } },
        { key: 'litColour', label: 'Held', value: s.litColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'SplitZone.litColour' } },
        { key: 'gapColour', label: 'Gap', value: s.gapColour ?? 'FF3A3A46', target: { type: 'control', controlId: core?.id, path: 'SplitZone.gapColour' } },
        { key: 'labelColour', label: 'Labels', value: s.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'SplitZone.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; }
  .warn { font-size: 11px; color: #F2C94C; background: #241f10; border: 1px solid #4a3f18; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .info { font-size: 11px; color: #8FC7F5; background: #101c26; border: 1px solid #1d3b52; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .tablewrap { overflow-x: auto; }
  .zt { border-collapse: collapse; font-size: 11px; width: 100%; }
  .zt th { text-align: left; color: #8A8A92; font-weight: 500; padding: 2px 4px; border-bottom: 1px solid #2a2a36; white-space: nowrap; }
  .zt td { padding: 2px 4px; vertical-align: middle; white-space: nowrap; }
  .zt tr.off { opacity: 0.45; }
  .cell { background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 11px; padding: 2px 4px; border-radius: 3px; }
  .nc-wrap { display: inline-flex; vertical-align: middle; }
  .nc-wrap.n { width: 46px; }
  .cell.name { width: 82px; }
  .cell.sel { width: 96px; }
  .cell.selsm { width: 78px; }
  .cell.cclist { width: 76px; margin-left: 3px; }
  td.switched { background: rgba(242, 201, 76, 0.08); }
  .presets { display: flex; flex-wrap: wrap; gap: 5px; }
  .preset { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .preset:hover { border-color: #4a4a58; color: #E8E8EE; }
  .nl { color: #6f6f78; font-size: 10px; margin-left: 3px; }
  .acts button { background: #1A1A1A; border: 1px solid #333; color: #888; font-size: 11px; padding: 1px 5px; border-radius: 3px; cursor: pointer; }
  .acts button:disabled { opacity: 0.3; cursor: default; }
  .hdr-btn {
    height: 16px; font-size: 9px; padding: 0 8px; border-radius: 8px;
    background: #252525; border: 1px solid #333; color: #777;
    font-family: inherit; cursor: pointer; line-height: 1;
  }
  .hdr-btn:hover { border-color: #4A6E8C; color: #CCC; }
</style>
