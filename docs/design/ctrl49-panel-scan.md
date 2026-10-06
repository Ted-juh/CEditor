# CTRL49 panel scan — a plug-in's own sections on the keyboard

Status: spec, with the first tool (`Ctrl49PanelScan.exe`) on branch `ccr-afa36ff6-0e0ifw`.

## What it is for

A hosted plug-in's window does not fit the CTRL49's 480 × 272 screen, and every plug-in's window
is a different size. Showing the whole window shrunk to fit is unreadable; drawing a generic page
from the parameter list is readable but does not look like the plug-in.

The answer is to cut the plug-in's GUI into the **sections it is already built from** (Filter,
Amp Envelope, Osc 1, ...), and show one section per keyboard page:

- the section's picture, cut from a snapshot of the plug-in's own window, scaled to fit the screen
  with its aspect kept, uploaded **once** as the page's background;
- on top of it, drawn by the keyboard, an overlay at each control's position — a knob ring, a
  fader cap, a button light, a selector mark — that moves as the CTRL49's eight knobs turn.

Nothing is re-uploaded while playing; the overlays are a handful of rects and sprites, which the
measurements (`tools/ctrl49/README.md`) say has 5× or more headroom.

Nobody maps anything by hand. Where the sections are, where each control is and what kind of
control it is are all worked out by a **scan**, once per plug-in, and kept.

## The scan, step by step

### 1. Sections from the plug-in's own groups

A VST3 declares its parameter groups as **units** (`IUnitInfo`): every parameter carries a
`unitId`, and every unit a name and a parent. Each unit that holds controls is a section, named
`Parent / Child` when its parent is not the root. Controls in the root unit, when others exist,
form a section named after the root unit (or **Main**).

Units are used when the controls sit in two or more units; otherwise the names decide.

When the plug-in declares no units, or puts every parameter in the root unit, the sections come
from the **parameter names**: titles are split into words (space, `_`, `-`, `:`, `.`; a number
stays with the word before it, so `Osc 1 Wave` and `OSC1 Wave` both start with one word), and
parameters sharing their first word form a section. A section with more than 24 members is split
again by its second word, and so on, which turns Surge-style names (`A Osc 1 Pitch`, `A Filter 1
Cutoff`) into `A Osc 1`, `A Filter 1`. Sections of one go to **Other**. If that still gives a
single section, or more than 48, the plug-in is grouped in its own order, 8 at a time
(**Parameters 1**, **Parameters 2**, ...).

The JSON records which of the three it used: `units`, `names` or `order`.

Not controls, and left out: parameters flagged read-only, hidden, program change or bypass.

### 2. Each control's place on the GUI

Two ways, the first that works wins per parameter:

1. **Ask the plug-in** (`finder`). VST3's `IParameterFinder` is an extension of the editor
   view: given a point, the plug-in answers which parameter is there. VSTGUI plug-ins answer it,
   and JUCE plug-ins whose editor implements `getControlParameterIndex`. The scan asks every 4 px
   over the whole editor. A parameter's place is the **largest connected patch** of points that
   named it (a parameter that is also named by a display elsewhere does not stretch its box over
   both).
2. **Watch the plug-in** (`diff`). For every control the finder did not place: take a picture,
   move the parameter to the end of its range furthest from where it is, take another, move it
   to the other end, take another, move it to the middle, take a fourth, put it back. The pixels
   that changed between any two are the control. Before any parameter moves, three pictures are
   taken with nothing changed; whatever animates by itself (scopes, meters, blinking LEDs) is
   masked out **as an area** (the box of each patch that moved, filled), because its next frame
   lights other pixels of the same area.
   Changed pixels within 3 px of each other form one patch. The control is the largest patch plus
   every patch in line with it (sharing at least half its column or row, no further off than
   twice its longer side): that joins a fader's cap at both ends of its travel, or a selector's
   lit segments, and leaves out a display elsewhere that also redrew. A box covering more than a
   quarter of the editor is **too wide** (a mode switch that redraws a whole section): the
   control stays unplaced, and is reported as such rather than given a wrong box. A knob found
   this way is the area its pointer swept; its box becomes the square on that area's longer
   side, same centre, which is closer to the knob itself.

Watching takes about two thirds of a second per control, so it stops after 200 seconds; whatever
is left is unplaced, with `"why": "out of time"`.

A control that neither placed still belongs to its section and still gets a knob on the keyboard;
it is drawn as a generic overlay in a strip under the picture. The JSON says `"how": "none"`.

### 3. The kind of overlay

From the parameter, then the shape of its box:

| Parameter | Box | Overlay |
|---|---|---|
| `stepCount` 1 | any | `button` (a light) |
| `stepCount` 2 or more | any | `selector` (a mark and the value's name) |
| continuous | height ≥ 2.2 × width | `vfader` (a cap) |
| continuous | width ≥ 2.2 × height | `hfader` |
| continuous | otherwise | `knob` (a ring) |

### 4. Keyboard pages

A section's controls are put in **reading order**: placed controls by rows, top to bottom (a
control joins the current row when at least half of its height, or of the row's, overlaps the
row), left to right; unplaced ones after them, in the plug-in's order. Every 8 is one page, so CTRL49 knob 1
(the leftmost of the eight round knobs) is the first control in that order. A section of 11 is
`Filter 1/2` (8) and `Filter 2/2` (3).

