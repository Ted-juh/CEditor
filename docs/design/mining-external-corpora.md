# Mining other people's synth knowledge — a survey of six public corpora

> Status: **assessment, 2026-09-17.** Nothing built. Every corpus below was cloned and read,
> not described from its README, and every count in this document came out of the working tree.
>
> The question it answers: `beta-differentiation.md` §4 proposes harvesting the Ctrlr corpus,
> because the thing that limits this product is not features but *how many synths it supports on
> day one*. Ctrlr is not the only corpus. This is what a second one actually contains.

---

# KnobKraft Orm — the librarian half

[`christofmuc/KnobKraft-orm`](https://github.com/christofmuc/KnobKraft-orm), **AGPL** (the author
sells an MIT licence on request).

## The short answer

**It is mineable, and for the half you cannot get anywhere else — but not the half you might
expect.**

KnobKraft Orm is a **librarian**, not an editor. Its adaptations know how to ask a machine for a
patch, recognise the reply, count its banks and read its name. They do **not** know what parameter
lives at which address, what its range is, or what its enum labels say — because a librarian never
needs to.

That sounds like the disappointing half and is the opposite. `midi2-integration-plan.md` states the
limit of the parameter route in its own scope notes: *"PE exposes controllers/programs/identity,
not SysEx addresses, bit packing, checksums, or dump layouts."* The dump layer is exactly what
MIDI-CI cannot give us and exactly what a manual import struggles with. It is the half this corpus
has.

---

## What is actually in KnobKraft

Counted, not estimated:

| | Count |
|---|---|
| Top-level adaptation `.py` files | **115** |
| Carrying the dual AGPL/commercial-MIT header | 84 |
| Hand-written (define `name()` directly) | 69 |
| Built by a `Generic*` factory — pure keyword arguments | **17** |
| Define `make_test_data()` | 77 |
| Citing a service manual or MIDI implementation chart by page | 19 |
| **Real `.syx` / MIDI-log fixtures in `testData/`** | **107 files, 14 MB** |

Manufacturers represented: Akai, Alesis, Behringer, Casio, Clavia, DSI/Sequential, Elektron, E-mu,
Ensoniq, Groove Synthesis, John Bowen, Kawai, Korg, Line 6, Moog, Novation, Oberheim, Pioneer,
Quasimidi, Roland, Studiologic, Waldorf, Yamaha, Zoom.

Per-capability coverage, which is what decides how much of a profile an import can fill:

| Adaptation callback | Files | Fills which DPD field |
|---|---|---|
| `createDeviceDetectMessage` / `channelIfValidDeviceResponse` | 68 / 68 | `identity` |
| `nameFromDump` | 63 | `presets.nameRequest`, and the name offset |
| `createEditBufferRequest` / `isEditBufferDump` | 57 | `dumps` |
| `createProgramDumpRequest` / `isSingleProgramDump` | 56 | `dumps` |
| `numberOfBanks` / `numberOfPatchesPerBank` | 43 / 43 | `presets.banks` |
| `calculateFingerprint` | 41 | — (our own dedupe already exists) |
| `bankDescriptors` | 30 | `presets.banks` |
| `renamePatch` | 28 | write-back path |

---

## Three tiers of mineability, in the order worth doing them

### Tier 1 — the 107 real dumps. Take these first.

The sleeper, and probably worth more than the code.

`midi2-integration-plan.md` names the standing gap plainly: *"What has NOT happened is a CI-capable
device on the other end of the cable."* `captureInference.js` calls Mode B — the dump diff — *"the
valuable one: the mode that covers everything made before the mid-90s, which is precisely the
population no editor covers."* And the only synth this project can currently test against is
`test/support/fakeSynth.js`, which we wrote, which means it agrees with our assumptions by
construction.

`testData/` is 107 real bank dumps off real machines. Better, `make_test_data()` turns each into a
**complete fixture** rather than a loose file — here is the whole of the Prophet 6's:

```python
return testing.TestData(sysex="testData/P6_Programs_v1.01.syx",
                        program_generator=programs,      # patch 2 is named 'Thick Low Brass'
                        expected_patch_count=500)
```

A file, an expected record count, and a known patch name at a known index. That is precisely the
shape our dump parser, record-boundary logic and checksum families need to be tested against — on
seventy-odd machines nobody here owns, in CI, on Linux, with no hardware in the room.

### Tier 2 — the 17 declarative adaptations. Near-mechanical.

The Sequential, DSI, Oberheim and Roland families are built by a factory, so the adaptation *is* a
data structure:

```python
synth = sequential.GenericSequential(name="Sequential Prophet 6",
                                     device_id=0b00101101,
                                     banks=10, patches_per_bank=100,
                                     name_len=20, name_position=107).install(this_module)
```

This was not taken on trust. Python's `ast` module parses all seventeen **without executing any of
them**, which matters because executing a downloaded adaptation to read its contents would be a
poor idea:

```
DSI Prophet 08.py   {'device_id': 35, 'banks': 2, 'patches_per_bank': 128, 'name_len': 16, 'name_position': 184}
DSI Prophet 12.py   {'device_id': 42, 'banks': 8, 'patches_per_bank': 99,  'name_len': 20, 'name_position': 402}
```

Sixteen distinct keyword fields are available across the set: `banks`, `blank_out_zones`,
`device_id`, `file_version`, `friendlyBankName`, `friendlyProgramName`, `id_list`,
`layerNameIndex`, `manufacturer`, `name`, `name_info_function`, `name_len`, `name_position`,
`numberOfLayers`, `patches_per_bank`, `program_data_ids`.

Line those up against `dpd.schema.json`'s `presets` block — `banks`, `recall`, `nameRequest`,
`initPatch` — and `identity` — `manufacturerId`, `family`, `member`, `firmware`, `capturedReply` —
and the mapping is close to one to one. This is the same job `CE/dpd/tools/import-midici.mjs`
already does for a Property Exchange blob, with a different input.

### Tier 3 — the 69 hand-written ones. Read, do not translate.

Real Python with real logic: bit-unpacking, checksum arithmetic, multi-message reassembly. Nothing
mechanical is possible here. But nineteen of them cite the source they were written from, in the
code, beside the bytes:

```python
def createDeviceDetectMessage(channel):
    # Page 5 of the service manual - Device ID Request
```

That is a *worked, tested reading of a service manual* for machines whose manuals are bad, scanned,
or gone. Even used purely as a reference while authoring a profile by hand, it removes the most
expensive part of the job — discovering that the manual is wrong.

---

## What KnobKraft cannot give us, and who has it

**Parameters.** No addresses, no ranges, no enum labels, no codecs, no bit-fields. A librarian moves
whole patches and never looks inside one. So that corpus fills `identity`, `presets` and `dumps`,
and leaves `deviceStructure` and `scopes` entirely empty.

Three other corpora were then read against exactly that gap.

---

# Edisyn — the parameter half, under a licence with no strings

