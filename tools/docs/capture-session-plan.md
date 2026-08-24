# Capture Session — learning a synth from the synth

> Status: **S1–S4 built, 2026-08-23.** The inference engine, the session state machine and the
> guided screen exist; see "What was built" at the foot of this file. Originally written as design,
> 2026-08-11. Tier 1 #1 in
> [`docs/beta-differentiation.md`](../../docs/beta-differentiation.md), and the proposed headline
> for the first beta. Companion to
> [`device-profile-engine-mvp-plan.md`](device-profile-engine-mvp-plan.md) (the engine this writes
> into) and [`midi2-integration-plan.md`](midi2-integration-plan.md) (the other road to the same
> destination).

## The problem

Every editor ever written begins with a human transcribing a MIDI implementation chart out of a
manual. That is the category's real bottleneck — not layout, not scripting, not export. It is why
there are thousands of synths and a few hundred editors, and why a device becomes unsupported
forever when the one person who profiled it moves on.

The DPD is an excellent thing to *have* and an expensive thing to *fill*. Nothing about CEditor
changes that today: the Parameters screen is a table you type into, and
`DpdParametersScreen.svelte:81` — `◉ MIDI learn`, `disabled title="Coming soon"` — is where the
answer was always going to go.

## The feature

Put the device in the room. Press Learn. Turn a knob **on the hardware**. CEditor tells you what
parameter that was, and writes it into the profile with a test vector attached.

The insight that makes it work is that a synth already describes itself — it just does so in bytes
rather than in prose. Every edit you make on the front panel is a statement about the device's
parameter map, and either the synth transmits that statement directly (CC / NRPN / SysEx on edit)
or it will hand over its whole state on request, at which point **two dumps that differ by one
front-panel move locate a parameter exactly**.

## Why this is feasible here and essentially nowhere else

The schema already anticipated it. `dpd.schema.json` defines `provenance.source` with the enum
`official | community | imported | **learn**`, alongside `verifiedRoundTrip`,
`verifiedOnHardware` and `confirmations`. The place to put a learned parameter, and the vocabulary
for saying how much to trust it, are already written down.

More to the point, the engine already contains every piece the inference has to produce:

| The inference must decide | Where that already lives |
|---|---|
| Wire address | `parameter.address` (`$defs/hexBytes`), relative to the scope base |
| Byte count | `parameter.size` |
| Value codec | `encoding.type` — `u7 · u8 · s7 · u14 · u14-lsb · nibbles · packed8to7 · bitslice` |
| Range and sign | `parameter.range`, `valueType` (`continuous · signed · enum · toggle · trigger`) |
| Direction | `access.read/write`, and `wires[]` with `dir: write · read · rxLive` |
| Live-edit transmission | `rxLive` — the GAIA case, written by SysEx but transmitted as CC |
| Checksum | `$defs/checksum` — `roland-7bit · sum-7bit · xor · none` |
| Where it sits in a dump | `dumpLayoutEntry` — `{ param, offset, size, codec }` |
| Whether it is right | test vectors, already runnable from the Designer |

And the runtime already does the mechanical work the session depends on: `ingestIncomingMidiMessage`
and the monitor feed, `parseDumpMessage`, dump collections that track received / missing /
**duplicate address ranges**, checksum-failure classification, profile-timing-aware pacing, and
outbound origin tracking with echo suppression.

**Nothing here needs new plumbing. It needs a new reader of plumbing that exists.**

There is one more argument, and it is the schema's own. On `encoding.packOrder`:

> *"INDISTINGUISHABLE by inspection - must be round-trip verified across boundary values
> (0,127,128,255)."*

The schema already says, in its own words, that some facts cannot be read out of a manual and can
only be settled against hardware. A capture session is that verification, promoted from a caveat to
a feature.

---

## The three capture modes

The session picks a mode from what the device actually does, and says which one it is in. A synth
that transmits nothing and dumps nothing cannot be learned, and the honest UI says so on the first
screen rather than after twenty minutes.

### Mode A — Live transmit (easy, immediate)

The device sends something when you move its front panel. Watch the stream, attribute the movement.

- **Attribution rule: take the controller that moved the *most*, not the one that spoke first.** A
  synth idles with active-sensing, clock, and often a stream of unrelated CCs; first-past-the-post
  learns the wrong thing roughly as often as it works. The Expression Router already implements
  exactly this reduction for its own MIDI learn — the logic exists and is in the wrong place.
- CC is direct. NRPN needs the four-CC run assembled before attribution. A SysEx message on edit is
  the best case of all: it usually *is* the write message, so address and encoding fall straight
  out of the parameter-change frame.