A page's picture is the box around its placed controls, 8 px wider on every side, kept inside the
editor. On the keyboard: a 24 px title bar (section name, page n/m), and under it the picture
scaled to fit 480 × 248 with its aspect kept (never enlarged more than 2×), centred. When the
page has unplaced controls, the bottom 40 px is a strip of generic overlays for them and the
picture fits the 208 px above it. A page with no placed control has no picture: generic overlays
only.

Page Left / Right walks the pages in the plug-in's section order.

## The tool: `Ctrl49PanelScan.exe`

Windows only, built from `CE/src/ControlSurface/Ctrl49PanelScan.cpp`; the logic above is
`Ctrl49PanelScan.h`, pure std, tested off Windows by `CEditorCtrl49PanelScanTests`. It does not
use JUCE's plug-in hosting: it loads the VST3 itself through the SDK's interfaces, because it
needs the editor view (`IParameterFinder`) and the edit controller directly, and JUCE keeps both
private. It never touches the keyboard.

| Command | Does |
|---|---|
| `Ctrl49PanelScan list` | every `.vst3` under `%CommonProgramFiles%\VST3`, numbered |
| `Ctrl49PanelScan scan <word> [<word> ...]` | scans every listed plug-in whose file name contains a word (any case) |
| `Ctrl49PanelScan scan <number> ...` | the same, by the numbers `list` printed |
| `Ctrl49PanelScan selftest` | scans the test plug-in built beside the tool and checks what it found |
| `--no-diff` | skips step 2's second way (fast; finder only) |

Each plug-in is scanned in **a process of its own** (`scan-one`, started by the tool itself), with
five minutes to finish. A plug-in that crashes or hangs is named in the summary and the next one
runs; it cannot take the run down.

The editor opens in an ordinary window on the main screen, at 100 % scale (the tool tells the
plug-in its content scale is 1, and is not DPI-aware, so the finder's points and the picture's
pixels are the same pixels). **Do not cover or move it while it runs**; some plug-ins only draw
while visible. The picture is taken with `PrintWindow (PW_RENDERFULLCONTENT)`; if that comes back
one flat colour, from the screen instead.

### Output

`%TEMP%\ctrl49-panel-scan\<plug-in>\`:

| File | What |
|---|---|
| `editor.png` | the plug-in's window as captured |
| `scan.png` | the same with a box around every placed control (colour per section, number = knob on its page) and around every page, labelled |
| `pages\NN <section> n-m.png` | each keyboard page as it would look: 480 × 272, title bar, picture, overlays numbered 1-8 |
| `scan.json` | everything below |
| `log.txt` | what the scan did, step by step |

and `%TEMP%\ctrl49-panel-scan\summary.txt`, one line per plug-in, also printed at the end:

```
Plug-in        Editor    Sections      Controls  Finder  Diff  Unplaced  Result
Fixture Synth  640x400   3 (units)     9         4       4     1         ok
```

`scan.json`:

```json
{
  "format": 1,
  "plugin": { "name": "...", "vendor": "...", "classId": "32 hex", "file": "..." },
  "editor": { "width": 640, "height": 400, "capture": "printwindow|screen|blank|none",
              "finder": true },
  "grouping": "units|names|order",
  "controls": [ { "id": 12, "title": "Cutoff", "units": "Hz", "stepCount": 0,
                  "section": 1, "how": "finder|diff|none", "kind": "knob",
                  "box": [x, y, w, h] } ],
  "sections": [ { "name": "Filter", "pages": [ { "box": [x, y, w, h],
                  "controls": [12, 13, 14] } ] } ]
}
```

`box` is in editor pixels, absent when `how` is `none`. Control ids are the plug-in's VST3
parameter ids, so a later step (HoSTage) can key everything by the plug-in's class id and drive
the parameters directly.

### Self-test

`Ctrl49PanelScanFixture.vst3` is a small VST3 built with the tool (no JUCE, GDI drawing): an
editor of known layout with three units (Osc, Filter, Amp), nine controls (knobs, a fader, a
button, a selector), a finder that answers for some of them only, and one control drawn nowhere.
`selftest` scans it and checks that the units, boxes, kinds and pages come out as built. It runs
before any real plug-in so a failure on the owner's machine is the tool's, not a plug-in's.

## Risks, and what the scan does about them

| Risk | Handling |
|---|---|
| GPU-drawn editors give a black picture to `PrintWindow` | second attempt from the screen; `capture` says which worked, `blank` if neither |
| Editors that draw nothing while hidden | the window is shown, on screen, and the tool waits for the first paint |
| Animated GUIs (scopes, filter curves) | the noise mask from two still pictures; patches over a quarter of the editor refused |
| One parameter drawn in two places | the largest connected patch, finder and diff alike |
| Mode switches that redraw a section | too wide → unplaced, said in the JSON and the summary |
| A plug-in that crashes or hangs | its own process, five minutes, named in the summary |
| Plug-ins that only update their GUI from the audio side | they will look unplaced in `diff`; noted per plug-in in the summary |

## Not in this step

- Pages on the keyboard. The next step is a Lua page (one background image, overlays from a
  payload like the knob pages') and HoSTage keeping the scan per class id.
- In HoSTage, plug-ins live in the worker process (`CEditorPluginWorker`); the scan moves there
  then, through the worker's editor. This lab tool is a process of its own, like the screen lab,
  and is not a shipping entry point.
- AU, CLAP, VST2.
