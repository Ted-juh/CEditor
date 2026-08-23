<script>
  import { getSection, updateControlProperty } from '../stores/controls.js';
  import {
    HARMONY_MODES, HARMONY_MODE_LABELS, VOICINGS, VOICING_LABELS,
    OUT_OF_KEY, OUT_OF_KEY_LABELS, MEMORY_PRESETS, memoryPresetShape,
    memoryShape, harmoniserMode, chordForNote, chordLabel, harmoniserUseFlats,
    degreeOfNote, MAX_VOICES,
    VOICE_LEADING, VOICE_LEADING_LABELS, voiceLeading, overrideForDegree,
    harmoniserStrum, harmoniserScale,
  } from '../utils/harmoniserLayout.js';
  import { SCALES, SCALE_LABELS, NOTE_SHARP, NOTE_FLAT, noteName, useFlats } from '../utils/chordPadLayout.js';
  import PropertyCell from '../properties/PropertyCell.svelte';
  import NumberCell from '../properties/NumberCell.svelte';
  import PropertySection from '../properties/PropertySection.svelte';
  import PropertyToggle from '../properties/PropertyToggle.svelte';
  import SwatchCluster from '../properties/SwatchCluster.svelte';
  import Music from 'lucide-svelte/icons/music';
  import Layers from 'lucide-svelte/icons/layers';
  import Hash from 'lucide-svelte/icons/hash';
  import Monitor from 'lucide-svelte/icons/monitor';
  import Palette from 'lucide-svelte/icons/palette';

  let { control = null } = $props();

  let core = $derived(getSection(control, 'Core'));
  let p = $derived(getSection(control, 'Harmoniser'));

  function set(prop, value) {
    if (!core?.id) return;
    updateControlProperty(core.id, `Harmoniser.${prop}`, value);
  }
  function num(v, f = 0) { const n = Number(v); return Number.isFinite(n) ? n : f; }
  function clampInt(v, lo, hi, f) { const n = Math.round(num(v, f)); return n < lo ? lo : n > hi ? hi : n; }

  let isMemory = $derived(harmoniserMode(control) === 'memory');
  let flats = $derived(useFlats(num(p?.key, 0), String(p?.scale ?? 'major')));
  let keyNames = $derived(flats ? NOTE_FLAT : NOTE_SHARP);
  let scaleKeys = $derived(Object.keys(SCALES));

  // What every degree of the key currently produces. In diatonic mode this is
  // the whole component in one line — the point is that it is correct for every
  // note, so showing one example proves nothing.
  let table = $derived.by(() => {
    try {
      const f = harmoniserUseFlats(control);
      const base = 60 + num(p?.key, 0);
      const out = [];
      for (let i = 0; i < 24 && out.length < 7; i += 1) {
        const n = base + i;
        if (!isMemory && degreeOfNote(control, n) === null) continue;
        const notes = chordForNote(control, n);
        if (!notes.length) continue;
        out.push(`${noteName(((n % 12) + 12) % 12, f)} → ${notes.map((x) => noteName(((x % 12) + 12) % 12, f)).join(' ')}`);
        if (isMemory) break;
      }
      return out;
    } catch { return []; }
  });
  let example = $derived.by(() => { try { return chordLabel(control, 60 + num(p?.key, 0)); } catch { return ''; } });

  // Per-degree overrides. 1-based in the UI, as musicians count degrees.
  let selDegree = $state(1);
  let degreeCount = $derived.by(() => { try { return harmoniserScale(control).length; } catch { return 7; } });
  let degreeOverride = $derived.by(() => { try { return overrideForDegree(control, selDegree - 1); } catch { return null; } });
  function setDegree(list) {
    const prior = p.degreeChords && typeof p.degreeChords === 'object' ? p.degreeChords : {};
    const key = String(selDegree - 1);
    if (!list) { const next = { ...prior }; delete next[key]; set('degreeChords', next); return; }
    set('degreeChords', { ...prior, [key]: list });
  }
  function setDegreeText(text) {
    const list = String(text ?? '').split(/[,\s]+/).map((t) => Number(t.trim()))
      .filter((n) => Number.isFinite(n)).slice(0, MAX_VOICES);
    setDegree(list.length ? list : null);
  }
  let overriddenDegrees = $derived.by(() => {
    const all = p?.degreeChords && typeof p.degreeChords === 'object' ? p.degreeChords : {};
    return Object.entries(all)
      .filter(([, v]) => Array.isArray(v) && v.length)
      .map(([k, v]) => `${Number(k) + 1}: ${v.join(' ')}`)
      .sort();
  });

  function setShapeText(text) {
    const list = String(text ?? '').split(/[,\s]+/).map((t) => Number(t.trim()))
      .filter((n) => Number.isFinite(n));
    set('shape', list.length ? list.slice(0, MAX_VOICES) : [0]);
  }
