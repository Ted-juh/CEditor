# Twelve additional control sets

The historical starter collection has 24 design directions. Atlas, Kiln, Arcade, Spool, Tessera,
Bellows, Helix, Iris, Balance, Satellite, Fan and Crown add 48 rotary/key/switch/meter
forms, twelve pad outlines and twelve Number stepper arrangements. The existing twelve
starters remain available. The larger set catalogue contains 42 sets, including its
additional finishes.

| Set | Rotary mechanism | Performance pads | Number stepper |
| --- | --- | --- | --- |
| Atlas | Eight-spoke ship wheel | Portholes with rim fasteners | Circular buttons beside the field |
| Kiln | Stacked pottery dial | Glazed petals, staggered rows | Two ceramic buttons stacked on the left |
| Arcade | Moving joystick cap in an octagonal gate | Diamonds | Broad diamond buttons |
| Spool | Three-spoke open reel | Reels with three dark apertures | Opposing circular buttons at different heights |
| Tessera | Rotating square frame | Staggered hexagons | Stepped hexagonal buttons |
| Bellows | Expanding concertina | Pleated edges and ribbed faces | Offset parallelogram buttons |
| Helix | Nut traveling across a lead screw | Staggered ribbed capsules | Buttons stacked on the right |
| Iris | Variable shutter aperture | Six-sided shutter panels | Triangular focus buttons |
| Balance | Tilting counterweight beam | Shields | Low trapezoid paddles around a raised field |
| Satellite | Articulated dish | Separate pods in an orbit | Vertical navigation buttons beside a wide field |
| Fan | Opening folded fan | Pleated fan outlines | Triangular buttons at different heights |
| Crown | Toothed gear and spokes | Gear outlines | Hexagonal buttons beside a tall central field |

**Ten of the twelve are retired.** Atlas, Kiln, Arcade and Spool went first, judged unrelated to
synthesizers. After reviewing a starter panel for each of the remaining eight, the owner retired
Tessera, Bellows, Helix, Balance, Fan and Crown as "hardly usable for a synthesizer panel". A
retired set stays defined in `RETIRED_CONTROL_SET_IDS` (`models/controlSets.js`), so a panel
that uses one still draws. It is not offered in the set pickers, the Library, a new panel or the
starter gallery, and its starter file is gone. No shipped panel used any of the ten. Their
definitions stay in place because `ADDITIONAL_DIRECTIONS`, `NUMBER_LAYOUTS` and the form tables
are indexed by position.

Iris and Satellite stay, marked as **illustrated** (the owner: "it should be clear for those two
that they do not work as the rest as a control set"; the mock-up was approved). Unlike the other
sets, their knobs, keys, switches and meters are whole drawings (`editor/AdditionalAnatomy.svelte`),
not parts, so only colours, size and depth change, and the value moves the mechanism rather than a
pointer over a scale. `ILLUSTRATED_CONTROL_SET_IDS` and `isIllustratedControlSet`
(`models/controlSets.js`) and `isIllustratedForm` (`models/controlAnatomy.js`) say which. What the
author sees:

- The Library's style and group are **Illustrated** (formerly Mechanical), with a line under the
  group heading, and each card carries an **Illustration** badge.
- The set's page has an **Illustrated set** tag and a short explanation of what differs, naming the
  kinds of control it draws whole, so a copy whose knobs were given a template's design says less.
- The set pickers and the Form list name them "(illustrated)". The Form list no longer offers a
  retired set's form, except the one a control already has.
- The Knob, Button, Switch and Meter tabs of such a control say the parts do not apply and dim them.
  They used to send the author to Convert to Parts, which these forms do not have.

Each new starter includes a stopped, editable eight-step, two-track sequencer. Its cells
follow the pad design. Active cells still display velocity through opacity; muted tracks
remain dim, and the live playhead remains distinct. Track order, step order and MIDI notes
are unchanged by a cell's appearance. Edit the pattern in the existing Designer dock.

## Editing and interaction

The experimental collection is retained for existing panels. The current gallery presents
thirty-six synthesizer designs instead; see [Synthesizer control designs](physical-control-sets.md).
The gallery has a grayscale
switch. Open a starter to copy its pinned controls into a panel.

Rotary controls, keys, switches and meters expose their form under Core → Control design.
Drum Pads → Pad design exposes Shape and Arrangement; Step Sequencer → Sequence exposes
Cell shape. The Number's actual Parts carry its button positions, shapes, colours and value
field, so the Parts editor can change each of them independently.

Pad drawing and hit testing use the same normalized outline. Orbital pad bounds do not
overlap, and the origin setting still determines each pad's identity. Enabling corner zones
uses a rectangular grid so every corner action remains reachable; the selected alternative
shape and arrangement are retained for when corner zones are disabled.

Number previously used fixed left/right hit regions even when its Parts were relocated.
Its hit test now uses the resolved visible Part geometry, including the active set, zoom,
anchors, capsules and polygons. Press and release must agree on the zone before stepping.
Keyboard entry, value limits, step size and MIDI behavior remain owned by the existing
control. The shape does not invent a second value or a new hardware capability.

## Verification

The browser starter check exercises all 24 choices. For the new twelve it additionally
clicks each relocated increment/decrement button, strikes and releases the visible pad
centre, checks empty pad corners and confirms the authored sequence remains present.
It repeats the Satellite checks without materializing the set, so a design inherited
from the panel must use matching drawn and interactive geometry too.

Unit checks cover shape hit boundaries, note identity across both pad origins, grid/stagger/
orbit layouts at several densities, non-overlapping orbital bounds, reachable corner zones,
sequencer cell identity, zoomed Number hit regions and save/load persistence.

The new forms are parametric vector controls. Their decoration is not a simulation of
pressure-sensitive hardware, physical gears or a motorized mechanism. Number buttons remain
fully editable Parts; the new rotary/key/meter forms expose parameters rather than every
individual SVG vertex. Original parts restores their previous renderer.
