@echo off
REM Restore build/native to dev-mode ON (editor loads the Vite dev server again).
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat" >nul 2>&1
cmake -S "C:\dev\Projects\CEditor" -B "C:\dev\Projects\CEditor\build\native" -DCEDITOR_DEV_MODE=ON
echo ===DEV_MODE_RESTORED===
