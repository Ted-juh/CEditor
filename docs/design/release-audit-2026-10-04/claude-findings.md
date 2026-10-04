# Claude's findings — release audit 2026-10-04

Tree: `main` @ `f37550c`. Environment: Linux container (Ubuntu 24.04, GCC 13,
Node 22, Chromium via Playwright, WebKitGTK under Xvfb). Protocol and severity scale: `README.md`.

_In progress — findings are appended as they are confirmed._

## Findings

### C-01 — With external MIDI clock on, every sequencer/arp step fires 3–4 times and swung steps never play   (S2 · bug · Hostage transport)

**Repro.** Hostage → EXT clock on; feed MIDI clock at 120 bpm (an 0xF8 every 1000 samples at 48 kHz) with 256-sample
blocks; launch a 16-step 1/16 clip, or hold a chord on a 1/16 arp.
**Observed.** Over 4 s (8 beats, position correctly 8 ppq): 124 note-ons where 32 are due; with pattern swing 0.5, 62
note-ons — every even step four times, every odd step never. Arp: 60 note-ons where 32 are due.
**Expected.** One note per step on the master's grid (`Transport.h`: the position "follows the tick count rather than
free-running").
**Where.** `CE/src/Performance/Transport.h:313-322` — in external mode a block's window is
`[positionPpq, positionPpq + ppqPerSample·n)` but `positionPpq` only moves in `handleExternalClockTick` (`:366`), so
every block between two ticks renders the same window again; where windows leave gaps, events never render.
`PerformanceEngine::renderPatternWindow` and `ArpEngine::process` both consume that window. `testExternalClock`
asserts only the position, never the notes.
**Evidence level.** observed-in-test — a harness linking the repo's `PatternModel/PatternCompiler/PerformanceEngine`
sources with JUCE, driven by a tick stream (Claude verified the window arithmetic by reading `Transport.h`).

### C-02 — A clip launched while stopped waits for the old playhead after ▶; a running clip goes silent after Stop → ▶   (S2 · bug · Hostage clips)

**Repro.** (a) Play ~5 bars, Stop (playhead 21.3 ppq), click a bar-quantised clip, press ▶. (b) A clip launched at
bar 3 is running; Stop; ▶.
**Observed.** (a) The clip shows "pending" for ~10 s and starts at ppq 21.30 — not on a bar line. (b) Silent for
7.9 quarter notes after ▶, until the playhead reaches the clip's old start. A "stop others" scene pressed while stopped
behaves the same.
**Expected.** `Transport.h`: "Start rewinds … a player pressing start expects the top of the pattern" — a launch
queued while stopped lands on the first quantise boundary of the new run.
**Where.** `PerformanceEngine.cpp:350` (boundary while stopped is the raw `positionPpq`); `Transport.h:284`
(`start()` rewinds without setting `jumped` or resetting clip state); `PerformanceEngine.cpp:549` (a clip renders
nothing while `block.startPpq < state.startPpq`). `BlockTime::justStarted` is computed and read by nothing.
**Evidence level.** observed-in-test (same harness, real `PerformanceEngine` + `compileSong`).

### C-03 — Turning on / adding / un-bypassing a MIDI module while a key is held swallows that key's note-off: hung note   (S2 · bug · MIDI insert chain)

**Repro.** Hold a key; then un-bypass (or add) a Key, Chords, Velocity or Note-shaping module — or switch the Arp on,
switch Latch on, set Note length above 0, or in legato mode release the last note and turn legato off. Release the key.
**Observed.** Bypassed Key(+12), C4 held, module enabled, key released → 0 events out (C3 never released). Arp switched
on over a held C-E-G → 60/64/67 each left with one unmatched note-on. Latch switched on over held C4 → C4 never
released, not even by the next phrase. The instrument holds the note until Panic.
**Expected.** The code's own rule — "a note-off must reach the note that is sounding" (`MidiFxChain.h`,
`MidiInsertRack.h`); `docs/design/modular-chain.md`: "a rebuilt chain never hangs a note".
**Where.** Each module decides a note-off's fate from its *current* settings, not from what it did at note-on:
`MidiFxChain.h:355`, `ArpEngine.h:121`, `NoteModules.h:1350` (Latch), `NoteModules.h:1226` and `:1186` (Length).
`MidiInsertRack::setSlots` flushes held notes only on enabled → bypassed, never on un-bypass or insert.
**Evidence level.** observed-in-test (through `MidiInsertRack::setSlots`/`process`, the calls `PartMidiFilterProcessor`
makes).

