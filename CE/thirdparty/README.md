# Vendored third-party SDKs

## WebView2

**`webview2/` is what the build uses.** `CMakeLists.txt` points `WEBVIEW2_DIR` at
`CE/thirdparty/webview2/build/native` and links `WebView2LoaderStatic.lib` out of it. Nothing reads
the `.nupkg`.

**`webview2.nupkg` is kept anyway, and this file is the reason.** It is the exact NuGet package the
directory beside it was extracted from, and without it there is no record of WHICH SDK the app is
compiled against — the extracted tree carries headers and libs but not a version anybody can read at
a glance. Eight megabytes to be able to answer "which WebView2?" without guessing is a trade worth
making, and it was nearly deleted as a duplicate for exactly that reason.

| | |
| --- | --- |
| Package | `Microsoft.Web.WebView2` |
| Version | **1.0.2535.41** |
| Source | https://www.nuget.org/packages/Microsoft.Web.WebView2/1.0.2535.41 |
| SHA-256 | `c9c5518e4d7efa9079ad87bafb64f3c8e8edca0e95d34df878034b880a7af56b` |

To upgrade: download the new `.nupkg`, replace this one, delete `webview2/` and unzip the package
into it (a `.nupkg` is a zip), then update the version and hash above. The layout the build wants is
`webview2/build/native/…` — that is the package's own layout, so a plain extraction is correct.

### Not to be confused with the runtime installer

The SDK here compiles the app. It is **not** what the installer ships to an end user — that is the
WebView2 **Runtime** redistributable, `MicrosoftEdgeWebView2RuntimeInstallerX64.exe`, which
`tools/scripts/package-installer.ps1` looks for under `tools/installer/thirdparty/` and warns about
if it is missing. That file is deliberately not committed: `.gitignore` excludes `*.exe`, and it is
a prerequisite you place on the build machine. Two different artifacts, two different directories,
and mixing them up is easy enough that it is written down here.
