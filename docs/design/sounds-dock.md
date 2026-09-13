# Sounds in the Hostage dock

Sounds is the initial tab in Hostage's rack dock, replacing its utility drawer. It uses the
existing focused part, resize grip and per-tab height persistence. The target selector includes
the part number so two instances of the same plug-in are distinguishable. Expand temporarily
gives the dock more space while retaining part of the rack; restore returns to the saved height.

While Sounds is open, rack parts use compact rows. Volume, mute, solo and the plug-in editor
remain available alongside all other part controls, without an ellipsis menu. The Plug-ins button
reveals the catalogue beside the rack. Other dock tabs retain the normal rack layout.

The default preset view is a 32 px list; comfortable spacing uses 42 px. A bounded row window
keeps large libraries inexpensive to render. Search, type, plug-in and favourite filters are
in one toolbar. Details and advanced filters open explicitly. Filters also holds saved searches,
collections, grid/map views, spacing, controller browsing and the on-load audition recipe.
Details retains versions, substitutes and the focused part's morph, including when a search
has no matches. Save preset/patch, Save chain and Save rack are directly available beside the
destination. Comparison and preview controls stay with the Sounds results. Details and
spacing preferences survive remounting; search restores the native library's current query.

Library is a maintenance panel: plug-in scanning, preset folders, manual updates and their
results, analysis and duplicate groups. The top Library button and the dock's Manage library
button open the same panel. On Rack it occupies a column above the dock, leaving Sounds
uncovered; narrow windows stack the panel in the rack region. Other workspaces use the existing
utility drawer. Opening management reads the current library query without resetting the
Sounds search, selected record or scroll. Selecting a duplicate group shows it in Sounds.

Selection does not load a preset. Double-click or Enter loads the selection; arrow keys, Home
and End move selection and scroll it into view. One footer owns Load/Add, displays the target,
and offers audition on load. Effect presets send the target part with both actions: Load reuses
or creates the matching insert, Add insert creates another. Racks restore through their existing
command. Standalone preview is disabled for effects because they require an audio source.

Opening Sounds requests the saved library without scanning or instantiating plug-ins. Update
library is the manual refresh action; saved records remain visible while it runs, and the
native merge preserves favourites, tags and notes. Counts distinguish the visible selection
from all saved records. Update results break down usable preset files, named programs and
unavailable records per plug-in, with generic Zebra3 MIDI slots excluded. Issues open expanded
in Library, and an empty catalogue has an explicit explanation.

The preset load bar reports loading, loaded or failed for its selected record. Native load
results are emitted through instrumentHostLibraryLoad; a later selection invalidates earlier
callbacks so a slow old worker cannot overwrite the latest result. A failed load remains
retryable, and selecting another sound leaves the previous result with its own record.

Validation (from `CE/web`, no application build required):

```sh
node --import ./test/support/register-svelte.mjs --test test/soundBrowserLayout.test.js test/hostDockSizing.test.js test/hostNavigation.test.js test/instrumentHost.test.js test/hostProductBuild.test.js
node browser-checks/sounds.mjs
```

The browser harness runs a Vite development server and captures bridge commands without
starting plug-ins or accessing the user's library. `CHROMIUM_PATH` can override its browser;
`SOUNDS_TEST_PORT` overrides port 18764. It checks a library of 7,855 records, selection and
filtering, target and effect commands, details, compact rack controls, expansion, collapse,
spacing and width changes, saved-library access without scanning, manual update feedback,
and loading/failure/retry feedback. It also checks management placement, search preservation,
direct save controls, comparison commands, audition settings, confirmed folder removal and
morph access with an empty result set.
