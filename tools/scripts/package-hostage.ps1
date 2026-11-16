Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
. (Join-Path $PSScriptRoot "Find-VcRedist.ps1")
$repo = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$package = Join-Path $repo "build\hostage-windows-package"
$prereqs = Join-Path $package "prerequisites"
$output = Join-Path $repo "build\package\installer"
$vcRedist = Find-VcRedist
if (-not $vcRedist) { throw "Install the Visual Studio x64 VC++ redistributable before packaging." }
$webView = Join-Path $repo "tools\installer\thirdparty\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"
if (-not (Test-Path -LiteralPath $webView)) { throw "Place the offline WebView2 x64 installer at $webView." }

Push-Location (Join-Path $repo "CE\web")
try {
    & npm.cmd ci
    if ($LASTEXITCODE) { throw "Installing locked web dependencies failed." }
    $tests = @(Get-ChildItem test\hostage*.test.js | ForEach-Object { $_.FullName })
    $tests += (Resolve-Path test\hostProductBuild.test.js).Path
    & node --import ./test/support/register-svelte.mjs --test @tests
    if ($LASTEXITCODE) { throw "HoSTage tests failed." }
} finally { Pop-Location }

& (Join-Path $PSScriptRoot "build-native.ps1") -HoSTageOnly
New-Item -ItemType Directory -Force -Path $prereqs | Out-Null
Copy-Item -LiteralPath $vcRedist, $webView -Destination $prereqs -Force
& node (Join-Path $PSScriptRoot "build-host-product.mjs") `
    --project (Join-Path $repo "tools\installer\hostage-windows.json") `
    --build-dir (Join-Path $repo "build\hostage-windows") --out $package `
    --prerequisites-dir $prereqs --installer-dir $output
if ($LASTEXITCODE) { throw "Compiling the HoSTage installer failed." }