- Watch a full sweep, not a single value: min-to-max travel gives the range, the number of distinct
  steps separates `enum`/`toggle` from `continuous`, and monotonicity vs wrapping catches a signed
  parameter presented as 0–127 with a bias.
- Output: a `wires[]` entry with `dir: rxLive`, plus the write wire when they coincide.

### Mode B — Dump diff (the valuable one)

The device answers a dump request but transmits nothing on edit — the common case for anything made
before the mid-90s, and precisely the population no editor covers.

The loop:

```text
1. Request a dump.                          → baseline payload B0
2. "Change one thing on the synth."
3. Request a dump.                          → payload B1
4. diff(B0, B1) → the set of changed byte offsets
5. Ask for one more value of the same parameter → B2, to confirm and to fit the codec
6. Name it. Write parameter + dumpLayoutEntry + test vector. Next.
```

What each diff outcome means — and this is the whole engine:

| Diff result | Reading |
|---|---|
| Exactly one offset changed | `u7` (or `u8`) at that offset. The simple, common case. |
| One offset + one trailing byte | The trailing byte is the **checksum**; fit it against the four known algorithms over candidate ranges |
| Two adjacent offsets, one moving in coarse steps | `u14` — determine MSB-first vs LSB-first from which byte is coarse |
| N adjacent offsets each ≤ 15 | `nibbles`, N bytes, high nibble first |
| One offset, but only some bits move | `bitslice` — and the *other* bits of that byte belong to a different parameter. Record the candidate; it is a finding, not a failure |
| The whole tail changed | Block packing — try `packed8to7` with both `packOrder` values and keep whichever round-trips at 0/127/128/255 |
| Nothing changed | Not in this dump. Either a different dump kind, or a global/edit-buffer-only parameter |
| Everything changed | The payload is packed, or the dump carries a timestamp/counter. Mask the volatile offsets and retry |

Two engineering details decide whether this is pleasant or maddening:

- **Volatile-offset masking.** Take *two* baselines with nothing changed in between and difference
  them. Any offset that moves on its own — a counter, a live LFO value, a checksum of a checksum —
  goes on a mask and is excluded from every later attribution. Do this once at session start and
  the whole rest of the session gets quieter.
- **Unpack before diffing.** If the dump declares `payload.pack`, diff the *unpacked* payload.
  Diffing packed bytes smears one parameter across a group and produces nonsense with high
  confidence, which is the worst possible failure mode.

### Mode C — Guided from a partial profile

The profile already exists but is thin — a MIDI-CI import (`source: midi-ci`, `completeness:
partial`), a Ctrlr harvest, or a hand-entry that stopped halfway. Here the session runs in
**verify** mode instead of discover mode: for each declared parameter, write a value, read it back,
and confirm the round trip. Failures are the output. This is the cheapest route from
`completeness: partial` to `verifiedOnHardware`, and it is what turns
[the Ctrlr harvest](ctrlr-import-plan.md) and MIDI-CI discovery into trustworthy profiles rather
than plausible ones.

---

## Confidence, and never guessing quietly

Every inference carries a confidence and its evidence. The rule:

> **High confidence writes a parameter. Low confidence writes a candidate. Nothing writes silence.**

| Level | Meaning | Lands as |
|---|---|---|
| **Confirmed** | Round-tripped on hardware — written, read back, byte-identical, across boundary values | Parameter + test vector, `verifiedRoundTrip` |
| **Probable** | Consistent across ≥3 observed values, one codec fits, no competing hypothesis | Parameter, flagged for confirmation |
| **Candidate** | One observation, or several codecs fit equally | Draft row with the alternatives listed |
| **Conflict** | Two parameters claim the same offset/bits | Surfaced as a pair, with the bit-field question asked explicitly |

The reason to be strict is that this feature's whole value is trust. A profile that is 95% right and
does not say which 5% is worse than no profile, because the user debugs their *synth* for an evening
before suspecting the tool. A learned parameter must always be able to answer "how do you know?"

## Echo is the trap

The panel sends. The device echoes. The session learns its own transmission and is delighted with
itself. This is the single most likely way to ship something that demos beautifully and is wrong.

The defence exists — the runtime already has outbound origin tracking, short echo-suppression
windows and live-conflict detection — and the capture session must be **built on it rather than
beside it**. Belt and braces for the session specifically: during capture the panel sends nothing
at all except explicit dump requests, and any inbound message inside the suppression window of an
outbound one is discarded rather than attributed.

## Stages

Each stage is independently useful and independently shippable.

**S1 — Learn one CC.** Mode A, CC and NRPN only, into an existing profile. Replaces the disabled
button with a working one. Small, and it makes every modern-ish synth profileable in an afternoon.

