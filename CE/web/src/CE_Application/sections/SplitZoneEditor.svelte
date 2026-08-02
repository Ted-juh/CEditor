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
  import PropertyToggle from '../properties/PropertyToggle.svelte';

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
  function colRgb(v, fb) { const t = String(v ?? fb).replace(/^#/, ''); return `#${t.length >= 6 ? t.slice(-6) : String(fb).slice(-6)}`; }
  function setCol(prop, cur, hex) {
    const t = String(cur ?? '').replace(/^#/, '');
    const al = /^[0-9a-fA-F]{8}$/.test(t) ? t.slice(0, 2) : 'FF';
    set(prop, `${al}${hex.replace('#', '').toUpperCase()}`);
  }
  function setZoneCol(i, cur, hex) {
    const t = String(cur ?? '').replace(/^#/, '');
    const al = /^[0-9a-fA-F]{8}$/.test(t) ? t.slice(0, 2) : 'FF';
    setZone(i, 'colour', `${al}${hex.replace('#', '').toUpperCase()}`);
  }
</script>

{#if s}
  <PropertySection title="Zone Splitter">
    <PropertyCell label="In channel" span={1} hint="Which MIDI channel to take notes from. 0 = omni (any channel).">
      <input class="val" type="number" min="0" max="16" step="1" value={num(s.inputChannel, 0)} onchange={(e) => set('inputChannel', clampInt(e.target.value, 0, 16, 0))} />
    </PropertyCell>
    <PropertyCell label="No zone" span={2} hint="What happens to a note no zone claims: drop it or pass it through.">
      <select class="val" value={String(s.unmatched ?? 'drop')} onchange={(e) => set('unmatched', e.target.value)}>
        <option value="drop">Drop (silent)</option>
        <option value="pass">Pass through</option>
      </select>
    </PropertyCell>
    {#if String(s.unmatched ?? 'drop') === 'pass'}
      <PropertyCell label="Pass ch" span={1} hint="The channel unclaimed notes are passed on.">
        <input class="val" type="number" min="1" max="16" step="1" value={num(s.passChannel, 1)} onchange={(e) => set('passChannel', clampInt(e.target.value, 1, 16, 1))} />
      </PropertyCell>
    {/if}
    <PropertyCell label="Show from" span={1} hint="Lowest note on the drawn keyboard. Snapped out to a white key, so it never starts on a floating black one.">
      <input class="val" type="number" min={MIN_NOTE} max={MAX_NOTE} step="1" value={num(s.lowNote, 36)} onchange={(e) => set('lowNote', clampInt(e.target.value, MIN_NOTE, MAX_NOTE, 36))} />
    </PropertyCell>
    <PropertyCell label="…to" span={1} hint="Highest note on the drawn keyboard.">
      <input class="val" type="number" min={MIN_NOTE} max={MAX_NOTE} step="1" value={num(s.highNote, 96)} onchange={(e) => set('highNote', clampInt(e.target.value, MIN_NOTE, MAX_NOTE, 96))} />
    </PropertyCell>
    <PropertyCell label="" span={2} hint="The range actually drawn, after snapping to whole white keys.">
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
      <PropertyCell label="" span={4} hint="">
        <div class="warn">
          Silent: {gapRuns.map((r) => (r.lo === r.hi ? midiNoteLabel(r.lo) : `${midiNoteLabel(r.lo)}–${midiNoteLabel(r.hi)}`)).join(', ')}
          — no zone claims {gapRuns.length === 1 && gapRuns[0].lo === gapRuns[0].hi ? 'that key' : 'those keys'}.
        </div>
      </PropertyCell>
    {/if}
    {#if velGaps.length}
      <PropertyCell label="" span={4} hint="">
        <div class="warn">
          {velGaps.join('; ')} — a note played outside a zone's &ldquo;plays at&rdquo; window is not claimed by it,
          so if no other zone catches it the note is {String(s.unmatched ?? 'drop') === 'pass' ? 'passed through' : 'dropped'}.
        </div>
      </PropertyCell>
    {/if}
    {#if overlaps.length}
      <PropertyCell label="" span={4} hint="">
        <div class="info">
          Layered: {overlaps.map((o) => `${midiNoteLabel(o.lowNote)}–${midiNoteLabel(o.highNote)}`).join(', ')}
          — those keys are sent by more than one zone. Deliberate, that's layering; accidental, it's the
          &ldquo;sounds thin and detuned&rdquo; bug.
        </div>
      </PropertyCell>
    {/if}
  </PropertySection>

  <PropertySection title="Zones">
    <PropertyCell label="" span={4} hint="Zones may overlap — a note inside two is sent twice, on two channels. Drag the split points in preview.">
      <div class="tablewrap">
        <table class="zt">
          <thead>
            <tr>
              <th>On</th><th>Name</th><th>From</th><th>To</th><th>Ch</th><th>Transp</th>
              <th>Velocity</th><th>Range</th><th title="Only respond to notes played in this velocity window — the hit-it-hard layer">Plays at</th>
              <th title="Which controllers this zone forwards">CCs</th>
              <th title="Forward the sustain pedal (CC64) to this zone's channel">Ped</th>
              <th title="A pitch bend carries no note, so who hears it is a rule rather than a fact">Bend</th>
              <th title="Channel aftertouch — same attribution rule as bend, its own switch">Press</th>
              <th title="Poly key pressure. It names its note, so it needs no rule — just on or off.">Poly</th>
              <th>Col</th><th></th>
            </tr>
          </thead>
          <tbody>
            {#each zones as z, i (z.id)}
              <tr class:off={!z.enabled}>
                <td><input type="checkbox" checked={z.enabled} onchange={(e) => setZone(i, 'enabled', e.target.checked)} /></td>
                <td><input class="cell name" type="text" value={z.label} onchange={(e) => setZone(i, 'label', e.target.value)} /></td>
                <td>
                  <input class="cell n" type="number" min={MIN_NOTE} max={MAX_NOTE} value={z.lowNote}
                         onchange={(e) => setZone(i, 'lowNote', clampInt(e.target.value, MIN_NOTE, MAX_NOTE, 0))} />
                  <span class="nl">{midiNoteLabel(z.lowNote)}</span>
                </td>
                <td>
                  <input class="cell n" type="number" min={MIN_NOTE} max={MAX_NOTE} value={z.highNote}
                         onchange={(e) => setZone(i, 'highNote', clampInt(e.target.value, MIN_NOTE, MAX_NOTE, 127))} />
                  <span class="nl">{midiNoteLabel(z.highNote)}</span>
                </td>
                <td><input class="cell n" type="number" min="1" max="16" value={z.channel}
                           onchange={(e) => setZone(i, 'channel', clampInt(e.target.value, 1, 16, 1))} /></td>
                <td><input class="cell n" type="number" min="-48" max="48" value={z.transpose}
                           onchange={(e) => setZone(i, 'transpose', clampInt(e.target.value, -48, 48, 0))} /></td>
                <td>
                  <select class="cell sel" value={z.curve} onchange={(e) => setZone(i, 'curve', e.target.value)}>
                    {#each VELOCITY_CURVES as c (c)}<option value={c}>{VELOCITY_CURVE_LABELS[c] ?? c}</option>{/each}
                  </select>
                </td>
                <td>
                  {#if z.curve === 'fixed'}
                    <input class="cell n" type="number" min="1" max="127" value={z.fixedVelocity}
                           onchange={(e) => setZone(i, 'fixedVelocity', clampInt(e.target.value, 1, 127, 100))} />
                  {:else}
                    <input class="cell n" type="number" min="1" max="127" value={z.velLow}
                           onchange={(e) => setZone(i, 'velLow', clampInt(e.target.value, 1, 127, 1))} />
                    <input class="cell n" type="number" min="1" max="127" value={z.velHigh}
                           onchange={(e) => setZone(i, 'velHigh', clampInt(e.target.value, 1, 127, 127))} />
                  {/if}
                </td>
                <td class:switched={zoneSwitchesOnVelocity(z)}>
                  <input class="cell n" type="number" min="1" max="127" value={z.velSwitchLow}
                         onchange={(e) => setZone(i, 'velSwitchLow', clampInt(e.target.value, 1, 127, 1))} />
                  <input class="cell n" type="number" min="1" max="127" value={z.velSwitchHigh}
                         onchange={(e) => setZone(i, 'velSwitchHigh', clampInt(e.target.value, 1, 127, 127))} />
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
                <td><input type="checkbox" checked={z.sustain !== false} onchange={(e) => setZone(i, 'sustain', e.target.checked)} /></td>
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
                <td><input type="checkbox" checked={z.polyPressure !== false} onchange={(e) => setZone(i, 'polyPressure', e.target.checked)} /></td>
                <td><input class="col" type="color" value={colRgb(z.colour, 'FF5B9BD5')} oninput={(e) => setZoneCol(i, z.colour, e.target.value)} /></td>
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
    <PropertyCell label="" span={4} hint="">
      <div class="note">
        <b>Bend</b> and <b>Press</b> carry no note, so a rule picks the zones: <b>Last played</b> = whichever
        claimed the most recent note-on; <b>While sounding</b> = every zone currently holding a note.
      </div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="">
      <button type="button" class="action-btn" onclick={addZone}>Add zone</button>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance">
    <PropertyCell label="Face" span={1} hint="Panel behind the keyboard."><input class="col" type="color" value={colRgb(s.faceColour, 'FF141420')} oninput={(e) => setCol('faceColour', s.faceColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="White keys" span={1} hint=""><input class="col" type="color" value={colRgb(s.whiteColour, 'FFE8E8EE')} oninput={(e) => setCol('whiteColour', s.whiteColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Black keys" span={1} hint=""><input class="col" type="color" value={colRgb(s.blackColour, 'FF1A1A22')} oninput={(e) => setCol('blackColour', s.blackColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Held" span={1} hint="Colour of a key currently sounding."><input class="col" type="color" value={colRgb(s.litColour, 'FFF2C94C')} oninput={(e) => setCol('litColour', s.litColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Gap" span={1} hint="Colour of a key no zone claims."><input class="col" type="color" value={colRgb(s.gapColour, 'FF3A3A46')} oninput={(e) => setCol('gapColour', s.gapColour, e.target.value)} /></PropertyCell>
    <PropertyCell label="Labels" span={1} hint=""><input class="col" type="color" value={colRgb(s.labelColour, 'FFB9B9B9')} oninput={(e) => setCol('labelColour', s.labelColour, e.target.value)} /></PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { width: 100%; background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 12px; padding: 3px 6px; border-radius: 4px; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; }
  .warn { font-size: 11px; color: #F2C94C; background: #241f10; border: 1px solid #4a3f18; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .info { font-size: 11px; color: #8FC7F5; background: #101c26; border: 1px solid #1d3b52; border-radius: 5px; padding: 6px 8px; line-height: 1.5; }
  .tablewrap { overflow-x: auto; }
  .zt { border-collapse: collapse; font-size: 11px; width: 100%; }
  .zt th { text-align: left; color: #8A8A92; font-weight: 500; padding: 2px 4px; border-bottom: 1px solid #2a2a36; white-space: nowrap; }
  .zt td { padding: 2px 4px; vertical-align: middle; white-space: nowrap; }
  .zt tr.off { opacity: 0.45; }
  .cell { background: #141420; border: 1px solid #2a2a36; color: #E8E8EE; font-size: 11px; padding: 2px 4px; border-radius: 3px; }
  .cell.n { width: 46px; }
  .cell.name { width: 82px; }
  .cell.sel { width: 96px; }
  .cell.selsm { width: 78px; }
  .cell.cclist { width: 76px; margin-left: 3px; }
  td.switched { background: rgba(242, 201, 76, 0.08); }
  .presets { display: flex; flex-wrap: wrap; gap: 5px; }
  .preset { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 3px 8px; border-radius: 4px; cursor: pointer; }
  .preset:hover { border-color: #4a4a58; color: #E8E8EE; }
  .nl { color: #6f6f78; font-size: 10px; margin-left: 3px; }
  .col { width: 26px; height: 20px; padding: 0; border: 1px solid #2a2a36; background: #141420; border-radius: 3px; }
  .acts button { background: #1A1A1A; border: 1px solid #333; color: #888; font-size: 11px; padding: 1px 5px; border-radius: 3px; cursor: pointer; }
  .acts button:disabled { opacity: 0.3; cursor: default; }
  .action-btn { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 4px 10px; border-radius: 4px; cursor: pointer; }
</style>
