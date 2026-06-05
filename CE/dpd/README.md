# DPD — Device Profile Designer (new architecture)

Implementation of the overhaul specified in `dpd.zip/device-library-architecture.md`
(+ `dpd-mockup-v2.html`, `packing-studio.html`). This directory is the **foundation** —
Layer 0 (versioning) + Layer 1 (identity / inheritance / scopes / override) data model,
the parameter/packing/provenance models, and a resolver that proves it against real hardware.

## Files

| File | Role |
|---|---|
| `dpd.schema.json` | The published, open **JSON Schema** for a profile (the doc's mandated schema). Manufacturer / model / variant / component; scopes; multi-wire parameters; enum wire values; encoding/packing; provenance; override algebra. |
| `library/roland.json` | **Manufacturer** profile — SysEx mfr id `41`, broadcast device id `7F`, `roland-7bit` checksum, `dt1`/`rq1` message shapes. Conventions inherited by every Roland model. |
| `library/roland.gaia.json` | **Model** profile (the spec's "data port") — `inherits: roland`, model id `00 00 41`, a `tone` scope instanced ×3 (filter section + osc.wave + lfo.shape) and a `global` scope (master volume). The working GAIA, ported. |
| `tools/dpd.mjs` | Resolver + codecs + message builder (pure JS, no deps): inheritance merge, scope→flat-param resolution with absolute addresses + directional wires, value encode/decode, Korg 8→7 packing, checksum, template→bytes. |
| `tools/verify.mjs` | Verification harness — `node CE/dpd/tools/verify.mjs`. Validates the profiles, resolves the GAIA, rebuilds the **exact bytes captured from the real GAIA**, and round-trips every codec across full range. 43 checks, all pass. |
| `tools/emit-runtime.mjs` | Emits the player's inbound maps **derived from the profile** (`build/<id>.runtime.json` + into the web app) — the "maps → profile" generalization (inbound consumption). |
| `tools/emit-legacy.mjs` | Emits the C++ engine's legacy `.ceditor-device.json` **from** the DPD (`roland-gaia-dpd`) so OUTBOUND is DPD-sourced without rewriting the engine. |
| `tools/import-midici.mjs` | **MIDI-CI Property Exchange** importer — a captured PE resource → native JSON (names + CCs + identity), `partial`. |
| `tools/library.mjs` + `library.test.mjs` | **Layer 3 flywheel** curation core — round-trip gate, confirm-vs-fork, partial-accrete, conflict→version/variant, versioning/revert/pin, reputation, downloader caution. |
| `tools/designer-view.mjs` | Designer **resolved-view** surface — renders a real profile as the mockup's parameter table (incl. the multi-wire *Receives* column) to `build/designer.html`. |
| `tools/validate.mjs` | Shared dependency-free structural validator (the formal contract is `dpd.schema.json`). |
| `tools/import-ins.mjs` | **Layer 2 importer** — Cakewalk `.ins` → native JSON, marked `structural-only`, with a "what came through / what needs you" summary. |
| `tools/match.mjs` | **Layer 4 matcher** — builds the Universal Device Inquiry, parses the Identity Reply, resolves to a profile id with graceful degradation (model → manufacturer → none). |
| `samples/sample.ins` | Sample Cakewalk definition for the importer. |
| `build/roland.gaia.runtime.json` | Generated: SysEx-address→param, CC→param, enum wires, out addresses — for all 3 tones (39 addresses + CC 102/103/104), replacing the player's hardcoded 4-entry map. |

## The one schema change beyond the doc: multi-wire parameters

The doc/mockup model a parameter as a single `Msg type` + one `Address / CC`. Real hardware —
proven this week on the GAIA — has parameters whose **transmit ≠ receive**, plus a separate
**read**:

> **Cutoff** → `write` = DT1 @ `10 00 01 0C`, `read` = RQ1 @ same, **`rxLive`** = **CC 102** (the
> knob physically transmits CC, not SysEx; per-tone 102/103/104 via `ccStride`).

So a parameter carries up to three directional **wires** (`write` / `read` / `rxLive`), each with
its own `msg` (`dt1`/`rq1`/`cc`/`nrpn`). The common case (one SysEx address used for all three, or
one CC) collapses to a single `address`/`wire` and stays simple; the asymmetric case is now
expressible. This is the gap that would otherwise have forced splitting one knob into two params
and broken merge-on-drop.

## How it maps to the architecture doc

- **Layer 0 (versioning):** every profile has `id` + semantic `version` + `schemaVersion`. ✅ schema.
- **Layer 1 (identity/inheritance/scopes/override):** `kind`, `inherits`, `includes`, `scopes`
  (global/tone/part with base+stride+instances), `overrides` (set/add/remove/reorder). ✅ schema +
  resolver (GAIA uses inherit + a 3× tone scope).
- **Parameter / packing model:** `encoding` covers u7/s7/nibbles/**bitslice**/**packed8to7** — the
  one unifying "bits from places, assembled" primitive; round-trip verified across the **full**
  range incl. the Korg footgun (both MSB orders). ✅
- **Layer 2 (sources/provenance):** `provenance` + `completeness` on every profile; the `.ins`
  **importer** lands names + CC maps as `structural-only` with a what-came-through/what-needs-you
  summary. ✅ schema + one importer (MIDI-CI + more adapters remaining).
- **Layer 4 (matching):** Universal Device Inquiry build + Identity-Reply parse + id resolution with
  graceful degradation; optional `identity` codes on a profile select model/variant. ✅ logic
  (live MIDI inquiry + fingerprint need hardware).
- **Integration seam:** the resolved profile (flat params + wires + enum wires + packing) is exactly
  what merge-on-drop copies into the value tree; `emit-runtime.mjs` shows that slice. ✅ data shape.

## What remains (per the doc's build order)

1. **Runtime consumption — DONE for the GAIA panel (both directions DPD-sourced).** Inbound: the
   player derives its decode maps from the generated `roland.gaia.runtime.json` (hardcoded `INBOUND_*`
   deleted). Outbound: `emit-legacy.mjs` generates the engine profile `roland-gaia-dpd` from the DPD,
   and the slim panel's `deviceSession` points at it. Verified headlessly: the C++ engine compiles
   the DPD-generated profile byte-identically, and injected MIDI drives the controls. Follow-ups: a
   generic loader (any panel/profile, no per-device wiring) and the C++ engine reading the new schema
   natively (instead of via the generated legacy file).
The **computational + logic core of every layer is now built and verified.** What's left is the
interactive-app, server, and live-hardware integration that can't be built and verified headlessly:

2. **Full interactive Designer + Packing Studio UI** — the editing experience (drag-to-bind, the
   bit-grid packing editor). The resolved **view** (`designer-view.mjs` → `build/designer.html`) and
   the packing **logic** (`dpd.mjs` + full-range round-trip) are done; the Svelte editor surfaces
   need the app + visual QA.
3. **Community backend for the flywheel** — the curation **logic** (`library.mjs`, 21 tests) is done;
   running it at scale needs a server + auth.
4. **Live MIDI 2.0 hardware** — the CI Discovery handshake + capturing the GAIA's real `identity`
   codes. The PE parse (`import-midici.mjs`) and inquiry/match (`match.mjs`) **logic** are done.
5. **Engine reads the new schema natively** — today it consumes a generated legacy profile
   (`emit-legacy.mjs`), which works and is byte-identical; native C++ parsing is a follow-up.

## Verify

```
node CE/dpd/tools/verify.mjs          # 48 checks — schema, resolution, exact GAIA bytes, round-trips, overrides/mixins
node CE/dpd/tools/match.mjs           # 12 checks — inquiry build, identity parse, match + graceful degradation
node CE/dpd/tools/library.test.mjs    # 21 checks — round-trip gate, confirm/merge/conflict, versioning, reputation
node CE/dpd/tools/import-ins.mjs      # .ins -> validated structural-only profile
node CE/dpd/tools/import-midici.mjs   # MIDI-CI PE -> validated partial profile (8 checks)
node CE/dpd/tools/emit-runtime.mjs roland.gaia    # inbound map (player) ; emit-legacy.mjs -> engine profile (outbound)
node CE/dpd/tools/designer-view.mjs roland.gaia   # resolved-view HTML
```
