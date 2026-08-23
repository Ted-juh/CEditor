# Total Recall — hardware that behaves like a plugin

> Status: **design, 2026-08-11.** Tier 1 #2 in
> [`docs/beta-differentiation.md`](../../docs/beta-differentiation.md). Companion to
> [`panel-export-pipeline-plan.md`](panel-export-pipeline-plan.md). Smaller and better-defined than
> the other two Tier-1 items — most of this is finishing things that are already three-quarters
> written.

## The promise

Open a project from six months ago and the hardware comes back with it: right patch, right knob
positions, automation intact, no hunting for which preset slot it was on. This is the single
most-complained-about fact of hardware-in-a-DAW life, and an exported CEditor panel is the natural
place to fix it.

## What already works — more than the completeness review suggested

Worth stating precisely, because the gap is smaller and sharper than "no session recall":

`PluginProcessor::getStateInformation` (`CE/src/Player/PluginProcessor.h:222`) already writes a
`CEDITOR_PLUGIN_STATE` tree carrying **the APVTS state** (every exported parameter's value), **the
device role→port mapping**, **script state** via `onDawSaveState`, and **`ce.storage` panel-scope
settings** — each kept separate so one script cannot overwrite another's keys. `setStateInformation`
restores all four, settings before script state because a script's restore hook may well read one
back, with a backward-compatibility path for APVTS-only state from an older build.

`PanelParameter` (`PanelParameters.h`) carries `deviceRole` and `deviceParameterId`, so the
processor can send MIDI for automation **with the plugin window closed** — the hard part of
window-closed operation is done.

So the session remembers. That is not the gap.

## The gap, in four parts

### 1. Nothing tells the hardware

`setStateInformation` restores the values and reconnects the ports — and then stops. The APVTS holds
the patch; the synth holds whatever it was left on. The state is *known* and *not transmitted*, which
from the user's chair is indistinguishable from not being saved at all.

The fix is a **restore push**: after `setStateInformation` completes and the device session reports
ready, compile and send the restored values through the existing paced transaction path — the same
thing `syncDirection: push` already does. Two constraints make it correct rather than merely
present:

- **It cannot run inside `setStateInformation`.** That call can arrive before ports are open, before
  `prepareToPlay`, and on a thread with no business sending SysEx. Set a pending-restore flag; fire
  it when the device session becomes ready.
- **It must be a stated policy, not a default.** A plugin that blasts SysEx at whatever is plugged in
  whenever a project opens is a bad citizen — the device may be a different synth today, or the same
  synth mid-take. Offer **Ask / Always / Never**, panel-authored with a user override, defaulting to
  Ask on the first restore per device and remembering the answer. "Restore hardware from session?"
  with a device name in it is a one-click question and a good first impression; a silent transmission
  is a support ticket.

### 2. The APVTS is not the patch

`buildParameterLayout` builds one parameter per entry in `exportParameters` — the controls the
author chose to expose to the host. That is the right set for *automation* and the wrong set for
*recall*: a synth patch has hundreds of parameters and a sensible panel exports a few dozen.

So full recall needs the **dump**, not the parameter list. Which is exactly the third stub:

```cpp
// PluginProcessor.h:809
cb.buildDump = [] (const juce::String&) { return juce::var(); };
```

Implemented, `buildDump` lets the processor capture complete device state as bytes, window closed,
and that blob rides along in `CEDITOR_PLUGIN_STATE` beside the APVTS. Restore then has two layers
and should use both: **send the dump** (the whole patch, exactly), then **apply the APVTS** (the
automation-visible values, which the host may have moved since). Dump first, values second — the
same ordering rule the Setlist already follows when it sends MIDI before values, and for the same
reason: the stored values belong to the patch that is being restored, so the patch has to land
first.

### 3. No host-visible programs

```cpp
int getNumPrograms() override { return 1; }      // :213
void setCurrentProgram (int) override {}         // :215
const juce::String getProgramName (int) override { return {}; }
```

The preset librarian exists — `stores/presetLibrarian.js` has persisted banks, ROM-write blocking,
recall, and `.syx`/JSON export — but it lives in the editor's web layer and the plugin never sees it.
Bake the selected bank into the exported panel document, and the three overrides become a thin
adapter over it: `getNumPrograms` returns the bank size, `getProgramName` returns the stored slot
name, and `setCurrentProgram` recalls the slot and sends it. That gives the DAW a program menu, a
host-automatable program change, and a `.vstpreset` story — with essentially no new machinery, just
a bridge between two things that already work.

Note the honest limit: this is a *panel-authored* bank, not a live view of the synth's memory. That
is the right trade for a plugin — the alternative is a scan on every project load — but the UI
should say which it is.

### 4. Parameters read as anonymous floats

```cpp
// PanelParameters.h — every entry:
layout.add (std::make_unique<juce::AudioParameterFloat> (…));
```

The JS side already carries `choiceMode` / `choiceValues`, so the information is present and thrown
away at the boundary. A combobox that shows `0.4700` in the automation lane instead of `Saw`, and a
toggle that reads `1.0000` instead of `On`, make a competent export look like a debug build. Emit
`AudioParameterChoice` where choices exist and `AudioParameterBool` for two-state parameters,
keeping `AudioParameterFloat` for continuous ones.

Two cautions, both of which bite later if ignored: parameter **type changes break saved automation**
in some hosts, so this wants doing before the format is in the wild rather than after — which is an
argument for the beta, not against it. And `PanelParameter` is parsed from the baked
`exportParameters` list, so carrying `choiceMode`/`choiceValues` across means touching
`collectExportParameters` on the JS side too; the single-source-of-truth pattern is worth keeping.

## Stages

**S1 — Typed parameters.** ✅ **Done, 2026-08-23.** Every derived parameter now carries an explicit
`valueKind` (`float` / `bool` / `choice`) and `choiceLabels` ride on every selector, not only the
store-by-name ones; `PanelParameters.h` branches on it into `AudioParameterChoice` /
`AudioParameterBool` / `AudioParameterFloat`. The explicit kind was unavoidable: a toggle and a plain
0..1 knob have identical ranges, so nothing could be inferred. The two shipped hardware panels gained
32 (GAIA) and 58 (AN1x) named menus that had been anonymous numbers. Migration holds — a panel baked
before the field reads as `float`, which is exactly what it had — and `PanelParametersTests` asserts
the concrete `juce::AudioParameter*` class the layout produces, not just that a string parsed.

**S2 — Restore push.** ✅ **Done, 2026-08-23.** `setStateInformation` arms a pending flag and sends
nothing — that call can arrive before the ports are open, before `prepareToPlay`, and on a thread
with no business emitting SysEx. The message-thread timer then asks `ce::decideRestore` on every
tick until the question is settled.

The rules live in their own header (`CE/src/Player/RestorePolicy.h`) as a pure function, because
they are all ordering and timing and `PluginProcessor.h` needs WebView2 and does not build off
Windows. `RestorePolicyTests` drives every ordering this section warns about on any machine —
including the two that are easy to get backwards: a remembered *never* outranks a panel that says
*always* (the author states a default, the person at the desk states a decision about the hardware
actually plugged in), and an unanswered question is **not** timed out, because a restore waiting on
a person is not a stalled one and dropping it would silently lose the patch.

Ask/Always/Never is authored in the Export tab (`exportSettings.restoreHardware`) and defaults to
Ask, which is also what a panel exported before the key existed reads as — strictly more than the
nothing it used to do. The answer is saved with the project rather than globally: the decision was
made about this session's patch and this session's synth.

The question is a bar in the Player, not a modal — the panel behind it is what the question is
about, and a modal over a plugin window in a DAW is a good way to lose a take. "Not now" sends
nothing and leaves the restore pending, so it is offered again next time.

Every path that does not push logs why. A restore that silently did not happen is the failure this
whole feature exists to prevent.

**S3 — `buildDump`.** Full-patch capture into session state; restore sends dump then values.
*Codec done, 2026-08-23* on both sides — C++ (`DeviceProfileEngine::buildDumpMessage`) and the
editor preview (`localBuildDumpMessage`, declared layouts). What S3 still wants is the session-state
half. Previously: the codec exists — `DeviceProfileEngine::buildDumpMessage`, round-trip
tested against the GAIA profile, and wired to `ce.device.buildDump` in the Player. What S3 still
wants is the session-state half: capturing the built dump into `getStateInformation` and sending it
before the values on restore.

**S4 — Programs.** Bake the librarian bank into the export; wire the three overrides.

S1, S2 and S3 are done: a reopened project puts the whole patch back on the synth, not just the
automation-visible slice of it. **S4 is what is left** — host-visible programs off the preset
librarian.

What has NOT happened is a test against hardware. Everything here is reasoned from the profile and
driven by unit tests; no restore in this build has reached a synth.

## Verification

The failure modes here are all timing and ordering, so test those rather than the happy path:

- **Save → reload → assert transmission.** A mock MIDI destination captures what the plugin sends on
  restore; assert the compiled bytes match the stored patch, and that ordering is dump-then-values.
- **Restore before ports exist.** Deliver `setStateInformation` with no device session and assert the
  push is deferred, not dropped and not sent to nothing.
- **Restore with the policy set to Never** — assert absolute silence on the wire.
- **Backward compatibility.** An APVTS-only state blob from an older build must still load; there is
  already a path for it and it must survive every change here.
- **Typed-parameter round trip.** A choice parameter saved and restored lands on the same choice,
  including at the ends of the range where float↔index rounding is worst.
- **Window-closed automation** with typed parameters — the existing path, re-asserted, because that
  is the one this change could quietly break.

## Open questions

- Should the stored dump be **per-device-role**? A panel driving two synths has two patches, and one
  blob will not do.
- What happens when the restored dump's profile no longer matches the connected device — different
  synth, different firmware? The identity-mismatch machinery and the override flow already exist in
  the Device tab; restore should reuse them rather than invent a second answer.
- Does `getNumPrograms` reporting a bank size upset hosts that cache program counts across sessions
  when the panel's bank later changes size?
- Should **Ask** be per-project or per-device? Per-device is fewer prompts; per-project is more
  predictable. Probably per-device with a project-level override, but this wants a real user rather
  than a guess.