</script>

{#if p}
  <PropertySection title="Harmoniser" icon={Music}>
    <PropertyCell label="Mode" span={4} hint="Diatonic = the chord for the played note's degree in the key. Memory = a fixed shape transposed to whatever you play.">
      <select class="val" value={p.mode ?? 'diatonic'} onchange={(e) => set('mode', e.target.value)}>
        {#each HARMONY_MODES as m (m)}<option value={m}>{HARMONY_MODE_LABELS[m] ?? m}</option>{/each}
      </select>
    </PropertyCell>

    {#if !isMemory}
      <PropertyCell label="Key" span={1} hint="">
        <select class="val" value={num(p.key, 0)} onchange={(e) => set('key', clampInt(e.target.value, 0, 11, 0))}>
          {#each keyNames as nm, i (i)}<option value={i}>{nm}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Scale" span={1} hint="">
        <select class="val" value={p.scale ?? 'major'} onchange={(e) => set('scale', e.target.value)}>
          {#each scaleKeys as k (k)}<option value={k}>{SCALE_LABELS[k] ?? k}</option>{/each}
        </select>
      </PropertyCell>
      <PropertyCell label="Chord size" span={1} compact hint="Notes stacked in thirds up the scale. 3 is a triad, 4 a seventh, 5 a ninth.">
        <NumberCell label="Size" min={2} max={6} step={1} value={num(p.size, 3)} defaultValue={3} onchange={(v) => set('size', clampInt(v, 2, 6, 3))} />
      </PropertyCell>
      <PropertyCell label="Out of key" span={1} hint="What to do with a note that has no degree in the scale.">
        <select class="val" value={p.outOfKey ?? 'pass'} onchange={(e) => set('outOfKey', e.target.value)}>
          {#each OUT_OF_KEY as m (m)}<option value={m}>{OUT_OF_KEY_LABELS[m] ?? m}</option>{/each}
        </select>
      </PropertyCell>
    {:else}
      <PropertyCell label="Shape" span={2} hint="Semitones from the played note, comma separated. 0 is the played note itself.">
        <input class="val" type="text" value={memoryShape(control).join(', ')} onchange={(e) => setShapeText(e.target.value)} />
      </PropertyCell>
      <PropertyCell label="Preset" span={2} hint="">
        <div class="seeds">
          {#each MEMORY_PRESETS as pr (pr.id)}
            <button type="button" class="seed" onclick={() => set('shape', memoryPresetShape(pr.id))}>{pr.label}</button>
          {/each}
        </div>
      </PropertyCell>
    {/if}

    <PropertyCell label="Voicing" span={1} hint="Open lifts the middle voice an octave; drop 2 drops the second voice from the top. Both need at least three notes.">
      <select class="val" value={p.voicing ?? 'close'} onchange={(e) => set('voicing', e.target.value)}>
        {#each VOICINGS as v (v)}<option value={v}>{VOICING_LABELS[v] ?? v}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Inversion" span={1} compact hint="Lifts the lowest voices up an octave, one per step.">
      <NumberCell label="Inv" min={0} max={3} step={1} value={num(p.inversion, 0)} defaultValue={0} onchange={(v) => set('inversion', clampInt(v, 0, 3, 0))} />
    </PropertyCell>
    <PropertyCell label="Octave" span={1} compact hint="Moves the added voices by whole octaves, leaving the played note where it is.">
      <NumberCell label="Oct" min={-3} max={3} step={1} value={num(p.octaveSpread, 0)} defaultValue={0} onchange={(v) => set('octaveSpread', clampInt(v, -3, 3, 0))} />
    </PropertyCell>
    <PropertyCell label="Max voices" span={1} compact hint="A hard ceiling on how many notes one key can produce.">
      <NumberCell label="Max" min={1} max={MAX_VOICES} step={1} value={num(p.maxVoices, 6)} defaultValue={6} onchange={(v) => set('maxVoices', clampInt(v, 1, MAX_VOICES, 6))} />
    </PropertyCell>

    <PropertyCell label="Keep played note" span={1} hint="Send the played note along with the harmony. Off sends the harmony only.">
      <PropertyToggle value={p.keepPlayed !== false} onchange={() => set('keepPlayed', !(p.keepPlayed !== false))} />
    </PropertyCell>
    <PropertyCell label="In channel" span={1} compact hint="0 listens on every channel.">
      <NumberCell label="Ch" min={0} max={16} step={1} value={num(p.inputChannel, 0)} defaultValue={0} onchange={(v) => set('inputChannel', clampInt(v, 0, 16, 0))} />
    </PropertyCell>
    <PropertyCell label="Out channel" span={1} compact hint="Where the chord is sent.">
      <NumberCell label="Ch" min={1} max={16} step={1} value={num(p.channel, 1)} defaultValue={1} onchange={(v) => set('channel', clampInt(v, 1, 16, 1))} />
    </PropertyCell>
    <PropertyCell label="Velocity" span={1} compact hint="0 follows the velocity you played. Any other value is fixed — an organ-like part that ignores how hard you hit it.">
      <NumberCell label="Vel" min={0} max={127} step={1} value={num(p.velocity, 0)} defaultValue={0} onchange={(v) => set('velocity', clampInt(v, 0, 127, 0))} />
    </PropertyCell>

    <PropertyCell label="" span={4} hint={isMemory ? 'The shape applied to C.' : 'The chord built on every degree of the key.'} compact>
      <div class="preview">{table.length ? table.join('\n') : '—'}</div>
    </PropertyCell>
    <PropertyCell label="" span={4} hint="" compact>
      <div class="note">Playing the tonic gives <b>{example}</b>.</div>
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Voicing extras" icon={Layers}>
    <PropertyCell label="Voice leading" span={4} hint="Pick the inversion closest to the previous chord. Closest = least total movement; Smooth = holds the top voice.">
      <select class="val" value={voiceLeading(control)} onchange={(e) => set('voiceLeading', e.target.value)}>
        {#each VOICE_LEADING as v (v)}<option value={v}>{VOICE_LEADING_LABELS[v] ?? v}</option>{/each}
      </select>
    </PropertyCell>
    <PropertyCell label="Strum" span={1} compact hint="Spread the chord over this many milliseconds. Note-offs are never strummed.">
      <NumberCell label="Strum" min={0} max={400} step={5} value={harmoniserStrum(control)} onchange={(v) => set('strumMs', clampInt(v, 0, 400, 0))} />
    </PropertyCell>
    <PropertyCell label="Direction" span={1} hint="Which end of the chord arrives first.">
      <select class="val" value={p.strumDirection ?? 'up'} onchange={(e) => set('strumDirection', e.target.value)}>
        <option value="up">Up</option>
        <option value="down">Down</option>
      </select>
    </PropertyCell>
    <PropertyCell label="Forward bend" span={1} hint="Pass incoming pitch bend to the chord's channel, all 14 bits.">
      <PropertyToggle value={p.forwardBend === true} onchange={() => set('forwardBend', !(p.forwardBend === true))} />
    </PropertyCell>
    <PropertyCell label="Forward pressure" span={1} hint="The same for channel aftertouch.">
      <PropertyToggle value={p.forwardPressure === true} onchange={() => set('forwardPressure', !(p.forwardPressure === true))} />
    </PropertyCell>
  </PropertySection>

  {#if !isMemory}
    <PropertySection title="Per-degree chords" icon={Hash}>
      <PropertyCell label="" span={4} hint="" compact>
        <div class="note">
          An override replaces the stacked chord for <b>one</b> degree and leaves the others alone.
        </div>
      </PropertyCell>
      <PropertyCell label="Degree" span={1} compact hint="1 is the tonic.">
        <NumberCell label="Deg" min={1} max={degreeCount} step={1} value={selDegree} onchange={(v) => { selDegree = clampInt(v, 1, degreeCount, 1); }} />
      </PropertyCell>
      <PropertyCell label="Chord" span={2} hint="Semitones from the played note, comma separated. Blank uses the stacked thirds.">
        <input class="val" type="text" placeholder="stacked thirds" value={(degreeOverride ?? []).join(', ')} onchange={(e) => setDegreeText(e.target.value)} />
      </PropertyCell>
      <PropertyCell label="" span={1} hint="" compact>
        <button type="button" class="seed" disabled={!degreeOverride} onclick={() => setDegree(null)}>Clear</button>
      </PropertyCell>
      {#if overriddenDegrees.length}
        <PropertyCell label="" span={4} hint="Every degree currently overridden." compact>
          <div class="preview">{overriddenDegrees.join('   ·   ')}</div>
        </PropertyCell>
      {/if}
    </PropertySection>
  {/if}

  <PropertySection title="Display" icon={Monitor}>
    <PropertyCell label="Click to audition" span={1} hint="Click a key in preview to hear the chord. Most of the editor's life is spent with no keyboard plugged in.">
      <PropertyToggle value={p.editable !== false} onchange={() => set('editable', !(p.editable !== false))} />
    </PropertyCell>
    <PropertyCell label="Header" span={1} hint="The chord name and mode strip.">
      <PropertyToggle value={p.showHeader !== false} onchange={() => set('showHeader', !(p.showHeader !== false))} />
    </PropertyCell>
    <PropertyCell label="Low note" span={1} compact hint="The keyboard's resting low note when nothing is sounding. It stretches to fit whatever plays.">
      <NumberCell label="Note" min={0} max={108} step={1} value={num(p.displayLow, 48)} defaultValue={48} onchange={(v) => set('displayLow', clampInt(v, 0, 108, 48))} />
    </PropertyCell>
    <PropertyCell label="Span" span={1} compact hint="How many semitones it shows at rest.">
      <NumberCell label="Span" min={12} max={60} step={1} value={num(p.displaySpan, 24)} defaultValue={24} onchange={(v) => set('displaySpan', clampInt(v, 12, 60, 24))} />
    </PropertyCell>
  </PropertySection>

  <PropertySection title="Appearance" icon={Palette}>
    <PropertyCell label="Colours" span={4} hint="Face, white keys, black keys, the key you played, the notes it added, labels. Click a swatch to edit it in the Colors tab.">
      <SwatchCluster swatches={[
        { key: 'faceColour', label: 'Face', value: p.faceColour ?? 'FF141420', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.faceColour' } },
        { key: 'whiteColour', label: 'White', value: p.whiteColour ?? 'FFE8E8EE', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.whiteColour' } },
        { key: 'blackColour', label: 'Black', value: p.blackColour ?? 'FF1A1A22', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.blackColour' } },
        { key: 'playedColour', label: 'Played', value: p.playedColour ?? 'FFF2C94C', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.playedColour' } },
        { key: 'addedColour', label: 'Added', value: p.addedColour ?? 'FFBB6BD9', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.addedColour' } },
        { key: 'labelColour', label: 'Labels', value: p.labelColour ?? 'FFB9B9B9', target: { type: 'control', controlId: core?.id, path: 'Harmoniser.labelColour' } },
      ]} />
    </PropertyCell>
  </PropertySection>
{/if}

<style>
  .val { box-sizing: border-box; width: 100%; min-width: 0; height: var(--pp-field-height, 26px); padding: var(--pp-field-padding, 0 6px); background: var(--pp-field-bg, #1A1A1A); border: 1px solid var(--pp-field-border, #333); border-radius: var(--pp-field-radius, 3px); color: var(--pp-field-fg, #DDD); font-size: var(--pp-field-font, 11px); font-family: inherit; outline: none; }
  .note { font-size: 11px; color: #9a9aa4; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 5px 7px; line-height: 1.5; }
  .preview { font-size: 11.5px; color: #C8C8CE; background: #141420; border: 1px solid #2a2a36; border-radius: 5px; padding: 6px 8px; line-height: 1.6; font-family: ui-monospace, Menlo, monospace; white-space: pre; overflow-x: auto; }
  .seeds { display: flex; flex-wrap: wrap; gap: 4px; }
  .seed { background: #1A1A1A; border: 1px solid #333; color: #C8C8CE; font-size: 11px; padding: 2px 7px; border-radius: 4px; cursor: pointer; }
  .seed:hover:not(:disabled) { border-color: #4a4a58; color: #E8E8EE; }
  .seed:disabled { opacity: 0.4; cursor: default; }
</style>
