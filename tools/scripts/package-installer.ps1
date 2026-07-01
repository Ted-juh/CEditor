param(
    [ValidateSet("Release")]
    [string]$Configuration = "Release",
    [string]$Version = "",
    [string]$WebView2InstallerPath = "",
    [switch]$StageOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-ProjectVersion {
    $cmakeLists = Join-Path (Get-RepoRoot) "CMakeLists.txt"
    $match = Select-String -Path $cmakeLists -Pattern 'project\s*\(\s*CEditor\s+VERSION\s+([0-9]+\.[0-9]+\.[0-9]+)\s*\)'

    if ($match -and $match.Matches.Count -gt 0) {
        return $match.Matches[0].Groups[1].Value
    }

    throw "Could not determine the project version from CMakeLists.txt."
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

    throw "Could not locate vcvars64.bat. Install the Visual Studio C++ workload first."
}

function Find-InnoCompiler {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"),
        (Join-Path ${env:ProgramFiles} "Inno Setup 6\ISCC.exe")
    )

    foreach ($candidate in $candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }

    $command = Get-Command ISCC.exe -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    return $null
}

function Find-VcRedist {
    $vsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
    if (-not (Test-Path $vsWhere)) {
        return $null
    }

    $installPath = & $vsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
    if (-not $installPath) {
        return $null
    }

    $redistRoot = Join-Path $installPath "VC\Redist\MSVC"
    if (-not (Test-Path $redistRoot)) {
        return $null
    }

    $redist = Get-ChildItem $redistRoot -Directory |
        Sort-Object Name -Descending |
        ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter vc_redist.x64.exe -ErrorAction SilentlyContinue } |
        Select-Object -First 1

    if ($redist) {
        return $redist.FullName
    }

    return $null
}

function Reset-Directory([string]$Path) {
    if (Test-Path $Path) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force
        }
        catch {
            Write-Warning "Could not fully clear $Path. Reusing the existing directory."
            New-Item -ItemType Directory -Path $Path -Force | Out-Null
            return
        }
    }

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
}

function Build-Frontend([string]$RepoRoot) {
    $frontendRoot = Join-Path $RepoRoot "CE\web"

    # Always rebuild the UI bundle. The previous "skip if dist looks fresh"
    # shortcut caused stale-UI bugs (a pulled fix would never reach the build),
    # so correctness wins over the few seconds saved.
    if (-not (Test-Path (Join-Path $frontendRoot "node_modules"))) {
        Write-Host "Installing frontend dependencies (npm ci)..."
        Push-Location $frontendRoot
        try {
            & npm ci
            if ($LASTEXITCODE -ne 0) {
                throw "npm ci failed."
            }
        }
        finally {
            Pop-Location
        }
    }

    Write-Host "Building frontend bundle (fresh build)..."
    Push-Location $frontendRoot
    try {
        & npm run build
        if ($LASTEXITCODE -ne 0) {
            throw "Frontend build failed."
        }
    }
    finally {
        Pop-Location
    }
}

function Build-And-Stage-Native([string]$RepoRoot, [string]$StageDir, [string]$Configuration) {
    $vcvars = Find-VcVars64
    Write-Host "Using vcvars: $vcvars"
    $buildDir = Join-Path $RepoRoot "build\package-native"

    Reset-Directory $buildDir

    Push-Location $RepoRoot
    try {
        $cmd = "`"$vcvars`" && cmake -S . -B `"$buildDir`" -G `"Ninja Multi-Config`" -DCEDITOR_DEV_MODE=OFF && cmake --build `"$buildDir`" --config $Configuration && cmake --install `"$buildDir`" --config $Configuration --prefix `"$StageDir`""
        cmd /c $cmd

        if ($LASTEXITCODE -ne 0) {
            throw "Native build or staging failed ($Configuration)."
        }
    }
    finally {
        Pop-Location
    }
}

function Stage-ExportPipeline([string]$RepoRoot, [string]$StageDir) {
    # Stage the export pipeline + toolchain provisioning SCRIPTS (never the provisioned binaries — those
    # are downloaded on demand). This makes Settings -> Scripting Toolchains work in the installed app and
    # gives the installer's language components something to provision into. NOTE: a full VST3 export also
    # needs the C++ build environment (source + CMake + a compiler); that is a separate "developer install"
    # and is not staged here — see tools/docs/windows-installer.md.
    $toolsSrc = Join-Path $RepoRoot "tools"
    $toolsDst = Join-Path $StageDir "tools"

    $scriptsDst = Join-Path $toolsDst "scripts"
    New-Item -ItemType Directory -Path $scriptsDst -Force | Out-Null
    Copy-Item (Join-Path $toolsSrc "scripts\*") -Destination $scriptsDst -Recurse -Force

    # Toolchain provisioning scripts only: the top-level files (manifest.json, *.mjs, provision.cmd/.sh,
    # *.cmake, README). Get-ChildItem -File skips the provisioned binary subdirs (llvm-mingw/, dotnet/, ...).
    $tcDst = Join-Path $toolsDst "toolchains"
    New-Item -ItemType Directory -Path $tcDst -Force | Out-Null
    Get-ChildItem (Join-Path $toolsSrc "toolchains") -File | Copy-Item -Destination $tcDst -Force

    Write-Host "Staged export pipeline + toolchain scripts -> $toolsDst"
}

