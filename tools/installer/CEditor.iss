#define MyAppName "CEditor"
#define MyAppPublisher "Tedjuh-inc"
#define MyAppExeName "CEditor.exe"

#ifndef MyAppVersion
  #define MyAppVersion "0.2.0"
#endif

#ifndef MySourceDir
  #define MySourceDir "..\\..\\build\\package\\stage\\CEditor"
#endif

#ifndef MyOutputDir
  #define MyOutputDir "..\\..\\build\\package\\installer"
#endif

[Setup]
AppId={{A596A8F4-643D-48E0-9E17-E0A9EADAF3CB}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
UninstallDisplayIcon={app}\{#MyAppExeName}
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename=CEditor-Setup-{#MyAppVersion}
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

; Scripting-language options. Lua / JavaScript / TypeScript are built in (no toolchain). The components
; below pull in the optional language toolchains; they can also be installed later from the app
; (Settings -> Scripting Toolchains) or fetched automatically on first export of a panel that uses them.
; NOTE: a full VST3 export needs the C++ build environment (source + CMake + a compiler); these
; components install the per-language toolchains for that build, they do not by themselves make a
; GUI-only install able to export. See tools/docs/windows-installer.md.
[Types]
Name: "standard"; Description: "Standard (Lua, JavaScript, TypeScript)"
Name: "full";     Description: "Full (adds Python, C++, C#, Java scripting)"
Name: "custom";   Description: "Custom"; Flags: iscustom

[Components]
Name: "python"; Description: "Python scripting (embedded CPython, ~11 MB)"; Types: full custom
Name: "cpp";    Description: "C++ scripting (LLVM/Clang build toolchain)";   Types: full custom
Name: "csharp"; Description: "C# scripting (.NET runtime, ~230 MB download)"; Types: full custom
Name: "java";   Description: "Java scripting (JDK + jlink JRE, ~195 MB download)"; Types: full custom

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "{#MySourceDir}\CEditor.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "{#MySourceDir}\web\dist\*"; DestDir: "{app}\web\dist"; Flags: ignoreversion recursesubdirs createallsubdirs
; The export pipeline + toolchain provisioning scripts, AND a bundled Node runtime (tools\node\node.exe)
; so toolchain provisioning/management works with no system Node. Toolchain BINARIES are downloaded on
; demand, never bundled. Staged by tools/scripts/package-installer.ps1. skipifsourcedoesntexist keeps the
; editor-only installer valid if the pipeline wasn't staged.
Source: "{#MySourceDir}\tools\*"; DestDir: "{app}\tools"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
; Prebuilt player templates (one per format). These are what let the installed app export a plugin
; with no compiler: the exporter copies one and writes the panel inside it, and the plugin derives
; its identity from that panel at load. Without them the app still designs panels and says so when
; someone presses Export. skipifsourcedoesntexist so an editor-only installer stays valid.
Source: "{#MySourceDir}\templates\*"; DestDir: "{app}\templates"; Flags: ignoreversion recursesubdirs createallsubdirs skipifsourcedoesntexist
Source: "{#MySourceDir}\vc_redist.x64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall ignoreversion skipifsourcedoesntexist
Source: "{#MySourceDir}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; DestDir: "{tmp}"; Flags: deleteafterinstall ignoreversion skipifsourcedoesntexist

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{tmp}\vc_redist.x64.exe"; Parameters: "/install /quiet /norestart"; StatusMsg: "Installing Microsoft Visual C++ Runtime..."; Flags: runhidden waituntilterminated skipifdoesntexist
Filename: "{tmp}\MicrosoftEdgeWebView2RuntimeInstallerX64.exe"; Parameters: "/silent /install"; StatusMsg: "Installing Microsoft Edge WebView2 Runtime..."; Flags: runhidden waituntilterminated skipifdoesntexist
; Provision the chosen language toolchains via the bundled provision.cmd (it prefers the bundled Node in
; tools\node, falling back to a system Node, and runs provision.mjs). Best-effort: skipifdoesntexist keeps
; the install valid when the pipeline wasn't staged, and if a download fails the app still fetches the
; toolchain on demand at first export. These [Run] steps execute elevated, so they provision into
; {app}\tools\toolchains; later in-app installs go to a per-user dir (CEDITOR_TOOLCHAIN_DIR). C++/C#/Java
; all need the LLVM build toolchain (provisioned once via the cpp/csharp/java components).
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "python-embed"; StatusMsg: "Installing Python scripting runtime..."; Components: python; Flags: runhidden skipifdoesntexist
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "llvm-mingw ninja"; StatusMsg: "Installing C/C++ build toolchain..."; Components: cpp csharp java; Flags: runhidden skipifdoesntexist
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "dotnet"; StatusMsg: "Installing .NET scripting toolchain (~230 MB)..."; Components: csharp; Flags: runhidden skipifdoesntexist
Filename: "{app}\tools\toolchains\provision.cmd"; Parameters: "jdk"; StatusMsg: "Installing Java scripting toolchain (~195 MB)..."; Components: java; Flags: runhidden skipifdoesntexist
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent
