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
- [ ] The page script HoSTage uploads is 42 KB (the 62 KB file, sent without its comments and
      indentation). The stress test in section 2 has run (2026-10-05): the 58 KB Rig full build
      loaded and ran, so this should too. If it shows a Lua error or the stock screen comes back instead,
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

## 3. The largest page script the keyboard takes

Close CEditor, VIP and your DAW first, and switch the CTRL49 off and on, so nothing from an
earlier session is in its memory. Then, in the VS 2022 prompt, in your CEditor folder:

    build\native\Release\Ctrl49ScreenLab.exe size > %TEMP%\size-log.txt 2>&1

It runs by itself for a few minutes: each size shows on the keyboard for two seconds (SCRIPT
SIZE TEST, the size, RUNNING and how many functions), and each upload takes longer than the
last. When the prompt comes back, `notepad %TEMP%\size-log.txt`. The last line is the answer.

- [ ] **Write down** the last line of the log, and copy the whole log.
- [ ] **Write down** the LUA and DEV numbers at the bottom of the keyboard's screen on the
      largest size that showed RUNNING.
- [ ] If the keyboard's own screen does not come back afterwards, switch it off and on: an
      oversized script lives only in its memory.

## 4. HoSTage Live: four more mockups

Close CEditor, VIP and your DAW first. Double-click `tools\ctrl49\Start_CTRL49_Feature_Mockups.cmd`
and press **5** (HoSTage Live). Page Left / Right walks the four pages. What each should look like
is in `tools\ctrl49\screen-lab\feature-mockups\hostage-live\preview-*.png`.

- [ ] **Live.** The step cards at the top: one is outlined and moves along with the beat. Keys
      under the coloured zone bands light up (amber, violet), and one or more teal keys with a dark
      dot are the arp's notes. Turn knob 8 (the rightmost of the eight round knobs) right: the
      top line changes from ARP UP to ARP CHORD, and three keys at once get the dot.
- [ ] **Section.** A plug-in's FILTER panel with purple rings around four knobs, numbered 1-8.
      Turn knob 3: the ring around CUTOFF follows, a tag CUTOFF with a value appears above it,
      and the knob's own pale pointer turns with it (the page paints over the plug-in's one).
      **Write down** whether you can see the edge of the painted-over disc on the knob.
- [ ] **Labels.** A large song name, a section card with a big number, a coloured bar of the
      song's sections. Turn knob 1: the song changes (song 9 is "Über den Fluss", with the dots
      on the U). Turn knob 3 all the way right: every word turns amber.
- [ ] **Meters.** Six level meters moving. Turn knobs 1-5 all the way right: red clip lamps
      light above some of the meters.
- [ ] **Write down**: whether it loaded (3 / 3), any line starting "The keyboard refused", whether
      the moving parts are smooth, whether the words on Labels look sharp or blurred, and the
      corner readout (draw calls, Lua KB) on Meters.

## 5. The smooth envelope

Close CEditor, VIP and your DAW first. Double-click `tools\ctrl49\Start_CTRL49_Machined_Metal.cmd`,
press Page Right twice to AMP ENVELOPE, and turn knobs 1-4 (attack, decay, sustain, release).

- [ ] The green curve is one smooth line with soft edges, no staircase and no gaps, at every
      setting; a very short attack is a near-vertical line.
- [ ] **Write down** anything that looks wrong (gaps, a dark fringe along the line, a line that
      looks dotted), with a photo if you can, and any "The keyboard refused" line.
- [ ] Optional: `Start_CTRL49_Era_Designs.cmd`, Midnight 2020, page 3: the filled envelope.

## 6. The knob pages

Start `build\native\CEditor_artefacts\Release\CEditor.exe`, File > Hostage..., with a part that has
a plug-in loaded and a control page assigned to it. On the keyboard:

- [ ] Each knob shows the plug-in's own value ("2.40 kHz", "27 %", "Saw"), not a number 0-127.
      Turn knob 1: the value changes with it.
- [ ] At the bottom: the knob turned last, larger, with its value, and PAGE n / m on the right.
- [ ] A knob with nothing on it is a faint ring with no number.
- [ ] Page Right to the performance page: a play triangle or stop square at the top left instead
      of ">" or "#"; a running clip has a green dot, a waiting one a hollow ring, and no "*" or ">".
