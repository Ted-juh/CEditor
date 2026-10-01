# Five tools run over the tree: a linter that found three bugs, and four that found their answer

> Status: **review, 2026-10-01, with the linter adopted the same day.** The fourth pass of the kind
> [`libraries-weighed-2026-10-01.md`](libraries-weighed-2026-10-01.md) made. Five candidates this
> time, each one run against the real tree rather than described, with the numbers written down.
> One is now a dependency (`eslint`, `npm run lint`), because its first run found three
> `ReferenceError`s that had been reachable from the UI for months. The other four are measured
> and declined or deferred, with the figure that decided each.

## How these were chosen

The previous passes asked which gaps the program has that somebody has already answered. This one
asked a narrower question: which tools would tell us something about the tree that nobody here has
looked at? Four kinds of looking were missing. Nothing lints the 846 JavaScript and Svelte files
(`.prettierrc.json` exists; Prettier is not installed and nothing runs it). Nothing has ever checked
the inspector's 1,340 cells for accessibility. The undo-history record
([`undo-history-measurement-2026-09-29.md`](undo-history-measurement-2026-09-29.md)) named Immer as
"the route" for the edit paths it did not fix, and no one had measured it. And the panel scripts
in seven languages have formatters for two of them (Lua and Python) that run in a browser.

## Adopted: ESLint, correctness rules only

`eslint` 10.11.0 (MIT), `@eslint/js`, `eslint-plugin-svelte` 3.23.0 (MIT), `globals`. Development
only; 91 packages into `node_modules`, nothing into the bundle.

### The first run

`js.configs.recommended` plus `svelte.configs['flat/recommended']`, over `CE/web/src`:

| | Count |
| --- | --- |
| Files | 846 |
| Files with a finding | 210 |
| Findings | 826 |

By rule, the whole list:

| Rule | Count | What it is |
| --- | --- | --- |
| `svelte/require-each-key` | 380 | An `{#each}` without a key. Style, mostly: the lists in question are rebuilt whole. |
| `no-unused-vars` | 264 | 186 declared and never used, 78 assigned and never read. |
| `svelte/prefer-svelte-reactivity` | 83 | A plain `Map`, `Set` or `Date` in `$state`. |
| `no-useless-assignment` | 38 | A value assigned and overwritten before it is read. |
| **`no-undef`** | **21** | **A name that is not defined anywhere. See below.** |
| `svelte/no-unused-svelte-ignore` | 13 | |
| `svelte/no-useless-children-snippet` | 6 | |
| `no-useless-escape` | 4 | |
| `svelte/no-at-html-tags` | 3 | Each renders text the app produced itself (help, code editor, line-type glyphs). |
| **`no-dupe-keys`** | **3** | **A key given twice in one literal. See below.** |
| parse errors | 3 | Two TypeScript components; one parser limitation, below. |
| `svelte/prefer-writable-derived` | 2 | |
| `svelte/no-dom-manipulating` | 2 | The notepad's `contenteditable`. |
| `svelte/no-useless-mustaches`, `no-control-regex`, `preserve-caught-error`, `no-irregular-whitespace` | 1 each | |

### What `no-undef` found

