# Property hint style

Rules for every user-facing string in the properties panel: `hint="…"` on a
`PropertyCell`, `title="…"` tooltips, and any `.note` / `.dock-note` text that sits
in the panel body.

A hint tells you **what the control does**. It is not the place to argue for the
design, compare components, or teach music theory. That belongs in `docs/`.

## The rules

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

## Why the ceiling exists

The Info bar (`PropertiesPanel.svelte`) is a fixed 80px box with `overflow:
hidden` and no scrollbar — roughly three lines, and about half that width when
panel properties are pinned in split view. Text past the ceiling is silently
clipped, and `PropertyCell` sets no `title` fallback, so a clipped hint is gone.

## Before / after

| Before | After |
|---|---|
| Milliseconds to slide the panel values across on a recall. 0 snaps, which is what a scene change usually means — a fade is for when a hard jump is worse than a slow one. Only numbers are interpolated; anything else switches at the halfway point, because there is no value between 'sine' and 'square'. | Milliseconds to slide panel values on a recall; 0 snaps. Only numbers interpolate; the rest switch at halfway. |
| All 16 channels is the right default: a stuck note is by definition one you have lost track of, so narrowing the search is the wrong instinct. | Which MIDI channels the panic covers. All 16 is the default. |
| Clock the sequence off the panel's Transport. A shift register that lands its mutations on the beat sounds composed; the same register free-running sounds like a fault. | Clock the sequence off the panel's Transport. |

## Checking a change

```bash
cd CE/web/src/CE_Application
# hints over the ceiling
grep -rhoP 'hint="[^"]{121,}"' --include=*.svelte . | grep -v '='
# caps that aren't acronyms, and rationale words
grep -rn 'hint="[^"]*\b\(MUST\|NOT\|THIS\|BARS\|REAL\|LAST\|SHAPE\|STEP\)\b' --include=*.svelte .
grep -rn 'hint="[^"]*\(because\|on purpose\|by design\|rather than\|the point of\)' --include=*.svelte .
```
