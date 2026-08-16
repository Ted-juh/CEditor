@echo off
REM ============================================================================
REM  One command to get the latest code and build a fresh installer.
REM   1. Pulls the latest commit on whatever branch you are on.
REM   2. Builds the installer with a freshly rebuilt UI bundle (no stale UI).
REM  After it finishes, check Help -> About CEditor (or the build stamp at the
REM  top-right of the menu bar) to confirm the commit you are running.
REM
REM  Every run is also written to build-installer.log next to this script, and
REM  when the script was started by double-click the window pauses instead of
REM  closing, so a failure can actually be read.
REM ============================================================================
setlocal
cd /d "%~dp0"

REM Started by double-click (cmd /c "...file...") rather than typed in a shell?
set "INTERACTIVE=0"
echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul 2>&1 && set "INTERACTIVE=1"

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
echo Updating branch %BRANCH% to the latest commit...
git pull origin %BRANCH%
if errorlevel 1 (
    echo.
    echo *** git pull failed. Fix the problem above, then run this again. ***
    if "%INTERACTIVE%"=="1" pause
    exit /b 1
)

echo.
echo Building installer with a fresh UI bundle...
call "%~dp0build-installer.cmd"
set "EC=%errorlevel%"
if not "%EC%"=="0" (
    echo.
    echo *** Build failed with exit code %EC%. ***
    echo *** Full output is in: %~dp0build-installer.log ***
    if "%INTERACTIVE%"=="1" pause
    exit /b %EC%
)

echo.
echo Build finished. Full output is in: %~dp0build-installer.log
if "%INTERACTIVE%"=="1" pause
exit /b 0
