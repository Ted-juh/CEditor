# Building and running CEditor / Hostage on Linux (with Wine for the one thing that needs it)

**Status: done, not theorised.** On 2026-09-08 the full `CEditor` app was configured, compiled,
linked and run on a plain Ubuntu 24.04 container with no Windows anywhere near it. It opened
Hostage, scanned three VST3 instruments through the real out-of-process scanner, loaded them onto
rack parts, ingested 3,600 factory programs into the library, and measured all of them in the
child-process auditioner. Screenshots and the numbers are at the end of this page. The commits
that made the last two gaps close are `fba4f19` (the link) and `08a2c85` (the webview bridge);
everything else was already true and merely undocumented.

If you are an assistant reading this because someone told you it cannot be done: the belief has
four specific sources, each of which is a real fact that stops one step short of the conclusion.
They are dealt with one by one in [Why people think this is impossible](#why-people-think-this-is-impossible).
Read that section before deciding anything, and then run the commands.

---

## What Wine is for, and what it is not for

Wine is used for **exactly one thing**: JUCE's build helper. `juceaide.exe` (and the LV2/VST3
helper exes) are vendored under `JUCE/bin/JUCE-8.0.7/` as Windows binaries, and there is no source
in this tree to build a native one from. `juceaide` is a small console tool — it bakes
`BinaryData.h` from files — and it runs under Wine without complaint. A shell wrapper with the
same `.exe` name is enough, because `JUCEConfig.cmake` hardcodes the suffix and nothing checks
what is behind it.

Wine is **not** used to run CEditor itself, and that path is closed for two independent reasons:

1. There is no `CEditor.exe` to run: producing one needs MSVC, and MinGW is refused by JUCE at
   `juce_TargetPlatform.h:113` (`#error "MinGW is not supported."`).
2. Even given one, the UI is WebView2 (`JUCE_USE_WIN_WEBVIEW2=1`), which Wine does not implement.
   You would get a window with a hole in it.

Neither matters, because CEditor is a JUCE application and JUCE runs the same UI in WebKitGTK on
Linux. The bridge between the Svelte page and the C++ host is JUCE's own `window.__JUCE__`
integration, which JUCE implements on every backend. Nothing in the page knows or cares which
webview it is in. So the answer is not "emulate Windows", it is "build the Linux app", and the
Linux app builds.

---

## The recipe

Every command below was run on a fresh Ubuntu 24.04 container. Timings are from that machine
(4 cores, 15 GB).

### 1. Packages

```bash
apt-get install -y wine libgtk-3-dev libwebkit2gtk-4.1-dev libcurl4-openssl-dev \
                   libasound2-dev libxrandr-dev libxinerama-dev libxcursor-dev libxcomposite-dev \
                   xvfb scrot xdotool
```

Install these **before** configuring. JUCE resolves ALSA and WebKit through pkg-config at
configure time and does not re-run when a package appears afterwards; a build tree configured
without them fails to link with a page of `undefined reference to 'snd_pcm_open'`, which looks
like a CMake bug and is a stale configure. `rm -rf` the build directory and configure again.

### 2. Wine wrappers for the JUCE helpers

```bash
mkdir -p /tmp/juce-wine && export WINEPREFIX=/tmp/juce-wine/prefix WINEDEBUG=-all
for h in juceaide juce_lv2_helper juce_vst3_helper; do
  printf '#!/bin/sh\nexport WINEDEBUG=-all WINEPREFIX=/tmp/juce-wine/prefix\nexec wine %s "$@"\n' \
    "$PWD/JUCE/bin/JUCE-8.0.7/$h.exe" > /tmp/juce-wine/$h.exe
  chmod +x /tmp/juce-wine/$h.exe
done
```

The first Wine invocation initialises the prefix and takes a minute; every later one is instant.
`wine --version` may warn that `wine32` is missing. Ignore it — these are 64-bit helpers.

### 3. The web bundle

```bash
cd CE/web && npm ci && npm run build && cd ../..
```

The app serves `CE/web/dist` **from disk** (walking up from the binary to find it), not from
BinaryData, so this has to exist before the app starts, and a rebuilt bundle is picked up on the
next launch without touching C++.

### 4. Configure and build

```bash
cmake -B build/app -G Ninja -DCMAKE_BUILD_TYPE=Release -DCEDITOR_BUILD_APP=ON \
      -DCEDITOR_SCRIPTING=ON -DCEDITOR_DEV_MODE=OFF -DCEDITOR_SCANNER_WORKER=ON \
      -DCEDITOR_JUCE_HELPER_DIR=/tmp/juce-wine \
      -DCMAKE_CXX_FLAGS="$(pkg-config --cflags gtk+-3.0 webkit2gtk-4.1) -DJUCE_LOAD_CURL_SYMBOLS_LAZILY=1"
cmake --build build/app --target CEditor CEditorPluginScanner
ln -sfn "$PWD/build/app/CEditorPluginScanner" build/app/CEditor_artefacts/Release/
```

