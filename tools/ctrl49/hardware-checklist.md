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
- [ ] Page Left / Right on the keyboard walks the control pages and the performance page, and
      the card follows.

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
- [ ] **Write down:** anything cut off or overlapping. The page is 480 x 272 and the names stop
      at 24 characters.

**Discover.** Needs a library with at least five measured sounds you have loaded (the Sounds page's
"What you play" says how many).

- [ ] Turn on **Discover**. Page Right arrives at DISCOVER after the other two. With too little
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

**Leaving them.**

- [ ] Page Left back to the performance page: it is drawn whole, with nothing left of the stage
      page behind it, and the pads light up again.
- [ ] Turn a page off while it is on screen: the keyboard lands on a page that still exists and
      draws it whole, never a blank or half-drawn one.
- [ ] If the keyboard refuses anything, the card shows a red line, "The keyboard refused ...".
      **Write down** that line exactly.

## 2. The screen lab's mockups: how much the keyboard takes

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