function Stage-NodeRuntime([string]$StageDir) {
    # Bundle a Node runtime beside the app (tools\node\node.exe). The app's findNodeExecutable() and the
    # installer's provision.cmd both prefer it, so toolchain provisioning + management work on a clean
    # machine with NO system Node. Windows node.exe is self-contained (depends only on system DLLs), so a
    # single-file copy of the build machine's node is sufficient and pins the bundled Node to the build's.
    $node = (Get-Command node -ErrorAction SilentlyContinue).Source
    if (-not $node) {
        Write-Warning "node.exe was not found on PATH; the installer will NOT bundle Node. Toolchain management on a clean machine will then require the user to install Node.js."
        return
    }

    $nodeDst = Join-Path $StageDir "tools\node"
    New-Item -ItemType Directory -Path $nodeDst -Force | Out-Null
    Copy-Item -LiteralPath $node -Destination (Join-Path $nodeDst "node.exe") -Force
    Write-Host "Bundled Node runtime: $node -> $nodeDst\node.exe"
}

function Copy-OptionalPrerequisites([string]$RepoRoot, [string]$StageDir, [string]$WebView2InstallerPath) {
    $vcRedist = Find-VcRedist
    if ($vcRedist) {
        Copy-Item -LiteralPath $vcRedist -Destination (Join-Path $StageDir "vc_redist.x64.exe") -Force
        Write-Host "Bundled VC++ redistributable: $vcRedist"
    }
    else {
        Write-Warning "vc_redist.x64.exe was not found. The installer will not bundle the VC++ runtime."
    }

    $installer = $WebView2InstallerPath
    if ([string]::IsNullOrWhiteSpace($installer)) {
        $installer = Join-Path $RepoRoot "tools\installer\thirdparty\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
    }

    if (Test-Path $installer) {
        Copy-Item -LiteralPath $installer -Destination (Join-Path $StageDir "MicrosoftEdgeWebView2RuntimeInstallerX64.exe") -Force
        Write-Host "Bundled WebView2 standalone installer: $installer"
    }
    else {
        Write-Warning "MicrosoftEdgeWebView2RuntimeInstallerX64.exe was not found. Place it at tools\\installer\\thirdparty\\MicrosoftEdgeWebView2RuntimeInstallerX64.exe or pass -WebView2InstallerPath."
    }
}

function Compile-InnoInstaller([string]$RepoRoot, [string]$StageDir, [string]$OutputDir, [string]$Version) {
    $iscc = Find-InnoCompiler
    if (-not $iscc) {
        Write-Warning "Inno Setup 6 was not found. The staged app is ready at $StageDir, but no .exe installer was built."
        return
    }

    $scriptPath = Join-Path $RepoRoot "tools\installer\CEditor.iss"
    & $iscc "/DMyAppVersion=$Version" "/DMySourceDir=$StageDir" "/DMyOutputDir=$OutputDir" $scriptPath

    if ($LASTEXITCODE -ne 0) {
        throw "Inno Setup compilation failed."
    }
}

$repoRoot = Get-RepoRoot
$stageDir = Join-Path $repoRoot "build\package-stage\CEditor"
$outputDir = Join-Path $repoRoot "build\installer"

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = Get-ProjectVersion
}

Reset-Directory $stageDir
New-Item -ItemType Directory -Path $outputDir -Force | Out-Null

Build-Frontend -RepoRoot $repoRoot
Build-And-Stage-Native -RepoRoot $repoRoot -StageDir $stageDir -Configuration $Configuration
Stage-ExportPipeline -RepoRoot $repoRoot -StageDir $stageDir
Stage-NodeRuntime -StageDir $stageDir
Copy-OptionalPrerequisites -RepoRoot $repoRoot -StageDir $stageDir -WebView2InstallerPath $WebView2InstallerPath

if ($StageOnly) {
    Write-Host "Staged install files at: $stageDir"
    exit 0
}

Compile-InnoInstaller -RepoRoot $repoRoot -StageDir $stageDir -OutputDir $outputDir -Version $Version
Write-Host "Installer output directory: $outputDir"