- [ ] Page Left / Right between two control pages: do the rings sweep to their new values over a
      moment, or jump at once? Either is fine; **write down** which.
- [ ] DISCOVER (switch it on in the CTRL49 card): round dots on the map, YOU under its ring.
- [ ] LIVE (switch **Live** on in the CTRL49 card; it comes right after the performance page, or
      after CUE). Hold a chord: the keys light in the colour of the part whose zone they are in.
      Turn knob 8 (the rightmost round knob) one step right: the title says ARP UP, and the part
      shown starts to arpeggiate; the step that plays is outlined and moves, and the notes it plays
      have a black dot. Turn knob 1 to step 3 and knob 2 left until the cell says REST: that step
      goes silent. Press pad 3: it comes back. Turn knob 8 back left: ARP OFF.
      **Write down** whether the outline keeps up with the beat or jumps, and whether the dots
      show on fast steps.
- [ ] METERS (switch **Meters** on in the CTRL49 card, then Page Right past LAYERS if that is on
      too). Play: each part's two bars move in its colour, a white line holds the peak for a
      moment, the master's history fills from the right. Turn knob 1: the first part's fader
      value at the bottom changes half a decibel a step, and the app's mixer fader moves with it.
      Turn knob 6: the master. Play loud enough to go over 0 dB: a red lamp over the strip.
      **Write down** whether the bars keep up with the playing or lag, and anything cut off.
- [ ] The browser: in the app's Sounds browser click **Browse on controller**. The keyboard shows
      eight sound names; the one under the cursor has a full ring, the others an empty one, and
      **no numbers** in any ring (it used to show 127 and 0). At the bottom: that sound's whole
      name and where it comes from ("Wool Pad - STAGE KEYS"). Scroll: the full ring jumps to the
      next sound at once, it does not sweep.
- [ ] **Write down** anything cut off, any "The keyboard refused" line.

## 7. Why the memory blocks did not draw

The stress page decoded eight 1 MB blocks and drew none of them. It now decodes two kinds, at two
times, so one run says why (`tools/ctrl49/README.md`, "Why the blocks did not draw"). Close
CEditor, VIP and your DAW first. In the VS 2022 prompt, in your CEditor folder:

    build\native\Release\Ctrl49ScreenLab.exe stress tools\ctrl49\screen-lab > %TEMP%\stress-log.txt 2>&1

The keyboard shows "STRESS - decoding block 1 of 2", then 2 of 2, then the stress page. At the
bottom left: **EARLY** with an **F** and a **T** over two places for a square, and **LATE**.

- [ ] Wait five seconds. **Write down** whether a square shows under EARLY F (blue) and under
      EARLY T (orange).
- [ ] Turn knob 5 (the fifth of the eight round knobs) slowly all the way right. Up to six more
      letters appear under LATE: F T F T F T. Wait five seconds. **Write down** which of them
      have a square under them, left to right (for example "F yes, T yes, F no, ...").
- [ ] **Write down** the DEV number at the bottom right.
- [ ] Press Ctrl+C in the prompt, then `notepad %TEMP%\stress-log.txt` and copy the whole log.

## 8. Pictures uploaded while a page runs

What a SECTION page (a plug-in's own window) and a LABELS page (words in the app's typeface)
would need. Close CEditor, VIP and your DAW first. In the VS 2022 prompt, in your CEditor folder:

    build\native\Release\Ctrl49ScreenLab.exe upload tools\ctrl49\screen-lab > %TEMP%\upload-log.txt 2>&1

The keyboard shows UPLOAD PROBE, a counter and an orange bar under the header, and six empty
rows. Over about fifteen seconds each row gets its size and time, and a piece of a picture beside
them.

- [ ] **Write down** whether the orange bar kept moving the whole time, or stopped while the
      pictures went up (and for how long, roughly).
- [ ] **Write down** which rows have a piece of a picture beside their size (1 at the top to 6).
- [ ] Press Ctrl+C in the prompt, then `notepad %TEMP%\upload-log.txt` and copy the whole log
      (each upload's KB, ms and redraws).

## What to send back

The **Write down** lines, the console lines copied as text, and a photo of any page that looks
wrong. What it should look like: HoSTage's pages in the preview (`cd CE/web`, `npm run dev`, then
`/ctrl49.html`, which has a scene for each), and each mockup's pages in the `preview-*.png` files
beside its `Design.ctrl49preset`.
