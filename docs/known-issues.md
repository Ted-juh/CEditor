# Known issues

Things that were found, are not fixed, and should not be forgotten. This file exists so that
retiring a review document does not also retire the two or three findings in it that nobody closed.

The rule for putting something here: it was **observed**, it is **not fixed**, and no other place in
the tree already records it. A finding whose fix is verifiable in code does not belong here — it
belongs in the commit that closed it and the test that keeps it closed. A feature somebody wants is
not a known issue; that is the roadmap.

---

## Standing debts from the 2026-07-02 project review

That review's order-of-attack table is done and the document is retired. These are the items it
raised that were deliberately *not* actioned — kept because "we decided not to" is worth recording,
and because each one will look like an oversight to the next person who finds it.

- **Two files are still large enough to be their own problem.**
  `sections/CustomDesignSurfaceEditor.svelte` (~8,300 lines) and `sections/TextEditor.svelte`
  (~2,450). Both were split once — the surface editor gave up two geometry/helper modules plus
  `CustomArpeggiatorEditor` and `CustomStateFilmstrip`, and `editor/CanvasControl.svelte` went
  5,718 → ~4,550 behind three pure-JS modules — and the two above have since grown back toward
  where they started. The review's own note stands: the layer dock and palette are too entangled
  with the surface editor to extract safely, which is why that part was skipped the first time and
  why a second pass is not a free afternoon.
- **`kitEntries` in the surface editor rebuilds a Map over all parts and hit zones** on relevant
  updates, with several `$derived` filters downstream. Fine at present sizes. Profile before
  touching it; it matters only if components with hundreds of parts show up.
- **No `CONTRIBUTING` or `SECURITY`.** `LICENSE` — the one the review called out as mattering most,
  because without it nobody can legally use or contribute — is AGPLv3, decided deliberately and
  recorded in [license-decision.md](license-decision.md). The other two are unwritten.
- **A `.prettierrc.json`, and no Prettier.** `.clang-format` and `.editorconfig` exist, and
  `CE/web/.prettierrc.json` has since 2026-09-22. Prettier itself is not a dependency of this project
  and nothing runs it, so the file configures a tool that is not there. What does run, since
  2026-10-01, is `npm run lint`: ESLint with correctness rules only (an undefined name, a duplicate
  key, unreachable code), not style. Its first run found three `ReferenceError`s behind buttons;
  [lint-and-accessibility-2026-10-01.md](design/lint-and-accessibility-2026-10-01.md) has the
  counts and the rules left off, each with its size.

---

## Standing decisions from the custom-component designer reviews

The 2026-07-12 workspace review and the 2026-08-14 properties-panel review are both closed and
retired. These are the things they raised that were deliberately **not** done, kept because each one
will look like an oversight to whoever finds it next.

### The canvas viewport is not extracted, and the number is why

`sections/CustomDesignSurfaceEditor.svelte` went from 8,325 lines to ~5,500 across eight
components. The one region left whole is the canvas viewport, and it was measured rather than
guessed: it needs **116 props**, and **68 pieces of parent state that its own handlers mutate** —
the interaction record, the active frame, the draw draft, the smart guides, the arpeggiator editing
state. Extracting it means 68 bindable props or 68 setters on top of the 116, or moving the
handlers with it — and the handlers are called from the keyboard shortcuts and the dock as well as
from the canvas. That is not a smaller file; it is the same coupling with a boundary drawn through
the middle of it. `test/surfaceDecomposition.test.js` ratchets the parent's line count so the rest
cannot grow back into it.

### Hit-zone rotation is not a UI job

Hit zones have no rotation field in the model. Adding one needs the field, the renderer and the
runtime hit test together — a zone that draws rotated while testing unrotated is worse than one
that does neither. Filed under Tier 2 in the review, but it belongs with the capability work below.

### Tier 3 stays Tier 3

Containers, image fill on shapes, colour tokens and constraints/anchors are capability features
spanning the model, the renderer, the runtime and the exporter, which is what the review's own
heading for them says. Two findings for whoever picks them up:

- **Shared swatches already exist** — `stores/palettes.js` is a persisted named palette library,
  reachable from the DisplayPanel. What is missing from "colour tokens" is the *reference*: a part
  storing a token name instead of a literal AARRGGBB, and something resolving it at render and
  export time.
- **Image fill is renderer work, not a model change.** `SECTION_DEFAULTS.Background.Fill` already
  declares `imageEnabled` and `imageSrc`; `editor/InteractivePartRenderer.svelte` never reads them.
  (The `Image` section it *does* read is the filmstrip, a different feature.)

### The Look bar triplication is a design decision, not a defect

Fill, gradient, stroke and corner live in three places: the Look bar, the palette's groups, and the
dock's Display tab. The review's advice was to "pick one quick home (the Look bar) and strip the
others to swatch-status only". That is a judgement about how the editor should feel, with no
obviously right answer, so it is left for whoever makes it rather than settled by whoever happened
to be closing the review.

### Not done from the properties-panel round

The bulk conversion of ~200 `<select>` and text inputs onto `PropertySelect`/`PropertyText`. The
widgets exist and new code uses them, but every `.val` in the panel already takes its metrics from
the shared tokens and carries `box-sizing: border-box` and `min-width: 0` — so the overflow bug and
the select-widens-its-own-track bug, the two things the widgets were needed for, are fixed where
they live. Conversion would buy less CSS and cost ~200 hand-edits that each change binding
semantics and each need an `<option>` list lifted into an expression, with no DOM-level test in the
suite to catch a slip.

---

## ~~Eight component types are undecided for host automation~~ — CLOSED

*(Was "twenty-seven cannot be automated", then "eight are deferred". All fifty are now ruled and
nothing is deferred.)*

`deriveExportParameters` reads a control's `Behavior`, its `ValueChannels`, or its type's own
`exportValues` declaration. As of 2026-08-23: **24 types export parameters and 26 decline with a
stated reason.** `qaPanels.test.js` fails if a new type reintroduces silence, and `DEFERRED_TYPES`
in `tools/scripts/qa/sheets/export.mjs` is now empty — kept rather than deleted, because a type
added tomorrow with `exportValues: []` and no ruling lands in "declined" and reads as considered,
so a future deferral has to be written down there to show up as one.

**How the eight were decided.** Each had real candidates and no obvious single answer, and an
exported parameter is permanent once a saved session references it.

| Type | Ruling |
|---|---|
| `Arp` | `rate`, `gate`, `swing`, `octaves` — all four, because all four are performed rather than configured. Picking a subset would have been the arbitrary choice. `phase` never, it is generated output. |
| `Turing` | `rate`, `randomness`, `gateThreshold`, `length`. Shortening the loop live is the instrument's defining gesture, not a setting. `quantizeLevels` declines — it changes what the values MEAN. |
| `Orbit` | `rate` only. `nodes` is a list whose length the author chooses, which is the Matrix problem: an exported list has to be fixed, so per-node values stay on ports and scripting. |
| `Kinetic` | `gravity`, `restitution`, `friction` — all three, the non-arbitrary answer to "picking one would be arbitrary". |
| `Looper` | **Nothing**, and the deferral was right to suspect it. `phase` is output; loop length is a structural edit, because every recorded gesture is stored against the loop it was drawn in. |
| `Phrase` | `transpose`, `swing`, `gate`, `rate` — the Arp's four over a different pattern source. `steps` declines (variable cardinality); `velocity` declines because it moves only the cells that carry none. |
| `Transport` | `swing` exports, `bpm` does not. A Transport following the host takes tempo FROM the DAW, so a host parameter writing tempo INTO it is the DAW arguing with itself, and which side wins depends on a setting the automation lane cannot see. `swing` is CEditor's own and behaves identically on either source. |
| `Setlist` | `index`, with a **fixed 0..127** range rather than the scene count. A range tracking the scene list would change meaning the moment somebody added a song; 0..127 is the answer MIDI program change already gives, and the component clamps. |

**What the ruling uncovered.** The `exportValues` door led nowhere. `valueOverride` is where a
Behavior value lands and `customValues` is where a CustomComponent channel lands; a field on a
component's own section was neither, so those parameters reached the host, automated, saved with
the session — and moved nothing. Only four types used that door and three of their parameters had
never been driven by anyone, which is why it survived. `utils/sectionValueOverrides.js` closes it
with one session key overlaid before anything renders, so `VectorJoystick`, `Timbre` and
`Constellation` gained working automation alongside the seven new ones.

