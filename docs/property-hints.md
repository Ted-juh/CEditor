# Panel text style

Rules for user-facing strings in the properties panel and the editor chrome:
`hint="…"` on a `PropertyCell`, `title="…"` tooltips, and any `.note` /
`.dock-note` text that sits in the panel body.

The shared rule: **say what the control does.** Not why it was built that way,
not which option is better, not how it compares to another component. Design
rationale belongs in `docs/`, not in a tooltip.

---

## Hints (`hint="…"`)

Rendered in the panel's Info bar on hover.

**1. Say what it does, in one sentence.**
A second sentence is allowed only when it carries a *distinct fact* — a unit, a
range, a default, or an edge case that will bite. Never a third.

**2. Stay under 120 characters.**
Option lists that must name every choice may run to 160. Nothing goes past that.

**3. Name options as `Option = meaning`.**
Never say which option is better.

> `Momentary = held while pressed. One-shot = a short fixed gate. Toggle = on until you hit the pad again.`

**4. No rationale.**
If you catch yourself writing *because*, *on purpose*, *by design*, *otherwise*,
*rather than*, *the point of*, or *the whole reason* — cut the clause. A default
that needs defending in a tooltip is either the wrong default or a `docs/` topic.

**5. No verdicts.**
Cut *the best of the three*, *which is almost always what you want*, *the textbook
rule*, *the right default*, *sounds like a fault*. The user decides.

**6. No caps for emphasis.**
`MUST`, `NOT`, `THIS`, `BARS`, `REAL` all read as shouting in an 11px grey bar.
Acronyms only — MIDI, CC, DAW, AARRGGBB.

**7. No scene-setting and no cross-selling.**
Not *what you want when the band is playing*, not *the Phrase Sequencer is better
at it*. Describe the control in front of the user.

**8. Body prose gets one line or gets deleted.**
A `<PropertyCell label="" span={4}>` holding a paragraph is documentation that
escaped into the UI. If the fact matters, fold it into the relevant control's
hint; if it needs a paragraph, it needs `docs/`.

### Why the ceiling exists

The Info bar (`PropertiesPanel.svelte`) is a fixed 80px box with `overflow:
hidden` and no scrollbar — roughly three lines, and about half that width when
panel properties are pinned in split view. Text past the ceiling is silently
clipped, and `PropertyCell` sets no `title` fallback, so a clipped hint is gone.

---

## Tooltips (`title="…"`)

A native tooltip appears after a delay, on its own, over the thing you were
looking at. It **names** — it does not explain.

**1. Name the thing or the action.**
A button gets its action (`Move up`). A section header gets the section name
(`Zone Splitter`). An input gets what the value is (`Padding left`).

**2. Under 60 characters, one fragment.**
The median tooltip in this codebase is 12 characters. That is the target, not
the floor.

**3. No sentences and no trailing period.**
`Browse...` keeps its ellipsis — that is the "opens a dialog" convention, not
punctuation.

**4. Anything that needs a sentence is a hint, not a tooltip.**
If the control lives in a `PropertyCell`, move the text to `hint` and follow the
hint rules above. If it has no cell and still needs a paragraph, it needs `docs/`.

**5. Rules 4–7 from the hints section apply unchanged.**
No rationale, no verdicts, no caps for emphasis, no cross-selling. A tooltip has
even less room to get away with it.

**6. Don't repeat visible text.**
If the button already says "Delete", the tooltip adds nothing.

**7. Never point at an internal doc.**
`(see native-handlers-design.md)` is a note to a maintainer, not to a user.

### Capitalisation

Two conventions coexist, and both are correct in their place:

- **Editor chrome** — the alignment, zoom and panel-toggle toolbars — uses Title
  Case commands: `Align Left Edges`, `Bring Forward`, `Zoom In`, `Toggle Rulers`.
- **Everything inside the properties panel** uses sentence case: `Copy to
  clipboard`, `Clear console`, `Padding left`.

