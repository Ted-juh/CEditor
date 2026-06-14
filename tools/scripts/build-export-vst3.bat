@echo off
REM Build a self-contained CEditorPlayerVST VST3 (dev-mode OFF, web bundled, value layer ON).
call "C:\Program Files\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvars64.bat"
if errorlevel 1 ( echo vcvars failed & exit /b 1 )
cmake -S "C:\dev\Projects\CEditor" -B "C:\dev\Projects\CEditor\build\native" -DCEDITOR_DEV_MODE=OFF
if errorlevel 1 ( echo configure failed & exit /b 1 )
cmake --build "C:\dev\Projects\CEditor\build\native" --target CEditorPlayerVST_VST3 --config Release
if errorlevel 1 ( echo build failed & exit /b 1 )
echo ===EXPORT_BUILD_OK===
