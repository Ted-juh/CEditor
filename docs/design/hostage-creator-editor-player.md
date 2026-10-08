# HoSTage: creator, editor and player

*Status: the owner's intention, written down on 2026-10-08, with what exists today and what each
part would take. Nothing in the "would take" columns is built. When this and the code disagree
about what exists, the code is right.*

## The intention, in the owner's words

> The initial idea was to let CEditor create the "installer" to install the HoSTage program (as
> in editor/player), and the instance in CEditor is what it is, to develop HoSTage further and
> further. The installed version holds both the editor and the player, from which a user can set
> up screens, playlists etc. The "created" player is a standalone program + VST3 that a user could
> run later on in a DAW, or from a Raspberry Pi (USB stick version) if no laptop is available.
>
> CEditor holds the HoSTage creator, which a user can buy an extra licence for.

And two rules that settle where the lines are:

- **Stage mode is what restricts**, not the player. A player adds instruments and effects on the fly
  and changes the setlist like anyone else; Stage mode is where the rig stops being editable.
- **Creating screens is what the editor has and the player does not** ("screens etc.").

## Three tiers

```
CEditor  ──(HoSTage Creator licence)──►  HoSTage installer
  │ the development instance                │
  │ (the Hostage tab)                       ▼
  │                              HoSTage, installed: editor + player
  │                                         │  Free / Core / Founder / Pro
  │                                         ▼
  │                              Created player: standalone + VST3,
  │                              or a USB stick / Raspberry Pi
  └── also tests the player, before any of it is built
```

| Tier | What it is | Who uses it | Licence |
|---|---|---|---|
| **A. CEditor's Hostage tab** | The development instance and the **creator**: everything HoSTage has, plus building the HoSTage installer. | Whoever develops HoSTage further; buyers of the creator licence. | A new **HoSTage Creator** licence on top of CEditor. Does not exist yet. |
| **B. HoSTage, installed** | **Editor + player** in one program. Racks, sounds, songs, setlists, control pages and CTRL49 screens, Stage. Creates players. | A musician setting up and playing a rig. | The existing edition ladder: Free, Core, Founder, Pro (`docs/licence-and-sunset-policy.md`). |
| **C. A created player** | The same program with screen creation and player creation taken out, carrying one show. Standalone + VST3; later a USB stick and a Raspberry Pi. | The same musician on stage, in a DAW, or on a machine with no laptop. | To be decided (see the end). |

## Where we are today

Tier B already nearly exists — by accident rather than design:

