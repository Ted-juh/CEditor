# Tier 3 — the post-beta bets

> Status: **design, 2026-08-11.** Tier 3 of
> [`docs/beta-differentiation.md`](../../docs/beta-differentiation.md): four things that are too big
> or too speculative for a first beta and would each be a reason to write about the program.
>
> Two of them are genuinely new and are designed here. Two already have design records and are
> summarised with a pointer, because duplicating a design doc is how two documents start disagreeing.

## What Tier 3 is for

Tier 1 makes the program work end to end. Tier 2 makes it spread. Tier 3 is what you build once
people are already using it, when the question changes from *"why would I switch"* to *"why would I
ever leave."*

The ordering principle is the same as everywhere else in this program: **the ones that compound beat
the ones that impress.** Of the four below, one multiplies the rate at which devices get profiled —
which is the metric everything else in the product feeds off — and the other three are, honestly,
demos. Excellent demos. Still demos.

---

## 1. Profile from the manual

**The idea.** Feed the synth's MIDI implementation chart — the PDF, the scanned appendix, the plain
text file someone posted in 1998 — and get a draft profile out.

### Why this fits the program rather than being bolted on

There is already a **house pattern** for this, and it has been used twice:

| Importer | Source | Lands as | Status |
|---|---|---|---|
| `import-ins.mjs` | Cakewalk `.ins` | `structural-only` | Built |
| `import-midici.mjs` | MIDI-CI Property Exchange | `partial` | Built (offline) |
| [Ctrlr harvest](ctrlr-import-plan.md) | `.panel` / `.bpanelz` | `partial` | Designed |
| **Manual import** | **PDF / text** | **`partial`, every row a candidate** | **This document** |

The pattern is fixed and it is a good one: a Layer-2 importer never claims more than it knows. The
`.ins` importer's own header says it plainly — *"encodes ONLY names + CC maps + bank-select; no
SysEx/packing/checksums/dumps"* — and it emits a **"what came through / what needs you" summary**
rather than a profile that looks finished. Manual import is the fourth importer, and the hardest
one, but it obeys the same contract.

### Why it is normally a terrible idea, and why it isn't here

Extracting structured data from a PDF is a well-known way to produce confident nonsense. Tables span
pages, columns are whitespace rather than markup, scans are crooked, and — the specific hazard here
— **manuals are wrong**. Implementation charts describe the firmware the manual was written for,
omit undocumented parameters, and quietly disagree with the device in front of you.

What makes it acceptable in this program is that **it does not have to be right.** The
[Capture Session](capture-session-plan.md) can verify every extracted claim against the hardware in
seconds: write the value, read it back, compare. So the manual is demoted from *authority* to
*hypothesis generator*, which is a job it can actually do.

That inverts the usual risk. A wrong row costs one failed verification instead of an evening of
debugging, and the failure is attributed to the importer rather than to the synth.

**The rule that makes it safe, and it is not negotiable:**

> **A manual import never writes a confirmed parameter.** Everything lands as a candidate with its
> page and table cell recorded, and only hardware promotes it.

### What actually comes out of a chart

Implementation charts are better at some things than others, and the importer should be explicit
about which is which:

| Well described | Usually present | Rarely or never |
|---|---|---|
| Parameter **names** and groupings | SysEx address tables | Checksum range boundaries |
| CC numbers | Value ranges and units | Bit-packing layouts |
| Enum option **labels** | Address→parameter maps | Dump payload offsets |
| Channel/mode behaviour | Message templates | Anything undocumented |

Note where the value sits: **names and enum labels are the part a capture session cannot infer and
a human otherwise types by hand.** Even an importer that extracted *nothing but* the names, groups
and enum labels — and left every byte to the Capture Session — would remove most of the remaining
human time. That is the version to build first, and it needs no cleverness at all.

### When the manual is a photograph — which, for these devices, it usually is

Worth stating before the staging, because it corrects an assumption: a *text* PDF is the lucky
minority. The devices this feature exists to serve are the ones nobody profiled, which means the old
ones, which means the manual is a scan — often a phone photograph of a page, crooked, curled and
yellowed. **Plan for the scan as the normal case.**

The pipeline, in the order that matters:

1. **Condition the image first.** Deskew, dewarp (a phone photo has page curl), despeckle, adaptive
   binarization — Sauvola rather than a global threshold, because vintage paper discolours unevenly
   — and upscale to ≥300 DPI, 600 for small tabular digits. Most OCR failure is image failure, and
   this stage is worth more than the choice of recognizer.
