# Spike: does a block view of Lua round-trip?

**This is not shipped code.** It is the evidence behind the block-editor proposal in
[`docs/design/product-ideas.md`](../../../../docs/design/product-ideas.md) §12, kept so the claim in
that document can be re-run and argued with rather than believed. Nothing imports it, no test path
reaches it, and it is not wired into CI.

## The question

A block editor for Lua only works if both directions hold:

1. **blocks → Lua** — does every block arrangement produce valid Lua?
2. **Lua → blocks** — can existing hand-written Lua be shown as blocks without being rejected or
   quietly changed?

Direction 2 is the one that decides the feature, and it is the one people assume rather than test.

## Running it

Needs `luaparse`, which `CE/web` already depends on:

```bash
cd CE/web && npm ci && cd ../..
node tools/scripts/spikes/lua-blocks/run-cases.mjs   # six scripts written against the ce.* API
node tools/scripts/spikes/lua-blocks/run-real.mjs    # the five real .lua files in tools/ctrl49/
```

## What "pass" means

Not string equality — **same meaning.** A case passes when Lua → blocks → Lua, re-parsed, produces
an AST identical to the original's once positions, ranges and literal spellings are stripped. So
reformatting is allowed and a changed variable, operator or scope is not.

## Result at the time of writing (2026-09-11)

Eleven of eleven, including all five real CTRL49 files (78–154 lines of working code).

The `fallbacks` column is the honest part. A construct outside the modelled subset is never
rejected — it becomes a raw-Lua chip that still round-trips — and the count says how much of a
script would come back as text rather than as a picture:

```
PASS  CEditor_Bridge.lua      154 lines,  38 top-level blocks, fallbacks: 0 stmt / 18 expr
PASS  CEditor_Knob_Test.lua    81 lines,  19 top-level blocks, fallbacks: 0 stmt /  5 expr
PASS  CEditor_MultiKnob.lua   114 lines,  24 top-level blocks, fallbacks: 0 stmt / 11 expr
PASS  CEditor_PresetList.lua   78 lines,  21 top-level blocks, fallbacks: 0 stmt /  7 expr
PASS  Hostage_MultiKnob.lua   131 lines,  29 top-level blocks, fallbacks: 0 stmt / 12 expr
```

Zero statement-level fallbacks on real code: every statement became a block. Five to eighteen
expression-level ones each — table constructors, anonymous functions, `#args` — which round-trip
perfectly and are not pictures. Ordinary panel scripts (`onValueChanged`, set a control, send a CC,
an if/else) come back with zero of either.

## What it found

**On the first run, all five real files failed.** `local function foo()` regenerated as
`function foo()`: the block dropped `isLocal`. That is not cosmetic — it turns a local into a global
and would silently break scripts in a way nobody would trace back to the editor.

One line to fix, ten minutes to find, and invisible behind a canvas. That is the argument for
building the mapping headless and testing it against real files **before** anyone draws a block.

## Scope, so nobody mistakes this for a design

The modelled subset is deliberately small — local/assignment/call/if/for/while/return/function, and
the expressions those need. Blocks carry no coordinates, there is no palette, no canvas, and no
generation from `panelApi.js`. All of that is the proposal; this is only the part that had to be
true first.