**S2 — Dump diff for `u7`.** Mode B, single-byte parameters only, with volatile-offset masking and
checksum detection. This is the stage that opens the vintage catalogue, and `u7` alone covers most
of it.

**S3 — The wide codecs.** `u14`, `nibbles`, `s7` bias detection, `bitslice` candidates, and
`packed8to7` with round-trip disambiguation of `packOrder`. Now the awkward devices work — and the
awkward devices are the ones nobody has profiled.

**S4 — Verify mode.** Mode C over an existing profile, producing the `verifiedOnHardware` stamp.
Cheap once S1–S3 exist, and it is what makes imported profiles worth trusting.

**S5 — Session ergonomics.** Save and resume a capture session, undo an attribution, bulk-name from
a list pasted out of the manual (the manual is still useful — as *names*, which it gets right, not
as *bytes*, which is where it lies), and export a session report.

## The UI shape

One guided surface, not a table. The session is a conversation with three states, and the screen
should never show more than one of them:

- **Setup** — device, ports, which mode is available and why, the volatile-offset baseline.
- **Capture** — one large prompt ("Change one thing on the synth, then press Captured"), the live
  diff as it comes in, and the hypothesis in plain language: *"one byte at payload offset 0x2C,
  values 0–127, no checksum change — looks like a plain 7-bit parameter."*
- **Confirm** — name, group, value type, and a **Test** button that writes the value back and asks
  the human whether the synth did the thing. That question is the ground truth, and no amount of
  byte analysis substitutes for it.

Where it lives: a fourth mode of the DPD Designer alongside Discovery / Parameters / Overview,
because the output is a profile and the Designer already owns profiles.

## Verification

Do not test this against hardware alone; hardware is not reproducible and a nightly cannot own a
Juno.

- **A simulated synth** in the test suite: a fake device with a known parameter map, a dump format,
  a checksum, a deliberate bit-field, one packed payload, and a volatile counter byte. Run the
  inference engine against it and assert it recovers the map. This is the real test, and it can run
  in CI forever.
- **Adversarial fixtures**: idle CC chatter during capture, a device that echoes, a dump with a
  timestamp, two parameters sharing a byte, a checksum over a range that excludes the header.
- **Round-trip assertion** on every produced parameter — encode then decode across the full range
  plus 0/127/128/255, the boundary set the schema already names.
- **Golden profiles**: run the engine over dumps synthesised *from* the existing `roland.gaia` and
  `yamaha.an1x` profiles and assert it recovers what those profiles already declare. The answer key
  is in the repository.

## Risks, stated plainly

- **Some devices cannot be learned.** No transmit, no dump, no luck. Detect and say so up front.
- **A dump is not the whole device.** Edit-buffer versus written-patch versus global parameters are
  different address spaces; the session must ask which one it is looking at rather than assume.
- **Bit-packed parameters need a human.** The engine can say "these four parameters share this
  byte"; only a person can say which nibble is Attack.
- **It is a slow feature to demo badly.** Twenty parameters is twenty knob turns. Ergonomics are not
  polish here — they are the difference between a tool people use and a tool people try once. S5 is
  not optional.
- **The manual is still worth reading.** This does not replace documentation where documentation
  exists; it replaces the *transcription*, and it covers the devices where documentation never
  existed.

## Open questions

- Should a capture session ship as a **shareable artifact** — the raw dumps plus attributions — so a
  second person with the same synth can confirm someone else's session offline? (`confirmations` in
  the provenance block suggests the schema was already thinking about this.)
- Does the session write into a draft profile that is merged on accept, or straight into the live
  one with undo? Draft-and-merge is safer; live-with-undo is faster to build and probably nicer to
  use.
- How much does the **name-from-manual** paste path matter versus typing each name? It is the bulk
  of the human time once the bytes are solved.
- For Mode A, how long a sweep is enough to call a range confidently — and should the session ask
  for the extremes explicitly rather than infer them from whatever the user happened to do?

---

## What was built, 2026-08-23

`utils/captureInference.js` (the engine), `utils/captureSession.js` (the state machine),
`editor/dpd/DpdCaptureScreen.svelte` (the conversation), and `test/support/fakeSynth.js` plus
`test/captureInference.test.js` (the answer key). S1, S2, S3 and S4; S5's ergonomics are partly
there — undo-last and a session summary — and save/resume and the manual-name paste are not.

**S5, revisited 2026-08-24. All of it is built.** The manual-name paste, the session report and
save/resume.

