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
On the AN1x it is worse: `$slot` defaults to 0, so the restore's `userVoice` bulk (`F0 43 00 5C 0F 16 11 00 00 …`)
writes User Voice 001 memory and `userPattern` (`F0 43 00 5C 00 46 01 00 00 …`) User Pattern 1 — stored patches
destroyed. GAIA system block at zero also means Master Level 0 (silent synth), Master Tune and Tempo 0 (below their
ranges), D-Beam sensitivity 0.
**Evidence level.** observed-in-test, **found independently by two reviewers**: one through the editor's JS copy of the
builder, one through a line-by-line port of `refreshCapturedDumps → buildDumpMessage → validateAndEncodeValue`, both over
the shipped GAIA and AN1x panels and profiles. Claude read the C++ (`refreshCapturedDumps` and the fill loop).

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

### C-25 — AN1x profile: Scene 2 and Free-EG tracks 2–4 in every dump read and write the Scene 1 / track 1 parameters   (S1 · bug · device profiles / DPD emitter)

**Repro.** Parse an AN1x Scene 2 bulk dump with Poly Mode = Legato; build a Scene 2 dump with Scene 1 poly, Scene 2 mono.
**Observed.** The Scene 2 dump sets `scPolyMode` (Scene 1, address 10 10 00) and leaves `scene2.scPolyMode` undefined;
the built Scene 2 payload carries Scene 1's value. Claude's own count over
`CE/profiles/test/yamaha-an1x-dpd.ceditor-device.json`: the `scene2` dump has 111 mappings and **zero** `scene2.*`
ids although the profile defines 111 of them; `voiceCommon` maps 840 entries onto 264 distinct ids (192 mapped four
times — FEG tracks 2–4 land on track 1); `userVoice` 364 onto 253. So reading Scene 2 moves Scene 1's controls,
after reading voiceCommon track 1 shows track 4's curve, and every built dump (Total Recall, `ce.device.sendDump`,
librarian sends) writes Scene 1 values into Scene 2.
**Where.** `CE/dpd/emit-legacy-core.mjs:88` — dump mappings use `flat(p.resolvedId)`, stripping the instance prefix,
while `legacyParam` (`:151`) keeps it for instance > 0. The in-app Designer saves through the same emitter: **every
instanced DPD has this.**
**Evidence level.** observed-in-test, and Claude re-counted the shipped profile. The reviewer's validator also reports
1,121 address/offset mismatches in the AN1x profile (not individually checked).

### C-26 — Exported plug-in sends a choice parameter's menu index as the device's wire value   (S2 · bug · Player)

**Observed** (shipped AN1x panel + profile, JS engine with the C++ rule): `arpSceneSwitch` (wire 1,2,3): "Scene 1"
→ not sent, "Scene 2" → sends scene-1, "Both" → sends scene-2; `cc64-sustain-switch` (0,127): "On" → not sent;
`sysKbdTxChannel`/`sysArpTxChannel`/`sysRxChannel1/2`: "Off"(16) → not sent. Six parameters in the shipped panel,
window-closed automation and the restore push; the same index goes into Total Recall dumps.
**Where.** `PluginProcessor.h:1172-1186`, `:1011-1020` pass the `AudioParameterChoice` index as a number;
`DeviceProfileEngine.cpp:2263` matches a number against each choice's wire `value`, not its position.
**Evidence level.** observed-in-test (JS engine, same rule); C++ read.

### C-27 — Total Recall's "dump first, values after" does not hold: the dump goes out the DAW's MIDI bus, the values straight to the port   (S2 · faulty · Player)