**What was decided earlier, for the record.** Structural types (`Background`, `Container`, `Group`,
`Image`, `Label`, `TestBox`) hold no value. Displays (`LcdDisplay`, `PixelDisplay`, `Meter`) are
outputs — a host parameter would let a DAW write what the component is meant to be reporting. Note
emitters (`ChordPad`, `NoteRibbon`, `DrumPads`, `Harmoniser`) send notes and hold no scalar to
sweep. `Router`, `SplitZone`, `Constraint` and `Recorder` are configuration or state machines.
`Matrix` and `Envelope` have variable cardinality against a fixed export list. `Timbre` and
`Constellation` got two parameters each — an XY space, the same ruling `VectorJoystick` got.

Why none of them got a `Behavior` section, which was the obvious route: `PropertiesPanel.svelte:223`
mounts a Behavior tab off the section's mere presence, so a crossfader would have grown a tab full
of `fireOn` and `buttonType`. The type declares what it exports instead, beside its own section.

## Two things the DPD Parameters screen wants and does not have

Both shipped for a while as disabled "Coming soon" buttons in the Parameters toolbar. They were
removed before the beta rather than left there: a permanently greyed button is a promise nobody is
keeping, and in a toolbar with one working action it was two-thirds clutter. Recorded here so the
intent is not lost with the buttons.

**Import CSV.** Every editor ever written starts with a human copying a MIDI implementation chart
out of a manual, and a chart is a table. Pasting or importing one and mapping its columns onto
`{ id, name, valueType, address, range, encoding }` is the single biggest saving available on the
authoring side, and `beta-differentiation.md` argues at length that profile acquisition — not any
component — is the category's real bottleneck.

**MIDI learn, for a parameter's address.** Wiggle a control on the synth and let the arriving
message fill in the address, rather than transcribing `F0 41 10 ...` by hand.

Worth being precise about what this is *not*, because the app already has something called MIDI
learn and it is a different thing. `MidiLearnChips.svelte` is a drag source in the MIDI Monitor: it
turns an inbound message into a chip you drop onto a control on a panel to *bind* it. That answers
"which control should this CC drive". The DPD needs the other direction — "what address does this
parameter live at" — which writes a profile definition, not a binding. Wiring the button to the
existing chips would have looked like progress and connected two unrelated subsystems.


---

## ~~Panel packaging exists but is not in the UI~~ — CLOSED

*(Was "no panel package format", then "the format is built, the button is not". Both halves now
exist: File → Share Panel... and File → Open Shared Panel....)*

A bare `.cepanel` holds ABSOLUTE PATHS to its images, so sending one to somebody else sends a panel
with no pictures. It looks perfect on the author's disk, which is exactly why it survived: the
failure only exists on the second computer, and the author is the one person who never sees it.

Three layers, kept apart on purpose:

| | | |
| --- | --- | --- |
| `utils/panelPackage.js` | the format | no filesystem, no bridge — testable anywhere |
| `stores/panelSharing.js` | the assets | supplies `readAsset`/`writeAsset` out of `fileCache` |
| `stores/panelSharingActions.js` | the commands | dialogs, file IO, landing the result in a tab |

A `ceditor-panel` envelope embeds every asset, content-addressed so one image used forty times is
stored once, deliberately the same envelope shape as the custom-component package so version
refusal and a reader's expectations are already established.

**The editor half needed almost no new code**, which is worth recording because the estimate was
much larger. Reading is `fileCache`, which already exists to show local images in the WebView: it
asks the bridge for a path and hands back a data URL, exactly the bytes the packager wants. Writing
turned out not to be needed at all — `CanvasControl.svelte:1789` accepts a `data:` URL wherever it
accepts a path, so an opened package puts the embedded bytes straight back into `imageSrc` and
`bgImage`. No temp files, no cleanup, and an opened panel is self-contained rather than pointing at
a folder the next person also needs. The only native support the format required is two file
dialogs (`savePanelPackageAs`, `openPanelPackage`).

