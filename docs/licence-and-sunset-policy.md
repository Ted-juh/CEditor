# Licence, updates and the sunset promise

This is the policy the software actually implements. Every promise below is matched by code and
by a test, and where a test enforces a promise this document says which one — a policy nobody
can check is a intention, not a commitment.

If this document and the code ever disagree, the code is right and the document is a bug.

---

## What you buy

A **perpetual licence**. You own the version you bought and every version covered by your update
entitlement, and you keep them.

| Edition | Price | What it is |
|---|---:|---|
| Free | — | The whole keyboard: hardware detection, control testing, the display, control pages, mappings, MIDI routing, preset browsing and diagnostics. One plug-in loaded at a time. |
| Founder | €39 | Core, at the early-access price. The same entitlements. |
| Core | €59 | Everything above, with no limit on how many plug-ins you load. |
| Pro | €89 | Core plus the pattern engine and clips, scenes and setlists, return buses and extra outputs, and script actions. |

**Basic hardware integration is never a paid feature.** The display, the control pages, the
mappings, the splits and layers, VST3 hosting, preset browsing and saving and recalling your
setups work on every edition including the free one. You should not have to pay to use the
defining controls of your own keyboard.

That is not a slogan. The list lives in the code as `neverGated()` in
`CE/src/Licensing/Entitlements.h`, it is shown in the product's Licence panel, and
`LicensingTests` walks it against every edition. If somebody ever moves one of those behind a
paid tier, the build fails.

---

## Activation

**Offline.** Your licence is a signed file. The product verifies the signature itself, against a
key built into it. It does not contact anything, at first launch or ever, and there is no code in
the licensing sources that could.

**Your licence covers three machines** (the number is written into your licence, so a different
arrangement is a different number rather than a special case). Installing it on a machine records
that machine; releasing it frees the record and hands you a receipt with the machine, the date and
your order number on it.

**What that count really is, plainly.** Each install records the machines *it* has seen. Two
separate installs on two different machines cannot see each other's records, because that would
need a server and there is no server. So the number is an honest statement of what you bought and
a way to keep track, not a lock somebody is enforcing from a distance. We would rather tell you
that than claim an enforcement that does not exist.

**Your machine's identity never leaves your machine.** The activation record holds a hash, not
your hardware addresses, and the support bundle carries only its first eight characters.

---

## Updates

Your purchase includes updates published up to the date on your licence. All 1.x releases are
included with the initial purchase; a future major version may be an optional paid upgrade.

**When your update entitlement runs out, nothing happens to your installation.**

- It keeps running.
- It keeps every feature of the edition you bought.
- Your projects, presets and mappings keep opening.
- There is nothing to renew in order to go on using what you have.

The product tells you: a licence past its update date reads "Licensed — updates lapsed", and the
panel says *this version keeps working for good* in as many words.

In the code, `LicenceStatus::runnable()` is a compile-time constant rather than a computation.
That is deliberate: the way to guarantee something never happens is to leave nowhere in the
program where it could. A test installs a licence whose updates lapsed years ago and then uses
the Pro features to prove none of them went with it.

Every ambiguity resolves in your favour. An entitlement date the software cannot read counts as
no limit. A release date it cannot read counts as included. An edition name from a newer version
than yours reads as the free edition rather than as a lockout.

---

## What this software will never do

These are commitments, and each one is an absence in the code rather than a promise on top of it.

- **No subscription.** There is nothing to keep paying.
- **No online check at launch, or at any other time.** The licensing code contains no network
  calls and links nothing that could make one.
- **No single-computer lock.**
- **No features removed when an entitlement lapses.**
- **No cloud-only storage.** Your presets, racks and sessions are files on your disk in a
  documented JSON format.
- **No licence server.** There is nothing that can go down, and nothing whose shutdown you need
  to worry about.

---

## The sunset promise

Software outlives companies. The failure this audience has already lived through is a product
that stopped being available and took a keyboard's workflow with it.

**If this software is ever discontinued, a sunset key will be published.**

The sunset key is a licence file, signed with the same key as every other, with one difference:
it is issued for every product rather than one, and it licenses every edition on every machine,
permanently. Install it and the software is fully licensed, for good, with no seat count and
nothing that can expire.

Publishing it needs no server, no website that must stay up and nothing running anywhere. It is a
few kilobytes of text. Once it is published it cannot be withdrawn, because verifying it is
something your own copy does offline.

The mechanism exists **now**, not as a plan for later:

- `LicenceDocument::sunset` and the `"*"` product id, in `CE/src/Licensing/Licence.h`.
- The verification path in `verifyLicenceFile`, which recognises it before any product check.
- `CEditorLicenceTool sunset`, which is how it gets signed.
- Tests in `CE/tests/LicensingTests.cpp` covering that it unlocks every product, that it reports
  no seat limit, that it cannot expire — and that an *unsigned* claim of sunset is worth nothing,
  so the promise cannot be forged either.

It is deliberately not a back door. It is signed like any licence, which means only the key
holder can issue it, which is what makes it a promise rather than a hole.

---

## If something goes wrong

The product exports a support bundle: your version, your machine's OS and architecture, the audio
and MIDI devices it can see, the plug-in scan results, and your rack manifest. It shows you the
exact list before writing anything.

It is gathered by an allowlist — nothing travels unless it is named in the code — so licence
files, tokens and unrelated documents that happen to sit in the same folder cannot be in it. Your
plug-ins' own saved sounds are left out by default; the bundle carries their size and a checksum
instead, which is enough to diagnose almost anything without shipping your work.

See [the reliability record](design/instrument-host-reliability.md) for the whole of that.

---

## One thing this policy cannot decide on its own

**Selling this software needs a JUCE commercial licence, and that decision has not been made.**

The repository is AGPLv3 today, for the reason set out in [the licence
decision](license-decision.md): JUCE 8 is dual-licensed, nobody has bought the commercial half,
and AGPLv3 is the only licence that is actually valid without it. AGPLv3 and the commercial model
described above are not compatible in the way a purchaser would assume — anyone who receives a
binary is entitled to its source, which includes the licence check.

That does not make the mechanism pointless, and it is worth being exact about why. An offline
licence check has never been a defence against somebody determined to remove it; anyone willing
to patch a binary does not need to forge a licence. What it is good for is telling a paying
customer what they bought, keeping an honest record of their seats, and making casual copying
take deliberate effort. All of that works under any source licence.

But **the price table and the edition ladder above are a plan, not an offer**, until either a
JUCE commercial licence is bought or the business model is changed to one AGPLv3 supports. The
mechanism is built, tested and ready for whichever answer that is. The decision is the owner's
and it is a commercial one, not an engineering one.

## Where this comes from

The approved implementation baseline, §19 ("Trust"), §20, §26.2, §26.3 and §27. §27's list of
things to avoid is quoted in the source files that implement each one, so the reason a
prohibition exists sits next to the code that honours it.
