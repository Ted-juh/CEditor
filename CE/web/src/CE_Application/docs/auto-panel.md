# Auto-Panel Generator

> Status: **built.** File → **New Panel from Device Profile** → pick a device.
> A *feature*, not a placeable component. Part of the
> [panel parts backlog](./README.md); ideation in
> [groundbreaking-components.md](./groundbreaking-components.md).

## What it does

One control per profile parameter, grouped by the profile's own groups, with the component chosen
by the parameter — and each control **bound and adopted**, so it arrives with the real range, the
real choices, the real label and the bytes to send. A 793-parameter GAIA profile becomes 1624
controls in a second; the AN1x's 1296 parameters become 2620.

The output is a normal, fully editable panel with no file path. Save it and it is yours.

## Why the adoption case is the whole point

A profile is the hard part: a manual, a weekend, and someone reading address tables. Until this
existed, that work bought nothing until the user spent a *second* weekend placing and binding every
control by hand. Nobody does that. So the profile — the thing that makes this program different
from a drawing app — was reaching the screen only for the two devices somebody had hand-built a
panel for.

## Where the code is, and why it is in three pieces

| | | |
| --- | --- | --- |
| `utils/autoPanel.js` | the generator | pure — no store, no bridge, no filesystem |
| `stores/autoPanelActions.js` | the command | finds the profile, waits for it, opens the tab |
| `layout/MenuBar.svelte` | the menu | one row per profile, so it names the device before acting |

The generator is pure for the same reason `parameterAdoptionRules.js` is: the editor calls it, tests
call it, and a Node script could. It is also why the whole feature is tested off Windows.

**Waiting is the interesting part of the command.** `deviceProfiles` is a *list* — id, name, file
path — and does not carry parameters. Those live in the profile's source text, which the engine
sends on request and caches in `profileSources`. Every other reader of that store is reactive and
can return null and re-run when the source lands; a menu command has one shot, so it asks and
awaits, with a timeout so a profile that never arrives reports itself instead of hanging the menu.

## The three questions this replaced

The design draft ended with three open questions. They are answered here rather than deleted,
because two of the answers are constraints somebody will otherwise re-litigate.

**Mapping policy — which control for which type?** The profile already says: `ui.preferredComponent`
is filled in for all but two of the 4936 parameters across the shipped profiles. So the profile
decides, and `FALLBACK_COMPONENT` is only the floor for a hand-written profile that omits it.

Two adjustments, both of which exist because the data made them necessary:

- `ComboBox` and `Combobox` both appear in the shipped profiles (53 and 72 parameters). Only one is
  a component this build has. Matching case-insensitively beats putting a knob where a dropdown
  belongs over a capital letter.
- A `RadioButtonGroup` with more than eight choices becomes a `Combobox`. Eight is the number
  `getBindingCompatibility` already warns at, taken from there deliberately: generating a panel the
  editor immediately warns about is a strange thing for the editor to do to itself.

Everything the generator substitutes or declines to place comes back in a list. A generated panel is
exactly the artefact whose gaps have no symptom — 793 controls appear, one parameter is missing, and
nobody notices until they reach for it on the hardware.

**Layout strategy?** Sectioned by the profile's groups, in first-appearance order — the order its
author wrote them, which is usually the instrument's own signal flow. Cells flow and wrap within a
fixed content width. Two densities: `comfortable` reads, `compact` fits more on screen.

This is deliberately *not* the instrument's front panel. `tools/scripts/gaia-panel` is that, hand
placed, and it took a person who owns a GAIA. The two are not redundant and neither replaces the
other: an algorithm can cover every parameter and cannot know that the four amp faders belong in a
row.

**Regenerate vs merge?** Not implemented, on purpose. Merging would have to decide, per control,
whether a moved knob is a deliberate layout or a stale position, and there is no honest answer to
that. It generates a *new* panel.

What keeps the option open is that control ids are **derived** from the profile and parameter ids
rather than minted: run it twice and you get the same ids, so two generated panels diff. Whoever
builds merge later has that to work with.

## What it does not do

- No instrument-shaped layout (see above).
- No note keyboard, no LCD, no meters — it places what the profile describes and nothing else.
- Nothing generated has been driven against real hardware, like everything else in the device layer.