**Observed.** When dumps are captured, `sendRestoredDumps` queues them on the plug-in's MIDI output bus, drained at the
next `processBlock` and routed wherever the DAW sends it; the values go `sendParamMidi →
sendOrQueueTransaction → MidiOutput::sendMessageNow` on the message thread to the port the Player opened. The values
reach the synth first — or the dump never does. (`PluginProcessor.h:1288-1291` claims "the plugin never opens a port
itself"; profile-bound sends do.)
**Where.** `PluginProcessor.h:1102-1121` (`runRestorePush`), `:1301-1340`; `DeviceProfileServiceMidiIO.cpp:341-388`.
**Evidence level.** read-in-code.

### C-28 — GAIA "from DPD" (and any Designer-saved signed parameter): s7 becomes u7 but keeps −63..63 — negatives never send, others arrive 64 low   (S2 · bug · DPD emitter)

**Observed.** Filter Env Depth (tones 1–3) in `roland-gaia-dpd`: −20 → not sent (expect `2C`), 0 → `00` (expect `40`),
+20 → `14` (expect `54`); the default −63 cannot be sent.
**Where.** `CE/dpd/emit-legacy-core.mjs:182-188` (s7 → u7) with `:169-170` copying the signed range unchanged
(Claude read both); the C++ u7 encoder (`DeviceProfileEngine.cpp:2187-2193`) applies no offset.
**Evidence level.** observed-in-test.

### C-29 — `ce.device.setVariable` / `setTiming` report success but the sending engine never sees them   (S2 · bug · scripting / device service)

**Observed.** The JS side stores the override and `ce.device.variables()` reports it; C++ `setDeviceRoleMapping` ignores
`variables` and `timingOverrides` (`DeviceProfileServiceMidiIO.cpp:66-118`, `RoleMapping` has no field for them,
`DeviceProfileService.h:105-118`); recipes resolve `$deviceId`/`$channel` from the profile only
(`DeviceProfileEngine.cpp:1774`). The plug-in's `cb.deviceSet` (`PluginProcessor.h:1815-1855`) is the same. With no
other per-role device-ID/channel UI, a synth on another channel or device ID is reachable only by editing the profile.
**Expected.** `docs/scripting-manual.md` (deviceSetVariable): "point this panel at a different unit".
**Evidence level.** read-in-code.

### C-30 — Profile pacing is ignored: push sync and the restore fire DT1 messages back-to-back   (S3 · faulty · device service)

`delayAfterMs: 20` on the DT1 recipe and `timing.minDelayBetweenMessagesMs: 20` are not honoured for parameter sends:
`compileSysex` never sets `delayAfterMs` (`DeviceProfileEngine.cpp:2488+`; only NRPN `:2430` and requests `:500` read
it), `minDelayBetweenMessagesMs` is read only by bulk jobs (`DeviceProfileServiceJobs.cpp:260-267`), and the rate limit
is per parameter (`DeviceProfileServiceMidiIO.cpp:428-433`). `pushRuntimeStateToDevice`
(`DeviceProfileServiceRequests.cpp:168-190`) and the restore push send every DT1 in one loop. Read-in-code; the
hardware effect is unproven — **a real-device question for the owner.**

### C-31 — Device-request `retries` never happen; one lost reply ends the whole startup sync   (S3 · unfinished · device service)

`processPendingRequestTimeouts` erases a timed-out request and never acts on `retriesRemaining`
(`DeviceProfileServiceRequests.cpp:409-445`); the next request in the chain is sent only after a reply (`:277, :332,
:386`). The GAIA's 27-step pull declares `retries: 1` per step; one dropped reply leaves the panel half-synced.
Read-in-code.

### C-32 — A MIDI-learn chip drops the channel it learned: a CC learned on channel 5 sends on channel 1   (S3 · bug · MIDI learn)

**Observed.** Chip "CC 74 · ch 5" → `binding.channel = 0` → sends `B0 4A 64`; "NRPN 1:32" (ch 5) → `B0 63 01 B0 62 20 …`.
**Where.** `midiLearnChips.js:232-251` (`chipDragPayload` carries no channel); `midiControlBindings.js:269`
(`channel: 0`). Workaround: set the channel by hand in Device Bindings.
**Evidence level.** observed-in-test.

### C-33 — The preview JS engine still builds different bytes from the C++ engine   (S4 · faulty · preview)

SH-201: 34 booleans declare `trueValue: 1` with `boolean-u7` — C++ sends `01`, the JS preview/Designer shows `7F`
(`deviceProfileLocalEngine.js:250`). Out of range: JS clamps (−20 → `00`), C++ refuses. The shipped test fixture
`test-sysex-synth` (in the user's device list) has `mod.depth` 0..255 on a 1-byte u7 and a `currentPatchDump` with no
payload size, so it cannot build. Observed-in-test.

### C-34 — Closing the Hostage plug-in while Library → Listen is measuring crashes the DAW   (S1 · bug · Hostage VST3 — if that product ships)

**Repro.** CEHostVST3: Library → Listen (`analyseLibrary`); while it runs, remove the plug-in or close the project.
**Observed.** `~InstrumentHostService` joins `analysisThread` (`InstrumentHostService.cpp:123-125`); the thread's last
act posts a closure capturing `this` (`:11318-11351` — `library.edit`, `saveLibrary`, `snapshots->sweep`,
`emitLibrary`) through `options.onControlThread`, which in the plug-in is a bare `MessageManager::callAsync`
(`HostPluginProcessor.cpp:209-212`). The DAW's message loop runs it after the service is freed: use-after-free.
**Expected.** The library preset scan already drops its `finish` closure via an `alive` token (`:12316`); this one
does not.
**Evidence level.** read-in-code; Claude confirmed the `this` capture and the unguarded `callAsync`.

### C-35 — A failed preset load leaves the part named and saved as the new plug-in, holding the old plug-in's state   (S1 · bug · Hostage session persistence)

**Repro.** Part has plug-in A; load a library preset of plug-in B (`loadLibraryRecord`, `auditionRecord`,
`walkPartPreset`) and let the load fail (worker crash in construction, 15 s handshake timeout on a licence dialog or a
big sampler, safe mode refusing the module).
**Observed.** `loadPresetRecord` primes B's identity into the part document before the async load
(`InstrumentHostService.cpp:12941`, `InstrumentRackHost.cpp:1291-1303`); the failure path only reports (`:12845`). The
card says B while A plays; the next save or DAW `getStateInformation` writes A's live state into the part whose
`pluginCeId` is B (`InstrumentRackHost.cpp:2388-2403`); on the next start `commitLoad` feeds that blob to B
(`:1735-1740`). The user's A and its tweaks are gone from the session; B gets foreign state.
**Expected.** Identity changes when the load commits, as plain `loadInstrument` does.
**Evidence level.** read-in-code.

### C-36 — The browse audition's phrase arrives as one block of notes: nothing is heard   (S2 · bug · Hostage audition)

**Repro.** Audio running; ▶ in the audition bar, a tile with audition on, or 1–4 in Compare (default phrase "recent",
4 bars).
**Observed.** `playPhrase` queues every note on a `juce::MidiMessageCollector` with future timestamps
(`InstrumentHostService.cpp:11444-11472`); the collector does not schedule — it empties into the next block and drops
anything >1 s older than the newest. Real collector + `RecentPlay`: a single note's on and off land on the same
sample; "your last 4 bars" delivers 5 of 33 messages (the all-notes-off among the dropped). The UI says "Playing your
last 4 bars".
**Expected.** The "Also on load" path's own scheduler (`startPresetAudition`, `:12529-12574`) does this right.
**Evidence level.** observed-in-test (the function body run against the real classes).

### C-37 — Auditioning a preset of a different plug-in plays the phrase on the OLD plug-in, then nothing on the new one   (S2 · bug · Hostage audition)

`auditionRecord` starts B's load asynchronously, then hands off at once because `rack.getInstrument(partId)` still
returns A (`InstrumentHostService.cpp:7058-7062`; the old node goes only in `commitLoad`); when B commits,
`handOffAudition` returns early (`:11498`). Compare (keys 1–4) uses the same call. The test covers only the same-class
case (`InstrumentHostServiceTests.cpp:3517-3521`). Read-in-code.

### C-38 — Picking another preset while a new plug-in is still loading applies it to the old plug-in; the first pick wins   (S2 · bug · Hostage library load)

After B1's prime the part claims B while A is live, so B2 counts as `sameClassLoaded` (`InstrumentHostService.cpp:12891`)
and is applied to A (a vendor `.vstpreset` is refused "The plug-in refused this preset"; a program number selects on A;
a captured state goes into A's `setStateInformation`). B2 is reported loaded; when B commits, B1's afterCommit applies
B1 — B1 plays under B2's name. A capture in that window overwrites B1's primed state with A's. No in-flight-load
tracking exists. Audition mode (every tile click loads) hits this naturally. Read-in-code.

### C-39 — The audition snapshot ignores a Stop that arrives before the next audio block and plays its full 2 s over the live sound   (S3 · bug · AuditionPlayer)

`processBlock` picks up the pending clip and resets `fading = false; gain = 1` (`AuditionPlayer.h:84-93`), losing a
`stop()` made in the same message-thread call (the C-37 path, a fast in-place apply, Stop right after a click).
Real class: 188 blocks (2.005 s) of snapshot audio after `stop()`, against 3 for the intended 30 ms fade. `stop()` also
writes plain `fading`/`fadeSamplesRemaining` from the message thread while the audio thread reads them (a data race).
Observed-in-test.

### C-40 — If the scanner worker cannot launch, every plug-in is quarantined after two scans — and stays so when the worker is back   (S3 · faulty · plug-in scan)

`launchFailed` counts as a module failure (`PluginScannerCoordinator.cpp:200-216`). Real coordinator: pass 2
quarantines; after restoring the worker, `scanned=0 skippedQuarantined=1`. Recovery is one Retry click per module.
Triggers: antivirus, a build without `CEDITOR_SCANNER_WORKER`, a hand-copied install. Observed-in-test.

### C-41 — The host trusts the worker-writable shared-memory header on every block; one changed field makes the host write outside the mapping   (S3 · bug · plug-in isolation)

Geometry is validated once, then `plane.getHeader()->config` is re-read every block (`PluginWorkerBlockBridge.h:176`,
`PluginWorkerDataPlane.h:333-341`). A mapping sized for 512 frames with the worker side setting
`config.maxFrames = 16384`: ASan SEGV, WRITE in `copyInputAudio` (`PluginWorkerBlockBridge.h:299`). A plug-in that
corrupts memory inside the worker can take the host down — the thing process isolation exists to prevent
(`plugin-process-isolation.md`). Observed-in-test (ASan).

### C-42 — "Your last N bars" does nothing to the "Also on load" audition   (S3 · faulty · Hostage audition)

`choosePhrase('recent')` sends only `setAuditionPhrase` (`SoundsAuditionBar.svelte:34-35`); `startPresetAudition`
never reads `auditionPhraseMode` (`InstrumentHostService.cpp:12550-12558`). The bar's own header promises the same
phrase for both. Read-in-code.

### C-43 — Retry on a quarantined module during a scan is undone when the scan finishes   (S3 · bug · plug-in scan)

`clearQuarantine` edits `catalog` and saves (`InstrumentHostService.cpp:981-990`); the scan ends with
`catalog = working; saveCatalog();` from a copy taken before the Retry (`:17880-17912`). Retry is not disabled while
scanning (`ReliabilityPanel.svelte:381`). Read-in-code.

## Verification of the other's findings