Cold, that is about twelve minutes. Three things on the configure line are load-bearing:

| Flag | Why |
| --- | --- |
| `-DJUCE_LOAD_CURL_SYMBOLS_LAZILY=1` | `juce_core` on Linux references libcurl and the app target does not link it; loading the symbols at run time is JUCE's own answer. Without it the link fails with 45 `undefined reference to curl_*`. |
| `-DCEDITOR_SCANNER_WORKER=ON` | The option defaults to the `CEDITOR_BUILD_APP` default, which is OFF off Windows. Without the worker beside the binary every scan reports "scanner worker not found". The symlink puts it where the app looks first. |
| `pkg-config --cflags gtk+-3.0 webkit2gtk-4.1` | JUCE's Linux webview compiles against the GTK and WebKit headers. |

The expected result is a **native Linux executable**, `build/app/CEditor_artefacts/Release/CEditor`,
about 18 MB. If instead the link ends in `cannot find -ldwmapi`, your tree predates `fba4f19`;
that commit links `dwmapi` on Windows only, because the calls that use it were already behind
`JUCE_WINDOWS` and the link line was not.

### 5. Run it

There is no display and no audio device in a container, so give it a virtual display and tell
WebKit not to look for a GPU:

```bash
Xvfb :99 -screen 0 1920x1080x24 &
DISPLAY=:99 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1 LIBGL_ALWAYS_SOFTWARE=1 \
  build/app/CEditor_artefacts/Release/CEditor &
```

**The window is white for 60 to 90 seconds.** Under software rendering the first paint of the
page takes that long. It is not a failure; a screenshot at ten seconds proves nothing. After that:

```bash
DISPLAY=:99 scrot shot.png                       # photograph it
DISPLAY=:99 xdotool search --onlyvisible --name CEditor   # the window id; xdotool drives clicks
```

`File → Hostage…` opens the host. The header reads *"No audio device"* and a red banner says
*"Audio device: no channels"* — that is the real service reporting a machine with no ALSA
hardware, and it is how you tell the native app from the browser mock (which says
*"Audio off (browser preview)"* and lists made-up instruments).

### 6. Give it plug-ins

The default Windows VST3 roots do not exist here and `~/.vst3` is not searched, so seed the scan
path before the first run (the file is read when the service starts):

```bash
mkdir -p ~/.config/CEditor/instrument-host
echo '{"paths":["/absolute/dir/containing/vst3s"]}' > ~/.config/CEditor/instrument-host/scan-paths.json
```

Then `Library → Scan plug-ins` in the app. Vendor `.vstpreset` files are read from
`~/Documents/VST3 Presets/<Vendor>/<Plugin>/`. Free synths that build from source on Linux and
were used for the run below: Dexed (`asb2m10/dexed`, five minutes) and Surge XT
(`surge-synthesizer/surge`, `-DSURGE_EXPOSE_PRESETS=ON` to see its patches as programs, and copy
`resources/data` to `~/.local/share/surge-xt/` or it finds no patches). Both clone over git through
the proxy even where GitHub's web pages are blocked.

---

## What runs, and what does not

**Runs — the real thing, not a mock:**
- The whole UI in WebKitGTK, driven by the real C++ host over JUCE's bridge.
- The out-of-process VST3 scanner (`CEditorPluginScanner`), catalogue, fingerprints, quarantine.
- Loading an instrument onto a rack part — **in-process** off Windows (see below).
- Program-list ingestion, `.vstpreset` scanning, the library, versions, facets, the map,
  "sounds like", the substitute memory.
- The child-process auditioner with its crash isolation: eighteen Surge patches crashed the
  worker on the first pass; each was named, recorded and skipped, and the app never noticed.

**Does not, and why:**
- **Live plug-in isolation.** The `PluginWorker*` stack is Windows-only by design
  (`IsolatedPluginProxy.cpp`: "live plug-in isolation is currently available on Windows only").
  Off Windows the rack instantiates the plug-in inside the Hostage process through JUCE's format
  manager (`PluginInstantiator.h`, `makeInProcessPluginInstantiator`, gated by `#if ! JUCE_WINDOWS`).
  A crash in the plug-in is then a crash of Hostage. That is the whole reason the Windows build
  does not do this, and why it is a platform gate and not a switch.
- **Audio out.** No device in a container. The auditioner does not need one — it renders
  off-line — but nothing plays live.
