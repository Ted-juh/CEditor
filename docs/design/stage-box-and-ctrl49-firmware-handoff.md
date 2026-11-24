# HoSTage off the PC, and the CTRL49's firmware — handoff

*Written 2026-11-22 at the end of a cloud session, so the work can go on from a local checkout.
Everything here was either read from code or measured; where it was neither, it says so. When this
file and the code disagree, the code is right.*

Start with this file, then `CLAUDE.md`, then the three "reading" sections of
`tools/ctrl49/README.md` ("What the firmware says" through "Changing the firmware, and sound").
Paste [Prompt for Claude Code](#prompt-for-claude-code) to start the next session.

## Where things are

| What | Where | State |
|---|---|---|
| The firmware notes | `tools/ctrl49/README.md` on `ccr-294be42e-m99lky` | pushed; not merged, no PR |
| This handoff, the reading scripts, the footprint harness | same branch | pushed with this file |
| HoSTage on Linux | `codex/hostage-linux-playback` (tip `b76a693` when measured), `codex/hostage-linux-build` | the owner's branches; nothing of this session is on them |
| ST's documents for the chip | `docs/STM32F429/` on the owner's machine | ignored by git on purpose: ST's copyright, tens of MB |
| The Advance firmware updater and everything extracted from it | nowhere in the repo | Akai's; keep it out. The owner has the updater zip |

Nothing in this session changed product code. The branch holds documentation, five small reading
scripts and a measurement harness.

## What was established

### 1. A stage box: HoSTage with no PC beside the keyboard

The CTRL49 cannot host anything itself (below). The lightweight stage rig is a small computer under
the keyboard, the CTRL49 as the only interface.

- **HoSTage builds and runs as ARM64 unchanged.** `codex/hostage-linux-playback` cross-compiled for
  aarch64 with no source change: `HoSTage` (27.8 MB), `CEditorPluginScanner`, `CEditorPluginWorker`.
  Under qemu, fourteen test programs pass (the three `PluginWorker*` ones, `PluginCatalog`,
  `MidiInDecoder`, `HostMidiInput`, `RackModel`, `VendorPreset`, and all six `Ctrl49*`), the ARM64
  scanner scans and auditions an ARM64 VST3 (DPF's Nekobi: peak 0.116, a real envelope), and the app
  paints its full UI. Emulation proves the code path, not speed, and not ARM's weaker memory
  ordering on real cores.
- **Neither audio thread is real-time on Linux.** `PluginWorkerMain.cpp:1563` starts the worker's
  audio thread with `Priority::highest` and JUCE's ALSA thread uses `Priority::high`; JUCE 8 maps
  both to `SCHED_OTHER`. Four late blocks in a row trip a part (`PluginWorkerBlockBridge.h:464`) and
  nothing reloads it. A desktop hides this; a four-core board running a web view will not. The fix:
  `startRealtimeThread` for the worker, real-time priority for the device thread (a vendored-JUCE
  patch, or JACK), `rtprio` in the system limits, and an automatic reload of a tripped part.
- **The build's Wine step does not travel.** `juceaide.exe` under Wine crashed in the container and
  cannot run on ARM at all. Building `juceaide` natively from the JUCE 8.0.7 source works
  ([recipe](#arm64-cross-build)).
- **The web view is most of the memory, the workers most of the CPU.** Four instruments, a held
  chord, 60 s averages, twice each, on a fast x86 server:

  | | With the web view | Without |
  |---|---|---|
  | Memory (PSS) | about 380 MB | about 80 MB |
  | CPU, share of one core | about 22% | about 18% |

  WebKit's page process 177 MB, the web view's child 86 MB, its network process 21 MB; HoSTage
  itself 44 MB without them; a worker about 9 MB. The four workers cost about 13% of a core whether
  notes sounded or not (12.8% silent, 13.4% playing), so that is the price of keeping a worker
  alive each block, not of synthesis. Not measured: smaller buffers (it ran at 512), a page with
  moving meters, a slow board.
- **A screenless player is close.** `HostRuntimeShell.cpp:253–284` creates the service (audio on)
  and the CTRL49 broker before any web view, and the broker calls the service directly. What a
  player without a screen still needs: the rig restored at start-up (today only when the web view
  first asks, `InstrumentHostService.cpp:658–661`); a way not to create the web view
  (`HostRuntimeShell.cpp:343`); the real-time fix; reloading a tripped part; booting straight into
  it on a read-only system.
- **Plug-ins are the Pi's real limit.** Only Linux ARM64 builds load. VST3 there, as reported and
  not checked on the makers' own pages: Pianoteq, Decent Sampler, Surge XT, Dexed, sfizz, Cardinal,
  the DPF synths. Far more exist as LV2 only (setBfree, Odin 2, ZynAddSubFX, Yoshimi); JUCE 8.0.7
  already carries the LV2 host code and HoSTage enables only VST3. Never on ARM: u-he (TyrellN6
  included), Spire, Vital, Arturia, NI. On an x86 box the owner's own plug-ins keep working, Windows
  ones through yabridge (untested with HoSTage).
- **Hardware, as priced in November 2026** (memory prices have moved everything up): a used thin
  client (Dell Wyse 5070, Fujitsu Futro S740) about €35–70 and the cheapest complete box; a Pi 5
  kit about $125–150 and it needs the official 5 V / 5 A supply (USB ports share 600 mA without it,
  1.6 A with), active cooling and a USB audio interface; the Radxa X4 is the x86 board of that
  size. One power plug for the whole rig is possible: the box powers the CTRL49 and the interface
  over USB.

### 2. The CTRL49 itself

All of it is in `tools/ctrl49/README.md`; the short version:

- The Advance firmware (the same VIP runtime; M-Audio publishes none for the CTRL49) runs on an
  STM32F429/439 at 168 MHz with most likely 32 MB of SDRAM, no operating system, Lua 5.2 with its
  full standard library, LodePNG and FreeType. No audio hardware is used.
- **Settings**: 04/01 sets and 04/02 reads a device setting (octave, transpose, curves, tempo,
  brightness, the VIP timeout). The table and the ids never to send are written down.
- **The VIP fallback** comes after 3 s without a valid frame. `Ctrl49Session.h` still says about
  900 ms in a comment.
- **Native widgets**: knobs (02/12–1C) and pads (02/00–06) the firmware draws itself from art in
  its flash. HoSTage uses neither. The command shapes are known, the recipe is not, and VIP never
  sends them to the CTRL49 (corrected 2026-11-23 from the USB captures: the README's fourth
  reading). VIP does use native text objects (02/21–2B) and 02/23 readouts, and those frames are
  written down.
- **Pages can probably redraw themselves** (`lua_widget_make_dirty` from `draw()`), there is no
  usable clock, `print` writes to the screen, LEDs can be set from Lua, 06/02 is a ping, nothing
  persists, an uploaded font is ignored.
- **Extending Lua**: helpers written in Lua, code added through `load()`, shapes rendered on the PC
  as filmstrips. No native functions without new firmware.
- **New firmware**: possible only as code of our own, and the board's wiring (which pin does what)
  is the part that cannot be designed afresh. The README's last section has the assessment and the
  one read-only check that decides whether a backup of the stock firmware is possible.

## Doing it again locally

### ARM64 cross-build

On Ubuntu 24.04 x86-64, from a checkout of `codex/hostage-linux-playback`:

```bash
# arm64 packages come from ports.ubuntu.com; pin the existing sources to amd64 first
for f in /etc/apt/sources.list.d/*.sources; do grep -q '^Architectures:' "$f" || sudo sed -i '/^URIs:/i Architectures: amd64' "$f"; done
printf 'Types: deb\nURIs: http://ports.ubuntu.com/ubuntu-ports/\nSuites: noble noble-updates noble-security\nComponents: main restricted universe multiverse\nArchitectures: arm64\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n' \
  | sudo tee /etc/apt/sources.list.d/ports-arm64.sources
sudo dpkg --add-architecture arm64 && sudo apt-get update
sudo apt-get install -y crossbuild-essential-arm64 qemu-user-static ninja-build pkg-config \
  libgtk-3-dev:arm64 libwebkit2gtk-4.1-dev:arm64 libcurl4-openssl-dev:arm64 libasound2-dev:arm64 \
  libxrandr-dev:arm64 libxinerama-dev:arm64 libxcursor-dev:arm64 libxcomposite-dev:arm64 libfreetype-dev:arm64

# a native juceaide instead of the vendored .exe under Wine
git clone --depth 1 --branch 8.0.7 https://github.com/juce-framework/JUCE.git /tmp/juce-src
cmake -S /tmp/juce-src -B /tmp/juce-host -G Ninja -DCMAKE_BUILD_TYPE=Release -DJUCE_BUILD_EXTRAS=OFF -DJUCE_BUILD_EXAMPLES=OFF   # configuring builds juceaide
mkdir -p /tmp/juce-native
cp /tmp/juce-host/tools/extras/Build/juceaide/juceaide_artefacts/Custom/juceaide /tmp/juce-native/juceaide.exe
for h in juce_lv2_helper juce_vst3_helper; do printf '#!/bin/sh\nexit 1\n' > /tmp/juce-native/$h.exe; chmod +x /tmp/juce-native/$h.exe; done

cat > /tmp/aarch64.cmake <<'EOF'
set(CMAKE_SYSTEM_NAME Linux)
set(CMAKE_SYSTEM_PROCESSOR aarch64)
set(CMAKE_C_COMPILER aarch64-linux-gnu-gcc)
set(CMAKE_CXX_COMPILER aarch64-linux-gnu-g++)
set(CMAKE_LIBRARY_ARCHITECTURE aarch64-linux-gnu)
set(CMAKE_CROSSCOMPILING_EMULATOR /usr/bin/qemu-aarch64-static)
EOF

(cd CE/web && npm ci && NODE_OPTIONS=--max-old-space-size=8192 npm run build)
export PKG_CONFIG_LIBDIR=/usr/lib/aarch64-linux-gnu/pkgconfig:/usr/share/pkgconfig PKG_CONFIG_PATH=
cmake -S . -B build/arm64 -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_TOOLCHAIN_FILE=/tmp/aarch64.cmake \
  -DCEDITOR_BUILD_APP=ON -DCEDITOR_DEV_MODE=OFF -DCEDITOR_SCANNER_WORKER=ON -DCEDITOR_PLUGIN_WORKER=ON \
  -DCEDITOR_JUCE_HELPER_DIR=/tmp/juce-native -DCE_HOST_PRODUCT_NAME=HoSTage \
  -DCMAKE_CXX_FLAGS="$(pkg-config --cflags gtk+-3.0 webkit2gtk-4.1) -DJUCE_LOAD_CURL_SYMBOLS_LAZILY=1"
cmake --build build/arm64 --target CEHostStandalone CEditorPluginScanner CEditorPluginWorker
```

The stub helpers are enough because the three targets need neither the LV2 nor the VST3 helper.
The arm64 `-dev` packages cannot sit beside their amd64 twins: remove them before building for x86
on the same machine. To run the results there, `QEMU_LD_PREFIX=/ qemu-aarch64-static ./binary`, or
register qemu with binfmt so child processes (WebKit's) run too. A free ARM64 VST3 to test with:
`apt-get download dpf-plugins-vst3:arm64`.

### The footprint measurement

`tools/hostage-footprint/` holds `experiment.patch` (for `codex/hostage-linux-playback` at
`b76a693`; **an experiment, never to be committed**), `measure.py` and an example command list. The
patch adds three environment switches: `HOSTAGE_EXPERIMENT_COMMANDS` (a JSON list of host commands
and waits, fed to the service after start-up), `HOSTAGE_EXPERIMENT_HEADLESS` (no web view) and
`HOSTAGE_EXPERIMENT_MULTI_PART` (lifts the free edition's one-plug-in limit, which otherwise
refuses the second instrument without a word in the log).

```bash
git apply tools/hostage-footprint/experiment.patch         # on the Linux branch, in a scratch tree
# build HoSTage, scanner and worker for this machine; put the two helpers beside HoSTage
./CEditorPluginScanner --scan /usr/lib/vst3/Nekobi.vst3    # the ceId to put in the command list
Xvfb :99 & export DISPLAY=:99
pulseaudio -n --daemonize=yes --exit-idle-time=-1 -L "module-null-sink sink_name=stage" \
  -L module-native-protocol-unix -L module-always-sink
python3 tools/hostage-footprint/measure.py ui       path/to/HoSTage commands.json shot.png
python3 tools/hostage-footprint/measure.py headless path/to/HoSTage commands.json
```

A ceId belongs to one machine's copy of a plug-in, so the command list has to be made there. Kill
any HoSTage left running first: a leftover instance once made a run look as if nothing loaded.

### Reading the firmware

`tools/ctrl49/firmware-reading/` (nothing in it runs or sends anything):

```bash
python3 isx.py "Akai Professional ADVANCE Firmware Updater 1.0.10.exe" out/     # the MSI and two .ini
7z x "out/ADVANCE Firmware Updater .msi" -omsi && 7z x msi/Data1.cab -ocab      # the updater program
python3 hexblobs.py cab/advanced_firmware_updater.ex images/                    # two flat images
arm-none-eabi-objdump -D -b binary -m arm -M force-thumb --adjust-vma=0x08040000 \
  images/hex00_08040000.bin > app.dis
python3 dis.py   images/hex00_08040000.bin app.dis 805a6bc 805a820              # a range, literals resolved
python3 xref.py  images/hex00_08040000.bin app.dis 0x20010ce8                   # who uses a constant
python3 assets.py images/hex01_08100000.bin previews/                           # the resource records
```

Landmarks in the application image (base `0x08040000`), so nobody has to find them twice:

| Address | What |
|---|---|
| `0x08072ef0` | reset handler; `.data` is `0x20000000–0x200038a4`, copied from `0x080c9dd0` |
| `0x08059b38` | the 8 kHz tick: runs the 15-entry task table (RAM `0x2000071c`, enable mask `0x200069e4`) |
| `0x0805a820` / `0x0805a6bc` | incoming MIDI pump / one complete SysEx frame (buffer `0x2000fe88`) |
| `0x0805a9f8`, table `0x0805aa14` | the type-02 dispatcher and its 61-entry jump table (default `0x0805aac8`); replies through `0x0805a99c` |
| `0x08059dac`, `0x08059f7c`, `0x08059804` | type 04, type 05 (object upload), type 01 |
| `0x08058d08` / `0x08058d18` | read / write a device setting; the table's rows are 32 bytes from `0x080ca020` |
| `0x08059d34`, `0x0805fd88` | the 3 s host-alive test; the mode logic that uses it |
| `0x08052c2c`, `0x08053758`, `0x080adcb4` | where the device, drawing and `text_data` functions are given to Lua |
| `0x08065668`, `0x0806571c` | call a Lua function by name; call `draw` |
| `0x08052e3c`, `0x080ada58`, `0x200038c4` | fire a hook; the hook names; the hook mask |
| `0x0805f1e8`, `0x08066fa4`, `0x08067008` | the screen loop; the buffer swap request; the LCD interrupt |
| `0x080648a8`, `0x08064268`, `0x20010ce8` | knob widget: create, draw, its table |
| `0x0806255c`, `0x08061fb4` | pad widget create; text object create |
| `0x080b25b8`, `0x0805bc80` | the 58-entry LED id table; set an LED |
| `0x08066480`, `0x0806c998` | find a resource by (type, id); load the fonts at start-up |
| `0x0806da10`, `0x0805f562`, `0x0805a87c` | SDRAM controller set-up; SPI2 set-up; USB pin set-up |
| `0x08067fac`, `…fcc`, `…fb4`, `…fe0`, `0x0806803c` | decode a 7-bit, 14-bit, signed 14-bit, 28-bit number, a string |

### ST's material

From GitHub, no ST account needed: `STMicroelectronics/STM32CubeF4` (v1.29.0; its drivers are
submodules: `cmsis_device_f4`, `stm32f4xx_hal_driver`, `32f429idiscovery-bsp`,
`stm324x9i-eval-bsp`, the `ampire480272` panel component, `stm32_mw_usb_device`) and
`STMicroelectronics/STM32_open_pin_data` (every F429/F439 pin and what it can be). The PDFs are in
`docs/STM32F429/` on the owner's machine; st.com refuses automated downloads. ST's USB library has
no MIDI class.

## What is open

Needs the keyboard:

1. Run the asset probe: does the CTRL49 carry the Advance's art (`asset_get_valid(11, 0)` for the
   knob frames)?
2. A page whose `draw()` ends in `lua_widget_make_dirty`: does it redraw itself every frame?
3. One harmless 04/01 (brightness to 3 and back) to confirm the setting ids before any is used.
4. The read-only protection check described in the README, if the firmware route is wanted.

~~Needs the VIP captures: the frames VIP sent for its knob page (02/12–1C, 02/00–06).~~ Read
2026-11-23: the captures hold no such frames, so the knob and pad recipe needs the keyboard. What
they did hold, VIP's text objects, 02/23 readouts and how it enters and leaves VIP mode, is in the
README's fourth reading.

Code, in the order suggested:

1. The real-time fix and the reload of a tripped part, on the Linux branch. It helps every box.
2. The screenless player: restore at start-up, no web view, by a flag or the player role.
3. In `Ctrl49Protocol`: a refuse list (03/06; setting 13; 14 with any value but 1 or 2; 15 with
   any value but 0; 33, 36, 37; ids outside the table), 04/01 and 04/02 builders, and a ping
   (06/02) so a silent keyboard is noticed. Not "settings 13–15" whole: HoSTage starts with
   14 = 2, as VIP does. The refuse list is built (2026-11-24, `refusalReason`), wider than this
   line: the README's eleventh reading added restarts, flash writes and 05/00's storage state.
4. What an idle worker spends about 3% of a fast core on, every block.
5. LV2 hosting, if the Pi is the target.
6. A Lua drawing library for pages, tested in the preview.

The firmware route, if taken: a first pin map from the Advance firmware's pin set-up read against
ST's pin data (done 2026-11-23: the README's sixth reading, which also found a second
microcontroller on the board), and a skeleton on an STM32F429I-Discovery board, before any
keyboard is opened.

For the owner: which box (Pi, thin client, x86 board); whether the Pi's plug-in scope is
acceptable; whether new firmware is worth a keyboard.

## Rules that held all session

- No firmware bytes, no extracted images and no ST PDFs in the repository. It is public.
- Nothing was sent to a keyboard. The commands and setting ids marked "never send" in the README
  stay that way.
- The experiment patch is a measuring aid, not a feature.
- `CLAUDE.md`: verify locally, one push per finished change, `[skip ci]` for documentation only.

## Prompt for Claude Code

```text
Continue the work in docs/design/stage-box-and-ctrl49-firmware-handoff.md. Read that file, then
CLAUDE.md, then the firmware sections of tools/ctrl49/README.md. ST's documents for the chip are in
docs/STM32F429/ (not in git). The Linux work is on codex/hostage-linux-playback. Do not commit
firmware, extracted images or ST's PDFs, and do not send anything to the keyboard that the README
marks as never to be sent. Start with: <the item from "What is open" you want next>.
```
