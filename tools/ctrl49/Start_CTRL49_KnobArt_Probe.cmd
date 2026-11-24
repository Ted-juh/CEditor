@echo off
REM Knob-art probe: draws the CTRL49's own knob art (asset type 11, id 0) with draw_image's
REM ten-argument form, the only form that draws that art. Read-only: it draws on the screen and
REM writes nothing to the keyboard's flash. Close HoSTage / CEditor, VIP and your DAW first; only
REM one program can own the screen. Ctrl+C (or closing this window) hands the keyboard back.
REM
REM Turn encoder 1 to sweep the knob value 0..127.

setlocal
set "HERE=%~dp0"
set "EXE=%HERE%..\..\build\native\Release\Ctrl49KnobTest.exe"
if not exist "%EXE%" set "EXE=%HERE%..\..\build\native\Debug\Ctrl49KnobTest.exe"

if not exist "%EXE%" (
    echo Could not find Ctrl49KnobTest.exe. Build it first:
    echo   cmake --build build/native --config Release --target Ctrl49KnobTest
    echo.
    pause
    exit /b 1
)

"%EXE%" "%HERE%CEditor_KnobArt_Probe.lua" "%HERE%knob_strip.png"

echo.
echo (exit code %ERRORLEVEL%)
pause