### C-04 — Bypassing/removing a module upstream of an arp while a key is held leaves the arp running forever   (S2 · bug · MIDI insert chain)

**Repro.** Chain Key(+12) → Arp(on). Hold C4, bypass Key, release C4.
**Observed.** 16 arp note-ons in the 2 s after every key is up; it never stops.
**Where.** `MidiInsertRack.cpp:307-313` — the bypassed module's release (note-off 72) is queued in `pendingFlush` and
appended after every module has run, so the arp never sees it and keeps 72 held; the user's note-off 60 matches
nothing in the arp. Removing or retyping the upstream module does the same.
**Evidence level.** observed-in-test.

### C-05 — Arp and Echo/Strum/Humanize/Length notes ring on after a rewind, and forever inside a DAW loop   (S2 · bug · arp / note modules)

**Repro.** (a) 1/16 arp at 100 % gate on a held chord; press ▶ again (rewind) and release. (b) Hostage as a plug-in,
DAW looping one bar; an Echo (3 repeats, ½ beat, +2) gets a note at beat 4.25 each pass.
**Observed.** (a) The last note-off arrives 5.37 s after the keys are released. (b) After 60 loop passes note 74 has
60 note-ons and no note-offs — the echo's release is scheduled past the loop end the playhead never reaches.
**Expected.** `PerformanceEngine.h`: "jumping the playhead … flush through the same path"; no orphan notes.
**Where.** `ArpEngine.h:525` (`releaseDue`), `NoteModules.h` (`ModuleClock::advance`, `PendingEvents::flushDue`)
schedule releases at absolute transport positions; only `PerformanceEngine` reads `Transport::consumeJumped()`, and
`BlockTime` carries no jump flag. Affects ▶ rewind, locate, DAW loop/locate, MIDI Start.
**Evidence level.** observed-in-test (`ArpEngine` driven by `Transport`; `NoteEchoEngine` by
`Transport::applyHostPosition` simulating a DAW loop).

### C-06 — Changing a hardware part's MIDI channel or output while notes sound strands them on the old destination   (S3 · bug · Hostage hardware parts)

**Repro.** While a hardware part sounds (held key, running clip, latched arp), change its MIDI channel or output.
**Observed.** Later note-offs go to the new channel/port; nothing sends note-offs or all-notes-off to the old one.
**Expected.** `PartMidiFilterCore.h`: "a note-off must reach the same destination that received the matching note-on,
even when the rules changed in between".
**Where.** `RackProcessors.h:315` (`MidiSendProcessor::processBlock` rewrites every channel message to the current
`outChannel`); `InstrumentRackHost.cpp:2116` (`syncAuxNodes` applies at once); `InstrumentHostService.cpp`
`setHardwareConfig` → `openHardwareMidi` swaps the output without a panic on the old one.
**Evidence level.** read-in-code. **Codex: this one is worth a real-port check on Windows (W6).**

### C-07 — Help → Check for Updates answers with an error for every user today   (S3 · faulty · release process)

**Repro.** Help → Check for Updates (or the startup check, if enabled).
**Observed.** GitHub's `releases/latest` for Ted-juh/CEditor is tag `Alpha0.04`, name "CEditor alpha 0.04"
(2026-05-01, not a pre-release). `parseVersion` accepts neither, so `readLatestRelease` returns "The newest release is
not named with a version number ("Alpha0.04")."
**Expected.** "You are up to date" on 0.2.0.
**Where.** `CE/src/UpdateCheck.h:120-129` — the code is right; the published release is not. **Publishing 0.2.0 as a
GitHub pre-release will not fix it**: `releases/latest` skips pre-releases and keeps returning `Alpha0.04`. Publish
`v0.2.0` as a full release, or retag/delete `Alpha0.04`.
**Evidence level.** read-in-code + the live GitHub API reply. (To be observed in the running Linux app.)

## Verification of the other's findings