Six of the 21 were globals the configuration did not know (`URLSearchParams`, `WorkerGlobalScope`,
`ImageDecoder`, Vite's `__APP_BUILD__`). The other **fifteen are three missing imports**, every one
of them a `ReferenceError` the first time a user reached the line:

| Where | Name | What happens |
| --- | --- | --- |
| `stores/alignment.js`, 10 uses | `updateControlProperty` | **Snap to Grid** and **Snap to Guides** in the alignment panel throw with a selection present. Every other button in that panel works, because the twenty-five other operations go through `applyControlPatchesById`, which is imported. |
| `stores/controls.js`, 3 uses | `SECTION_DEFAULTS` | `addSection` and `addSections` throw. `controlTreeUtils.js` and `documentShape.js` import the same constant, so the name was familiar enough that nobody noticed it was not in scope here. |
| `stores/appSettings.js`, 2 uses | `inferFontMimeTypeFromFileName` | A locally imported font whose stored entry carries no `fileFormat` throws on load (`loadLocalFontFace`) and when its data is cached. `appSettingsImportBuilders.js` imports the same function from `appSettingsSchema.js`. |

Reproduced from Node before fixing: `snapSelectionToGrid()` with one selected control on a
`gridSize: 10` panel, `ReferenceError: updateControlProperty is not defined`; `addSection(id,
'Grid')`, `ReferenceError: SECTION_DEFAULTS is not defined`. The fix is the import in each case.
`test/lintFoundReferences.test.js` reaches the two it can from Node and fails without the fix; the
font path needs the bridge to hand over a file and is covered by the lint rule alone.

How three functions on buttons stayed broken: none had a test that reached the line, the three
modules each import the *neighbours* of the missing name so a reader sees a familiar import block,
and a `ReferenceError` inside a click handler in a WebView2 is a console line nobody is watching.
A `no-undef` run takes under a minute and would have caught each one the day it was written. That is
the whole case for the tool.

### What `no-dupe-keys` found

Three literals that name a key twice: `profileId` in `instrumentHost.js` (identical expressions),
`id` in `scriptWorkspace.js` and `_type` in `panelLayers.js` (both the spread-then-override
pattern). The first key looked dead, since the one after the spread wins, and removing it failed
twelve tests: a duplicate key keeps the *position* of its first occurrence and the *value* of its
last, so the first `_type` is what puts it at the top of every layer in every committed panel, and
the panels are compared as text against their generators. All three stay, each with the rule
disabled on that line and the reason beside it. A finding the tool is right about and the code is
right about too; the comment is what was missing.

### The parse errors

`scrub/JuceScrub.svelte` and `scrub/ScrubControl.svelte` are TypeScript inside Svelte; the
configuration ignores them by name rather than add `@typescript-eslint/parser` for two files.
`editor/MeterRenderer.svelte` failed on `{@const pa = (meterArcAngle(...))}`: the parser's
generated script does not survive a parenthesised initializer in an `{@const}`. Found by bisection
(the style-attribute template literals were the obvious suspect and were not it). The parentheses
were redundant and are gone.

### What is configured, and why not more

`eslint.config.js` in `CE/web` keeps the recommended sets and switches off every rule above whose
finding is an opinion rather than a defect, each with its count on the day, so whoever turns one on
knows the size of the job. What remains is the set where every finding is a bug: undefined names,
duplicate keys, unreachable code, assignment to a constant, a `case` given twice, and the Svelte
plugin's checks on store and reactivity misuse. **The tree is clean under that configuration.**

Not in CI. `npm run lint` runs in 52 seconds here and would sit between `npm ci` and
`npm test` in `ci.yml`; adding it is the owner's call under CLAUDE.md's rule on widening CI. The
recommendation is to add it, because the three bugs above are exactly the kind a green test suite
does not see.

`svelte/require-each-key` at 380 is the one disabled rule worth a second look. Svelte 5 reconciles
an unkeyed `{#each}` by index, which is right for a list rebuilt whole and wrong for one whose
items move while holding state (an input mid-edit, a focused row). The 380 would need reading one
at a time; a sample of twelve spread across the list (colour bands, glyphs, measure segments,
settings sections, option lists, font lists) held no per-item state, so index reconciliation is
correct for each of them.

## Measured and declined

### axe-core — the inspector is not labelled, and it is one component

`axe-core` 4.13.0 and `@axe-core/playwright` 4.13.0, MPL-2.0, development only.

Run over the 27 fixture pages the browser checks build (`dist-scenery/*.html`), each mounted and
settled for 2.5 s, with the `wcag2a`, `wcag2aa` and `best-practice` tag sets:

| Impact | Findings |
| --- | --- |
| critical | 72 |
| serious | 236 |
| moderate | 494 |
| minor | 7 |

| Rule | Findings | Where it points |
| --- | --- | --- |
| `region` | 441 | The fixture pages have no landmarks. The harness, not the app. |
| `color-contrast` | 182 | Below. |
| `select-name` | 53 | A `<select>` with no accessible name. |
| `page-has-heading-one`, `html-has-lang`, `landmark-one-main` | 79 | Fixture pages again. |
| `nested-interactive` | 22 | A `role="option"` row containing a focusable control. |
| `label` | 16 | An `<input>` or `<textarea>` with no label. |
| `aria-allowed-role`, `label-title-only`, `aria-required-children` | 16 | |

Three findings are real and each has one home:

1. **The 69 unlabelled fields are one component.** `properties/PropertyCell.svelte` renders
   `<span class="property-label">` beside a well, and the field inside the well is not associated
   with it: no `<label for>`, no `aria-labelledby`. Every `<select class="val">` and
   `<input class="val">` in the 1,340 cells reads to a screen reader as an unnamed control. The
   fix is in that one file (an id on the span, `aria-labelledby` on the first form control in the
   well), not in 1,340 places. `NumberCell` already carries its own label.
2. **The contrast findings are two tokens.** `#777777` on `#1e1e1e` (3.72:1; disabled labels,
   hints) and `#616c75` on `#15181b` (3.31:1; the animation tab's secondary text, written this
   week). AA asks 4.5:1 for text this size. `.property-label` on a disabled cell is `#292929` on
   `#1e1e1e`, 1.14:1, which is invisible rather than low-contrast and is presumably the intent.
3. **The 22 nested-interactive rows are the two lists in the Animation tab** (`AnimationList`,
   `TargetList`): a `role="option"` row that also holds an On/Off toggle. The row should be the
   option and the toggle should be outside it, or the row a `listitem` with the name on a button.

Declined as a dependency: axe is a measurement, and these three measurements are now written down
here. Running it in CI would re-report the fixture harness's 520 landmark findings every time until
the harness grows a `<main>`, which is work on the harness for the benefit of the tool. When the
three fixes above are made, one run of this script confirms them; the script is in the session's
notes, and is forty lines over Playwright's `chromium` with a static server.

### Immer — the measurement the undo record asked for

`immer` 11.1.18, MIT, 12.3 KB gzipped if it shipped (`dist/immer.mjs`).

The undo record fixed the hot paths with `setNestedValueShared` and left the fourteen
`mutatePanelControlsInList` callers that still `deepClone` each control they touch, saying Immer
"remains the route if they ever need the same treatment". Measured on the GAIA panel (27.6 MB, six
top-level controls, one container of 6.5 MB), Node 22, against `deepClone` of the control:

| Edit | `deepClone` | `produce` | Retained after 50 steps |
| --- | --- | --- | --- |
| nudge one field on the container | 61.6 ms | 0.11 ms | 338 MB against under 1 MB |
| select all, nudge | 283 ms | 0.11 ms | |

Structural sharing confirmed: after `produce`, every untouched child is `===` its original.

So the record's expectation holds and the figures are large. The verdict is still **not now**, for
the reason the record gave: the paths that repeat per frame or per selection are already fixed by
the shared-spine write, and the fourteen remaining callers each touch one control from a menu or a
field. The 183 `deepClone` call sites across 59 files are the real size of the job, and most are
not in the edit path at all (defaults, templates, export). When one of the fourteen is found on a
hot path, this is the number to bring, and `produce` drops in at `mutatePanelControlsInList`
without touching the mutators, which is what makes it the route.

### StyLua and ruff — formatters for scripts in languages the panels do not use

`@johnnymorganz/stylua` 2.5.2 (MPL-2.0, 3.2 MB of WebAssembly) and `@astral-sh/ruff-wasm-web`
0.16.10 (MIT, 11 MB). Both load in Node and both run in a browser; the question was whether the
script editor should offer *Format* for Lua and Python.

Then the corpus was counted. The GAIA panel's 232 scripts are all JavaScript. No panel in
`CE/panels` has a Lua or a Python script. The only Lua in the tree is the seven CTRL49
device-side scripts in `tools/ctrl49` (1,089 lines, written for the controller's firmware, not for
CEditor), and the only Python the two asset generators beside them and one WebKitGTK check. On
those, for the record: StyLua's default (tabs) rewrites every line; with two-space indentation to
match the files it still touches most of them. ruff reports nine findings over the three Python
files (five `SIM115` open-without-context-manager, two `UP031`, one import order, one `re.S`
alias) and its formatter rewrites 419 lines of 310 in `fontWorker.py`. None of it is product
code.

**Declined**, at 14 MB of WebAssembly for a corpus of zero. Named here so the next person who
thinks of it sees the count first. If panel authors start writing Lua, StyLua is the right answer
and runs in the WebView without a toolchain; the editor's Lua is `CE/src/Scripting`'s Lua 5.4 and
StyLua formats 5.4 syntax.

## Changes made under this review

- `stores/alignment.js`, `stores/controls.js`, `stores/appSettings.js`: the three imports.
- `stores/instrumentHost.js`, `stores/scriptWorkspace.js`, `utils/panelLayers.js`: the three
  duplicate keys kept, with the rule disabled in place and the key-order reason written down.
- `editor/MeterRenderer.svelte`: redundant parentheses in one `{@const}`.
- `eslint.config.js`, `npm run lint`, four development dependencies.
- `test/lintFoundReferences.test.js`.
- `docs/known-issues.md`: the Prettier entry corrected (`.prettierrc.json` has existed since
  2026-09-22; the tool still is not a dependency) and the linter noted beside it.
