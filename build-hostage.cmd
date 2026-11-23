@echo off
setlocal
cd /d "%~dp0" || exit /b 1
if not exist "build\" mkdir "build" || exit /b 1

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Transcript -Path 'build\build-hostage.log' -Force | Out-Null; $ec = 0; try { git pull --ff-only; if ($LASTEXITCODE) { throw 'Git update failed.' }; & '.\tools\scripts\package-hostage.ps1' } catch { Write-Host $_; $ec = 1 } finally { Stop-Transcript | Out-Null }; exit $ec"
set "EC=%errorlevel%"
if not "%EC%"=="0" (
    echo Build failed. See "%~dp0build\build-hostage.log".
    echo %cmdcmdline% | findstr /i /c:"%~nx0" >nul 2>&1 && pause
)
exit /b %EC%
