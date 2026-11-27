# The choice group (`RadioButtonGroup`), redesigned

*Decided and built on 2026-11-26, after the owner judged the stock radio group "far from pleased the
way it looks, is implemented" and asked for a redesign and the code brought up to standard.*

## What was wrong

Measured in Preview before any change (the screenshots are in the session that did this):

- **A frame inside a frame.** Every option drew a copy of the control's whole Background (fill,
  border, corners) inside the control's own Background. Spacing was paid twice: the control's
  padding (12 px a side), each option's (12 px a side), a 12 px circle and an 8 px gap, about 44 px
  an option before a letter.
- **The chosen option did not read.** In the default style it differed by its outline colour and a
  6 px dot; in the segmented style by its outline colour alone. In `graphite` it took the frame's
  colour, so the option that stood out was the one not chosen.
- **Labels vanished at panel sizes.** A 110 × 28 two-way switch showed no labels (radio) or "O..";
  five short labels in 300 px were cut to one glyph each. Every option got the same width.
- **Hover and press belonged to the whole group.** The control-level Hover and Pressed states
  painted every option and shrank the group.
- **Not usable from the keyboard.** In Preview and the player the group had no tab stop
  (`previewTabIndexFor` left `radiogroup` out), arrow keys reached range controls only, and a screen
  reader found a `radiogroup` with no radios in it.
- **Scripts were not told.** A Toggle reports every change by default; a radio group did not.
- **The code.** `radioSegmentStyle.js` (620 lines) merged four sources (legacy row
  `visualOverrides`, the Selected state's component patch, `Value.segmentStyle`, state segment
  patches) and kept legacy scalar border fields and the Border/Corners objects in step both ways.
  Layout was worked out twice: a CSS grid drew, `resolveRadioGroupLayout` hit-tested, and the
  editor's test surface did a third copy. Buttons had a whole lamp vocabulary (LED, jewel, window)
  that a radio group was barred from (`hasLamp ... && !isRadioGroupControl`).

The GAIA panel generator had already given up on it: "A custom LED column, not a RadioButtonGroup".

## Decisions

**Five styles, one frame at most** (`Behavior.visualStyle`):

| Style | Frame | Each option | The chosen one |
|---|---|---|---|
| `segmented` (default) | the control's Background | no box; hairline dividers between | a thumb in the Selected fill, its label in an ink that reads on it |
| `buttons` | none | a key painted with the control's Background | the Selected fill, as a Button's on state |
| `radio` | none | a ring and a label, on the panel | a dot in the accent |
| `led` | none | the set's button lamp and a label, on the panel | the lamp lit |
| `tab` | none | a label, on the panel, over a baseline | an underline in the accent, its label in the panel's text |

The Background section is the frame in `segmented`, each key in `buttons`, and draws nothing in
`radio`, `led` and `tab`, whose options sit on the panel and take the panel's text colour.

**The control's interaction states are the options' states.** A state whose condition asks about
hover, pressed, checked or focused is evaluated for each option with that option's flags (the
pointer over it, pressed on it, chosen, keyboard-focused) and patches that option only; it no longer
patches the control. Its component patch (`Background.*`, `Text.*`) paints the option in the two
styles that paint options; its `segments` patch reaches every style. Other states (disabled, a rule
on a channel) stay the control's.

**Readable whatever the set.** Measured over the 66 offered sets: 78 of the 79 built-in sets give the
radio group a Selected state that colours only the border and the text, the "on" body token equals
the face in 21, the Selected text fails on the chosen fill in 21, and 46 faces are gradients. So the
resolver (`utils/choiceGroupStyle.js`) guarantees two things, and checking every set by eye shaped
both:

- *A chosen option shows.* In the segmented and buttons styles, a chosen option whose fill no state
  about being chosen changed takes the thumb: the first of the set's `surface.checked`, `accent`,
  `control.fill` and `accent.hot` that stands out from the face (1.4:1), else the one that stands out
  most. It keeps it under the pointer too (below, "Under the pointer").
