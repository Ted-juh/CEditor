param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Debug",
    # The app embeds CE\web\dist at build time, so a native build without a fresh web bundle
    # ships whatever bundle was last built — which is how a pulled UI fix "did not show up"
    # after a green native build. The bundle is rebuilt here by default; -SkipWeb is for the
    # case where you just built it yourself and know it.
    [switch]$SkipWeb
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

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

$repoRoot = Get-RepoRoot

if (-not $SkipWeb) {
    $webRoot = Join-Path $repoRoot "CE\web"
    Push-Location $webRoot
    try {
        if (-not (Test-Path "node_modules")) {
            Write-Host "Installing web dependencies (npm ci)..."
            & npm ci
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }
        }
        Write-Host "Building the web bundle (npm run build)..."
        & npm run build
        if ($LASTEXITCODE -ne 0) { throw "Web bundle build failed." }
    }
    finally {
        Pop-Location
    }
}

Push-Location $repoRoot
try {
    $cmd = "`"$vcvars`" && cmake --preset native && cmake --build --preset native-$($Configuration.ToLowerInvariant())"
    cmd /c $cmd
}
finally {
    Pop-Location
}

if ($LASTEXITCODE -ne 0) {
    throw "Native build failed (configuration: $Configuration)."
}

$sha = "unknown"
try { $sha = (& git -C $repoRoot rev-parse --short HEAD) } catch { }
Write-Host ""
Write-Host "Native build succeeded ($Configuration, source $sha)."
Write-Host "Editor:  $repoRoot\build\native\CEditor_artefacts\$Configuration\CEditor.exe"
Write-Host "Hostage: $repoRoot\build\native\CEHostStandalone_artefacts\$Configuration\Hostage.exe"
Write-Host "Help > About in either should read build $sha."
