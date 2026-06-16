@echo off
REM ============================================================================
REM  One command to get the latest code and build a fresh installer.
REM   1. Pulls the latest commit on whatever branch you are on.
REM   2. Builds the installer with a freshly rebuilt UI bundle (no stale UI).
REM  After it finishes, check Help -> About CEditor (or the build stamp at the
REM  top-right of the menu bar) to confirm the commit you are running.
REM ============================================================================
setlocal
cd /d "%~dp0"

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD') do set "BRANCH=%%b"
echo Updating branch %BRANCH% to the latest commit...
git pull origin %BRANCH%
if errorlevel 1 (
    echo.
    echo *** git pull failed. Fix the problem above, then run this again. ***
    exit /b 1
)

echo.
echo Building installer with a fresh UI bundle...
call "%~dp0build-installer.cmd"
exit /b %errorlevel%
