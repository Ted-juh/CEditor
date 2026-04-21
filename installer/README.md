# Windows Installer Setup

This project now has a basic Windows packaging flow for Inno Setup 6.

## What must be true before an installer works

The installed application cannot rely on the Vite dev server. The native app must be built with:

```powershell
-DCEDITOR_DEV_MODE=OFF
```

In that mode `CEditor.exe` serves the frontend from files staged next to the executable under:

```text
web\dist\
```

The staged install layout should look like this:

```text
CEditor\
  CEditor.exe
  web\
    dist\
      index.html
      assets\...
```

## Files added for packaging

- `installer/CEditor.iss`
  Inno Setup 6 script.
- `scripts/package-installer.ps1`
  Builds the frontend, builds the native app in installed mode, stages files with `cmake --install`, optionally bundles prerequisites, and compiles the installer.

## Recommended workflow

From the repo root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-installer.ps1
```

Or just double-click:

- `build-installer.cmd` to build and compile the Inno installer
- `stage-installer.cmd` to rebuild/stage the app without compiling Inno

What the script does:

1. Runs `npm run build` in `CE/web`.
2. Configures CMake with `CEDITOR_DEV_MODE=OFF`.
3. Builds the Release native app.
4. Stages the install tree into `build\package-stage\CEditor` using `cmake --install`.
5. Copies `vc_redist.x64.exe` into the staging folder if Visual Studio provides it locally.
6. Copies `MicrosoftEdgeWebView2RuntimeInstallerX64.exe` into the staging folder if you placed it in `installer\thirdparty\`.
7. Compiles `installer/CEditor.iss` with Inno Setup 6 if `ISCC.exe` is installed.

If you only want the staged files and not the final installer executable:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-installer.ps1 -StageOnly
```

## Inno Setup script behavior

`installer/CEditor.iss` installs:

- `CEditor.exe`
- `web\dist\...`
- optional `vc_redist.x64.exe`
- optional `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`

At install time it will:

1. Install the VC++ runtime silently if `vc_redist.x64.exe` is present.
2. Install the WebView2 runtime silently if `MicrosoftEdgeWebView2RuntimeInstallerX64.exe` is present.
3. Create Start Menu and optional desktop shortcuts.
4. Launch CEditor after install unless the user ran the installer silently.

## WebView2 standalone installer

The app uses WebView2 on Windows, so a clean user machine may need the WebView2 Runtime.

Place the Microsoft x64 standalone installer here before packaging:

```text
installer\thirdparty\MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

Or pass a custom path:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\package-installer.ps1 `
  -WebView2InstallerPath "C:\path\to\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
```

## Manual build if you do not want to use the helper script

Build the frontend:

```powershell
cd CE\web
npm run build
cd ..\..
```

Configure and build the native app for installed mode:

```powershell
cmake --preset native -DCEDITOR_DEV_MODE=OFF
cmake --build --preset native-release
cmake --install build/native --config Release --prefix ".\build\package\CEditor"
```

Compile the Inno installer:

```powershell
"C:\Program Files (x86)\Inno Setup 6\ISCC.exe" `
  "/DMyAppVersion=0.1.0" `
  "/DMySourceDir=C:\dev\Projects\CEditor\build\package\CEditor" `
  "/DMyOutputDir=C:\dev\Projects\CEditor\build\installer" `
  "C:\dev\Projects\CEditor\installer\CEditor.iss"
```

## How to test like an end user

Best option:

1. Test on a clean Windows VM.
2. Ensure the VM does not already have your local source tree, build tools, or dev server running.
3. Run the generated installer from `build\installer`.
4. Launch from the Start Menu shortcut, not from your repo folder.
5. Confirm the UI loads without `localhost:5173`.
6. Confirm `%APPDATA%\CEditor` is created after the first run and settings persist between launches.
7. Uninstall and confirm the program files are removed from `Program Files`.

Good local smoke test:

1. Run `scripts/package-installer.ps1 -StageOnly`.
2. Launch `build\package-stage\CEditor\CEditor.exe`.
3. Verify it opens without the Vite dev server running.

## Current external prerequisites

The built Release executable depends on:

- Microsoft Edge WebView2 Runtime
- Microsoft Visual C++ runtime (`MSVCP140.dll`, `VCRUNTIME140.dll`, `VCRUNTIME140_1.dll`)

That is why the installer supports bundling both prerequisite installers.
