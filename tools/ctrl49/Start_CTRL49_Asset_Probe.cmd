@echo off
REM Asset probe: lists which images the CTRL49 carries in its own flash, and draws a few.
REM Read-only: it only asks whether an asset exists and tries to draw it. Nothing is written
REM to the keyboard's flash. Close HoSTage / CEditor, VIP and your DAW first; only one program
REM can own the screen. Ctrl+C (or closing this window) hands the keyboard back.
REM
REM Turn encoder 1 to step through the asset types that have images.

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

"%EXE%" "%HERE%CEditor_Asset_Probe.lua" "%HERE%knob_strip.png"

echo.
echo (exit code %ERRORLEVEL%)
pause