[`eclab/edisyn`](https://github.com/eclab/edisyn), **Apache 2.0**, pure Java. An *editor*, so it has
to know the inside of a patch, which is the thing KnobKraft never needs to know.

| | Count |
|---|---|
| Synth directories | **47** |
| Editor `.java` files | 181 |
| Carrying an `allParameters` index→name map | **35** |
| `new LabelledDial(...)` — label, key, **min, max**, all literals | **3,516** |
| `new Chooser(...)` — enum bindings | **949** |
| `new CheckBox(...)` — booleans | **569** |
| `.init` files (binary init patches) | **78** |
| Per-synth HTML documentation | 80 |

Roughly **five thousand parameter declarations**, and the three things that cost the most to author
by hand are all literals in the source.

**The address map is an array whose index is the byte offset:**

```java
final static String[] allParameters = new String[/*100 or so*/]
{
"-",                // this is the name
…
"volume",
"effect",
"outselect",
```

That is `deviceStructure` and `scopes` in DPD terms, handed over as a flat list.

**The range and the human label sit in the widget constructor,** as literal arguments:

```java
comp = new LabelledDial("Effect [K4] /", this, "effect", color, 0, 31, -1);
comp = new LabelledDial("Mod Wheel",     this, "wheeldep", color, 0, 100, 50);
```

Human label, parameter key, minimum, maximum, and an optional display offset. A regex gets all
3,516 of them. Ranges are *not* mostly in `setMinMax` — only 16 files use it — which is why the
widget constructors are the thing to parse.

**Enum labels are plain static arrays,** and they are the expensive part of profile authoring:

```java
public static final String[] WAVES = { "Sin 1st", "Sin 2nd", …, "Electric Piano 1", … };
public static final String[] KS_CURVES = { "Linear", "Exponential", "Logarithmic", … };
public static final String[] VELOCITY_CURVES = { "Linear", "Logarithmic", … };
```

The `Chooser` call binds a key to one of them, so resolving an enum needs one line of look-back —
tractable, not mechanical in the way the dials are.

**And 78 `.init` files** are binary init patches (the K4's is 140 bytes), which is
`presets.initPatch` with no work at all.

**Apache 2.0 is the other half of the value.** Nothing here entangles the licensing options
`license-decision.md` keeps open. Of everything surveyed, this is the corpus to take first on legal
grounds and the richest on technical ones.

---

# PyMidiInstrumentDefs — small, modern, and the right shape

[`simonholliday/PyMidiInstrumentDefs`](https://github.com/simonholliday/PyMidiInstrumentDefs),
**MIT**, YAML, with a loader and a validator. Only **14 devices** — Behringer, Modal, Moog, PWM,
Roland, Sequential, Soma, Vermona, Voce, Waldorf — so it is not a volume play. It is worth reading
for two other reasons.

**It is already almost a DPD profile:**

```yaml
controls:
  vco_1_frequency:
    label: VCO 1 Frequency
    cc: 4
    lsb: 36
    range: [0, 16383]
    default: 0
    group: vco_1
```

Label, group, CC with an LSB partner (so 14-bit, our `u14`), range, default. That is the parameter
model this project already has, in somebody else's file.

**And its provenance discipline is this repository's own, arrived at independently:**

```yaml
source: >-
  User manual, 58 pages: MIDI OPERATIONS at pp. 42-44, which is the complete
  control-change table … NOT RECORDED: polyphony and velocity, which the manual
  does not state …
sources:
  manual:
    url: "…/Subharmonicon_Manual%20AMZ.pdf"
    sha256: c79ffe2d4fbcb48a5763ad2e937f7ea7bc712f33c2a6e7173377ab6576bf4a65
    retrieved: 2026-09-13
    page_offset: -1
```

A page citation, a hash of the PDF it was read from, the date, and an explicit list of what was
*not* captured. Our `provenance` block already has `source`, `confirmations`, `contributors` and
`importedFrom`; this is what filling them in honestly looks like. Fourteen devices is a small
import and a good template.

It also covers **modern gear**, which the other corpora underserve — they are vintage-heavy, and so
are we.

---

# The `.midnam` corpus — names only, and a licence problem

[`lacojim/Ardour-MIDI-Patch-Files`](https://github.com/lacojim/Ardour-MIDI-Patch-Files) —
**237 `.midnam` files, 18 MB**, converted from Cakewalk `.ins` instrument definitions.

MIDI Name Documents are XML and carry **patch names, bank structure and controller names**. No
addresses, no ranges, no SysEx. So this is a third layer again: not the dump layer, not the
parameter layer, but the *naming* layer — which is exactly what populates a patch browser.

Two things make it interesting anyway:

- **We already want to write this format.** `product-ideas.md` §23 proposes emitting `.midnam` and
  Cubase maps so this project's output reaches people who never install it. A reader and a writer
  share most of a schema, so building the importer makes the exporter cheaper, and vice versa.
- **Cakewalk `.ins` is a far larger legacy corpus** than this one repository, in a documented plain
  text format, and this repo is evidence the conversion is mechanical — somebody did 237 of them
  with a TCL script.

**The problem: there is no LICENSE file in that repository at all.** No licence means no grant of
rights, not "public domain". Use it to *learn the format* and to test a parser locally; do not ship
anything derived from it without resolving that, and prefer `.midnam` files whose own licensing is
clear.

---

# JSynthLib — both halves in one corpus, and the address is in the widget

[`jpcaruana/jsynthlib`](https://github.com/jpcaruana/jsynthlib), **GPLv2-or-later**, Java. Recorded
in an earlier draft as existing-but-unread; read now, and it is the corpus that breaks the
librarian/editor split this document was built around, because it is both.

| | Count |
|---|---|
| Manufacturer directories | 22 |
| Driver `.java` files | **532** |
| `Driver` classes — the librarian half | 234 |
| `Editor` classes — the parameter half | **71** |
| `ComboBoxWidget` (enums) | **813** |
| `ScrollBarWidget` (ranged) | **775** |
| `KnobWidget` (ranged) | **399** |
| `CheckBoxWidget` (booleans) | 297 |
| `SpinnerWidget`, `PatchNameWidget` | 32, 39 |

Roughly **2,355 parameter widgets** alongside 234 dump drivers, covering Access, Alesis, Behringer,
Boss, Casio, Clavia, E-mu, Ensoniq, Kawai, Korg, Line 6, MIDIbox, Novation, Oberheim, Peavey,
Quasimidi, Roland, SCI, TC Electronic, Waldorf and Yamaha.

**And the widget constructor carries the address**, which Edisyn's does not:

```java
new KnobWidget("Algorithm", patch, 0, 87, 1, new FS1RModel(patch, 0x2C), new FS1RSender(0x2C), mAlgoImages)
new ComboBoxWidget("Wave", patch, new FS1RModel(patch, 0x10), new FS1RSender(0x10),
                   new String[]{"Triangle", "Saw down", "Saw up", …})
```

Label, minimum, maximum, **and the SysEx offset**, in one expression. Edisyn hands over the same
information split across two places — an `allParameters` array for the address and a
`LabelledDial` for the range — so a JSynthLib widget is a complete parameter tuple on one line and
an Edisyn one needs a join. For a mechanical importer that difference matters more than the raw
counts do.

**The licence was checked rather than assumed**, because it decides whether this corpus is usable
at all: 864 GPL notices across the drivers, and **every** GPL-headered file carries "or (at your
option) any later version" — zero exceptions. GPLv2-or-later upgrades to GPLv3, which is compatible
with this repository's AGPLv3. It carries the same relicensing entanglement as KnobKraft, and the
same facts-versus-expression distinction applies.

---

# Beyond librarians — three other kinds of corpus

Every corpus above answers the same question: *what does this synth's data look like?* Three
different kinds of resource answer questions this project also asks and that no patch librarian
touches.

## Control surfaces, which is a different subsystem entirely

`CE/src/ControlSurface/SurfaceProfile.h` states the rule for new hardware as a process — capture
the protocol, define a profile and a page renderer, run conformance, map the existing neutral
pages — and `product-ideas.md` §8 wants that generalised beyond the CTRL49. That needs a corpus of
*controllers*, not synths, and one exists.

[`mixxxdj/mixxx`](https://github.com/mixxxdj/mixxx) ships **328 files under `res/controllers`,
144 of them `.midi.xml` mappings**. Each describes a physical controller: its name, its author, and
the status bytes its pads, knobs and faders send, often with the physical layout drawn in a
comment.

```xml
<controller id="DJTechTools MIDIFighter" port="">
  <!--  Top Row
        0x30, 0x31, 0x32, 0x33
        0x2C, 0x2D, 0x2E, 0x2F  … -->
```

That is `SurfaceProfile`'s input: what the surface has, and what each control transmits. It is DJ
gear rather than keyboard controllers, so the overlap with a studio rig is partial — but the
*shape* is exactly right, and Ardour's binding maps and Bitwig's controller scripts are two more
corpora of the same kind, unassessed here.

**Licence caution.** Mixxx is GPL version 2; the `COPYING` line read does not itself say "or
later", and that was not chased further. GPLv2-**only** would be incompatible with AGPLv3, so this
one needs settling before any code is taken. The facts — which byte a pad sends — remain facts.

## Open-source emulations, which are implementations rather than transcriptions

Every corpus above is somebody reading a manual. An emulation is somebody who got a machine's
behaviour *right enough that it sounds like the machine*, with tests and users complaining when it
does not. For the machines they cover, that is a stronger source than a transcription.

[`asb2m10/dexed`](https://github.com/asb2m10/dexed) is the obvious one: a DX7 emulation carrying a
complete cartridge and SysEx implementation for a machine whose format is famously fiddly.
[`surge-synthesizer/surge`](https://github.com/surge-synthesizer/surge) and
[`reales/OB-Xd`](https://github.com/reales/OB-Xd) are others. All three were verified to exist and
**none was measured**; nothing is claimed here about how mineable they are. They are named because
"read the emulation" is a category this document would otherwise have missed, not because anybody
has checked what it yields.

## A library for a feature already planned, and one to refuse

`product-ideas.md` §12 proposes a Lua block editor and records that its round-trip was already
spiked against this repo's own `.lua` files. The canvas half is the deferrable, expensive part —
and [`google/blockly`](https://github.com/google/blockly) is Apache-2.0 and is that canvas. The
document's own argument, that the palette should generate itself from the API declaration a test
already guards, is unaffected by where the blocks are drawn.

**The one to refuse: a third-party code editor.** `CodeEditor.svelte` is deliberately
dependency-free and already does line numbers, syntax highlighting, smart indent, bracket and quote
closing, comment toggling, find and replace, folding and column editing — over a `languageService`
supplying completions, hover, go-to-definition and signature help across seven languages. Dropping
CodeMirror or Monaco in would not add capability; it would cost the language-service integration
that is the actual work. Recorded so the suggestion can be turned down on purpose the next time
somebody makes it.

---

# The corpora together

| Layer a profile needs | KnobKraft (AGPL) | Edisyn (Apache-2.0) | JSynthLib (GPLv2+) | PyMidiDefs (MIT) | `.midnam` (none) |
|---|---|---|---|---|---|
| Device identity | **yes, 68** | yes | yes | yes | partly |
| Bank / program layout | **yes, 43** | partly | yes | — | **yes** |
| Dump request & reply shapes | **yes, 56** | yes | **yes, 234** | — | — |
| Real dump fixtures | **yes, 107** | 78 init patches | — | — | — |
| Parameter address map | — | **yes, 35** | **inline in 2,355 widgets** | **yes, 14** | — |
| Ranges | — | **yes, 3,516** | **yes, ~1,200** | **yes** | — |
| Enum labels | — | **yes, 949** | **yes, 813** | **yes** | — |
| Patch / controller names | yes, 63 | yes | yes, 39 | yes | **yes, 237** |
| Licence risk | real | **none** | real, but compatible | **none** | **unresolved** |

Separately, and not a profile layer at all: **Mixxx's 144 controller mappings** feed
`SurfaceProfile` rather than the device profile, and open-source emulations are a source of
*verified behaviour* for the handful of machines they cover.

No single corpus gives a whole profile. KnobKraft, Edisyn and JSynthLib between them very nearly do, and they
overlap on enough machines — Kawai K4, Korg microKORG, DSI Prophet 08 and 12, Casio CZ, E-mu
Morpheus, Yamaha DX7 and more — that the same synth can be assembled from both halves and the
overlap used to check the join.

## The licence question, which is a strategy question

`license-decision.md` records that this repository is AGPLv3 *because* no JUCE commercial licence
is held, and keeps option 2 open: buy one, then relicense freely. That option interacts with this
document, and the interaction runs the wrong way if nobody notices it in advance.

Only one of the four corpora carries this risk, which is itself an argument about ordering.

KnobKraft is AGPL (the author sells an MIT licence on request). Copying its **code** makes a
derivative work, binds that code to AGPL for good, and would have to be excised — or separately
licensed from the author — the day this project wants to go permissive or proprietary. Doing that
by accident, spread across dozens of profiles, would be very hard to unpick later.

There is a real distinction to work with, and it is the reason to prefer Tier 2 over Tier 3:

- **Facts about hardware are not creative expression.** That the Prophet 08's device id is 35, that
  it has 2 banks of 128, that the patch name sits at offset 184 and runs 16 bytes — these are
  measurements of a machine. Extracting them entangles nothing.
- **Logic is expression.** A hand-written unpacker, a checksum routine, a reassembly loop — copying
  or closely translating one is derivative.
- **The `.syx` fixtures are captured device output**, not authored work, though they are
  redistributed inside an AGPL repository and are worth checking file by file before shipping any
  of them inside a product rather than using them as local test input.

Not legal advice, and worth twenty minutes of somebody who is. The engineering conclusion stands on
its own though: **mine the facts and the fixtures, read the logic, do not copy the logic.** That
takes most of the value, keeps every licensing door open, and happens to be the cheapest path too.

---

## The first slice, if this is ever built

Reordered by the survey, because the licence-free corpora should go first:

1. **Wire KnobKraft's `testData/` into the dump tests.** 107 real banks with expected record counts
   and known patch names, against our parser, in CI, with no hardware. Local test input carries no
   licensing question at all, and this is worth doing even if nothing else here is.
2. **`tools/dpd/import-edisyn.mjs`** — parse `allParameters`, the `LabelledDial` constructors and
   the static label arrays into `deviceStructure`, `scopes` and enum labels. Apache 2.0, the
   richest corpus, ~5,000 parameter declarations, no entanglement. This is the one that moves the
   number of supported synths.
3. **`tools/dpd/import-pymidi.mjs`** — fourteen YAML files, near one-to-one, and the provenance
   template comes with it. An afternoon, and it exercises the importer's shape before step 2's
   volume lands on it.
4. **`ast`-parse KnobKraft's 17 declarative adaptations** for the librarian layer — facts only, as
   below.
5. Read the hand-written KnobKraft adaptations as reference while authoring, never translating
   them. Demand-driven, unbounded, last.

The honest estimate: step 1 is a day and pays immediately. Step 3 is an afternoon. Step 2 is the
real project — a week or so to get a clean mapping plus however long it takes to check the output,
which is the part that actually decides whether the profiles are trustworthy. Steps 4 and 5 are
optional and carry the only licensing question in the list.

**What none of this does** is verify anything against hardware. Every profile imported from any of
these corpora must land with `completeness: "partial"` and a `provenance.importedFrom` that names
the source, exactly as `import-midici.mjs` already does — and `verifiedOnHardware` stays false until
somebody's actual machine says otherwise.
