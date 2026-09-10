# The API tab

Status: **built**, 2026-09-10. The properties panel is untouched — see [What was built](#what-was-built).

Candidate 5 from [`display-panel-candidates.md`](display-panel-candidates.md), after
[Effects](effects-tab-design.md), [Typography](typography-tab-design.md),
[Assets](assets-tab-design.md) and [Screen](screen-tab-design.md). Drawn in
[`api-tab-mockups.html`](api-tab-mockups.html).

## Scope, measured — and the measurement is the argument

Both publish editors were mounted in Chromium and every section read with
`getBoundingClientRect()`, at two contract sizes.

| Section | 5 in · 3 out · 6 props | 20 in · 12 out · 18 props |
|---|---:|---:|
| **Author** — `CustomPublishedPropertiesEditor` | | |
| Public API | 123px | 123px |
| API Preview | 782px | 1,205px |
| Published Inputs | 198px | **198px** |
| Published Outputs | 198px | **198px** |
| Editable Properties | 256px | **256px** |
| **Consumer** — `CustomPublicPropertiesEditor` | | |
| Published Inputs | 266px | 971px |
| Editable Properties | 331px | 931px |
| everything else | 263px | 301px |
| **total** | **2,417px** | **4,183px** |

Read the three bold numbers. Fifty published entries render the editing sections in exactly the
same height as eight, because **their height does not depend on the contract**. They show one entry
at a time, chosen from a `<select>`, three times over.

So this is not the usual "the panel is too tall" case. It is the opposite and worse: the surface
that *defines* what a component exposes cannot show you what it exposes, while the surface that
*consumes* it lists everything and grows to 2,203px doing so.

## Three findings

### 1. The contract is a table, edited one row at a time

To answer "what does this component publish?" in the author's editor you pick a name from a
dropdown, read eight fields, pick the next name, and remember what you saw — for inputs, then
outputs, then editable properties.

The list already exists twelve pixels away. `API Preview` draws every enabled entry in three
read-only lanes, 782px of them at eight entries. **The tab is that list, made the thing you edit.**

### 2. "Will a consumer see this?" has three answers, and they disagree

The one worth building for, and it was measured rather than reasoned about. For an editable
property with path `Parts.background.Background.Fill.nonsenseKey` on a component that really does
have a `background` part:

| Asked | Answer |
|---|---|
| `customComponentPackage.editablePropertyPathIssue` | **no issue** — it validates the FIRST segment and passes everything after it |
| `CustomPublishedPropertiesEditor` (the author) | **fine** — it tests only for an empty string |
| `CustomPublicPropertiesEditor` (the consumer) | **filtered out** — `valueAtPath` returns undefined, and the row silently vanishes from the instance's panel |

The author is the only person who can fix it and the only one not told. The tab gives the author
the consumer's answer, because that is the one that decides whether the entry exists.

### 3. The shipped default contract contains an entry no consumer can see

`createCustomComponentPublishedPropertiesDefaults` publishes three inputs, and the third is:

```js
accentColour: { variable: 'accentColour', label: 'Accent Colour', type: 'color', enabled: true },
```

`variable`, not `channel`. Nothing in the application reads it — the consumer view tests
`entry.channel` only, package validation never mentions it, and the sole other reference is a focus
helper in the author's editor. So **every custom component made from that factory ships with a
published input the instance panel silently refuses to show**, and nothing anywhere says so.

Not fixed here, deliberately: changing a shipped default changes existing panels. The tab reports
it, names the channel that would replace it when one exists, and the repair is one click.

## Layout

```
  THE CONTRACT                                                    THE ENTRY
  ~700px                                                          ~272px

  DIR  NAME          TYPE    TARGET             RANGE   DEF   ON   ⚠ never reaches a consumer
  →    accentColour  color   mainValue            —      —    ●     targets variable "mainValue"
  →    gain          float   mainValue          0 … 1   0.5   ●     [ target the channel instead ]
  →    ghost         float   noSuchChannel        —      —    ●   ─────────
  →    muted         float   noSuchChannel        —      —    ○   Name   accentColour
  ←    level         float   mainValue            —      —    ●   Label  Accent Colour
  ·    bogus         color   Parts.…nonsenseKey   —      —    ●   Type   color
  ·    caption       text    Parts.label.…      INIT          ●   Publish  No | Yes
```

Sortable by every column. A row a consumer will never see is amber **on the row**, because the row
is where it gets fixed. The dot publishes and withholds without leaving the table.

## The three things worth calling innovative

1. **The consumer's answer, given to the author.** One modulo's worth of work in each case, and the
   application already had every piece of it in the wrong place.
2. **Package warnings on their row.** `validateCustomComponentPackage` already produces them and the
   panel already shows them — as a flat list of sentences you match to a row by reading a quoted
   name out of the prose. Same messages, attached to the row they are about. Imported, not
   reimplemented.
3. **One table for three maps.** Inputs, outputs and editable properties are one contract and are
   read as one, which no surface in the application has ever shown.

## No sliders

Same rule as the other four. `NumberCell` for numbers, `Segmented` up to four options,
`PropertySelect` beyond, and the table for choosing.

## What was built

| Piece | File |
|---|---|
| The model — the contract as rows, the consumer's answer, sorting, validation attachment | `utils/publicApiModel.js` |
| The tab | `components/ApiTab.svelte` |
| Columns | `components/api/ContractTable · EntrySettings` |
| Registration | `stores/editorTarget.js`, `panels/DisplayPanel.svelte`, `utils/displayDock.js` |
| Tests | `test/publicApiModel.test.js` (27), `browser-checks/apiTab.mjs` (19) |

**The properties panel is untouched.** Both publish editors still draw every section and still edit
every field. Nothing is relocated, so the 4,183px is not yet recovered; `allApiFieldLabels()` is in
place for when it is.

### What the building turned up

- **Applying the repair has to clear the field it replaces.** Writing `channel` and leaving
  `variable` beside it would leave the stale spelling in the data for the next reader to trust. The
  fix writes both.
- **The tab strip had run out of distinct icons.** `Share2` is Routes' and `Cable` is Device's; a
  strip where two tabs wear the same icon is a strip you cannot scan. `Braces` was free and reads
  as a contract.
- **A disabled entry is not a broken one.** The first draft flagged any unresolvable target; a
  withheld entry is switched off on purpose and saying it "never reaches a consumer" is true and
  useless. The check returns null for it.

## Still open

1. **Nothing is relocated yet**, and the panel needs its search index extended before anything is.
2. **Adding and removing entries are built here now** (2026-09-10, step 3 of the panel cleanup).
   `newEntryShape` is one definition of what a new entry is, so the panel's three Add functions and
   this one make the same thing — and unlike theirs, a duplicate name is suffixed rather than
   silently doing nothing.
3. **The `variable` spelling is reported, not repaired at the source.** The shipped default still
   produces it. Changing that default changes what every new component gets, which is the owner's
   call rather than a side effect of this tab.

## Notes

- 2026-09-10: Written and built together; the findings were measured against the shipped validator
  before the document was written.
