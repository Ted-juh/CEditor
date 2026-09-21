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
