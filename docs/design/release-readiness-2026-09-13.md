# Release readiness review — 13 September 2026

Status: work in progress. This is the execution record for preparing a first public release,
not a declaration that every feature has been verified.

## How the ideas list affects this work

`product-ideas.md` and its MIDI companion are design records, not an accurate list of unimplemented
features. They mix existing capabilities, gaps in their presentation, and larger new products.
Each proposed change must be checked against the current code and a user workflow.

| Idea | Release decision |
| --- | --- |
| Export preflight and a toolchain doctor | Fix false success now. Settings already exposes language/toolchain status; reuse it. |
| Back up work quietly and preserve panel history | Protect recovery and save/open first. Existing autosave and undo are not a reason to build another history engine. |
| Share a panel with someone else | Verify native dialogs, embedded artwork, reopen and Save. Missing-file errors must be visible. |
| “Why isn't this knob doing anything?” | High-value next usability pass: explain selection, binding and connection state using existing diagnostics. |
| A real first run and beautiful example panels | Review after file/export blockers. Start with one complete create → bind → preview → save → export walkthrough. |
| Component package drift | Already detected with content fingerprints. The missing operations are diff/pull/push/detach/reset; do not add another version system. Start with a readable diff if needed. |
| Panel support bundle | Useful follow-up, after essential workflows; reuse existing diagnostics and avoid a new reporting service. |
| Tablet client, visual scripting, autosampling, live collaboration | Later development. They are not prerequisites for a dependable editor release. |

## First corrective batch

- Recovered panels receive fresh session IDs, preserving their document GUIDs. Reusing stored
  session IDs collided with the next opened panel and stopped the whole canvas rendering.
- Invalid package shapes are refused before asset traversal. Malformed ordinary panel component
  lists are also refused rather than throwing from deserialization.
- Sharing and file-open failures use the existing notification UI. The user no longer needs to
  discover a console entry to understand why opening or sharing failed.
- Inline images load without native filesystem requests. This fixes missing backgrounds when
  opening a shared panel on Windows. Sharing that panel again uses the embedded bytes directly.
- Panel textures and nested control/part image, overlay and texture sources are included in
  sharing, along with the existing backdrop and font references.
- Build → Export Plugin reveals the Export properties and its identity decision. Both entry
  points share the pending decision, so a copied panel no longer appears to do nothing.
- Export checks actual installed tools, including system tools. Failed required handler builds
  fail the run. Missing requested format artifacts and unavailable template runtimes also fail.
- The compiling exporter prepares its outputs before replacing previous exports and restores
  the previous development/release mode. A successful ordinary Windows VST3 export was exercised.
- The editor prepares automation parameters, current TypeScript, selected script modules and
  embedded artwork for both export paths. Missing artwork/modules fail before native build work.
- Installer builds enable scripting, stage the Node runtime and identity helpers, install only
  the CEditor runtime component, and copy the outer VST3 bundle without recursing into its DLL.
- Installed exports prefer their own pipeline and write to Documents/CEditor/Exports. Windows
  template exports rename the internal binary to match its bundle and show the panel's name,
  vendor and version in the host. CLAP/LV2 templates are skipped with an explicit build-log warning
  because their identities are still fixed at build time. Older panels still export VST3 without
  changing their saved format settings. The compiling exporter retains those formats.
- Export's action, identity decision and result are at the top. Advanced identity/module sections
  start collapsed; saved collapse preferences are honored. Explanations wrap instead of truncating.

## Evidence so far

- Full frontend suite: 4,773 passed, zero failed, two skipped. Regenerated example/QA fixtures
  carry the new VST3-only defaults; saved users' explicit format settings are preserved.
- Full Windows Release build and all 33 native tests passed, including scripting and Hostage.
- Production web build passed. The rendered application was tested in Edge: Build opens a hidden
  Properties panel at Export and displays both identity choices without page errors.
- Native Windows walkthrough: recover existing unsaved work; open another panel; share a panel
  containing an SVG; open the package; save an editable copy; restart and verify the artwork.
  The saved package contained one embedded asset and no missing references.
- Native Windows malformed-package walkthrough: the current panel remains visible and an error
  explains the refusal. No extra tab is opened.
- Actual compiling exporter produced an 18.7 MB Windows VST3 with exit zero. The original
  `CEDITOR_DEV_MODE=OFF` setting remained off afterward.
- A staged app outside the checkout starts without localhost and restores existing panels.
  Its actual Build menu exported successfully into Documents/CEditor/Exports using bundled Node.
- Two 18.9 MB template plugins scanned and ran in CEditor's isolated native host with distinct
  IDs and correct panel names; both restored state. The scripted check exposed two parameters
  and emitted CC 20, 21 and 22 from Lua, JavaScript and TypeScript with no plugin window open.
  This proves the native host path, not compatibility with every third-party DAW.

## Continued release review

### Second corrective batch