- **Build product** (Project utility in CEditor's Hostage tab) makes `CEHostStandalone` +
  `CEHostVST3` and an installer (`tools/installer/HostProductTemplate.iss`), named and branded by
  the Host Project manifest (`docs/design/instrument-host-product.md`). That is tier A making tier B.
- The program it makes shows the **whole** Hostage workspace: `HostRuntime.svelte` mounts the same
  `InstrumentHostView` the tab uses, Build mode, Controller workspace and utilities included. So
  the installed program is already "editor + player". Its own Build product answers "Building is
  not available in this build." — it cannot make tier C.
- **Building needs a developer machine:** the script assembles programs a CMake build already made,
  with Node.js and Inno Setup. CEditor's installer ships none of the host programs.
- **Every built product shares one data folder**, `%APPDATA%\CEditorInstrumentHost`
  (`HostRuntimeShell.cpp`), so two products on one machine overwrite each other's rig.
- **Stage Lock is already the restriction the owner describes**, enforced in the host itself
  (`InstrumentHostService.cpp`, the allow-list near the top): playing, songs, scenes, levels,
  macros and parameters work; changing the rig does not.
- **There is no "player" yet**, and no file that carries a show from one program to another.
- **The player builds on Linux too** — `CEHostStandalone` was built on a Linux x86-64 machine for
  this note, as a 41 MB `Hostage` — but plugins load only on Windows: live plugin isolation is Windows-only
  (`IsolatedPluginProxy.cpp`), and the product refuses to load plugins any other way. The CTRL49
  is Windows-only too (`Ctrl49WindowsEndpoints.cpp`).

## What goes where

Rows are what the Hostage workspace does today. "Stage" means the rule holds outside Stage mode
and Stage Lock restricts it as it does now.

| Capability | A. CEditor tab | B. Installed | C. Created player |
|---|---|---|---|
| Scan plugins, add and replace instruments and effects | ✓ | ✓ | ✓ (Stage locks it) |
| Zones, MIDI effects, inserts, routing, mixer, layers | ✓ | ✓ | ✓ (Stage locks it) |
| Sounds: browse, load, audition | ✓ | ✓ | ✓ |
| Sounds: library folders, recording previews | ✓ | ✓ | ✓ — *decide*: a Pi may be too slow to record previews |
| Patterns, launcher, looper, gestures, recorder, modulation, tuning | ✓ | ✓ (Pro) | ✓ (Pro) |
| Songs and setlists: edit | ✓ | ✓ | ✓ (Stage locks it) |
| Stage screen, Stage Lock, panic | ✓ | ✓ | ✓ — the main screen |
| **Control pages and CTRL49 screens: create, name, assign, Auto pages** | ✓ | ✓ | ✗ — shows them, cannot change them |
| **Describe a controller** (any MIDI controller's picture) | ✓ | ✓ | ✗ |
| Re-learn which physical knob a page slot listens to | ✓ | ✓ | *decide* — useful when the stage keyboard is not the one the show was made on |
| ⚡ quick-learn a parameter to a knob | ✓ | ✓ | ✗ — it changes a page |
| CTRL49 stage pages: switch on and off | ✓ | ✓ | ✓ |
| **Try the show as the player** ("test before hand") | ✓ | ✓ | — |
| **Create a player** (tier C) | ✓ | ✓ | ✗ |
| **Build the HoSTage installer** (tier B) | ✓ (Creator licence) | ✗ | ✗ |
| Licence: install an edition | — | ✓ | *decide* |

So the player is HoSTage minus three things: making screens and pages, making players, and making
installers. Everything a musician does to a rig stays, and Stage mode keeps doing the restricting.

## What travels between them

**Tier A → B: an installer.** The HoSTage program, branded by the Host Project (name, publisher,
its own uninstall identity, which already exists as `appId`), optionally with a starting rig.

**Tier B → C: a show.** What a player needs to run one rig without its editor:

- the rack: parts, zones, MIDI effects, inserts, buses, returns, macros, mixer;
- the control pages and CTRL49 screens, finished;
- the scenes, songs, setlist and stage notes;
- captured hardware patches;
- which plugins and sounds it needs, by name and ID — never the plugins themselves (their licences
  forbid it), so the player checks on start-up what is missing, the way Check setlist does now.

The player carries one show, built in, and can save changes to it (outside Stage mode). Today's
`session-performance.json` "factory performance" in `build-host-product.mjs` is the start of this.

**One set of programs, two modes.** B and C should be the *same* executables with a small
manifest beside them saying which they are (`role: editor | player`, the product name, the show).
The web side reads it and hides what a player does not have; the host refuses the same commands
natively, the way Stage Lock does, so a player cannot be talked into making screens by a script.
Two builds would double every test and every release; one build with a role cannot drift.

## What each step would take

1. **The player role.** The manifest, the host refusing screen and player creation in the player
   role, and `InstrumentHostView` hiding them. Small. Also gives tier A and B "Try as player".
2. **One data folder per product**, named from the Host Project, instead of the shared
   `CEditorInstrumentHost`. Small, and needed before two products can live on one machine.
3. **The show** — format, save in B, load in C, the missing-plugin check. Medium.
4. **Create a player from B without a developer machine.** The installed HoSTage ships its own
   programs as the template; creating a player copies them with the manifest and the show into a
   folder. No Node.js (the staging moves into C++), and no Inno Setup needed: the result is a
   folder, which is also what a USB stick wants. An installer stays optional. Medium.
5. **The creator in CEditor builds the tier B installer** the same way — CEditor's installer ships
   the host programs; Inno Setup is needed only for the installer itself. The **Creator licence**
   gates it. Medium, plus the licence (below).
6. **USB stick, Windows:** the step 4 folder with "portable" set in the manifest — data kept on
   the stick beside the program instead of in `%APPDATA%`. Small once 4 exists.
7. **Raspberry Pi.** Large, and honest about it:
   - a Linux ARM64 build of the player (the code builds on Linux already);
   - live plugin isolation ported to Linux — the single biggest item: a worker process and shared
     memory on POSIX, replacing the Windows-only path;
   - plugins: only plugins built for Linux on ARM run there, and there are few (open-source ones
     such as Surge XT and Dexed). A Windows plugin will never run on a Pi. **A Pi player is
     realistic for rigs of hardware synths and open-source plugins**, not for a rig of commercial
     Windows instruments;
   - the CTRL49 on Linux: unproven. On Windows its knobs arrive through the M-Audio driver's hidden
     port; whether Linux's own USB-MIDI driver exposes that port needs a test on the hardware;
   - the screen: the UI runs in WebKitGTK on Linux, which is heavy for a Pi. The player could run
     with the CTRL49 as its only interface, or serve its UI to a phone or tablet over the local
     network;
   - "USB stick version" for a Pi most likely means a ready image to boot from, starting straight
     into the player.

## Decisions for the owner

1. **The player's licence.** Does a created player need its own licence, carry the edition of the
   HoSTage that made it, or run free? The Free edition's one-instrument limit matters here.
2. **The Creator licence.** What it costs, and whether it covers branding (a product with your own
   name) or only building. Note `docs/licence-and-sunset-policy.md`: selling anything needs a JUCE
   commercial licence or a different business model, and that decision is still open — it applies
   to the Creator licence as much as to the editions.
3. **Re-learning in the player** (the "decide" rows above): may a player re-learn which physical
   knob a slot listens to, record previews, install a licence?
4. **USB stick:** a portable Windows folder that runs on any PC, a bootable Pi image, or both — and
   which first.
5. **Raspberry Pi scope:** hardware synths and open-source plugins only, accepted as the scope?
   If yes, the Linux plugin worker and a CTRL49 hardware test come first.
6. **The editor's own Screen Builder** (CEditor's "New Screen (CTRL49)") is not part of this: it is
   a prototype for hardware synths edited with CEditor. Keep it, fold it into tier A's screen
   design, or retire it?

## Where this comes from

The owner's messages of 2026-10-07 and 2026-10-08; `docs/design/instrument-host-product.md` (the
build pipeline as built); `docs/design/screen-builder-design.md` (the CTRL49 screen design, whose
phase 7 "player-hosted bridge (standalone/gig mode) … packaging" is tier C);
`docs/licence-and-sunset-policy.md` (the edition ladder); and the code cited above.
