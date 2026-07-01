@echo off
setlocal
REM provision.cmd — one-shot provisioning of CEditor's export toolchains (C++/C#/Java/Python) on Windows.
REM Runs provision.mjs with Node, which downloads the bundled toolchains into the per-user toolchain dir
REM (or tools\toolchains\<id>\ when run elevated by the installer) so a user can export every language with
REM NO Visual Studio / .NET SDK / GraalVM pre-installed. Pass toolchain ids to provision a subset, e.g.
REM   provision.cmd dotnet llvm-mingw        (just the C# + C++ toolchains)
REM   provision.cmd --force                  (re-download everything)
REM Prefer the Node bundled beside the app (tools\node\node.exe, shipped by the installer) so this works
REM on a clean machine with no system Node; fall back to a Node on PATH for source-checkout use.
set "BUNDLED_NODE=%~dp0..\node\node.exe"
if exist "%BUNDLED_NODE%" (
  "%BUNDLED_NODE%" "%~dp0provision.mjs" %*
  exit /b %errorlevel%
)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(node.exe^) was not found on PATH and no bundled Node is present. Install Node.js, then re-run this script.
  exit /b 1
)
node "%~dp0provision.mjs" %*
exit /b %errorlevel%