- The player now queues incoming host MIDI away from the audio thread and delivers it through
  the existing device service. Note-on/off triggers Lua, JavaScript and TypeScript with no editor
  window. A host briefly creating and destroying an editor can no longer leave its device-event
  callback disconnected. This uses a bounded single-producer/single-consumer byte queue, with
  overflow reported in the existing player log. It does not run scripts in the audio callback.
- Binding status identifies the next missing step; Last received retains a useful controller
  readout across clock/keep-alive messages. MIDI learn opens the existing drag-to-bind chips.
- The status bar reveals MIDI output and opens Ports. Ports enumerates real endpoints, updates
  backend role mappings, and selects the panel's named device. Multiple devices require an
  explicit choice. Changing a port preserves that device's profile and recorded values.
- Raw Send and MIDI-CI use the selected device. Send reports the correlated backend result or
  explains an outgoing filter's refusal. It no longer declares success before sending.
- Help includes a create → bind → preview → save/share → export walkthrough. Ports fields and
  buttons follow the properties-panel colors and dimensions.
- Native acceptance found Ports, Routes and Snapshots missing from the dock's renderer despite
  having loaders and tab buttons. The dock now renders these loaded tools; the workflow test
  mounts the real dock and checks all three, instead of testing Ports in isolation.
- Windows Release build and 34 native tests pass, including queue overflow, wraparound, large
  SysEx and concurrent producer/consumer tests. A real VST3 worker test now processes 64 blocks;
  a fixture emitted CC 30/31/32 for incoming notes and CC 40/41/42 for note-off across Lua/JS/TS.
  The old player emitted none of these. This checks actual script output, not just host survival.
- A rendered workflow regression checks default and custom device roles, preservation of profile
  values, dropdown-to-backend mapping, binding guidance, last CC, navigation and send outcomes.
- The complete browser suite passes in Windows Edge, including Text, Effects, Screen, inbound
  player MIDI, learn chips and dock navigation. The generated help bundle is current.
- REAPER 7.73 acceptance uses its own configuration and Dummy Audio: both exported VST3s scan
  with distinct names, load embedded SVG artwork, and expose Cutoff. Setting A to 0.87 through
  REAPER's parameter UI updates its panel; B remains 0.50. After saving the project, closing
  REAPER completely and reopening it, A restores 0.87 and B restores 0.50 with correct identities.
- Native first-use acceptance created a blank panel, inserted a knob, bound a profile parameter,
  exercised binding guidance, opened Ports and MIDI, saved and reopened the panel. A loopMIDI
  port sent and received CC 74 value 96, with the backend result and last-received readout agreeing.
- That walkthrough found the toolbar's Bind action claimed metadata adoption while leaving a
  knob at 0..1. It now calls the same adoption helper as drag-to-bind and starts with Dry Run off.
  The rendered regression clicks the real toolbar and verifies range 0..127, integer type and
  default 64. Raw MIDI's direct-value range is explained in the walkthrough.
- Port assignment uses the existing Generic MIDI CC profile for an unmapped device; named
  device profiles remain unchanged. The installer now includes device profiles and the backend
  resolves them beside the executable before falling back to a developer checkout.
- The copied native test loaded profiles entirely from an installed-layout directory and mapped
  a new Generic MIDI CC device. The staged exporter produced a 21.9 MB VST3 carrying its profiles;
  its manifest regenerated and the real native host verified all six note-triggered script CCs.
- A repeated native run exposed JUCE's Windows pipe cancellation race: a timeout could discard
  a completed read and release a still-live OVERLAPPED. The local JUCE patch drains cancellation
  and retains successful completion. The unchanged 4 MB polling test passes five consecutive
  times, and the full Windows native suite passes 34/34 after the fix.

### Acceptance still required

The Standard installer upgrade now passes. Post-upgrade comparison exposed a missing Inno Setup
file-list entry despite correct CMake staging; RC3 includes that entry. Its installation log reports
success, all nine installed device-profile JSON files match staging, and the installed application,
scanner, worker, Node and export script match their tested copies. The upgraded Program Files app
starts, restores existing work and renders Ports. The pre-upgrade installation was backed up.

1. Confirm hardware MIDI and session restore against an actual instrument. The available input
   is loopMIDI's CEditor Test Out, not a physical synth. Hostage's 36-feature completion audit and
   native tests were reviewed; its physical/performance acceptance remains part of this gate.
2. Broaden format/runtime/platform acceptance before advertising beyond Windows VST3 with the
   verified script runtimes. This candidate does not claim a macOS/Linux or universal-DAW release.
3. No public release tag or installer publication has been made. Review the physical acceptance
   result before treating the local candidate as an official first release.

Implementation is committed on main as cc9f70cc. Claude reviewed it independently and confirmed a
clean, synchronized checkout with only main on the remote. The final installer file-list correction
and this acceptance record follow as a separate commit.

Builds and tests run locally. GitHub CI is not the iterative test environment, and no workflow
expansion is needed for this review.
