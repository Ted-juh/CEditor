@echo off
setlocal
REM provision.cmd — one-shot provisioning of CEditor's export toolchains (C++/C#/Java/Python) on Windows.
REM Finds Node.js on PATH (the same node CEditor uses to run the exporter) and runs provision.mjs, which
REM downloads the bundled toolchains into tools\toolchains\<id>\ so a user can export every language with
REM NO Visual Studio / .NET SDK / GraalVM pre-installed. Pass toolchain ids to provision a subset, e.g.
REM   provision.cmd dotnet llvm-mingw        (just the C# + C++ toolchains)
REM   provision.cmd --force                  (re-download everything)
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(node.exe^) was not found on PATH. Install Node.js, then re-run this script.
  exit /b 1
)
node "%~dp0provision.mjs" %*
exit /b %errorlevel%
