# WebView2 profile folders

Every CEditor webview on Windows — a player panel in a DAW, the standalone player, the instrument
host — runs in Microsoft's WebView2, and WebView2 needs a *profile folder* (its "user data folder")
for cache, cookies and settings. This page says which folder each webview gets, what clears them up,
and how to try sharing one engine between plug-in copies. The code is
`CE/src/WebViewProfileFolders.h`.

## One folder per webview, and the sweep

Each webview gets a folder of its own under `%TEMP%\CEditorPlayer_WebView2\` (the instrument host
uses its own base folder the same way), named `p<pid>-<start>-<module>-<n>`:

| Part | What it is |
| --- | --- |
| `pid` | the process the webview lives in |
| `start` | when that process started, the same for every plug-in binary loaded into it |
| `module` | a token drawn by the plug-in binary, so two binaries in one process never pick the same name |
| `n` | a counter per webview |

A folder per webview because a shared one once blanked the second panel: WebView2 would not create
a second webview on a folder another user (the standalone, or another instance) already had.

Nothing used to delete them, so every player window ever opened left a WebView2 profile in `%TEMP%`.
Now the first webview a plug-in binary makes sweeps the base folder of what is no longer anyone's:

- a folder whose process has gone;
- one with this process's id but another start time (the id came round again, so its owner has gone);
- one in the name older builds used (`<hex ticks>_<n>`) made more than 30 days ago.

A live process's folders are never touched, whichever binary in it made them, and neither is
anything not named like these. A folder WebView2 still holds open is left for the next sweep. The
sweep stops after 200 ms and carries on at the next start.

## Sharing one engine per process (off by default)

WebView2 runs one browser process per profile folder, with its own GPU, network and utility
processes: about 200 MB in Chromium terms, measured in October 2026 (the page itself costs about
300 MB more per copy for a panel the size of GAIA). A folder per webview therefore means a whole
engine per plug-in copy.

With the environment variable `CEDITOR_WEBVIEW2_SHARED=1`, every webview one plug-in binary makes in
one process uses the same folder (`…-0`), so the copies of a panel in one DAW share one engine. A
second binary (another panel, or the same panel as CLAP beside VST3) still gets its own folder, and
so does every other process — the standalone, or a DAW that runs each plug-in in a process of its own.

It stays off until it has been tried in DAWs, because a shared folder is what blanked panels before.

### What the log says

Every player window writes three lines about its webview to `%TEMP%\ceditor-player-scripts.log`,
under the instance's tag:

```
[GAIA SH-01 3f2a]  [webview] opened, profile p4120-1d9a3f-7c01b2e4-0
[GAIA SH-01 3f2a]  [webview] page ready, profile p4120-1d9a3f-7c01b2e4-0, 2890 ms after opening
[GAIA SH-01 3f2a]  [webview] panel shown, profile p4120-1d9a3f-7c01b2e4-0, 3410 ms after opening
```

With the switch on, every copy in one DAW names the same folder, ending in `-0`; without it each
names its own. A window that logs `opened` and nothing after never got a working webview — the
blank panel this section is about — and `opened, no webview` means the WebView2 runtime is missing.

### The engine probe

`CEditorWebViewEngineProbe` (tests/WebViewEngineProbe.cpp) does what a tester would do in a DAW,
in one process of its own: loads an exported player plug-in three times, opens every editor in a
window, closes one and reopens it, closes all three and reopens them at once (twice), and starts a
second process with the same panel while the windows are open. Each window has to log `panel
shown`. On Windows it also counts the WebView2 engines it owns, one per profile folder in use, and
prints their memory. Build it beside a player plug-in and run it with the switch off and on:

```
cmake --preset native -DCEDITOR_WEBVIEW_ENGINE_PROBE=ON "-DCE_VST_PANEL_PATH=<export payload>"
cmake --build --preset native-release --target CEditorWebViewEngineProbe CEditorPlayerVST_VST3
build\native\Release\CEditorWebViewEngineProbe.exe "build\native\CEditorPlayerVST_artefacts\Release\VST3\<name>.vst3"
set CEDITOR_WEBVIEW2_SHARED=1
build\native\Release\CEditorWebViewEngineProbe.exe "build\native\CEditorPlayerVST_artefacts\Release\VST3\<name>.vst3"
```

`--copies`, `--cycles` and `--timeout` (seconds per stage) change the defaults of 3, 3 and 120. It
runs on Linux too, where the webview is WebKitGTK and the switch only changes the folder's name; that
proves the probe, not WebView2.

It is not a DAW: a host's own threads and windows are still worth a look, which is what follows.

### Trying it

On a Windows machine with an exported player plug-in installed:

1. In a Command Prompt: `setx CEDITOR_WEBVIEW2_SHARED 1`, then start the DAW from a fresh session
   (setx affects programs started afterwards; signing out and in is the sure way).
2. Put three instances of the same panel on three tracks and open all three windows.
3. Check that every panel draws and responds, and that closing and reopening a window still works.
4. Start the standalone player with the same panel while the DAW is running, and check both draw.
5. In Task Manager, the DAW's `msedgewebview2.exe` processes: with the switch there should be one
   browser process (and its helpers) for the three windows, not three sets. The DAW's memory should
   be several hundred MB lower than without the switch.
6. In `%TEMP%\ceditor-player-scripts.log`, every window should have logged `panel shown`, all with
   the same `…-0` folder (see *What the log says*).
7. `setx CEDITOR_WEBVIEW2_SHARED ""` turns it off again.

A panel that stays blank or white with the switch on and draws without it is the failure this is
waiting to rule out; note the DAW and its version.
