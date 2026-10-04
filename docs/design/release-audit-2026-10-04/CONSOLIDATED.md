# Release audit — consolidated list

> **Status, 2026-10-04:** Claude's half is complete — **83 findings**, in `claude-findings.md` with repro, cause and
> evidence for each. **Codex's half (Windows) has not been pushed yet**; its rows and its verdicts on Claude's S1/S2
> findings will be merged here when it is. Tree: `main` @ `f37550c`.

## Verdict

**Not ready for a formal release.** A beta is reasonable once the seven S1 findings below are fixed or the features
they live in are switched off for the beta. Four of the seven need only a small, local change.

| | S1 | S2 | S3 | Unfinished | S4 | Total |
| --- | --- | --- | --- | --- | --- | --- |
| Claude | 7 | 25 | 39 | 3 | 9 | 83 |
| Codex | — | — | — | — | — | pending |

Evidence: 9 findings reproduced **in the running app** (Linux build of this commit), 39 **demonstrated by a test or
harness** run against the repo's own code, 35 **traced in code**. Of the S1s, four are demonstrated in the app or in a
test; C-34 and C-35 are code traces.

## Release blockers (S1), with the smallest safe treatment

| ID | What happens | Smallest safe treatment |
| --- | --- | --- |
| C-08 | Opening a shared panel and pressing Preview runs its JavaScript with the page's own globals, including the native file bridge — a panel can read or write any file. Reproduced in the app. | Give the native file handlers a path allow-list (only paths the user picked in a dialog, plus the app's own folders), and run panel JS without access to `window.__JUCE__`. Until then, ask before running scripts in a panel opened from a file. |
| C-09 | Save As, then one Undo, re-points the tab at the original file; the next Save overwrites it. Reproduced in the app. | Leave `filePath` and `name` out of the undo snapshot (`stores/history.js:319`). One line. |
| C-11 | "Send saved sound" (Total Recall) sends every dump the profile declares, zero-filled where the panel binds nothing — GAIA System block to 0, AN1x user voice/pattern memory overwritten. Found by two reviewers independently. | Send only dumps whose bytes all come from a real capture; until a device capture exists, do not send dumps at all. |
| C-25 | The AN1x profile's Scene 2 and FEG tracks 2–4 dump mappings point at the Scene 1 / track 1 parameters; every instanced profile the Designer saves has the same flaw. | Keep the instance prefix in the emitter's dump mappings (`CE/dpd/emit-legacy-core.mjs:88`) and regenerate the AN1x profile. |
| C-57 | One endless loop in any preview script hangs the editor for good; no watchdog. Reproduced in the app. | Run preview scripts in a Worker the page can terminate, or give the interpreters an instruction budget like the native engines already have. |
| C-34 | Closing the Hostage plug-in while Library → Listen runs crashes the DAW (use after free). Applies only if the Hostage VST3 product ships. | Guard the closure with the `alive` token the preset scan already uses. |
| C-35 | A failed preset load leaves the part named as the new plug-in while the old one plays; the next save writes the old plug-in's state under the new one's identity. | Change the part's identity only when the load commits, or restore it on failure. |

## The work, grouped — for planning the fixes

1. **Hardware output and Total Recall** — C-11, C-12, C-25, C-26, C-27, C-28, C-29, C-30, C-31, C-13, C-72. The release
   notes already say no message has reached real hardware; the code says several would currently be wrong. Either fix
   this group or mark Total Recall and profile-driven sends experimental for the beta.
2. **Hostage (instrument host)** — C-01…C-06, C-34…C-43, and the licensing set C-15, C-73, C-74, C-76, C-77, C-78.
   Hostage is not mentioned in the release notes, but it is in the File menu. Decide whether it ships in this beta and,
   if so, what the Free edition means in an AGPL product (C-15).
3. **Scripting: safety and preview = export** — C-08, C-57, C-58…C-70.
4. **Animation overhaul (the newest code)** — C-44…C-56. A state-triggered sequence never plays on any shipped control
   (C-44) — fix it or hold the Sequence kind back from this release.
5. **Export** — C-13, C-14, C-16…C-21.
6. **Data safety** — C-09, C-35, C-80 (quit loses the last ~20 s of edits with no prompt), C-81 (Linux only: text
   double-encoded on save).
