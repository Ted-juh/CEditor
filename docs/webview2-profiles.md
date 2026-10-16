# WebView2 profile folders

Every CEditor webview on Windows — a player panel in a DAW, the standalone player, the instrument
host — runs in Microsoft's WebView2, and WebView2 needs a *profile folder* (its "user data folder")
for cache, cookies and settings. This page says which folder each webview gets, why the copies of a
panel in one DAW share one engine, and what clears the folders up. The code is
`CE/src/WebViewProfileFolders.h`.

## The folders, and the sweep

Webviews get their folders under `%TEMP%\CEditorPlayer_WebView2\` (the instrument host uses its own
base folder the same way), named `p<pid>-<start>-<module>-<n>`:

| Part | What it is |
| --- | --- |
| `pid` | the process the webview lives in |
| `start` | when that process started, the same for every plug-in binary loaded into it |
| `module` | a token drawn by the plug-in binary, so two binaries in one process never pick the same name |
| `n` | `0` for the binary's one shared folder (the default, below), or a counter per webview |

Never a fixed folder, because one shared across processes once blanked the second panel: WebView2
would not create a webview on a folder another process (the standalone, or a second DAW) already had.

Nothing used to delete them, so every player window ever opened left a WebView2 profile in `%TEMP%`.
Now the first webview a plug-in binary makes sweeps the base folder of what is no longer anyone's:

- a folder whose process has gone;
- one with this process's id but another start time (the id came round again, so its owner has gone);
- one in the name older builds used (`<hex ticks>_<n>`) made more than 30 days ago.

A live process's folders are never touched, whichever binary in it made them, and neither is
anything not named like these. A folder WebView2 still holds open is left for the next sweep. The
sweep stops after 200 ms and carries on at the next start.

## One engine per process (on by default)

WebView2 runs one browser process per profile folder, with its own GPU, network and utility
processes, so a folder per webview meant a whole engine per plug-in copy. Every webview one plug-in
binary makes in one process now uses the same folder (`…-0`), and the copies of a panel in one DAW
share one engine. A second binary (another panel, or the same panel as CLAP beside VST3) still gets
its own folder, and so does every other process: the standalone, or a DAW that runs each plug-in in a
process of its own. The instrument host's webviews go the same way, with the same WebView2 options.

It was off by default until October 2026, because a shared folder is what blanked panels before. The
engine probe (below) then ran on Windows with WebView2, three copies of a small panel in one process:

| | WebView2 engines | Private memory, 3 windows |
| --- | --- | --- |
| A folder per webview | 3 | 563–747 MB |
| One folder per process | 1 | 307–331 MB |

Every panel was shown, through three rounds of closing and reopening every window at once, and a
second process with the same panel showed its own beside them. The saving grows with the panel and
with the number of copies.

`CEDITOR_WEBVIEW2_SHARED=0` (or `false`, `off`, `no`) in the environment gives every webview a folder
of its own again, as before. `1`, which testers set while sharing was off by default, still means on.

### What the log says

Every player window writes three lines about its webview to `%TEMP%\ceditor-player-scripts.log`,
under the instance's tag:

```
[GAIA SH-01 3f2a]  [webview] opened, profile p4120-1d9a3f-7c01b2e4-0
[GAIA SH-01 3f2a]  [webview] page ready, profile p4120-1d9a3f-7c01b2e4-0, 2890 ms after opening
[GAIA SH-01 3f2a]  [webview] panel shown, profile p4120-1d9a3f-7c01b2e4-0, 3410 ms after opening
```

By default every copy in one DAW names the same folder, ending in `-0`; with
`CEDITOR_WEBVIEW2_SHARED=0` each names its own. A window that logs `opened` and nothing after never got a working webview — the
blank panel this section is about — and `opened, no webview` means the WebView2 runtime is missing.

### The engine probe

`CEditorWebViewEngineProbe` (tests/WebViewEngineProbe.cpp) does what a tester would do in a DAW,
in one process of its own: loads an exported player plug-in three times, opens every editor in a
window, leaves them open for 10 s, minimises them all for 30 s and restores them (reporting WebView2's memory by
process at each point, the 10 s shown being what tells minimising from time passing), closes one and reopens it, closes all three and reopens them at once (three times), and
starts a second process with the same panel while the windows are open, once as a program started
from Explorer is and once as one started from a terminal. Each window has to log `panel shown`. On Windows it also counts the WebView2 engines it owns, one per profile folder in use, and
prints their memory. Build it beside a player plug-in and run it as it is and opted out:

```
cmake --preset native -DCEDITOR_WEBVIEW_ENGINE_PROBE=ON "-DCE_VST_PANEL_PATH=<export payload>"
cmake --build --preset native-release --target CEditorWebViewEngineProbe CEditorPlayerVST_VST3
build\native\Release\CEditorWebViewEngineProbe.exe "build\native\CEditorPlayerVST_artefacts\Release\VST3\<name>.vst3"
set CEDITOR_WEBVIEW2_SHARED=0
build\native\Release\CEditorWebViewEngineProbe.exe "build\native\CEditorPlayerVST_artefacts\Release\VST3\<name>.vst3"
```

`--copies`, `--cycles` and `--timeout` (seconds per stage) change the defaults of 3, 3 and 120. It
runs on Linux too, where the webview is WebKitGTK and the switch only changes the folder's name; that
proves the probe, not WebView2. `.github/workflows/release-checks.yml` runs it both ways on Windows.

It is not a DAW: a host's own threads and windows are still worth a look, which is what follows.

### What minimising gives back

Nothing, so far. The probe's minimise stage, release checks #12 and #13 (QA-08, three windows, the
shared engine; the renderers are the pages, and the GPU, browser and utility processes stay flat):

| | renderers' memory | renderers' CPU in the interval |
| --- | --- | --- |
| just opened | 190 MB | |
| after 10 s shown | 730-760 MB | 5.4 s |
| then 10 s minimised | 820-907 MB | 1.3 s |
| 20 s minimised | 941-1031 MB | 1.9 s |
| 30 s minimised | 1120-1217 MB | 1.7 s |
| 3 s after restoring | 1183-1283 MB | 0.2 s |

Opted out, the same within 10%. A minimised page does slow down, to about a third of its CPU, but
its memory keeps growing at 12 to 18 MB a second, and did not fall within the 43 s measured; only
closing the windows gives it back. Asking WebView2 for its low memory target while hidden
(`MemoryUsageTargetLevel`, tried as part of JUCE patch 9) made no difference and came out.

The same page in Chromium here, hidden as a background tab, goes quiet (one frame request a second)
and is collected about 12 s later, from 327 to 121 MB. What keeps a minimised WebView2 page busy and
growing is not yet known: its growth does not follow its own CPU, which points at something reaching
it from outside rather than its animation.

To see inside the pages, release checks watch the first shared run with
`tools/scripts/watch-webview-pages.mjs`. WebView2 is started with a debugging port of its own
choosing (`--remote-debugging-port=0`, so a second process cannot collide with the first), and the
watcher finds each browser's port in its profile folder and reports every page's visibility, the
frames and timers it asked for, the events the plug-in pushed in and the page sent out, its heap,
and what allocated, with the time, so its lines can be set beside the probe's. The switch goes in
through WebView2's per-user policy for the executable, which it reads where it ignored the
`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable. On a Windows machine, the same by hand:

```
reg add HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments /v CEditorWebViewEngineProbe.exe /d --remote-debugging-port=0 /f
start "" build\native\Release\CEditorWebViewEngineProbe.exe "<plug-in>.vst3"
node tools\scripts\watch-webview-pages.mjs --root "%TEMP%\CEditorPlayer_WebView2"
reg delete HKCU\Software\Policies\Microsoft\Edge\WebView2\AdditionalBrowserArguments /v CEditorWebViewEngineProbe.exe /f
```

### Checking it in a DAW

On a Windows machine with an exported player plug-in installed:

1. Start the DAW.
2. Put three instances of the same panel on three tracks and open all three windows.
3. Check that every panel draws and responds, and that closing and reopening a window still works.
4. Start the standalone player with the same panel while the DAW is running, and check both draw.
5. In Task Manager, the DAW's `msedgewebview2.exe` processes: there should be one browser process
   (and its helpers) for the three windows, not three sets.
6. In `%TEMP%\ceditor-player-scripts.log`, every window should have logged `panel shown`, all with
   the same `…-0` folder (see *What the log says*).

A panel that stays blank or white is the failure to report, with the DAW and its version and those
log lines. To see whether sharing is the cause, run `setx CEDITOR_WEBVIEW2_SHARED 0` in a Command
Prompt and start the DAW from a fresh session (setx affects programs started afterwards; signing out
and in is the sure way). `setx CEDITOR_WEBVIEW2_SHARED ""` undoes it.