2. **Recover the table before recognising characters.** This is the crux and the usual mistake. The
   meaning of an implementation chart lives in its *grid* — which column is address, which is name,
   which is range. OCR the page as prose and the result is a stream of digits with no columns, which
   is worse than nothing because it looks like data. Detect ruling lines, or for unruled tables
   recover columns from vertical whitespace projection profiles, rebuild the cell grid, then **OCR
   each cell separately**.
3. **Restrict the charset per column.** Once a column is known to be hex, allow only `0-9A-F`;
   decimal columns get `0-9`. One setting, most of the errors gone before they happen.
4. **Repair with structure, not with confidence scores.** Hex is the worst charset a scan can carry:
   `0`/`O`/`D`, `8`/`B`, `5`/`S`, `1`/`I`, `6`/`G`, `2`/`Z` are exactly the glyphs addresses use. But
   an address column is normally a **monotonic sequence**, so a column reading `00 01 02 O3 04`
   corrects itself. Declared block sizes are a second constraint: if the table says 0x40 bytes, the
   row count and the address span must agree.

**And then the conclusion that should reshape the staging: for a scan, do not OCR the byte tables at
all.**

The Capture Session already knows the true address of the parameter you just moved — it got it from
the hardware, by diffing dumps, exactly. What it cannot infer is that the parameter is *called*
"Filter Cutoff". So the manual only has to supply **names**, and names are the easiest thing on the
page: larger type, in a column, in ordinary words. A misread name is visible to a human at a glance
and harmless — "Fiiter Cutoff" fools nobody — whereas a misread hex digit is invisible and poisons
the profile.

> **Hardware supplies the bytes. The manual supplies the vocabulary.** Each does the half it is
> actually good at, and neither is asked to do the other's.

Two cheap checks before any of this runs: many "scanned" PDFs already carry an OCR text layer from
whoever archived them, and for well-known synths an enthusiast usually transcribed the spec to plain
text decades ago. Look for both first.

### Where a language model fits, and where it must not

The table-shaped parts of a chart are ordinary parsing. The messy parts — a photographed two-column
appendix, a table split across a page break, a vendor's private notation for nibbles — are where a
model earns its place, and a vision model reads a photographed table considerably better than
classical OCR plus layout detection, emitting structured rows directly. It also invents plausible
hex with total confidence, which is why none of the constraints below relax for it.

Constraints, in order of importance:

- **Optional and bring-your-own-key.** The program must work identically with it switched off; a
  local parser handles clean text and tables, and the model is an accelerator for the awkward
  fraction. Nothing about CEditor should require an account with anybody.
- **It proposes, the schema disposes.** Output is validated against `dpd.schema.json` before it is
  shown. An extraction that does not validate is discarded, not repaired.
- **Every row keeps its citation** — page and table — so a human can check the source in one click.
- **Never a silent network call.** The user chooses to send a document somewhere, per document, with
  the destination named.

### Stages

**S1 — Names and labels only, from text.** Embedded text layers and clean tables → parameter names,
groups, enum labels, CC numbers. No addresses, no codecs. Lands `structural-only`. Cheap, safe, and
it removes most of the typing for anything with a text-bearing manual.

**S2 — Names and labels from a scan.** Image conditioning, table recovery, per-cell OCR with column
charsets — aimed at the **name column only**. This is the stage that reaches the devices the feature
is actually for, and deliberately still touches no addresses. It is also where the *assisted
transcription* UI belongs (below), because with a human glancing at the crops this stage is already
good enough to ship.

**S3 — Verification handoff.** Feed the extracted names, and any candidate addresses, into the
Capture Session's verify mode (Mode C), so the flow is *import → verify → done* rather than
*import → hope*.

**S4 — Address tables.** Parse the SysEx address table format most vendors use, with monotonic-column
and block-size repair. Candidates only, and worth it only where the source is text or a clean scan —
on a poor photograph the hardware is a better and faster oracle than the page.

**S5 — The awkward fraction.** Optional model-assisted extraction for irregular layouts and bad
photographs, with citations and schema validation.

### The UI this implies

Not "extract and hope" — **assisted transcription**. The page image on one side, the extracted rows
on the other, and each row highlighting the region of the image it came from. Correcting a misread
by glancing at the crop takes seconds; typing the table from scratch takes hours. Naming it
assistance also sets the expectation honestly, which "automatic extraction" does not — and the
expectation is the thing that decides whether a user trusts the result or is quietly burned by it.

### Verification

- Fixtures from the two profiles already in the repository: reconstruct chart-shaped text for the
  GAIA and the AN1x, import it, and assert the result matches the real profile's names and
  addresses. The answer key is in the tree.
- A deliberately hostile fixture: a table split across a page break, one wrong row, a parameter the
  chart omits entirely. Assert the importer flags the split, marks the wrong row as unverified, and
  does not invent the missing one.
