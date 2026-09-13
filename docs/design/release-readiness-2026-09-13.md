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
  vendor and version in the host. CLAP/LV2 templates are refused before touching output because
  their identities are still fixed at build time. The compiling exporter retains those formats.
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

## Remaining release gates

1. Installer installation/upgrade and a third-party DAW acceptance pass remain required. The
   staged runtime and in-app export passed; the older Program Files installation was not replaced.
2. Broaden export-format/runtime acceptance beyond the verified VST3 path. Extra script runtimes
   are currently bundled only for VST3 by the compiling exporter; template export cannot add
   them. Unsupported combinations now explain their refusal instead of producing false success.
3. Review first-use navigation, component diagnostics and the create/bind/preview workflow.
   Preserve all properties; improve grouping, labels and the route to existing controls.
4. Confirm hardware MIDI and session restore against an actual instrument. Automated message
   checks do not demonstrate the physical synth's behavior.
5. Hostage's existing 36-feature completion audit and current native suites were reviewed. A
   fresh physical/performance acceptance pass remains separate from source/test completion.
6. Update packaged documentation, produce a release candidate, and reconcile the reviewed batch
   with main. No public release tag or installer publication has been made by this work.

Builds and tests run locally. GitHub CI is not the iterative test environment, and no workflow
expansion is needed for this review.
