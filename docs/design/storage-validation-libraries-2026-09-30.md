# Thirty-two libraries, weighed: what was taken, what it found, what was not

*Built, 2026-09-30.* The repository owner proposed 32 projects under four headings: panel files and
storage, plug-in handling, artwork and rendering, and speed and robustness. Each was judged
against a problem CEditor has today. Four were worth doing at once. A further group was worth doing
once a specific need was shown, and for four of those the need was found and they were built. The
rest were declined, each with the change that would reopen it.

The earlier survey this extends is [open-source-landscape.md](open-source-landscape.md).

## Done now

### pluginval and clap-validator — the most valuable thing on the list

`tools/scripts/validate-plugins.mjs`, documented for users in
[docs/plugin-validation.md](../plugin-validation.md). Its first run, against the GAIA panel built
as VST3, CLAP and LV2 on Linux, failed all three, and each failure was a real defect: no Linux
plug-in could link; a reloaded project never told the host to re-read its parameters; non-ASCII
choice labels converted to the first choice; the CLAP declared no main category; and the LV2 built
its script engines on the host's thread and ran them on its own. Every JavaScript call then failed
with "stack overflow", 1.1 million times in one run, and teardown raced a timer. All are fixed, and
all three formats pass.

No other test in the tree could have found any of them. The state bug passed pluginval at
strictness 10, because pluginval restores into the same instance, and only clap-validator reloads
into a fresh one. That is the argument for running both. At the owner's request, CI's Windows job
now runs both on every run, against the GAIA panel's VST3 and CLAP.

### Ajv: a format version, a migration chain, and a schema

`utils/panelFormat.js`, `utils/panelDocumentSchema.js`. A `.cepanel` now carries `formatVersion` (2),
and migrations run once each, in order, from the document's version (1 → 2 is the dotted-name
conversion that used to run on every open). A document from a newer CEditor opens with a warning
and keeps its number. The schema is checked before migrating, and a failure names the path
("controls/3: is missing \"_type\""). It is deliberately loose: unknown keys are allowed everywhere,
and a field is typed only where a wrong type is known to break a reader.

Ajv compiles the schema **at build time** (standalone mode). Neither bundle ships Ajv, and a test
fails when the committed validator is stale. JSON stays the format. The player, the exporter and the
C++ reader all read plain JSON, and nothing measured makes parsing a bottleneck.

### Dexie: recovery and the component library out of localStorage

`utils/browserDatabase.js`. localStorage's ~5 MB was already refusing the GAIA panel's recovery
snapshot. Recovery and the library now live in IndexedDB. Two details carry the design: start-up
reads the snapshot before reopening files, so a recovered edit is not replaced by the clean copy on
disk; and a small snapshot is also written synchronously on unload, because a closing WebView does
not promise to finish an IndexedDB write. The newer copy wins on restore. In the acceptance run,
21 panels (8 MB expanded) came back after a reload with nothing in localStorage.

**SQLite / SQLiteCpp** are the right tools for what comes after this: a searchable catalogue of
panels, components, assets and tags. There is no catalogue yet, and a list of dozens does not need
one. The `.cepanel` itself stays JSON either way.

### sccache in CI

The Windows build compiles about an hour of mostly unchanged JUCE, Lua and QuickJS from cold every
run. Release objects already use `/Z7`, which is what MSVC needs for sccache to cache them. The
first run fills the cache, and the job's last step prints the hit statistics.

## Done because the need was found