- **Synthetic scans**, which are the only way to test the image path reproducibly: render a known
  chart to an image, then degrade it on purpose — rotate two degrees, add page curl, add noise,
  drop the contrast, halve the resolution — and assert the name column still comes out and the
  address column either corrects itself or is reported as unreadable. Never silently wrong. A real
  photographed page is a useful smoke test and a hopeless regression test.
- Assert the invariant directly: **no imported parameter is ever emitted as verified.**

---

## 2. Cross-device patch translation

**The idea.** *"Take this Juno patch to the Blofeld."* Read a patch on one synth, and produce the
nearest equivalent on a different one.

**Why it is expressible here.** Because the DPD is semantic. A parameter is not a byte offset — it
carries an id like `filter.cutoff`, a `group`, a `valueType`, a real `range`, and enum entries with
human labels. Two profiles therefore have something to match *on*. A program whose device layer is a
SysEx template has nothing to compare but bytes, and bytes do not translate.

**What it needs that does not exist yet:** a **canonical vocabulary** — an agreed set of parameter
meanings (`filter.cutoff`, `amp.envelope.attack`, `osc1.waveform`) that profiles map onto. The
foundation for this is already in the library: profiles `inherit` from manufacturer bases
(`roland.json`, `yamaha.json`), and `generic.cc.json` is effectively a vocabulary of standard
controllers already. A canonical layer is the same mechanism pointed at meaning instead of at
message shapes.

**The honest limits, which are the interesting part:**

- **Ranges differ in kind, not just in size.** A cutoff in Hz and a cutoff in 0–127 need a mapping
  curve, not a rescale, and the right curve depends on the filter.
- **Topologies differ.** A 4-pole ladder and a state-variable filter do not sound the same at the
  same cutoff. Translation is *approximation*, and the UI must never imply otherwise.
- **Things have no counterpart.** The target has no sub-oscillator; the source has no wavetable.
  These are the *interesting* output, not an error case.

So the feature is not "translate", it is **"translate and report"**: a result plus a plain list —
*n parameters matched exactly, m approximated with a curve, k had no counterpart and were left at
their defaults.* Same shape as the Ctrlr import report and the Auto-Panel regenerate report, for the
same reason.

**What it reuses:** the interpolation and blending mathematics already written for
Timbre Space and
Preset Constellation — which already
weight and blend whole patches across DPD ranges, stepping enums and skipping the
non-interpolatable. Translation is that machinery pointed at two devices instead of two patches.

**Where it lives:** an editor command over the librarian, not a panel component. And it wants the
canonical vocabulary to exist first, which makes it genuinely late-order work.

---

## 3. Modulation node-graph — already designed

Design record: `node-graph.md`.

A patch-cord canvas: sources wired to destinations with depth and curve. The record's own key
decision is the right one — **a cable *is* a route**, sharing the existing route model with the
properties-panel link and the Link Mapper, so it is a third *editor* over one model rather than a
third model. The remaining work is almost entirely the canvas UI, which the record identifies as
the biggest lift in its tier.

Why it sits in Tier 3: it is the best screenshot the program could have and it does not make
anything *possible* that the Link Mapper cannot already do. Flash, not moat. Build it when the
program needs a magazine cover.

## 4. Snapshot Morph — half shipped

Design record: `macro-and-morph.md`.

The **Macro** half is shipped: one knob to many destinations, each with depth, curve and range,
through the fan-out mechanism, with a pure engine and tests. What remains is the **snapshot morph** —
define the panel at 0% and 100% and interpolate the whole patch between them — which needs the
snapshot system underneath it.

It is the piece that most completes the "editor becomes instrument" story, and it is the cheapest of
the four once snapshots exist, because the interpolation rules (step enums, skip the
non-interpolatable, respect DPD ranges) are already written and shipping inside Timbre Space and the
Constellation.

---

## Ranking Tier 3

| Bet | Compounds? | Verdict |
|---|---|---|
| **Profile from the manual** | **Yes** — every import feeds the profile library | The only one that is strategy rather than spectacle. Even S1 alone is worth it. |
| Snapshot Morph | No, but cheap and finishes a story | Best effort-to-payoff of the four |
| Cross-device translation | No — but nothing else can do it at all | The unforgettable demo. Needs the canonical vocabulary first. |
| Node-graph | No | The screenshot. Build it when there is a reason to be looked at. |

If only one of these is ever built, build the manual importer's **S1–S2** — names, groups and enum
labels, from text and then from a scan — and hand the bytes to the Capture Session. It is the least
glamorous item in Tier 3 and the only one that makes the program permanently faster at the thing it
exists to do.
