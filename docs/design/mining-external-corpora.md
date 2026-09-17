# Mining other people's synth knowledge — an assessment of the KnobKraft corpus

> Status: **assessment, 2026-09-17.** Nothing built. Measured against
> `christofmuc/KnobKraft-orm` at master, cloned and read rather than described from its README.
>
> The question it answers: `beta-differentiation.md` §4 proposes harvesting the Ctrlr corpus,
> because the thing that limits this product is not features but *how many synths it supports on
> day one*. Ctrlr is not the only corpus. This is what a second one actually contains.

---

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

## What is actually in there

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

## What it cannot give us

**Parameters.** No addresses, no ranges, no enum labels, no codecs, no bit-fields. A librarian moves
whole patches and never looks inside one. So this corpus fills `identity`, `presets` and `dumps`,
and leaves `deviceStructure` and `scopes` entirely empty.

The complement is [Edisyn](https://github.com/eclab/edisyn) — an *editor*, 60-plus synths, pure
Java, **Apache 2.0**. Editors must know the inside of a patch, so it carries exactly the parameter
layer KnobKraft lacks, under a permissive licence with none of the entanglement below. It has not
been assessed the way this document assesses KnobKraft; it should be, and it is the obvious next
one.

Between the two, the two halves of a profile:

| Layer | KnobKraft (AGPL) | Edisyn (Apache-2.0) |
|---|---|---|
| Device identity | **yes** | yes |
| Bank / program layout | **yes** | partly |
| Dump request and reply shapes | **yes** | yes |
| Real dump fixtures | **yes, 107** | some |
| Parameter addresses, ranges, labels | no | **yes** |

---

## The licence question, which is a strategy question

`license-decision.md` records that this repository is AGPLv3 *because* no JUCE commercial licence
is held, and keeps option 2 open: buy one, then relicense freely. That option interacts with this
document, and the interaction runs the wrong way if nobody notices it in advance.

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

1. **`tools/dpd/import-knobkraft.mjs`** — `ast`-parse the seventeen declarative adaptations into
   draft profiles with `completeness: "partial"` and `provenance.importedFrom` set. The provenance
   block already has the field; `import-midici.mjs` is the pattern to copy.
2. **Wire `testData/` into the dump tests.** Point the existing parser at real banks with their
   expected record counts and known names. This is worth doing *even if step 1 is never built*, and
   it is the only item here with no licensing question attached to using it locally.
3. Only then consider hand-porting, and only for machines somebody actually asks for.

The honest estimate: step 2 is a day and pays immediately. Step 1 is a few days for seventeen
machines' worth of the librarian layer. Step 3 is unbounded and should stay demand-driven.
