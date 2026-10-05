# CTRL49 hardware checklist

Everything below has run in software only: the C++ tests over a fake keyboard cable, the browser
checks over the same Lua the keyboard is sent. None of it has been on a CTRL49. This is the list
to take to one, in order, with what to write down. Tick as you go and send back what the
**Write down** lines ask for, even when it worked: "it drew" with a number is worth more than
"it worked".

## 0. Before you start

- [ ] Build on Windows, in a Developer shell (the root `CLAUDE.md` says why a plain PowerShell
      picks up MinGW and fails late):

      cmake --preset native -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF
      cmake --build --preset native-release --target CEditor Ctrl49ScreenLab

- [ ] Close VIP, the DAW and any other CEditor: one program owns the keyboard's screen at a time.
- [ ] Connect the CTRL49 before starting anything.

## 1. HoSTage's pages on the keyboard

Open CEditor, then File > Hostage..., then the **Controller** workspace. The CTRL49 screen card
is at the bottom.

- [ ] The card says **Showing on the keyboard too**, and the keyboard shows the same page.
      If it says anything else, stop here: **write down** the card's text and its red line, if any.
- [ ] The page script HoSTage uploads is 40.6 KB now (it was 9 KB before these pages). The
      stress test in section 2 has run (2026-10-05): the 58 KB Rig full build loaded and ran,
      so this should too. If it shows a Lua error or the stock screen comes back instead,
      **write down** exactly what it says.
- [ ] Page Left / Right on the keyboard walks the control pages and the performance page, and
      the card follows.

**Cue.** Have a setlist of a few songs, one with sections and notes.

- [ ] Turn on **Cue**. Page Right from the performance page arrives at CUE first.
- [ ] Before the set starts it says NO SONG ON STAGE YET. E1 picks song 1 (GO TO at the bottom,
      pad 1 lit); pad 1 goes to it, in the app too.
- [ ] On a song: SONG N OF M, its name and tempo; its notes when it has no sections, with its
      clock against the time planned (red when over); the set's clock in the title.
- [ ] Start its sections: the section name, BAR N OF M filling in, the bars left counting down, and
      NEXT naming the next section.
- [ ] NEXT names the next song, with LOADING n% / READY when it preloads a rig.
- [ ] **Write down:** whether the clocks keep time against a watch over a whole song, and how far
      behind the bar the page runs at your tempo.

**Layers.** Have at least two parts with different zones (a split is the clearest).

