# ASM device profiles

Profiles for Ashun Sound Machines instruments, read from the documents ASM publishes on its
downloads pages at `www.ashunsoundmachines.com` (the files on `www.mecldata.com`). As with the
other brands, the documents are not committed: what is committed is what was read from them, with
each file's name, SHA-256 and address.

## Survey (November 2026)

| Document | What it gives |
| --- | --- |
| Hydrasynth Keyboard / Desktop **MIDI NRPN & CC Communication Spec**, firmware 1.5 (legacy downloads, 31 pages) | Every engine parameter: its NRPN, its CC where it has one, and how its value is sent (`VV*128+WW = [0,218]`, `when VV=01H ,set OSC2 Mode`). Five rhythm lists the synced rates choose from. |
| Hydrasynth Keyboard / Desktop Owner's Manual 2.2.0 | A CC chart, sorted by module and by number, no values; the Deluxe's manual prints the same chart |
| Hydrasynth Explorer Owner's Manual 2.2.0 | A CC chart of its own |
| Leviasynth Keyboard and Desktop Owner's Manuals 1.2.1 | CC charts; NRPN mentioned, not listed |
| Diosynth Owner's Manual 1.0.2 | Its controllers' assignable CCs only |

The NRPN spec is the one ASM document that says what a value is, and it was written for firmware
1.5 of the Keyboard and Desktop: parameters added later (firmware 2.x, the Deluxe's multi mode) are
not in it. No SysEx format is published; the instruments send and take patches as SysEx, between
themselves and ASM's manager.

## The pipeline

| Step | File | What it does |
| --- | --- | --- |
| 1 | `read-asm-cc.mjs` | An owner's manual's MIDI CC chart (`Module  Parameter  CC`, two tables side by side) → its rows as printed. |
| 1 | `read-asm-nrpn.mjs` | The spec's table → its rows as printed: category, name, CC, NRPN MSB and LSB, comment; and the rhythm lists. Decides nothing. |
| 2 | `import-asm.mjs` | Writes `tables/<name>.json`: those, with the document's name, SHA-256 and address. **This is what is committed.** |
| 3 | `synths/<name>.mjs` | The layout: the document, its pages, the first row of each group, the rows the spec prints wrongly, the names a line break split. |
| 4 | `build-asm-profile.mjs`, `make-profiles.mjs` | Transcription + layout → `CE/profiles/test/<id>.ceditor-device.json`. |
| 4 | `build-asm-cc-profile.mjs` | The same for a CC chart: each row its controller, 0 - 127. |

```bash
node tools/profiles/asm/import-asm.mjs hydrasynth Hydrasynth_KB_DR_MIDI_Spec_1.5.0.pdf
node tools/profiles/asm/make-profiles.mjs            # or --check
```

## Reading the spec

The table's columns are `Category  Parameter  CC Dec  CC Hex  NRPN MSB  NRPN LSB` and a comment,
at the same places on every page. Every cell but the numbers is set in the middle of its row, over
as many lines as it needs: a name over three lines around the row's NRPN, a comment over five. So the
NRPN MSB column anchors the rows; each column's other lines run into cells (a cell's lines are 10
points apart, rows further), and a cell goes to the row whose NRPN is nearest it. Two cells for one
row at a page's head or foot are a cell carried over the break (`OSC1 WaveScan` on one page, `Wav6`
on the next): the further goes to the row on the other side. A row split by a break is printed on
both pages, its numbers and comment twice, and is read once. An NRPN printed as a run, `30H-37H`
over two lines, is kept as printed.

The rhythm lists follow the table, each caption under its list: the ARP list has twelve values, as
`ARP Division`'s `WW = [0,11]` has.

## What the builder takes as settled

- **Every row is its NRPN**, the value 14 bits on data entry: VV, the data MSB, on CC 6 and WW, the
  data LSB, on CC 38; the value is VV × 128 + WW. The instrument's MIDI page 6 must have **Param RX
  set to NRPN**.
