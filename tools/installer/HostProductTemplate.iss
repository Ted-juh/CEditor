; HostProductTemplate.iss — the generated Hostage product's installer.
;
; One template for every Host Project: tools/scripts/build-host-product.mjs stages the built
; targets and compiles this with /D switches carrying the project's manifest. Every define is
; #ifndef-guarded (the CEditor.iss convention) so the template also compiles by hand with
; defaults, which is how you debug it without the pipeline in the way.
;
; The AppId comes from the manifest and NOWHERE else. It is minted once per project and pinned;
; Inno treats a changed AppId as a different product, so this is the line between "an upgrade"
; and "two half-installed rack products fighting over shortcuts".

#ifndef MyAppName
  #define MyAppName "Hostage"
#endif
#ifndef MyAppVersion
  #define MyAppVersion "0.1.0"
#endif
#ifndef MyAppPublisher
  #define MyAppPublisher ""
#endif
#ifndef MyAppId
  #define MyAppId "6D2C4E86-0000-4000-8000-000000000000"
#endif
#ifndef MyAppExeName
  #define MyAppExeName "Hostage.exe"
#endif
#ifndef MyVst3BundleName
  #define MyVst3BundleName "Hostage.vst3"
#endif
#ifndef MySetupBase
  #define MySetupBase "Hostage"
#endif
#ifndef MySourceDir
  #define MySourceDir "..\\..\\build\\host-product\\stage"
#endif
#ifndef MyOutputDir
  #define MyOutputDir "..\\..\\build\\host-product\\installer"
#endif
; String flags, deliberately: ISCC /D passes strings, and mixing a string /D with an integer
; #ifndef default would make the comparisons below type-dependent on how the build was invoked.
#ifndef IncludeStandalone
  #define IncludeStandalone "1"
#endif
#ifndef IncludeVst3
  #define IncludeVst3 "1"
#endif

[Setup]
AppId={{{#MyAppId}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
#if MyAppPublisher != ""
AppPublisher={#MyAppPublisher}
#endif
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
#if IncludeStandalone == "1"
UninstallDisplayIcon={app}\{#MyAppExeName}
#endif
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
Compression=lzma2
SolidCompression=yes
DisableProgramGroupPage=yes
OutputDir={#MyOutputDir}
OutputBaseFilename={#MySetupBase}-Setup-{#MyAppVersion}
PrivilegesRequired=admin
WizardStyle=modern

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

#if IncludeStandalone == "1"
[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
#endif

[Files]
#if IncludeStandalone == "1"
; The standalone and both workers, side by side — the runtime looks for them there first.
Source: "{#MySourceDir}\Standalone\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif
#if IncludeVst3 == "1"
; The VST3 bundle is a directory; both workers were staged inside it next to the module,
; which is "beside the binary" from the plug-in's point of view.
Source: "{#MySourceDir}\VST3\{#MyVst3BundleName}\*"; DestDir: "{commoncf64}\VST3\{#MyVst3BundleName}"; Flags: ignoreversion recursesubdirs createallsubdirs
#endif

#if IncludeStandalone == "1"
[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
#endif