**Comlink**, through a font worker (`workers/fontWorker.js`). The need, measured: building a glyph
atlas is one 200–310 ms task on the page per face, and subsetting a carried font is seconds on a CJK
face. Through the worker the page has no long task (Long Tasks API, `browser-checks/fontWorker.mjs`).
Every call falls back to the page wherever a module worker cannot start. That mattered because the
app is served from a custom scheme on WebKitGTK, which was the open question: checked since, on
WebKitGTK 2.52 (`browser-checks/webkitgtk/fontWorker.py`, which serves the build over a `juce://`
scheme set up as JUCE's Linux webview sets it). The worker starts from that scheme, its atlas and
subset are identical to the page's, and the page's longest stall while an atlas builds falls from
256–615 ms to 14–17 ms. The fallback is there for a WebView that refuses, and Linux is not one.

**fast-check** rather than RapidCheck. The logic worth generating cases for is JavaScript.
`test/properties.test.js` covers the save/load round trip over random edits of every control
type, the migration, and the rotation maths. It found two things worth writing down: a newly built
control's key order differs from a loaded one's (the same content, reordered once on the first
re-save), and the deliberate "under 0.001° counts as unturned" tolerance.

**ag-psd**: File › New Panel from Photoshop Artwork (`utils/psdPanelImport.js`), on the SVG
importer's convention. A `components` layer group holds the placeholders, named or coloured by
role, and everything else is flattened into the background. The flattening first applied opacity
in normal blending only and reported the rest. It is now Photoshop's own model
(`utils/psdComposite.js`): every blend mode except Dissolve's noise, layer masks, clipping groups,
and isolated versus Pass Through groups, each checked against values worked out from Photoshop's
formulas. Layer effects, vector masks and adjustment layers have no pixels in the file, so they are
still reported by name. The old flattening skipped adjustment layers without a word.

**fflate**, not for packages but for the PNG the PSD importer writes (`utils/pngEncode.js`). A
canvas would premultiply alpha and does not exist in node, where the importer is tested.

**resvg: the need was real, and a lighter answer won.** An SVG drawn as an image cannot see the
page's fonts. Measured: artwork text in Allerta Stencil drew in the fallback serif, with the font
loaded. resvg would fix that by rendering to pixels, which throws the vector away, and a panel
background scales with the plug-in window. An SVG image may carry its own fonts as `data:` URLs, so
`utils/svgArtworkFonts.js` embeds each face the artwork's text names, subset to the characters it
uses, and the SVG stays vector. A font nothing can supply is reported, with the fix.

## Declined, and what would change that

| Project | Why not now | What reopens it |
| --- | --- | --- |
| lottie-web | A new feature, not a fix: value-driven animated indicators. Nobody has asked, and it adds weight to every export that uses it. | A panel artist with After Effects indicators. It would be a lazily loaded part whose frame follows the value. |
| cpptrace | Windows worker crashes already produce minidumps with exact symbol retention, go into the support bundle, and are symbolised offline (`resolve-worker-symbols.mjs`). Off Windows there is no live plug-in worker to crash. | Plug-in workers on macOS or Linux. |
| Tracy | A profiler for a native stall, and none is waiting to be profiled. | One is. Tracy is a development build option then, never a shipped dependency. |
| Clipper2, Earcut | Paper.js already does unions, subtraction and insets on real curves. Clipper2 flattens curves to polygons, and Earcut only serves a GPU renderer that does not exist. | A GPU renderer. |
| simdjson, FlatBuffers | Panels are parsed by JavaScript in the WebView, and the C++ side reads a parameter list. Nothing measured shows parsing as a cost. | A profile that says otherwise. |
| libzip, Zstandard | `juce::ZipFile` builds the support bundle already. Zstandard only pays off beside a revision store. | A revision store. |
| PixiJS, ThorVG | The editor and the player share one web renderer, which is a strength. A WebGL region or a native renderer would split it. ThorVG deserves an experiment only if a native renderer becomes necessary. | A renderer the web one cannot be. |
| Taskflow, readerwriterqueue | JUCE's thread pool, the worker processes and `AbstractFifo` already cover this. | — |
| clap-helpers, clap-wrapper, WIL | CLAP comes from JUCE plus clap-juce-extensions. Nothing is written against COM by hand at a scale WIL would help. | Hand-written CLAP or COM code. |
| VST3 SDK, clap-host, Element, uapmd | Reading, not dependencies. Element is GPL, so it is read, not copied. | CLAP hosting in the instrument host. |
