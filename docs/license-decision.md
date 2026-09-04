# LICENSE decision (open item from the 2026-07-02 review)

> **DECIDED 2026-07-02:** the owner has no JUCE commercial license, so the repo is licensed
> **AGPLv3** (option 1 below). The canonical license text is in [/LICENSE](../LICENSE) and the
> README License section points here. If a JUCE commercial license is ever purchased, this can
> be revisited (the owner holds the copyright and can relicense their own code).

The repo previously had no LICENSE file. The choice is constrained by dependencies, so it was
made deliberately rather than defaulted:

## The constraint: JUCE

JUCE 8 is dual-licensed: **AGPLv3** (free) or a **paid commercial license**. Unless a JUCE
commercial license is purchased:

- The editor app and every exported standalone/VST3 binary link JUCE, so they must comply with
  AGPLv3 — effectively the whole project (and arguably user-exported panels) must be AGPLv3.
- MIT/Apache-2.0 for this repo would be misleading: the combined work still can't be
  distributed under those terms while linking AGPL JUCE.

Other dependencies are permissive (Lua/sol2 MIT, WebView2 SDK proprietary-but-redistributable,
Svelte/Vite MIT, QuickJS via juce_javascript MIT) — JUCE is the only gating one.

## Options

1. **AGPLv3 for the repo** — consistent with free-tier JUCE today. Any distributor of the app or
   of exported plugins must provide source. Fine for an open project; restrictive if selling
   panels/plugins closed-source later.
2. **Buy a JUCE license, then choose freely** — MIT/Apache for the repo if the goal is maximum
   adoption, or keep it proprietary. Required anyway if exported plugins should ever be
   closed-source and revenue exceeds JUCE's free-tier threshold.
3. **No license (status quo)** — all rights reserved by default. Legally safest short-term for a
   private project, but blocks any outside use/contribution and is unclear for the exported-panel
   story.

## Recommendation

If the project stays personal/open: add **AGPLv3** now (option 1) — it's the only license that is
actually valid without paying for JUCE. If commercial exports are the plan (the compile-per-panel
pipeline suggests they might be), budget for a JUCE license first and then pick the repo license
to match the business model.

---

## Update, 2026-08-27: the mechanism now exists, the decision still does not

The §19 "Trust" block of the VIP-successor baseline has been implemented — perpetual licences,
offline signature verification, seat records, the sunset key — and is documented for users in
[Licence, updates and the sunset promise](licence-and-sunset-policy.md).

**None of that resolves this document.** The price ladder that mechanism serves (€39 founder,
€59 Core, €89 Pro) assumes a proprietary product, and option 1 is what the repository is on.
Selling under those terms means buying the JUCE commercial licence first — option 2 — and until
somebody does, the editions in the policy document are a plan rather than an offer. The policy
document says so in its own words, in a section headed for the purpose.

Recording it here as well because this is where the question lives, and because a reader who
finds the pricing document first should be sent back to this one.
