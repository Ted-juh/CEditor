[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $InstrumentVst3,

    [Parameter(Mandatory = $true)]
    [string] $EffectVst3,

    [string] $InstrumentClass = "",
    [string] $EffectClass = "",
    [string] $BuildDirectory = "",

    [ValidateSet("Debug", "Release", "RelWithDebInfo", "MinSizeRel")]
    [string] $Configuration = "Release"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
if ([string]::IsNullOrWhiteSpace($BuildDirectory)) {
    $BuildDirectory = Join-Path $repositoryRoot "build\native"
}
$resolvedBuildDirectory = [System.IO.Path]::GetFullPath($BuildDirectory)

function Resolve-SmokeBinary {
    param(
        [Parameter(Mandatory = $true)]
        [string] $FileName
    )

    # Cover Visual Studio/multi-config and Ninja/single-config layouts without sweeping the
    # tree and accidentally selecting a stale binary from an unrelated artefacts directory.
    $candidatePaths = @(
        (Join-Path (Join-Path $resolvedBuildDirectory $Configuration) $FileName),
        (Join-Path $resolvedBuildDirectory $FileName)
    )
    $matches = @($candidatePaths | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf })
    if ($matches.Count -eq 0) {
        throw "Missing $FileName under '$resolvedBuildDirectory'. Build the explicit CEditorPluginWorkerRealVstSmoke target first."
    }
    if ($matches.Count -gt 1) {
        throw "Ambiguous ${FileName}: both multi-config and single-config outputs exist. Pass the exact build directory for the intended binary set."
    }
    return [System.IO.Path]::GetFullPath($matches[0])
}

function Resolve-Vst3Module {
    param(
        [Parameter(Mandatory = $true)]
        [string] $Path,

        [Parameter(Mandatory = $true)]
        [string] $Role
    )

    $resolved = [System.IO.Path]::GetFullPath($Path)
    if (-not ((Test-Path -LiteralPath $resolved -PathType Leaf) -or
              (Test-Path -LiteralPath $resolved -PathType Container))) {
        throw "$Role VST3 does not exist: $resolved"
    }
    if (-not $resolved.EndsWith(".vst3", [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "$Role path is not a .vst3 module: $resolved"
    }
    return $resolved
}

function Invoke-SmokeRole {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("instrument", "effect")]
        [string] $Role,

        [Parameter(Mandatory = $true)]
        [string] $ModulePath,

        [string] $ClassSelector = ""
    )

    $smokeArguments = @($scannerExecutable, $workerExecutable, $ModulePath)
    if (-not [string]::IsNullOrWhiteSpace($ClassSelector)) {
        $smokeArguments += $ClassSelector
    }

    Write-Host ""
    Write-Host ("=== Real VST3 {0}: {1} ===" -f $Role, $ModulePath)
    $smokeOutput = @(& $smokeExecutable @smokeArguments 2>&1)
    $exitCode = $LASTEXITCODE
    $smokeOutput | ForEach-Object { Write-Host $_ }

    $recordLine = @($smokeOutput | ForEach-Object { $_.ToString() } |
        Where-Object { $_.StartsWith("SMOKE_RESULT ", [System.StringComparison]::Ordinal) })
    if ($recordLine.Count -ne 1) {
        throw "The $Role smoke run returned $($recordLine.Count) SMOKE_RESULT records; expected exactly one."
    }

    try {
        $record = $recordLine[0].Substring("SMOKE_RESULT ".Length) | ConvertFrom-Json
    }
    catch {
        throw "The $Role smoke run returned malformed JSON: $($recordLine[0])"
    }

    if ($exitCode -ne 0 -or $record.ok -ne $true) {
        throw "The $Role smoke run failed during '$($record.phase)': $($record.detail)"
    }
    if ($record.processedBlocks -ne 12) {
        throw "The $Role smoke run processed $($record.processedBlocks) blocks; expected 12."
    }

    $reportedInstrument = $record.instrument -eq $true
    if (($Role -eq "instrument") -ne $reportedInstrument) {
        $actual = if ($reportedInstrument) { "instrument" } else { "effect" }
        throw "The module supplied for the $Role check selected an $actual class ('$($record.plugin)'). Use the optional exact class selector when the bundle exposes multiple classes."
    }

    return $record
}

$instrumentModule = Resolve-Vst3Module -Path $InstrumentVst3 -Role "Instrument"
$effectModule = Resolve-Vst3Module -Path $EffectVst3 -Role "Effect"
$smokeExecutable = Resolve-SmokeBinary -FileName "CEditorPluginWorkerRealVstSmoke.exe"
$scannerExecutable = Resolve-SmokeBinary -FileName "CEditorPluginScanner.exe"
$workerExecutable = Resolve-SmokeBinary -FileName "CEditorPluginWorker.exe"

$instrumentResult = Invoke-SmokeRole -Role "instrument" -ModulePath $instrumentModule `
    -ClassSelector $InstrumentClass
$effectResult = Invoke-SmokeRole -Role "effect" -ModulePath $effectModule `
    -ClassSelector $EffectClass

$summary = [ordered]@{
    ok = $true
    configuration = $Configuration
    scanner = $scannerExecutable
    worker = $workerExecutable
    instrument = $instrumentResult
    effect = $effectResult
}

Write-Host ""
Write-Host "PASS  representative real VST3 instrument and effect completed in isolated workers"
Write-Output ("REAL_VST_ACCEPTANCE " + ($summary | ConvertTo-Json -Depth 8 -Compress))