The collector includes `panel.bgImage`, `panel.bgTexture`, nested control/part image, overlay and
texture sources, and `Text.path` font references. Fonts imported in Settings that the panel's text
names travel as `panel.fonts` (`utils/documentFonts.js`): the player and a recipient without those
fonts register them on opening, and a font whose file cannot be read is reported missing like an
image. Arbitrary files read by scripts are not collected.

Two things are stripped on the way out, and both are the kind of leak nobody notices until it is
in somebody else's hands: `filePath`, which is the author's name and folder layout, and
`deviceSession`, which names MIDI hardware the recipient does not have.

**Windows walkthrough verified on 13 September 2026.** Native Share/Open Shared dialogs, an embedded
SVG background, saving an editable copy and reopening after restart passed. Inline artwork no
longer triggers a filesystem read. Invalid package shapes show a visible error, preserve the
current panel and do not open an extra tab. Tests also cover nested artwork and missing assets;
the walkthrough is not evidence for every asset format or a second computer.

## ~~A multi-channel custom component exports every channel with the FIRST channel's device binding~~ — CLOSED

*(Found and fixed 2026-09-28. `exportParameters.js` now picks each channel's wire by the binding
whose `port` is the channel's name, as the live editor does; a single public channel keeps "any
binding drives it". `exportParametersChannelBindings.test.js` pins it.)*

The bug: one device wire per control was spread onto every public channel, so two channels bound
to two synth parameters exported two host lanes that both drove the first parameter, window-closed
only. No QA sheet had a multi-channel component with bindings, so no existing export changed.

**The display half is fixed too** (same day): the Parameter Editor listed one item per control, from
its first binding. `utils/parameterStatus.js` `parameterEntries` now gives a component one item per
bound channel; the first keeps the control's id, so the GAIA panel's 277 items are unchanged, and a
further channel is `controlId::channel`. `parameterStatus.test.js` pins it.

## ~~A custom component's variants are never applied~~ — CLOSED

*(Found 2026-09-28 while building the States × sizes sheet; fixed 2026-09-29.
`customComponentVariants.test.js` and `browser-checks/variants.mjs` pin it.)*

The Variants tab defined named looks and each placed copy could pick one, but nothing that drew a
component read either: picking a variant changed the document and nothing on screen. The built-in
presets were broken too. They wrote `Parts.<name>.Transform.*`, which no part has (a part's scale
and rotation are in its `Layout`), and `Designer.width`/`height`, which do not size a placed copy.
They also fell back to guessed part names, and a patch to a path that does not exist was silently
dropped.

`resolveInteractiveControl` now applies the copy's variant before bindings and states. It is the
one path the editor canvas, preview mode and the exported plug-in's player all draw through, so
there was no C++ side to change. Patches on generator-made parts are retried after the generators
run. A variant may change only how a component looks: its parts, and the root's Background, Text,
Effects and Image. It may not change how the component behaves (hit testing reads the component's
own hit zones, so a moved hit zone would draw in one place and respond in another) or its
Transform, which belongs to whoever placed the copy. The Variants tab marks any override that is
refused or that names a path the component does not have. The presets now target real parts only,
and the Vertical preset is gone: rotating two parts about their own centres does not make a
vertical layout.

## Compiler-free plugin export

The installed exporter supports VST3, CLAP and LV2. New panels select VST3 only; CLAP is on unless
turned off and LV2 off unless turned on, as the compiling exporter reads them, and saved format
choices are retained. An LV2's identity lives in its bundle's `.ttl` files as well as in the binary,
so the exporter does not copy the template's: it puts the panel beside the copied binary and runs
`juce_lv2_helper`, which has the plug-in write them again with the panel's URI and parameters. A
template `.lv2` copied without its panel reports the template's own URI (`urn:ceditor:default`), not
nothing as a CLAP does, because the template build generates its own manifests from the bare binary.

A template VST3 carries two vendor strings. The class entry's (name, vendor, version) is filled
from the panel at load by the sidecar hook, like the CLAP's descriptor. The factory's is baked in
when the template is built (`Tedjuh`), and a JUCE-based host shows that one — CEditor's own scanner
read `Tedjuh-inc` off a template until the build default was aligned. A panel that sets its own
vendor in Export settings therefore shows it in a compiled export, in a template CLAP, and in the
class entry of a template VST3, but a host that reads the factory vendor shows the template's. The
identity a host keys on is unaffected.

A CLAP is exported as a folder — `<Name>/<Name>.clap` beside its `panel.cepanel` and device profiles
— because the CLAP folder is shared by every CLAP a user has and the panel must sit beside the
module. Install the whole folder into the CLAP folder; hosts search it recursively. A `.clap` copied
out on its own reports no plugins rather than an identity it does not have.

The installed template includes Lua/JavaScript support (TypeScript is prepared by the existing
export pipeline). It cannot bundle C++/C#/Java handlers or CPython. The compiling exporter currently
bundles these extra runtimes only for VST3. A requested unsupported combination fails explicitly
before replacing an export. A failed required handler build also fails the export.

## Keyboard shortcuts in a DAW while the exported editor has focus — scoped, not built

*(Scoped 2026-10-01 from a review of webview-in-plug-in projects; nobody has reported it yet.)*

While the plug-in's editor window has keyboard focus on Windows, every key goes to the page and
none to the DAW: Space does not start the transport, and the host's own shortcuts are dead until the
user clicks outside the editor. JUCE's WebView2 host (`juce_WebBrowserComponent_windows.cpp`)
registers only `MoveFocusRequested`, for Tab traversal, and no `AcceleratorKeyPressed` handler, and
the player (`PlayerHost.cpp`, `PluginProcessor.h`) adds no key handling of its own. A keyboard-first
panel (a text field, the scripting console) does need the keys, so this is not simply "never take
focus".

What fixing it would take, when someone reports it:

1. A vendored JUCE patch (the fifth) registering `add_AcceleratorKeyPressed` on the WebView2
   controller. For a key the page has not claimed, mark it handled and post it to the plug-in
   window's parent, which is the host's; a key the page has claimed passes through.
2. "Claimed" comes from the page: a bridge message when an editable element gains or loses focus,
   which the Svelte player can send from one `focusin`/`focusout` listener. Without it, pass
   through the transport keys (Space, Enter, the arrows when nothing editable is focused) and keep
   the rest.
3. Linux (WebKitGTK) and macOS differ: X11 hosts generally receive keys the embedded view does not
   consume, and WKWebView has its own first-responder chain. Scope each when there is a report.

The wxp project (Rust, wry) carries parent-attachment and focus patches for exactly this situation
and is the reference to diff against upstream wry when the work starts. iPlug2 does step 2 and
nothing else: its Windows webview (`IPlug/Extras/WebView/IPlugWebView_win.cpp`) puts a `keydown`
and a `keyup` listener on the page that forward the key to C++ through the bridge whenever the
active element is not a text input (`docs/design/libraries-weighed-2026-10-01.md`).

## ~~The GAIA panel's scripts, run window-closed in the plug-in~~ — CLOSED

*(Logged 2026-09-30 as panel-script behaviour; both turned out to be defects in CEditor, fixed the
same day. `exportDocument.test.js` and `PlayerScriptIntegrationTests` pin them.)*

Seen in the player log while pluginval ran the GAIA panel as a plug-in:

- **14,000 refused writes** to `recall_*.text.fill.colour` and `recall_*.core.tooltip`. Not the
  scripts: the plug-in had been built from the saved `.cepanel`, which stores each control as a
  difference from its defaults, and those two properties were at their defaults, so the plug-in
  had no such paths. The command-line exporter had the same flaw, and worse: it derived the host
  parameter list from the sparse controls, 5 parameters instead of 60 on QA-08. A saved document is
  now completed first, with the editor's own export serialisation (`tools/scripts/lib/exportDocument.mjs`).
  The refused writes went from 14,395 to none.
- **The MIDI flood guard tripping at load.** Not the script either: the guard counted every
  `set()` as a MIDI send, including a label's text and colours, which never send anything. Painting
  the preset list spent the whole budget, and a bound control set in the rest of that second lost
  its MIDI. Now only writes to bound paths count.