**The session lives on the panel**, beside `deviceSession`, so it survives whatever the panel
survives and moves between machines with the file. The cost was named before the choice was made and
is accepted: a shared `.cepanel` carries a half-finished capture and the raw dumps it took off
somebody's synth. It is NOT in the build payload — `serializePanelForExport` passes
`captureSession: null`, because the player's C++ reads Core, Behavior and Scripts and has never
heard of a capture, so carrying one would compile tens of KB of SysEx into a binary for nothing.

**`normalizeCaptureSession` coerces rather than trusts**, because this reads a document.
Everything downstream indexes into `baselines` as arrays of bytes and one string where an array
belongs makes the diff engine produce confident nonsense. A session with nothing learned and no
baselines returns null: it is indistinguishable from a fresh one, and restoring it opens the screen
mid-conversation with nothing to show. Mid-hypothesis `observations` are dropped — scratch for one
prompt, the largest thing in the session, and a hypothesis resumed without the question that
produced it is one nobody remembers being asked.

**Resume restores the baselines too**, which is the fast path and the one with the sharp edge.
`recordDump` diffs every dump against `baselines.at(-1)` through the stored `mask`, so a session
resumed after a power-cycle, a patch change, or a different unit on the same port is measuring
against a device that no longer exists. A large difference surfaces honestly as `packed` or
`inconsistent`; a small one reads as a parameter and is wrong.

That is a warning rather than a refusal, by decision. What makes it act like one is `baselineAgeHours`:
the banner says how old the baseline is, because "less than an hour ago" and "nine days ago" call
for different answers, and it carries a **Retake baselines** button that clears the perishable half
and keeps what was learned. The split is the whole reason this stayed small — `learned` is an hour
of work and cannot be rebuilt; baselines, mask and checksum are three dumps.

`namesFromPaste` is POSITIONAL and shows the pairing before it lands. Matching by similarity would
pair "Cutoff" with "Cutoff Env Amount" on a page that has both, and a paste starting one line too
high would rename everything below it silently — so it reports too-few and too-many names in both
directions and the author sees old → new before applying.

`sessionReport` groups by how much a row is worth trusting, hardest evidence first, and carries each
row's evidence with it. A report in capture order buries the four rows that need attention under the
thirty that do not, and six months later "u7 at offset 44, values 0-127" is the difference between
trusting a row and re-capturing it.

**The simulated synth is the feature, not the test scaffolding.** This plan said "hardware is not
reproducible and a nightly cannot own a Juno", and that turned out to shape everything: the fake
device carries a plain u7, a 14-bit value, a nibble field, **two parameters sharing one byte**, a
volatile counter that ticks on every dump, idle CC chatter on the live stream, and a Roland-style
checksum **over a range that excludes the header**. The engine recovers the whole map from dumps
alone, and every awkward case in that list caught a real defect on the way.

**Four rulings the plan did not have to make, and the engine did.**

*A shared byte needs three conditions, not one.* "Some bits did not move" is not evidence of a
bit-field. Bits `{0,1,2,3,5,6}` moving is a plain byte whose bit 4 happened not to flip across three
samples, which is common — so a bit-field now requires the moved bits to be **contiguous** (a real
field is a mask and a shift), at most **five wide** (a six-bit "field" in a seven-bit byte is a u7
that never reached its top), and some bit outside the run to be **actually used** in some
observation. Without that last one the engine invents a bit-field wherever a value stayed small.

*A wide parameter can leave a byte unchanged.* `0x0064 → 0x1234` moves three of four nibbles,
because the last one is 4 either way. Demanding identical diff signatures across observations would
call that "two controls were moved". So nested signatures over a contiguous run take the union, and
only genuinely disjoint ones are reported as inconsistent.

*The tightest checksum range wins.* A leading byte that is zero in every payload contributes nothing
to a sum, so "covers it" and "does not" fit equally. The start offset is scanned descending and the
wider fits are reported alongside, because the difference matters the first time a device sends a
non-zero header.

*A partial sweep is not a selector.* Five readings at 0, 20, 40, 80, 127 are somebody sweeping a
knob. "Few distinct values" alone calls that a five-way enum every time; **evenly spaced** distinct
values is the discriminator, and it is the only one available from a single pass.

**Echo is a constant, not an absence.** `SENDS_DURING_CAPTURE = false` is a value that can be
asserted rather than a gap in the code, and inbound messages inside the echo window are discarded
without being counted. The plan is right that this is the likeliest way to ship something that demos
beautifully and is wrong, and a rule that exists only as missing code is a rule somebody adds code
past.

**The human's answer is the only thing that confirms anything.** A hypothesis reaches `probable` on
three consistent observations and no further. The Confirm step's checkbox — "I wrote the value back
and the synth did the thing" — is what makes it `confirmed`, and the provenance block records which.
