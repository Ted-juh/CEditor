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
| `tools/dpd.mjs` | Node entry: file loading + inheritance orchestration + message builder. Re-exports `codecs.mjs` + `resolve.mjs` so existing importers are unchanged. |
| `codecs.mjs` | **Browser-safe** pure codecs (no Node deps): hex↔bytes, address resolve, `roland-7bit` checksum, value encode/decode, bitslice, Korg 8↔7 packing. Shared by the Node tools and the browser UIs. |
| `resolve.mjs` | **Browser-safe** pure resolution: scope→flat-param expansion with absolute addresses + directional wires, override algebra, mixin composition. Imports only `codecs.mjs`. |
| `merge.mjs` | **Browser-safe** merge-on-drop translation (doc §Integration): a resolved param → (a) a legacy **descriptor** the existing fit/adopt logic consumes, and (b) a **self-contained value-tree section** carrying address/CC + enum wire values + packing + the required `source:"id@version"` stamp. |
| `tools/verify.mjs` | Verification harness — `node CE/dpd/tools/verify.mjs`. Validates the profiles, resolves the GAIA, rebuilds the **exact bytes captured from the real GAIA**, and round-trips every codec across full range. 48 checks, all pass. |
| `tools/emit-runtime.mjs` | Emits the player's inbound maps **derived from the profile** (`build/<id>.runtime.json` + into the web app) — the "maps → profile" generalization (inbound consumption). |
| `tools/emit-legacy.mjs` (+ browser-safe `emit-legacy-core.mjs`) | Emits the C++ engine's legacy `.ceditor-device.json` **from any** resolved DPD profile — manufacturer / family / identity / message-recipes / per-controller CC are all **derived from the profile** (no device special-cased). OUTBOUND is DPD-sourced without rewriting the engine. |
| `tools/import-midici.mjs` | **MIDI-CI Property Exchange** importer — a captured PE resource → native JSON (names + CCs + identity), `partial`. |
| `tools/library.mjs` + `library.test.mjs` | **Layer 3 flywheel** curation core — round-trip gate, confirm-vs-fork, partial-accrete, conflict→version/variant, versioning/revert/pin, reputation, downloader caution. |
| _(in-program Designer)_ | The mockup-faithful editor now lives IN the app: `CE/web/src/CE_Application/editor/DeviceProfileDesignerV2.svelte` + `editor/dpd/`. The old standalone `web/designer.html` and `tools/designer-view.mjs` were **retired** (superseded). |
| `web/packing-studio.html` | **Interactive Packing Studio** — the bit-level 8→7 packing editor; live byte breakdown, MSB-order toggle, full-range round-trip verify. Imports `codecs.mjs`. (Its in-app screen is still a placeholder.) |
| `server.mjs` + `server.test.mjs` | **Layer 3 community backend** — HTTP service over `library.mjs` (GET/POST `/profiles`, versions, caution, pin, reputation); file-persisted. 13 integration tests. |
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
- **Integration seam (merge-on-drop):** `merge.mjs` translates a resolved param into the
  self-contained value-tree section the doc specifies — its address/CC, range, **enum entries with
  their wire values**, **bit-slice/packing detail**, and the **`source:"id@version"` stamp** (doc
  lines 425/437/439) — plus a legacy descriptor so the *existing* red/orange/green fit and
  metadata-adopt keep working unchanged (doc: "provided the translation carries the value-type
  across"). 32 tests against the real GAIA + a packed param. ✅ data + translation.

## What remains (per the doc's build order)

**The computational + logic core of every layer, plus the editor integration seam, are built and
verified.** The DONE items below are headlessly proven; what genuinely remains is hardware- or
infrastructure-gated, or explicitly deferred by the doc itself.

1. **Runtime consumption — DONE (both directions DPD-sourced).** Inbound: the player derives its
   decode maps from the generated `roland.gaia.runtime.json` (hardcoded `INBOUND_*` deleted).
   Outbound: `emit-legacy.mjs` generates the engine profile `roland-gaia-dpd` from the DPD, and the
   slim panel's `deviceSession` points at it. Verified headlessly: the C++ engine compiles the
   DPD-generated profile byte-identically, and injected MIDI drives the controls.
2. **Editor integration (merge-on-drop) — DONE (headlessly verified).** Binding a parameter now
   writes a self-contained section: a `source:"id@version"` stamp plus the parameter's own
   address/CC + enum wire values + packing (`utils/dpdMergeOnDrop.js` via the generated `dpdMerge.js`
   + `mergeParams` + `dpdProfileMap.json`). 6 web unit tests against the real artifacts; full web
   suite 161/161; Vite build clean. This is the doc's specified integration (lines 425/437/439),
   which it states is **data, not a C++ architectural change** (line 441).
3. **Interactive Designer — DONE, now IN the app.** Rebuilt mockup-faithful as
   `CE/web/src/CE_Application/editor/DeviceProfileDesignerV2.svelte` (+ `editor/dpd/`): shell +
   Parameters / Overview / Device-structure / Message-shapes / Bulk-dumps / Advanced screens, with
   Save→engine, verified in the running CEditor.exe. The standalone `web/designer.html` it replaced
   was removed. `web/packing-studio.html` remains (its in-app screen is still a placeholder).
4. **Community backend for the flywheel — DONE (logic + service).** The curation **logic**
   (`library.mjs`, 21 tests) runs behind an HTTP service (`server.mjs`, 13 integration tests).

Hardware- / infrastructure-gated (cannot be built or verified headlessly):

5. **Live MIDI 2.0 hardware** — the CI Discovery handshake + capturing the GAIA's real `identity`
   codes. The PE parse (`import-midici.mjs`), inquiry/match (`match.mjs`) and the full recognition
   **cascade** (`connect.mjs`, 10 simulated-device tests) are done; only the live MIDI I/O against a
   responding MIDI-2.0 device remains — and the GAIA is MIDI 1.0, which "will never answer" (doc §Import).
6. **Public hosting + auth** for the community service (the service itself is done, item 4).
7. **Engine reads the new schema natively** — **explicitly a follow-up per the doc.** Today it
   consumes the generated legacy profile (`emit-legacy.mjs`), which is byte-identical and works; the
   doc's specified integration is merge-on-drop (item 2, done), not a native C++ re-parse.

## Verify

```
node CE/dpd/tools/verify.mjs          # 75 checks — schema + strict-validator gates, resolution, exact GAIA bytes, round-trips (incl. packed8to7), per-wire address, device-agnostic legacy emit
node CE/dpd/tools/match.mjs           # 12 checks — inquiry build, identity parse, match + graceful degradation
node CE/dpd/tools/connect.mjs         # 10 checks — Layer 4 recognition cascade (simulated devices)
node CE/dpd/tools/library.test.mjs    # 22 checks — round-trip gate (incl. Korg packed), confirm/merge/conflict, versioning, reputation
node CE/dpd/server.test.mjs           # 13 checks — library HTTP service (ephemeral port)
node CE/dpd/tools/import-ins.mjs      # .ins -> validated structural-only profile
node CE/dpd/tools/import-midici.mjs   # 8 checks  — MIDI-CI PE -> validated partial profile
node CE/dpd/tools/merge.test.mjs      # 32 checks — merge-on-drop translation (real GAIA + packed param)
node CE/dpd/tools/emit-library.mjs                # bundle browser-safe modules + dpdLibrary into the app
node CE/dpd/tools/emit-runtime.mjs roland.gaia    # inbound map + mergeParams ; emit-legacy.mjs -> device-agnostic engine profile + dpdProfileMap
cd CE/web && node --test                          # 161 web tests incl. test/dpdMergeOnDrop.test.js (merge-on-drop wiring)
```