- [ ] Turn on **Layers** on the card (the switch's light comes on). Page Right from the
      performance page arrives at LAYERS, on the keyboard and on the card.
- [ ] The pads go dark: they do nothing on LAYERS or SOUNDCHECK.
- [ ] One band per part, over the keys where it plays. The part E1 has picked is outlined; it
      starts on the part HoSTage has focused.
- [ ] Hold a few notes: each lights its key in the colour of a part that plays it, and puts a
      white notch in the band of every part that plays it. Let go and they go.
- [ ] E1 picks the part; the title shows its name and range. E2 / E3 move its lowest / highest
      key, E4 the transpose, E5 / E6 the velocity range. The app's zone editor shows the same.
- [ ] One fast turn of E2 is one Undo in the app, not one Undo a detent (edits to the same part
      less than 0.6 s apart are one step).
- [ ] Make a layer group of two parts by velocity, with a crossfade. Each member shows `L1 V` and
      a gauge of its share, ramping at the crossfade. Play soft then hard: the notches move from
      one part to the other. A key layer ramps in its band instead.
- [ ] With Stage Lock on, turning E2 changes nothing and the app says why. The page stays up.
- [ ] **Write down:** how long Page Right takes to draw LAYERS, and whether held notes keep up
      with fast playing. Notes played on the CTRL49 itself light at once (the page hears them);
      notes from another MIDI input arrive with HoSTage's redraws, ten a second.

**Soundcheck.** Have a setlist of a few songs.

- [ ] Turn on **Soundcheck**: the set is checked as it turns on. Page Right arrives at
      SOUNDCHECK, after LAYERS.
- [ ] Each song is ready (green), has problems (red) or is not checked (grey). The counts at the
      top add up to the set. The selected song shows its problems in full on the right.
- [ ] E1 walks the set and stops at both ends. It starts on the song on stage.
- [ ] Add a song in the app: it shows as not checked. E8 checks the set again and it changes.
- [ ] Measure a song in the app's Soundcheck: its level appears as a bar in its row and in dB on
      the right.
- [ ] Go to a few songs, one with a captured rig. Each then shows how long it took to load, in its
      row and in the app's Soundcheck ("Load"). One over five seconds that was not preloaded is red,
      and with preloading off the page says TURN PRELOAD ON.
- [ ] **Write down:** the load times of your heaviest rigs, preloaded and not.
- [ ] **Write down:** anything cut off or overlapping. The page is 480 x 272 and the names stop
      at 24 characters.

**Discover.** Needs a library with at least five measured sounds you have loaded (the Sounds page's
"What you play" says how many).

- [ ] Turn on **Discover**. Page Right arrives at DISCOVER after SOUNDCHECK. With too little
      loaded it says NOT ENOUGH TO GO ON and how many of five it has; that is correct, not a fault.
- [ ] The title counts what you have never opened, the same number as the Sounds page's
      "Never loaded". The list is nearest first, with a bar for how like what you load each is.
- [ ] On the map: grey dots (what you load most), YOU, the eight listed in purple, the selected
      one in white. E1 moves the white one; E2 jumps eight further down.
- [ ] E3 keeps the list to one kind and says which in the footer; turning back reaches ALL.
- [ ] E4 clockwise marks the selected sound kept (an orange square) and it is a favourite in the
      app; counter-clockwise lets it go.
- [ ] Pad 1-8 auditions the row with that number. A pad is lit while its row has a sound, dark
      past the end of the list.
- [ ] **Write down:** how long the page takes to appear and to follow E1 on a big library (it
      reads the whole library when it opens and every two seconds), and the never-opened count.

**Changes.** Load a sound of your own from the library, save it, then turn a few knobs.

- [ ] Turn on **Changes**. With a sound not from the library it says why there is nothing to
      compare; that is correct.
- [ ] With your sound: its name, AGAINST your last save and when, and each parameter you moved,
      saved value > value now, with both on a bar. The title counts them.
- [ ] E1 down plays the save, E1 back up plays now, and in between is in between. Leave the page
      while listening: the sound is exactly as you left it.
- [ ] E2 picks a change; E3 puts it back (it leaves the list), E3 the other way takes it back.
- [ ] E4 walks back to older saves, by name, down to the oldest (or to the factory sound it was
      branched from).
- [ ] **Write down:** how long the first look at a save takes on your biggest plug-in (it reads
      the save through the plug-in once), and whether listening is smooth or stepped.

**Leaving them.**

- [ ] Page Left back to the performance page: it is drawn whole, with nothing left of the stage
      page behind it, and the pads light up again.
- [ ] Turn a page off while it is on screen: the keyboard lands on a page that still exists and
      draws it whole, never a blank or half-drawn one.
- [ ] If the keyboard refuses anything, the card shows a red line, "The keyboard refused ...".
      **Write down** that line exactly.

## 2. The screen lab's mockups: how much the keyboard takes

**Done, 2026-10-05.** All four builds and Red Lead loaded and ran smoothly with no refusal; the
results are in the [README](README.md#still-requires-hardware-open-phase-3-measurements). The
steps stay here for a different unit or firmware.

Close CEditor first. The full procedure, and what each number means, is
[Stress testing them on the keyboard](screen-lab/feature-mockups/README.md#stress-testing-them-on-the-keyboard).
The short version:

- [ ] `Start_CTRL49_Screen_Lab.cmd`, choice 2: the **Stress** page. It shows the raw ceiling.
- [ ] `Start_CTRL49_Feature_Mockups.cmd`: **1** (Features slim), **2** (full), **3** (Rig slim),
      **4** (full). Always slim first: if slim fails, full will too.
- [ ] On each, walk all five pages with Page Left / Right, and turn a few encoders on each.
- [ ] **Write down**, for each of the four:
  - whether it loaded: the loading screen reaching 3 / 3;
  - every line the console prints that starts with "The keyboard refused";
  - one of the console's ten-second lines ("... redraws/s sent (asked ...) ..., answers: ...");
  - the corner readout on the busiest page: draw calls, Lua KB, and the firmware's number.
- [ ] If the keyboard's own screen comes back mid-run, that is its watchdog: **write down**
      which page and what you were doing.

## What to send back

The **Write down** lines, the console lines copied as text, and a photo of any page that looks
wrong. What it should look like: HoSTage's pages in the preview (`cd CE/web`, `npm run dev`, then
`/ctrl49.html`, which has a scene for each), and each mockup's pages in the `preview-*.png` files
beside its `Design.ctrl49preset`.