A UI feature's proper name keeps its capitals in either context — `Device
Bindings`, `Public API`, `Zone Splitter`, `State Studio`. Keep a file internally
consistent.

---

## Section titles and labels

`PropertySection title="…"` and `PropertyCell label="…"`. Both render in
uppercase, so **source capitalisation is cosmetic** — match the file you are
editing and do not churn it.

Length is not the problem on this surface — the median label is 6 characters and
the median section title is 9. These rules are about naming.

**1. Name what the section holds, not what it is for.**
`Channels`, not `Channel Rig`. `States`, not `State Studio` or `Preview
Workbench`. `Counts`, not `Performance Budget`. A metaphor in a header makes the
user learn a word before they can find anything.

**2. One concept, one name.**
The same thing was called `Public Surface`, `External Contract` and `Public API`
in three sibling editors. When the in-app glossary
(`sections/SurfaceHelpOverlay.svelte`) has a term for it, that term wins.

**3. No parenthetical explanation in a title.**
`Sources`, not `Sources (rows)`. `Zones`, not `Zones (thresholds)`. If the
distinction matters, it goes in the first cell's hint. The exception is a
parenthetical that *disambiguates two sections visible at once* —
`Channels (flat list)` sits below the guided channel editor and has to.

**4. Units in a label are good.**
`Loop (bars)`, `Hold (ms)`, `Cycle (bars)`. That is naming, not explaining.

**5. Don't say it four times.**
A header, a label, a hint and an empty-state line that all state the same fact
is one fact. Pick the one place it belongs.

### Spelling

**British.** The hints use `colour` 94 times and `color` zero times, so that is
the house spelling; the labels that had drifted to `Color` were the outliers.
Same for `centre`.

Two exceptions:

- **`Behavior`** is system vocabulary — it names a module, a file, an editor and
  a glossary entry. It keeps its spelling.
- **Alignment commands** keep `center`, matching the CSS values they map to and
  the `Center X` / `Align center` command family: `Align center`, `Center
  content horizontally`, `Align horizontal center`.

---

## Buttons and empty states

Unlike labels, **button text renders exactly as authored** — casing here is
visible, so it has to be consistent.

### Buttons

**1. A verb and its object. Nothing else.**
`Auto-arrange`, not `Auto-arrange by similarity`. `+ Add parameter`, not
`+ Add parameter to this dump`. The section the button sits in already supplies
the context; the hint supplies the detail.

**2. Sentence case.**
`Add zone`, `Clear part overrides`, `Reset channels`. The one exception is the
**top-level chrome** — the canvas context menu, the workspace picker and the tab
bar — which are Title Case menu commands: `Bring to Front`, `New Custom
Component`, `Import Device Profile`.

A proper name keeps its capitals wherever it appears: `Open Component Designer`,
`Back to Notepad`, `Edit in Publish`, `Build VST3`, `Download PNG`.

**3. One ellipsis, spelt one way.**
`&hellip;` for a button that opens a dialog. Not `...`, not a bare `…`.

**4. One plus sign.**
ASCII `+`. A fullwidth `＋` had crept in.

**5. Don't invent adjectives.**
`probeable`, `semantic parts` — if a word only exists inside this codebase, it
does not belong on a button.

### Empty states

The pattern the codebase already uses in a dozen places, and the one to copy:

> **No <things> yet. <What to do>.**
> `No members yet. Add one, then bind its port.`

**1. Two short sentences. What is missing, then the one action that fixes it.**

**2. Under 80 characters.**

**3. Don't say it three times.**
An eyebrow, a heading and a sentence that all mean "nothing here" is one
message. A loading state needs no paragraph at all.

**4. No markdown.**
Backticks render as literal `` ` `` characters in the UI. Write the path or the
extension plainly.

---

## Console output and error messages

**Every `console.log` / `.warn` / `.error` in this app is user-facing.**
`stores/console.js` replaces the native console methods and pushes each call into
the Console panel, alongside `debugLog` messages from the C++ side. There is no
such thing as a devtools-only log here — write them for a panel author.