- **The comment says what the value is.** None: the spec's default range, 0 - 8192 (`[0 - 2000H]`).
  `VV*128+WW = [a,b]`: that range, a choice where `means A / B / C` names each value. A rhythm list:
  a choice of its values. The depth comments (`0 means depth = -128 … 8192 means depth = 128`) and
  `GlidCurv`'s `[Log(-64), Lin(0), Exp(64)]` are shown on that scale. The cent comment (`above 4096,
  cent = value - 8192`) is a range 0 - 8192 with the rule in its description. Every comment the
  builder does not recognise stops the build.
- **One NRPN, several parameters.** `when VV=00H ,set OSC1 Mode, when VV=01H ,set OSC2 Mode …` is
  three parameters, VV choosing which; `VV = [0,3] means MUTATOR 1-4` is four; `VV=05H ,WW = [1,4]`
  (the arpeggiator's, the LFOs' and envelopes' switches) is one with VV fixed. Each value is VV ×
  128 + WW; where VV is fixed the value shown is WW. A choice of them carries the whole 14-bit
  value, which both engines now send as two bytes (a choice is otherwise one data byte). The signed
  semitone (`when WW > 64, semi = WW - 128`) is a choice of -63 to +64.
- **A run of NRPNs** (`Macro1 Depth1 to Depth8` on `30H-37H`, `LFO1 step9 to step64`) is a parameter
  for each.
- **Groups** are named by the layout, by the first row of each: the category column is set in the
  middle of each group with nothing between groups that the text shows (`ARP Chance`, the
  arpeggiator's last row, is nearer the Macro label than its own).

Corrected by the layout, each named in the profile: LFO4's Smooth, printed `VV=07H` as its Steps
is, and LFO5's Smooth and Steps, both printed `VV=08H`, are 06H and 07H as on LFOs 1 - 3; `BMP Sync`
(LFOs 1 - 5) and `marco1 panel value` (the eight macros) are spelt; `BP M` and `One- Shot`, split
by line breaks, are joined.

## The CC charts

The Explorer's, Deluxe's and Leviasynth's manuals print a CC chart and no NRPNs, so their profiles are
the chart: `Module  Parameter  CC`, sorted by module, two tables side by side with the header over
the left one only and the right one's first row beside it. Every number on a line ends a row, the two
cells before it its module and parameter, and the left table is read before the right. The
Explorer's chart runs onto a page whose right-hand table is the same chart sorted by number; the
layout takes that page's left table only. Each row is its controller, 0 - 127, grouped by its module;
bank select, the wheel, the pedals, master volume and all notes off are left out. The instrument
takes them when its Param RX is CC. The Explorer's and the Deluxe's charts are the Keyboard's; the
NRPN specification, written for the Keyboard and Desktop at firmware 1.5, is not taken to be theirs.

## The profiles

| Profile | Read from | Rows | Parameters | Choices | Messages |
| --- | --- | ---: | ---: | ---: | ---: |
| `asm-hydrasynth` | Hydrasynth MIDI NRPN & CC Communication Spec, firmware 1.5 | 464 | 888 | 100 | 773 NRPNs |
| `asm-hydrasynth-explorer` | Hydrasynth Explorer Owner's Manual 2.2.0, CC chart | 117 | 110 | 0 | 110 CCs |
| `asm-hydrasynth-deluxe` | Hydrasynth Deluxe Owner's Manual 2.2.0, CC chart | 117 | 110 | 0 | 110 CCs |
| `asm-leviasynth` | Leviasynth Keyboard Owner's Manual 1.2.1, CC chart | 110 | 103 | 0 | 103 CCs |
| `asm-leviasynth-desktop` | Leviasynth Desktop Owner's Manual 1.2.1, CC chart | 110 | 103 | 0 | 103 CCs |

None reads anything back: there is no published SysEx format to Pull with.

## What is left out, and what would read it

| Left out | Why | What would read it |
| --- | --- | --- |
| LFO1 Smooth and Steps, ENV5 Loop and Legato | the spec gives ENV5 LFO1's NRPN (3FH 04H) and these pairs the same VV; which is right is not printed | the instrument: send each and look |
| PRE-FX and POST-FX preset, Param3 - 5, sidechain type | `depends on PRE-FX type`: the values per effect are not listed | the manual's effect chapters, a list for each type |
| The macro targets and the mod matrix's sources and targets | a number above 127 moves to another VV (`WW+128` on VV=03H), and the spec lists no sources or targets | the lists, from the manual's mod matrix chapter, and a choice of VV-and-WW pairs |
| Following a VV-selected parameter when the instrument sends it | an incoming NRPN is matched by its number alone, and these share one | the inbound index keyed by NRPN and data MSB |
| The Explorer's, Deluxe's and Leviasynth's values | their manuals print a CC chart only | an NRPN specification for them, if ASM publishes one, read as the Keyboard's is |
| Parameters after firmware 1.5 | not in the spec | a later spec, if ASM publishes one |
