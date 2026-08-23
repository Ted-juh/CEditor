# Shared Musical Context (Key / Scale) — Capability Design

> Status: **design / capability.** A panel-level key + scale that note-aware
> components read, so they stay in key together. Part of the
> [panel parts backlog](./README.md).

## Why

Note-producing/aware components each need a key/scale; without a shared one they
drift out of sync. A **panel musical context** lets the **chord generator**
(diatonic chords), **pad grid** (scale-locked melodic layout), **keyboard**
(highlight/snap), and **arpeggiator** all stay in key — and **re-harmonize
together** when the key changes. This was flagged as the novel systemic piece of
the [chord generator](./chord-generator.md).

## What — the model

A panel-level **MusicalContext**: `{ root (0–11 / note name), scale/mode (major,
minor, dorian, …, or custom intervals), octave? }`. Components read it; any may
**override locally** (e.g. a chromatic mode that ignores it).

## How

- A panel-level store `stores/musicalContext.js` (or a section on the panel root)
  holding `{ root, scale }`.
- A **scale library** (interval sets) + helpers: `isInScale(note)`,
  `quantizeToScale(note)`, `diatonicChord(degree)`, `scaleDegrees(root, scale)`.
- Consumers subscribe: chord gen builds diatonic chords; pad grid generates a
  scale-locked layout; keyboard highlights/snaps; note output can be
  **scale-quantized**.
- The key/scale can be **bound/driven** — a "Key selector" combobox (or a device
  value) sets the context, re-harmonizing the panel live.

## Where (integration)

- Panel-level store/section (shared state).
- A **Key/Scale selector** can be a component (combobox bound to the context) —
  but the context itself is the shared state, not that widget.
- **Consumers:** chord generator · pad grid (melodic) · keyboard · arpeggiator ·
  a scale-quantize behavior on any note output.

## When / semantics

- Use for any in-key playing surface; change key → all consumers re-map.
- **Local override** for chromatic/per-component independence.

## Open questions / future

- Where it lives (panel-root section vs dedicated store).
- Custom scales; multiple contexts (per-zone); binding the key to a control/device.
- Microtonal / non-12-TET (future).

---

## Built, 2026-08-23

`utils/musicalContext.js`, pinned by `test/musicalCapabilities.test.js`.

Fourteen scales, roots by number or note name (flats included — a user types Eb and no sharp table
carries it), `isInScale`, `quantizeToScale`, `scaleDegrees` and `diatonicChord`.

**Chords are built by stacking scale degrees, not fixed semitone intervals.** That is what makes
them diatonic: degree ii of a major scale comes out minor and vii diminished without either being
written down anywhere, and changing the scale changes the qualities with it — which is the whole
point of a *shared* context rather than a per-component one.

**Ties go down, consistently.** A note exactly between two scale tones has to go somewhere. The same
choice every time is a musical decision a player can learn; one that depends on which way they
approached it is a bug they cannot.

**Twelve-tone, and the file says so.** Microtonal and non-12-TET are real and are not here. Leaving
that implicit is how a future 24-TET attempt would find the assumption everywhere at once.