7. **Release surface and docs** — C-07 (update check fails today: publish `v0.2.0` as a full GitHub release), C-22
   (ship the AGPL text and a source link), C-23, C-24, C-70, C-71, C-75, C-79, C-82, C-83.

## Full index

| ID | Sev | Area | Finding | Evidence | Codex |
| --- | --- | --- | --- | --- | --- |
| [C-08](claude-findings.md) | S1 | scripting / sharing | A shared panel's JavaScript can read and write any file on the machine through the app's native bridge | in the app | pending |
| [C-09](claude-findings.md) | S1 | save / undo | Save As, then one Undo, silently points the tab back at the ORIGINAL file; the next Save overwrites it | in the app | pending |
| [C-11](claude-findings.md) | S1 | Total Recall | "Send saved sound" overwrites every dump parameter the panel does not export with 0 — including the synth's System block | in a test | pending |
| [C-25](claude-findings.md) | S1 | device profiles / DPD emitter | AN1x profile: Scene 2 and Free-EG tracks 2–4 in every dump read and write the Scene 1 / track 1 parameters | in a test | pending |
| [C-34](claude-findings.md) | S1 | Hostage VST3 — if that product ships | Closing the Hostage plug-in while Library → Listen is measuring crashes the DAW | read in code | pending |
| [C-35](claude-findings.md) | S1 | Hostage session persistence | A failed preset load leaves the part named and saved as the new plug-in, holding the old plug-in's state | read in code | pending |
| [C-57](claude-findings.md) | S1 | scripting runtime | One infinite loop in any preview script freezes the editor (or the plug-in's open window) with no recovery | in the app | pending |
| [C-01](claude-findings.md) | S2 | Hostage transport | With external MIDI clock on, every sequencer/arp step fires 3–4 times and swung steps never play | in a test | pending |
| [C-02](claude-findings.md) | S2 | Hostage clips | A clip launched while stopped waits for the old playhead after ▶; a running clip goes silent after Stop → ▶ | in a test | pending |
| [C-03](claude-findings.md) | S2 | MIDI insert chain | Turning on / adding / un-bypassing a MIDI module while a key is held swallows that key's note-off: hung note | in a test | pending |
| [C-04](claude-findings.md) | S2 | MIDI insert chain | Bypassing/removing a module upstream of an arp while a key is held leaves the arp running forever | in a test | pending |
| [C-05](claude-findings.md) | S2 | arp / note modules | Arp and Echo/Strum/Humanize/Length notes ring on after a rewind, and forever inside a DAW loop | in a test | pending |
| [C-12](claude-findings.md) | S2 | Player | The plug-in looks up dumps, program recall and `ce.device.buildDump` under a hard-coded `mainSynth` role: Total Recall and the Programs menu do nothing for the shipped panels | read in code | pending |
| [C-13](claude-findings.md) | S2 | export | An exported plug-in cannot find a device profile the user imported; its device-bound controls send nothing | read in code | pending |
| [C-14](claude-findings.md) | S2 | export identity | Renaming the panel, its file, plug-in name or vendor changes the CLAP id and LV2 URI: saved CLAP/LV2 sessions lose the plug-in | in a test | pending |
| [C-15](claude-findings.md) | S2 | licensing — needs an owner decision | Hostage in the editor is locked to the Free edition — one plug-in at a time — and no licence can unlock it | read in code | pending |
| [C-26](claude-findings.md) | S2 | Player | Exported plug-in sends a choice parameter's menu index as the device's wire value | in a test | pending |
| [C-27](claude-findings.md) | S2 | Player | Total Recall's "dump first, values after" does not hold: the dump goes out the DAW's MIDI bus, the values straight to the port | read in code | pending |
| [C-28](claude-findings.md) | S2 | DPD emitter | GAIA "from DPD" (and any Designer-saved signed parameter): s7 becomes u7 but keeps −63..63 — negatives never send, others arrive 64 low | in a test | pending |
| [C-29](claude-findings.md) | S2 | scripting / device service | `ce.device.setVariable` / `setTiming` report success but the sending engine never sees them | read in code | pending |
| [C-36](claude-findings.md) | S2 | Hostage audition | The browse audition's phrase arrives as one block of notes: nothing is heard | in a test | pending |
| [C-37](claude-findings.md) | S2 | Hostage audition | Auditioning a preset of a different plug-in plays the phrase on the OLD plug-in, then nothing on the new one | read in code | pending |
| [C-38](claude-findings.md) | S2 | Hostage library load | Picking another preset while a new plug-in is still loading applies it to the old plug-in; the first pick wins | read in code | pending |
| [C-44](claude-findings.md) | S2 | animation — the newest code | A state-triggered sequence never plays on any shipped control (so Hold last, Loop and Return never do either) | in a test | pending |
| [C-45](claude-findings.md) | S2 | animation | On a control with no parts, a sequence's Scale, Rotation and Opacity tracks say "works" and move nothing | in a test | pending |
| [C-58](claude-findings.md) | S2 | preview ≠ export | Lua preview: a script's `self`, `log`, `state` and helpers belong to whichever Lua script loaded last | in a test | pending |
| [C-59](claude-findings.md) | S2 | Python | Python preview: lists passed to the API arrive empty — `sendSysex([...])`/`sendMidi([...])` send nothing, `checksum` is wrong | in a test | pending |
| [C-60](claude-findings.md) | S2 | preview ≠ export | Python: payloads support `info.x` in the preview but only `info["x"]` in the plug-in — no spelling works in both | read in code | pending |
| [C-61](claude-findings.md) | S2 | Player lifecycle | Plug-in window: onPanelLoad/onPanelReady re-run on every window open, `info.firstTime` is always true, the dump is requested twice | read in code | pending |
| [C-62](claude-findings.md) | S2 | toolchains | Toolchains: "Install" for Python downloads a runtime nothing uses, then says Installed while export still fails | read in code | pending |
| [C-73](claude-findings.md) | S2 | licensing — extends C-15 | A generated Hostage product can never be licensed: every customer gets Free forever | in a test | pending |
| [C-80](claude-findings.md) | S2 | data loss — observed on Linux, Windows to verify | File → Close Program quits with unsaved changes and no prompt; edits from the last ~20 s are lost | in the app | pending |
| [C-06](claude-findings.md) | S3 | Hostage hardware parts | Changing a hardware part's MIDI channel or output while notes sound strands them on the old destination | read in code | pending |
| [C-07](claude-findings.md) | S3 | release process | Help → Check for Updates answers with an error for every user today | in the app | pending |
| [C-10](claude-findings.md) | S3 | tabs | The × on a Screen (CTRL49) tab does nothing | in a test | pending |
| [C-16](claude-findings.md) | S3 | export | Old panels show LV2 on in the Export tab; the installed exporter silently builds no LV2 | in a test | pending |
| [C-17](claude-findings.md) | S3 | export UI | The Export tab tells installed users CLAP and LV2 need a source checkout, and that output goes to `export-out/` | read in code | pending |
| [C-18](claude-findings.md) | S3 | export | A failed compiler-free export destroys the previous working export | in a test | pending |
| [C-19](claude-findings.md) | S3 | export identity | A panel with no `panelGuid` gets a new random GUID on every open; a re-export silently makes a different plug-in | in a test | pending |
| [C-20](claude-findings.md) | S3 | export | Two different panels with the same plug-in name overwrite each other's export without a word | in a test | pending |
| [C-21](claude-findings.md) | S3 | compiling exporter | Exports from a source checkout read their panel from an absolute path in `export-out/` | read in code | pending |
| [C-22](claude-findings.md) | S3 | licensing | Neither the installer nor the app ships the AGPL text or says where the source is | read in code | pending |
| [C-23](claude-findings.md) | S3 | first run | On a fresh install the default device, and File → Open Device Profile, are a test fixture ("Test CC Synth") | in the app | pending |
| [C-30](claude-findings.md) | S3 | device service | Profile pacing is ignored: push sync and the restore fire DT1 messages back-to-back | read in code | pending |
| [C-31](claude-findings.md) | S3 | device service | Device-request `retries` never happen; one lost reply ends the whole startup sync | read in code | pending |
| [C-32](claude-findings.md) | S3 | MIDI learn | A MIDI-learn chip drops the channel it learned: a CC learned on channel 5 sends on channel 1 | in a test | pending |
| [C-39](claude-findings.md) | S3 | AuditionPlayer | The audition snapshot ignores a Stop that arrives before the next audio block and plays its full 2 s over the live sound | in a test | pending |
| [C-40](claude-findings.md) | S3 | plug-in scan | If the scanner worker cannot launch, every plug-in is quarantined after two scans — and stays so when the worker is back | in a test | pending |
| [C-41](claude-findings.md) | S3 | plug-in isolation | The host trusts the worker-writable shared-memory header on every block; one changed field makes the host write outside the mapping | in a test | pending |
| [C-42](claude-findings.md) | S3 | Hostage audition | "Your last N bars" does nothing to the "Also on load" audition | read in code | pending |
| [C-43](claude-findings.md) | S3 | plug-in scan | Retry on a quarantined module during a scan is undone when the scan finishes | read in code | pending |
| [C-46](claude-findings.md) | S3 | Animation tab | The sequence playhead and Play pose nothing in design view for built-in controls; the tab's stage never shows a sequence | in a test | pending |
| [C-47](claude-findings.md) | S3 | animation | A colour track arriving with a back easing (inBack/outBack/inOutBack) flashes opaque black | in a test | pending |
| [C-48](claude-findings.md) | S3 | Animation tab timeline | Dragging several selected keyframes together writes the wrong values | in a test | pending |
| [C-49](claude-findings.md) | S3 | animation triggers | "default" never matches on a Knob or Slider: an animation From/To "default" never plays, and nothing warns | in a test | pending |
| [C-50](claude-findings.md) | S3 | animation | A sequence on the Value trigger ignores its Source field | read in code | pending |
| [C-51](claude-findings.md) | S3 | accessibility | Sequences ignore reduced motion (the OS setting and Preview's switch) | read in code | pending |
| [C-52](claude-findings.md) | S3 | animation | The timeline lets you drag a sequence's start, but the sequence never reads that delay | in a test | pending |
| [C-53](claude-findings.md) | S3 | animation | A filmstrip frame track (a release-note headline) is counted as "1 target does nothing" | in a test | pending |
| [C-54](claude-findings.md) | S3 | animation | A keyframe animation played once by a script or by Play replays by itself when the control is drawn again | in a test | pending |
| [C-55](claude-findings.md) | S3 | spring easing | At low damping (which the editor allows) a spring snaps the last quarter of its travel in the final frame | in a test | pending |
| [C-63](claude-findings.md) | S3 | Python | Python: the editor's skeletons for onPanelLoad/Build/Close/Destroy throw TypeError | read in code | pending |
| [C-64](claude-findings.md) | S3 | Python | Python in the editor and in the open plug-in window needs the internet | read in code | pending |
| [C-65](claude-findings.md) | S3 | scripting errors | C++/C#/Java preview: an exception is logged "[object Object]", never reaches onError, and is followed by "ran …()" | in a test | pending |
| [C-66](claude-findings.md) | S3 | native export | Exported native handlers: C#/Java errors lose their message; on Windows one C++ `throw` disables every C++ handler as a "hardware fault" | read in code | pending |
| [C-67](claude-findings.md) | S3 | preview ≠ export | C++/C#/Java handlers that preview cleanly fail the export build; the validator says nothing | in a test | pending |
| [C-69](claude-findings.md) | S3 | toolchains | Toolchain provisioning: an interrupted extract stays "already provisioned" forever; downloads are never verified | read in code | pending |
| [C-71](claude-findings.md) | S3 | first run — observed in the app | File → New Panel from Device Profile says "No device profiles" the first time it is opened | in the app | pending |
| [C-72](claude-findings.md) | S3 | shipped profile data — observed in the app | A panel generated from "Roland GAIA SH-01 (full)" labels every control with an internal id, and every default is the range minimum | in the app | pending |
| [C-74](claude-findings.md) | S3 | licensing / rack | The Free one-plug-in cap counts only finished loads: a recalled rack loads every part, and a removed instrument then cannot be put back | read in code | pending |
| [C-81](claude-findings.md) | S3 | S1 if Linux ships — observed in the app | On Linux, every non-ASCII character the page sends to the native side is double-encoded: saved panels come back as "Â·" | in the app | pending |
| [C-68](claude-findings.md) | U | native export | onDawSaveState is offered for C++/C#/Java but cannot save anything | read in code | pending |
| [C-75](claude-findings.md) | U | developer tool in the product | "New Screen (CTRL49)" on the welcome screen opens a Screen Builder whose work goes nowhere | in a test | pending |
| [C-76](claude-findings.md) | U | licensing | The Edition tab sells "Script actions" as Pro, but nothing can call them in any edition | read in code | pending |
| [C-24](claude-findings.md) | S4 | docs | Release notes, README and user docs quote numbers and formats the product no longer matches | read in code | pending |
| [C-33](claude-findings.md) | S4 | preview | The preview JS engine still builds different bytes from the C++ engine | in a test | pending |
| [C-56](claude-findings.md) | S4 |  | Animation polish | read in code | pending |
| [C-70](claude-findings.md) | S4 | docs | The scripting manual's language table contradicts the product | read in code | pending |
| [C-77](claude-findings.md) | S4 | licensing UI | Every user of the free AGPL editor is told "Newer builds: a paid upgrade" | in a test | pending |
| [C-78](claude-findings.md) | S4 | docs | Licensing docs say the public key is "built into" the product; it is read from a user-editable JSON file | read in code | pending |
| [C-79](claude-findings.md) | S4 | faulty | Off Windows, Hostage says "No CTRL49 connected — plug it in and it connects by itself", though support is compiled out | in a test | pending |
| [C-82](claude-findings.md) | S4 | dev | The `pluginPresets` browser check writes its screenshot to `C:/tmp/…`: off Windows it creates `CE/web/C:/tmp/` in the working tree | read in code | pending |
| [C-83](claude-findings.md) | S4 | layout | At 1280 px the selection context bar draws "SCRIPTS · no logic attached · Script Editor" over the Box/Effects tabs | read in code | pending |

## What was tested and held up

| Check | Result |
| --- | --- |
| Web unit suite (`npm test`, Linux) | **5,879 tests: 5,878 pass, 0 fail, 1 skipped** |
| `npm run lint` | clean |
| Script-export validation | 8 pass, 2 skipped (no Lua or dotnet here) |
| `verify-all.mjs`, `languages.mjs status` | exit 0 |
| Production build | clean |
| Windows CI run #315 on `f37550c` (MSVC build, ctest, pluginval + clap-validator) | **success** |
| Every enabled menu item, and all 56 Insert types, clicked in Chromium on the production bundle | 0 page errors, 0 console errors |
| Official browser suite (`test:browser`, 30 checks) | 27 pass; 3 timed out before any test ran (harness, re-run pending) |
| Behaviour and authoring ledgers (~90 checks) | second pass on one warm dev server in progress |
| The app on Linux (WebKitGTK, Xvfb): launch, menus, About, update check, New Panel from Device Profile, Open, Save As, Undo, Preview, quit and recovery | runs; findings C-07, C-08, C-09, C-23, C-57, C-71, C-72, C-80, C-81 come from here |
| Player plug-in on Linux (VST3 / CLAP / LV2) under pluginval and clap-validator | in progress |

Each reviewer also recorded what it checked and found sound — among them: failed saves are reported as failures;
29 hostile `.cepanel` documents open cleanly or are refused; round-trips of all QA panels are byte-stable; the
script-MIDI queue on the audio thread is lock-free; checksums match the manuals' examples; every Hostage command name
the web side sends exists natively; host parameter ids stay stable across exports; the performance engine's own notes
release correctly on stop, locate and panic. The full lists are in the reviewers' reports, summarised in the
"Checked and fine" notes this file was built from.

## Not covered by Claude — Codex's half

The Windows-only work in `README.md` (W1–W9): MSVC build and ctest from this commit, the installer, the native
dialogs and crash recovery (gate D3), compiler-free export into real DAWs, Hostage with the live plug-in worker, MIDI
on real ports, the animation work under WebView2, and an independent review of the C++ backend. Specific requests to
Codex are marked **Codex:** in `claude-findings.md` (C-06, C-13, C-15, C-57, C-61, C-66, C-80, C-81).

## Carried from the existing records (not new)

`release-checklist-2026-09-14.md`: A4 and B3 OPEN; D3 PART MET; D5 and D6 OFF-SITE; section E undecided (the six
unreachable declarations, a `Recorder.snapToScale` line in the release notes). Its header says no gate holds stale
evidence; A6, D1, D2 and D4 quote 14 September and are stale by its own legend. `known-issues.md`: the DPD Import
CSV / MIDI-learn-an-address items, DAW keyboard shortcuts with the exported editor focused, and the compiler-free
export limits.