**1. Say what went wrong, then what to do.**
This is the one surface where telling the user what to do is the message's job.
Two sentences at most.

> `Google could not find that family. Use the font name as listed on Google Fonts.`

**2. Errors and warnings are sentences. Confirmations are not.**
An error starts with a capital and ends with a full stop: `Image import expects
an image file.` A confirmation is a fragment and takes no stop: `Package JSON
copied`, `Selected package downloaded`.

**3. Console messages carry a `[module]` prefix.**
Lowercase-first, matching the module: `[bridge]`, `[panels]`, `[appSettings]`,
`[perf]`, `[fonts]`. Same prefix on every message from that module, including the
"off"/"disabled" half of a pair.

**4. No "please".**
`Try again in a moment.` not `Please try again.`

**5. Straight quotes, no markdown.**
Curly quotes and backticks both render literally.

**6. No internal vocabulary.**
`stamping version 4 without changes` and `no migration step registered` describe
the implementation. The user needs the outcome: `Marking it as version 4,
unchanged.`

---

## Before / after

| Before | After |
|---|---|
| Milliseconds to slide the panel values across on a recall. 0 snaps, which is what a scene change usually means — a fade is for when a hard jump is worse than a slow one. Only numbers are interpolated; anything else switches at the halfway point, because there is no value between 'sine' and 'square'. | Milliseconds to slide panel values on a recall; 0 snaps. Only numbers interpolate; the rest switch at halfway. |
| All 16 channels is the right default: a stuck note is by definition one you have lost track of, so narrowing the search is the wrong instinct. | Which MIDI channels the panic covers. All 16 is the default. |
| Clock the sequence off the panel's Transport. A shift register that lands its mutations on the beat sounds composed; the same register free-running sounds like a fault. | Clock the sequence off the panel's Transport. |
| *(tooltip)* Hide the raw graph editors (Channels, Behaviors, Hit Zones, Bindings, Links, Variants). Nothing is removed — Advanced brings them back. | Hide the raw graph editors |
| *(tooltip)* A pitch bend carries no note, so who hears it is a rule rather than a fact | Which zones receive pitch bend |
| *(section)* Performance Budget | Counts |
| *(section)* Hit-Zone Probe | Hit Zones |
| *(section)* Destinations (columns) | Destinations |
| *(button)* Regenerate Semantic Parts | Regenerate parts |
| *(warning)* No migration step registered for plan version 3; stamping version 4 without changes. | No migration step for plan version 3. Marking it as version 4, unchanged. |
| *(empty)* Nothing is interactive yet. Use “+ Make Interactive” (or draw with the surface's Interactive tool) to scaffold a wired control — value, behavior, and grab area in one step. | Nothing is interactive yet. Use + Make interactive to wire one up. |

---

## Checking a change

```bash
cd CE/web/src

# tooltips ending in a sentence (Browse... is the allowed exception)
grep -rnoP 'title="[^"{}]*[a-z]\."' --include=*.svelte .

# caps used for emphasis, and rationale words, in either surface
grep -rn '\(hint\|title\)="[^"]*\b\(MUST\|NOT\|THIS\|BARS\|REAL\|LAST\|SHAPE\|STEP\)\b' --include=*.svelte .
grep -rn '\(hint\|title\)="[^"]*\(because\|on purpose\|by design\|rather than\|the point of\)' --include=*.svelte .
```

Length has to be counted in characters, not bytes — an em-dash is three bytes,
so `grep` overcounts:

```bash
cd CE/web/src && python3 - <<'EOF'
import re, glob
for f in sorted(glob.glob('**/*.svelte', recursive=True)):
    for i, line in enumerate(open(f, encoding='utf-8'), 1):
        for attr, cap in (('hint', 120), ('title', 60)):
            for m in re.finditer(r'%s="([^"{}]+)"' % attr, line):
                t = m.group(1)
                if attr == 'hint' and t.count(' = ') >= 2:
                    cap = 160          # option list
                if len(t) > cap:
                    print('%s:%d [%d] %s' % (f, i, len(t), t))
EOF
```