- *Its lettering reads.* A label reading at under 3:1 on what it sits on takes black or white. What
  it sits on is measured as drawn: the option's fill, or the strip's frame, laid over the panel's
  colour; a gradient by its stops' average at the gradient's opacity (a 22% gloss is not a white
  face); a lit material lifted toward white by its specular light (a glass face over a dark fill is
  drawn near `#9EA2A6`). A colour chosen by hand in the Segments tab is left alone.

Options on the panel (radio, LED, tabs) draw no face, so they take none of the face's effects either:
a set's drop shadow under bare lettering drew every label twice.

**Options sized to their labels.** `optionSizing`: `auto` (equal widths when every label fits an
equal share, otherwise in proportion to the labels), `equal` or `fit`. Padding shrinks before text
is cut. One layout (`utils/choiceGroupLayout.js`) places the options; drawing and hit-testing both
read the drawn options, so they cannot disagree.

**Keyboard and assistive technology.** One tab stop; the arrows and Home/End move the choice (in a
multi-select group they move the focus, and Space or Enter toggles); the group is a `radiogroup` (a
`group` when multi-select) with `aria-activedescendant`, and every option a `radio` (`checkbox`)
with `aria-checked`. A focus ring marks the focused option.

**Scripts hear every change** (`emitValueChange: true` by default, as a Toggle).

**The file format is kept.** `Value.segmentStyle` and `States.*.patches.segments` keep their shape
and part names (`whole`, `indicatorOuter`, `indicatorInner`, `label`); the legacy fields (row
`visualOverrides`, `whole.borderColour`/`borderWidth`/`shape`/`radius`) are read, never written. A
group saved with the old default style has no `visualStyle` of its own, so it opens as `segmented`.

## Under the pointer (2026-11-27)

**What was wrong.** A set's Hover and Pressed states paint every option's fill alike, and the thumb
was given only to a chosen option whose fill *no* state had changed. So the moment the pointer was on
the chosen option, or pressing it, it took the hover or press colour and stopped looking chosen.
Recorded in Preview over the 66 offered sets, a row of keys and a strip in each, the middle option
chosen: the chosen key faded to an ordinary one in 52 sets, the chosen strip segment in 34.

**The owner's choice, of three put** (the chosen colour simply winning, which loses the hover
feedback; a colour of its own under the pointer; or leaving it to each author's own state): a colour
of its own, in every set. The owner saw every set it touches, before and after, and chose to apply it
to all of them rather than only where the choice faded.

**As built** (`utils/choiceGroupStyle.js`). The resolver notes which kind of state changed an
option's fill: one about being chosen (`checked`), one about the pointer (`hover`, `pressed`), or
another. A chosen option whose fill no state about being chosen and no other kind of state changed
takes the thumb, as before; where the pointer's states changed it, the thumb a shade off
(`chosenUnderPointer`): one shade hovered, two pressed, toward lighter or darker, whichever goes away
from what the options not chosen look like (their face, or the strip's frame), and the other way where
the colour can hardly move (a near-white cannot get lighter), then no further than keeps 60% of the
contrast it has with them at rest. Its lettering is checked against the new fill, as ever.

Left as they were: every option at rest, every option not chosen, a set whose own Selected state
paints the fill (it wins, as before), an author's state about the chosen option under the pointer
(`hover` and `checked` both on: it wins), and a state about something else that paints the fill.

Measured after, on the same recordings: under the pointer the chosen option stands out from the
options beside it by at least half what it does at rest in every set and both styles, hovered; pressed,
in all but Leatherbound's and Valve's keys, whose textured faces defeat a one-spot colour reading and
which read as chosen on the sheets. In 33 more cases (9 sets' keys, 24 sets' strips) the set's hover
colour had happened to keep the choice visible, and those change too: the hover colour becomes a shade
of the chosen. Held by `test/choiceGroupStyle.test.js`.

