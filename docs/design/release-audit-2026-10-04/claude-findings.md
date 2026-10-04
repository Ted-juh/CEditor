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
Also: on Windows JUCE returns a stream for a 4xx reply and `ValueTreeBridgeHandlers.cpp:782-788` tests only
`body.isEmpty()`, so a 404 (no full release) or a 403 rate limit is reported as the same naming error, not as a
service error. Related: About → "Open the release page" is a `target="_blank"` link (`AboutOverlay.svelte:53`) and
`WebViewHost.cpp` does not override `newWindowAttemptingToLoad`, so the link opens nothing; and "Check for Updates on
Startup" only writes to the About overlay and the Console (`stores/updateChannel.js:35-53`) — no notice is raised,
although the release notes and that file's own header say it tells you.
**Evidence level.** observed-in-test — the live `releases/latest` reply and GitHub's 404/403 bodies fed to the app's
own `readLatestRelease`/`updateCheckSummary`; the 4xx and new-window paths read in vendored JUCE.

### C-08 — A shared panel's JavaScript can read and write any file on the machine through the app's native bridge   (S1 · security · scripting / sharing)

**Repro.** A `.cepanel` or `.cepanelpkg` whose JS script contains, at top level,
`window.__JUCE__.backend.emitEvent('savePanel', { panelId:'0', filePath:'<Startup folder>/x.bat', data:'…' })`.
File → Open Shared Panel… (or Open Panel), then press **Preview** — or export it / load it in the Player, which run
`onPanelLoad`/`onPanelBuild` unconditionally.
**Observed.** The script's top-level code runs and the bridge event fires with the attacker's path and contents.
The native `savePanel` handler writes any path (`writeTextAtomically(juce::File(filePath), …)`); `requestFileData`
reads any path and returns it base64 to the page; `buildVst3`, `provisionToolchains`, `installScriptModule` run
processes and write files.
**Expected.** `docs/design/panel-api-spec.md:262` and `scripting-redesign-plan.md:142` promise "scripts see only the
panel API — no filesystem/network/OS". Shared panels are the release's advertised way to pass work around.
**Where.** `CE/web/src/CE_Application/scripting/panelRuntime.js:7296-7305` (`runJsSource` →
`new Function(...Object.keys(api), body)`: the API is passed in, but the function body still runs in the page's global
scope; also `:7173-7177` for installed modules). Sinks: `CE/src/ValueTreeBridgeHandlers.cpp:556-581` (savePanel),
`:990-1072` (requestFileData). No trust prompt and no script stripping on `panelSharingActions.js` `openPackageText`.
Python (Pyodide's `import js`) very likely has the same reach — not demonstrated.
**Evidence level.** observed-in-test (node test with a stub backend: the crafted script emitted the `savePanel` call);
Claude confirmed the executor and the unrestricted native handler by reading them.

### C-09 — Save As, then one Undo, silently points the tab back at the ORIGINAL file; the next Save overwrites it   (S1 · data loss · save / undo)

**Repro.** Open `master.cepanel`, edit, File → Save As → `variant.cepanel`, press Ctrl+Z once, press Ctrl+S.
**Observed.** After Save As: `{ filePath: '/docs/B.cepanel', name: 'B', modified: false }`. After one undo:
`{ filePath: '/docs/A.cepanel', name: 'Original', modified: true }` — the tab label flips back too. Ctrl+S then
writes the variant's content over `master.cepanel`.
**Expected.** A file's path and name are document identity, not undoable content.
**Where.** `CE/web/src/CE_Application/stores/history.js:319` — `snapshotOf` excludes only
`id, modified, bgImage, bgTexture, viewer`, so `filePath` and `name` are captured; `history.js:572-582` spreads the
snapshot over the live panel; `stores/panels.js:1091-1097` saves to `panel.filePath`.
**Evidence level.** observed-in-test (real stores: `addPanel` → edit → `applyPanelSavedPayload` → `undo()`); Claude
confirmed the destructuring at `history.js:319`.

### C-10 — The × on a Screen (CTRL49) tab does nothing   (S3 · bug · tabs)

**Repro.** Welcome → New Screen (CTRL49); click the tab's × (or right-click → Close / Close Others, or middle-click).
**Observed.** The tab stays. Ctrl+W does close it — without the unsaved-changes prompt every other document gets — and a
screen document has no save path at all (the editor shows its assignment JSON read-only), so its "modified" dot can
never clear.
**Where.** `CE/web/src/CE_Application/editor/TabBar.svelte:288-307` (no `screen` branch; the `else` calls
`closePanel(id)`, a no-op for a `ctrl_screen_…` id); `stores/screenBuilder.js:102-105` (no confirm on Ctrl+W).
**Evidence level.** observed-in-test (store test) + read-in-code.

### C-11 — "Send saved sound" overwrites every dump parameter the panel does not export with 0 — including the synth's System block   (S1 · faulty · Total Recall)

**Repro.** A panel bound (default role `mainSynth`) to a profile with `dumpDefinitions` — e.g. `roland-gaia-sh01`,
26 dumps. Export, save a DAW project, reopen, press **Send saved sound** (or policy `restoreHardware: always`).
**Observed.** Every declared dump is built from the APVTS values alone; parameters with no value get
`payload.defaultByte` (0). GAIA: `system` 89 of 89 unmapped →
`F0 41 10 00 00 41 12 01 00 00 00 00 00 00 …` (Master Tune, Clock Source, Rx/Tx channel, Rx Program Change … all
raw 0); all 16 arpeggio patterns zeroed; 694 parameters written as 0 across the 26 dumps — sent *before* the values.
**Expected.** RELEASE-NOTES: a reopened project "puts the whole saved patch back on the synth". `PluginProcessor.h:1002`
"The dump is the patch". A dump the panel binds nothing in should not be sent at all, and unbound bytes should come
from a captured device dump, not from zero.
**Where.** `CE/src/Player/PluginProcessor.h:1031-1053` (`refreshCapturedDumps`: builds every `dumpDefinitionIds()`,
keeps any `result.ok`, even 100 % unmapped), `:1062-1091` (sends them first);
`CE/src/DeviceProfile/DeviceProfileEngine.cpp:1205-1223` (fills with `defaultByte`, unmapped is "reported, not
refused"). Masked today for the shipped panels by C-12 — it bites exactly the user who follows the release notes'
"bind a panel to a device".
**Evidence level.** observed-in-test with the editor's JS copy of the builder over the shipped GAIA profile; Claude
read the C++ (`refreshCapturedDumps` and the fill loop) and it applies the same rule.

### C-12 — The plug-in looks up dumps, program recall and `ce.device.buildDump` under a hard-coded `mainSynth` role: Total Recall and the Programs menu do nothing for the shipped panels   (S2 · bug · Player)

**Repro.** Export `Roland GAIA SH-01.cepanel` (role "Roland GAIA SH-01"), `Yamaha AN1x.cepanel` ("Yamaha AN1x") or any
New Panel from Device Profile panel (role `primary`, `autoPanel.js:78`).
**Observed.** `deviceService.engineForRole({})` resolves to `mainSynth`, which in the plug-in is the constructor
default `test-cc-synth` (`DeviceProfileService.cpp:11-19`): 0 dumps, no presets. So no dump is ever stored ("pushed
0 dump(s)"), a baked program bank shows names in the DAW but recalling one fails "Profile has no preset model", and
`ce.device.buildDump` fails. GAIA's export parameters use its role 188×, AN1x's 397×; neither uses `mainSynth`.
**Where.** `CE/src/Player/PluginProcessor.h:883, 1032, 1067, 1751` (`engineForRole({})`); the Player web side was
already moved to the panel's own role (`Player.svelte:47-49, 420-450`), the processor was not.
**Evidence level.** read-in-code; roles and profile contents measured.

### C-13 — An exported plug-in cannot find a device profile the user imported; its device-bound controls send nothing   (S2 · bug · export)

**Repro.** File → Import Device Profile… (from Documents), bind a panel to it, export, load the plug-in.
**Observed.** The template exporter copies only `<install>/CE/profiles/test` into the bundle
(`export-panel-template.mjs:304-307`); the plug-in loads profiles only from `<module>/CE/profiles/test`
(`DeviceProfileService.cpp:600-619`); nothing embeds the panel's own profile. Every message compile fails "No device
profile mapped for role". Only the nine shipped profiles work in an export.
**Expected.** RELEASE-NOTES: "Bind a panel to a device … and export the result as a plugin."
**Evidence level.** read-in-code (whole lookup chain traced). Related: imported profiles are not re-listed after a
restart (only that folder is scanned), and editing a shipped profile under Program Files writes to its own file —
very likely refused without elevation. **Codex: worth checking on the installed build.**

### C-14 — Renaming the panel, its file, plug-in name or vendor changes the CLAP id and LV2 URI: saved CLAP/LV2 sessions lose the plug-in   (S2 · faulty · export identity)

**Repro.** Open the same GAIA document saved under two file names and export.
**Observed.** VST3 id `OLLs` both times; CLAP `com.tedjuh.roland-gaia-sh-01.69eedf81` vs
`com.tedjuh.gaia-live-rig.69eedf81`; LV2 URI likewise. "Update this plugin" does not keep them either.
**Expected.** `panel-export-pipeline-plan.md:24` "Re-exporting the same panel → the same identity";
`PanelExportIdentity.h` "same GUID → identical identity".
**Where.** `CE/src/Export/PanelExportIdentity.h:107-110` (id = `com.<vendorSlug>.<nameSlug>.<hash>`) and its JS copy
`utils/exportIdentity.js`; `Lv2SidecarIdentity.h:51`.
**Evidence level.** observed-in-test.

### C-15 — Hostage in the editor is locked to the Free edition — one plug-in at a time — and no licence can unlock it   (S2 · faulty · licensing — needs an owner decision)

**Repro.** File → Hostage…, load an instrument, then load a second on another part; or use scenes/setlists,
patterns/clips, return buses, script actions. Edition tab → Install a licence…, paste any licence.
**Observed.** Second instrument: "The Free edition loads one plug-in at a time…". Others: "… are part of Pro. You are on
Free…". Every licence: "This build carries no licence key, so nothing can be verified." The same Edition page lists
"Basic splits, layers and multis" under "None of these is ever withheld" beside "More than one plug-in at a time ·
1 of 1 loaded".
**Expected.** `docs/licence-and-sunset-policy.md` calls the edition ladder "a plan, not an offer" (no JUCE commercial
licence yet) and promises a published sunset key "licenses every edition on every machine" — impossible without a
public key. RELEASE-NOTES does not mention Hostage or any limit.
**Where.** `InstrumentHostService.cpp:19873-19879` reads `hostProject.licencePublicKey`, which nothing outside
`CE/tests` writes (Claude grepped `CE/src`, `CE/web/src`, `tools`); `Licence.cpp:151-157`;
`Entitlements.cpp:39-49` (`maxLoadedParts = 1` for Free); refusal at `InstrumentHostService.cpp:8448-8459`.
**Evidence level.** read-in-code; Claude confirmed the missing writer and the Free cap. **Codex: please observe this on
Windows (W5), where a second instrument can actually be loaded.**

### C-16 — Old panels show LV2 on in the Export tab; the installed exporter silently builds no LV2   (S3 · faulty · export)

**Repro.** A panel whose `exportSettings` lacks `exportClap`/`exportLv2` (saved by an intermediate build, or
hand-made); Build → Export Plugin from the installed app.
**Observed.** Export tab note `.vst3 + .clap + .lv2`, compiling exporter builds all three, installed exporter builds
`vst3 + clap` with no warning.
**Where.** `export-panel-template.mjs:193-196` (`=== true`) vs `PanelCardContent.svelte:214-220` and
`export-panel-vst3.mjs:390` (`!== false`); `panelModel.js:456-457` does not backfill keys inside `exportSettings`.
`known-issues.md:259-261` describes the compiling exporter's reading backwards.
**Evidence level.** observed-in-test.

### C-17 — The Export tab tells installed users CLAP and LV2 need a source checkout, and that output goes to `export-out/`   (S3 · faulty · export UI)

**Observed.** CLAP and LV2 hints: "Requires export from a source checkout with a C++ build environment"; section note:
"Additional formats … require the compiling exporter"; Output hint: "into export-out/" — the installed app writes
Documents\CEditor\Exports; the CLAP hint says "next to the .vst3", the template writes `<Name>/<Name>.clap`.
**Expected.** RELEASE-NOTES: "VST3, CLAP and LV2 … without Visual Studio or a source checkout, into Documents →
CEditor → Exports"; the installer stages all three templates (`package-installer.ps1:191-242`).
**Where.** `CE/web/src/CE_Application/panels/PanelCardContent.svelte:805, 1093-1107`.
**Evidence level.** read-in-code.

### C-18 — A failed compiler-free export destroys the previous working export   (S3 · faulty · export)

**Observed.** With every format on, a second export whose LV2 helper exits 3 fails "LV2 manifests could not be written"
after the VST3 and CLAP folders were already replaced; the old LV2 is left as a bundle with no `.ttl` (hosts ignore
it), and a raw Node stack line lands in the build log.
**Expected.** The compiling exporter stages and swaps on success (`export-panel-vst3.mjs:442-517`); known-issues says an
export "fails explicitly before replacing an export".
**Where.** `tools/scripts/export-panel-template.mjs:244-318` (`rmSync` then copy, per format, no staging).
**Evidence level.** observed-in-test (simulated install tree, fake templates).

### C-19 — A panel with no `panelGuid` gets a new random GUID on every open; a re-export silently makes a different plug-in   (S3 · bug · export identity)

**Observed.** The AN1x document without `panelGuid`, opened twice: `48796eac…` (code `Cpmq`) then `e441f522…` (`Y8ly`),
both `modified: false`; the export registry says "adopt", the next export overwrites `Exports/<Name>.vst3` with a new
FUID and old DAW projects lose it.
**Where.** `stores/panelModel.js:455-476` (`{...createPanel(), ...data}` mints a GUID) makes the "mint and persist"
branch in `panels.js:1193-1197` unreachable.
**Evidence level.** observed-in-test.

### C-20 — Two different panels with the same plug-in name overwrite each other's export without a word   (S3 · faulty · export)

**Observed.** Two documents, different GUIDs, both "Yamaha AN1x" → both report `Exports/Yamaha AN1x.vst3`; one bundle
survives, carrying the second GUID.
**Where.** `export-panel-template.mjs:252-256`; `ValueTreeBridgeHandlers.cpp:1601-1606`. The registry checks GUID
collisions only.
**Evidence level.** observed-in-test.

### C-21 — Exports from a source checkout read their panel from an absolute path in `export-out/`   (S3 · faulty · compiling exporter)

**Observed.** `CE_VST_PANEL_PATH` bakes the absolute `export-out/<productName>.cepanel` into the binary and the panel is
not copied into the bundle: moved to another machine the plug-in loads no panel (0 parameters); a same-named re-export
rewrites what the earlier plug-in reads; the CLAP is a bare file, not the folder the release notes describe; a `/` or
`:` in the product name fails.
**Where.** `export-panel-vst3.mjs:327-331, 408, 488-490`; `CMakeLists.txt:523-524`; `PluginProcessor.h:30-37`.
**Evidence level.** read-in-code. Developer path, but it is the path `CLAUDE.md` and the docs show first.

### C-22 — Neither the installer nor the app ships the AGPL text or says where the source is   (S3 · faulty · licensing)

**Observed.** `tools/installer/CEditor.iss` has no `LicenseFile` and does not install `LICENSE`; `CMakeLists.txt`
install rules (1958-1980) install no licence; About summarises the AGPL with no text and no repository URL; exported
plug-in folders carry no licence file.
**Expected.** AGPLv3 §4/§6: the licence accompanies the program, and object code comes with directions to the
Corresponding Source — the app's own notice tells exporters to do exactly this.
**Evidence level.** read-in-code.

### C-23 — On a fresh install the default device, and File → Open Device Profile, are a test fixture ("Test CC Synth")   (S3 · faulty · first run)

**Observed.** `selectedDeviceProfileId` and the `mainSynth` mapping default to `test-cc-synth`; Open Device Profile
opens it with no chooser. New Panel from Device Profile lists Test CC/NRPN/SysEx Synth and three GAIA SH-01 variants
(15, 882 and 40 parameters) side by side.
**Where.** `stores/deviceProfileStores.js:32, 39`; `stores/appSettingsSchema.js:231`;
`stores/deviceProfileSession.js:266`; `layout/MenuBar.svelte:107-117`; `DeviceProfileService.cpp:600-615`.
**Evidence level.** read-in-code (to be observed in the Linux app run).

### C-24 — Release notes, README and user docs quote numbers and formats the product no longer matches   (S4 · docs)

- "50 component types", "24 export … 26 decline" (RELEASE-NOTES, known-issues CLOSED): the code has **58** registered,
  56 insertable (Claude counted 56 in the Insert menu), **28 export / 30 decline**.
- "793 parameters become 1624 controls in a second": `roland-gaia-sh01` now gives **882 → 1804**, ~2.7 s in node.
- "C# and Java … ~230 MB and ~195 MB": the manifest totals **409 MB** and **379 MB** (Settings shows these correctly).
- README: panels "export as a VST3, CLAP, LV2 or standalone application"; `clap-export.md` "(and the standalone)" —
  RELEASE-NOTES: the standalone is not a per-panel export option.
- `clap-export.md`: LV2 "builds by default too" — new panels are VST3 only; a Python `.clap` "runs window-open only"
  — `exportValidation.mjs:24-33` refuses that combination.
- `scripting-language-options-and-shippable-export.md` §1: "The installed app cannot export".
- The regenerated VST3 `moduleinfo.json` is always version 1.0.0 (`export-panel-template.mjs:110`), whatever the
  panel's version.
- `release-checklist-2026-09-14.md` says "none hold stale evidence", but A6/D1/D2/D4 quote 14 Sep (`43d50bc4`) and the
  tree has since gained the CLAP/LV2 template export and the animation overhaul — by its own legend they are STALE.
- Checklist E still open: no `Recorder.snapToScale` line in RELEASE-NOTES; the six unreachable fields are still declared.
**Evidence level.** counts demonstrated with the real `classifyType`, `autoPanelPlan` and catalogues; the rest read.

## Verification of the other's findings
