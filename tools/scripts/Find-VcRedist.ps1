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