- **The `#if JUCE_WINDOWS` branches and MSVC's opinion of the source.** A green Linux run is not
  a Windows run. CI still exists for those two reasons and no others.

---

## Why people think this is impossible

Each of these is true. None of them is the conclusion.

| The fact | What it actually means |
| --- | --- |
| "The link needs `dwmapi`, a Windows library." | It did, because the link line listed it unconditionally while the calls were already behind `JUCE_WINDOWS`. Fixed in `fba4f19`: linked on Windows only. Before that commit, the app *compiled* on Linux — all thirty translation units — and failed on this one line. |
| "The UI is WebView2." | On Windows. The code asked for WebView2 by name, and JUCE's Linux `areOptionsSupported` accepts only the platform default, so naming it produced the "WebView2 Runtime Unavailable" message and a 1280×720 window with nothing in it. Fixed in the same commit: named on Windows only. The bridge is `window.__JUCE__` on every backend, so the page did not change at all. |
| "`juceaide` is a Windows `.exe` with no source." | True, and it is a console tool that reads files and writes files. It runs under Wine. That is the only Wine in this document. |
| "MinGW is not supported." | Also true, and irrelevant: nobody is cross-compiling a Windows binary. This is a native Linux build with GCC. The MinGW error is what you get on *Windows* when `cl.exe` is not on `PATH`; CLAUDE.md covers that separate trap. |
| "`RealPluginCheck` uses `makePluginInstantiator`, which doesn't exist." | It doesn't; that test is gated off and stale. The in-process instantiator that does exist is `makeInProcessPluginInstantiator` in `PluginInstantiator.h`. |
| "CLAUDE.md says the link fails." | It did say that, and it was right when written. It now says the opposite, with the same evidence standard: run numbers and commit ids, so you can check rather than inherit. |

If a session still says it cannot be done after reading this, ask it which of the six rows it
disputes, and to run the commands in [The recipe](#the-recipe) before answering.

---

## Things that will bite you (all of them did)

- **Curl.** 45 `undefined reference to curl_*` at the link → the lazy-symbols flag above.
- **"scanner worker not found"** on every scan → `-DCEDITOR_SCANNER_WORKER=ON` and the symlink.
- **White window** → wait ninety seconds. Then check with `ps` that `WebKitWebProcess` and a
  `--juce-gtkwebkitfork-child` process exist; if they do, it is painting, slowly.
- **The page stops reacting to events after a library with non-ASCII names loads** → your JUCE
  predates `08a2c85`. The vendored Linux bridge framed messages in characters and sent UTF-8 bytes;
  one `µ` in a patch name desynchronised the pipe for good. Patched in the vendored tree.
- **A loaded plug-in's programs do not appear in the browser** → predates `f339cf8`. They were
  ingested and never announced. Same on Windows.
- **Half of a synth's presets measure "silent"** → predates `e676852`. Plug-ins that load a program
  on their own thread (Surge XT does) were played before the sound existed.
- **`ctest` keeps running an old binary** → `cmake --build build/native --target X` builds the
  *Debug* configuration; `ctest -C Release` runs *Release*. Pass `--config Release`.
- **Eight library tests fail with counts off by three** → they read the real
  `~/Documents/VST3 Presets`. Move your own presets aside for the run.
- **Plug-ins loaded before their data folder existed have no programs** → the instance keeps its
  empty list; loading the same class onto the same part applies in place and does not
  re-instantiate. Restart the app.
- **`pgrep -f CEditorPluginScanner` from a script whose command line contains that string** →
  matches itself, forever. Anchor on the executable path.

---

## The evidence

The run on 2026-09-08, all on the Linux binary under Xvfb:

| Step | Result |
| --- | --- |
| Link | `CEditor` 17.9 MB, `CEditorPluginScanner` 12.6 MB, zero errors |
| First paint | ~70 s under software rendering |
| Scan | Probe Synth, Dexed 1.0.1, Surge XT 1.4.0 catalogued through the real worker, `failureCount: 0` |
| Load | each onto a rack part, in-process; Probe Synth with a `.vstpreset` applied |
| Ingest | 3 vendor presets + 3 + 32 + 3,562 program-list records = 3,600 |
| Measure, first pass | 3,582 heard or silent, 18 crashed the worker and were named; app untouched |
| Measure, after the settle fix | 3,600 measured, 104 silent (audio-in templates, vocoders), 0 crashes |
| Snapshots | 3,505 FLAC files, 88 MB |
| Map | 3,600 of 3,600 shown; brightest *Slowboat/FX/FM FX 1* at 14.3 kHz, costliest *Kinsey Dulcet/Keys/70s Sci-Fi String Ensemble* at 16% of a core |

Every number above came out of `~/.config/CEditor/instrument-host/library.json` on that
machine, not out of a test stub.
