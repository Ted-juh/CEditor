param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Find-VcVars64 {
    $vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (Test-Path $vsWhere) {
        $installPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
        if ($installPath) {
            $candidate = Join-Path $installPath "VC\Auxiliary\Build\vcvars64.bat"
            if (Test-Path $candidate) {
                return $candidate
            }
        }
    }

    $fallbackRoots = @(
        "C:\Program Files\Microsoft Visual Studio\18\Community",
        "C:\Program Files\Microsoft Visual Studio\2022\Community"
    )

    foreach ($root in $fallbackRoots) {
        $candidate = Join-Path $root "VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    throw "Could not locate vcvars64.bat. Install Visual Studio C++ workload first."
}

$vcvars = Find-VcVars64
Write-Host "Using vcvars: $vcvars"

$cmd = "`"$vcvars`" && cmake --preset native && cmake --build --preset native-$($Configuration.ToLowerInvariant())"
cmd /c $cmd

if ($LASTEXITCODE -ne 0) {
    throw "Native build failed (configuration: $Configuration)."
}

Write-Host "Native build succeeded ($Configuration)."
