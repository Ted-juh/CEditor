@echo off
REM Double-click launcher for the HoSTage feature mockups (screen-lab\feature-mockups): two presets
REM of five pages each, in two sizes for the stress test - full, and slim (a smaller script, less
REM data, fewer draw calls, less image memory, 10 redraws a second). Needs a Ctrl49ScreenLab.exe with
REM the preset mode, beside this file or built under build\native. Connect the CTRL49 and close VIP,
REM your DAW and HoSTage / CEditor first (only one program can own the screen).

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Release\Ctrl49ScreenLab.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Debug\Ctrl49ScreenLab.exe"

if not exist "%EXE%" (
    echo Could not find Ctrl49ScreenLab.exe beside this file or under build\native.
    echo Build it first:  cmake --build build/native --config Release --target Ctrl49ScreenLab
    echo.
    pause
    exit /b 1
)

echo   HoSTage Features   Sound Atlas, Motion, Capture, Stage, Chords
echo     1  slim          Skin.lua 30 KB, 10 redraws a second, at most ~195 draw calls
echo     2  full          Skin.lua 48 KB, 15 redraws a second, at most ~270 draw calls
echo   HoSTage Rig        Layers, Effects, Soundcheck, Discover, Changes
echo     3  slim          Skin.lua 39 KB, 10 redraws a second, at most ~175 draw calls
echo     4  full          Skin.lua 59 KB, 15 redraws a second, at most ~280 draw calls
echo.
echo   Slim first: if it fails, full will too. The corner beside the page dots shows the draw
echo   calls of each redraw and the Lua memory in KB (and the firmware's mem_usage, if it has one).
choice /c 1234 /n /m "Which one? [1-4] "
set "DESIGN=hostage-features-slim"
if errorlevel 2 set "DESIGN=hostage-features"
if errorlevel 3 set "DESIGN=hostage-rig-slim"
if errorlevel 4 set "DESIGN=hostage-rig"

echo.
echo Page ^< ^> walks the five pages. Ctrl+C stops.
"%EXE%" preset "%HERE%screen-lab\feature-mockups\%DESIGN%\Design.ctrl49preset"

echo.
echo (exit code %ERRORLEVEL%)
pause
