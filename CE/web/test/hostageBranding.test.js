import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (relative) => fs.readFileSync(new URL(relative, import.meta.url), 'utf8');
const view = read('../src/CE_Application/sections/InstrumentHostView.svelte');
const logo = read('../src/CE_Application/components/HostageLogo.svelte');
const cmake = read('../../../CMakeLists.txt');
const ctrl49Page = read('../../../tools/ctrl49/Hostage_MultiKnob.lua');

test('the Hostage header separates identity, mode, transport and emergency action', () => {
  assert.match(view, /import HostageLogo from '\.\.\/components\/HostageLogo\.svelte'/);
  assert.match(view, /class="host-brand"[\s\S]*<HostageLogo \/>/);
  assert.match(logo, /<svg[\s\S]*viewBox="0 0 348 72"[\s\S]*role="img"/);
  assert.match(logo, /wordmark-outline">HO<\/tspan><tspan class="wordmark-accent">ST<\/tspan>/,
    'the small header mark must preserve the outlined letters and filled orange ST');
  assert.doesNotMatch(view, /\.host-logo\s*\{/,
    'the header must not resize and negatively position the old padded raster');
  assert.match(view, /PLUG-IN HOST · LIVE STAGE/);
  assert.match(view, /class="host-mode"[\s\S]*class="host-command-area"/);
  assert.match(view, /class="host-transport-group"[\s\S]*data-testid="host-transport"/);
  assert.match(view, /class="host-global-actions"[\s\S]*class="panic"/);
  assert.match(view, /@media \(max-width: 1120px\)[\s\S]*grid-column: 1 \/ -1/,
    'the command area must wrap as a unit instead of crushing the transport');
});

test('plug-in scanning moved from global chrome into the Library utility', () => {
  const headerEnd = view.indexOf('</header>');
  const scan = view.indexOf('data-testid="host-scan"');
  const library = view.indexOf("activeUtility === 'library'");
  assert.ok(headerEnd >= 0 && library > headerEnd && scan > library);
  assert.match(view, /data-testid="host-scan"[\s\S]{0,160}Scan plug-ins/);
});

test('Hostage is the visible workspace and runtime name', () => {
  assert.match(read('../src/CE_Application/stores/panels.js'), /name: 'Hostage'/);
  assert.match(read('../src/CE_Application/editor/TabBar.svelte'), /instrumentHost: 'Hostage'/);
  assert.match(read('../src/CE_Application/layout/MenuBar.svelte'), /label: 'Hostage\.\.\.'/);
  assert.match(read('../host.html'), /<title>Hostage<\/title>/);
});

test('the CTRL49 shows the Hostage logo during its real startup dwell', () => {
  assert.match(ctrl49Page, /LOGO_PNG_ID\s*=\s*0x0210/);
  assert.match(ctrl49Page, /function set_mode\(args\)[\s\S]*mode = get_byte\(args, 0\)/);
  assert.match(ctrl49Page, /if mode == 0 then[\s\S]*draw_splash\(\)[\s\S]*return/);
  assert.match(read('../../../CE/src/InstrumentHost/HostRuntimeShell.cpp'),
    /kHostagePageLua[\s\S]*kHostageLogoPng/);
  assert.match(read('../../../CE/src/ValueTreeBridgeHandlers.cpp'),
    /kHostagePageLua[\s\S]*kHostageLogoPng/);
  assert.match(cmake, /Hostage_MultiKnob\.lua[\s\S]*hostage_logo\.png/,
    'both controller assets must regenerate the embedded source when changed');
});

test('the binary rename migrates the old default without changing identity', () => {
  assert.match(cmake, /set\(CE_HOST_PRODUCT_NAME\s+"Hostage"\s+CACHE STRING/);
  assert.match(cmake, /CE_HOST_PRODUCT_NAME STREQUAL "CE Instrument Host"[\s\S]*FORCE/,
    'an existing build tree must migrate the legacy cached default');
  assert.match(cmake, /juce_add_gui_app\(CEHostStandalone/);
  assert.match(cmake, /juce_add_plugin\(CEHostVST3/);
  assert.match(cmake, /set\(CE_HOST_PLUGIN_CODE\s+"CehR"/,
    'renaming a VST3 must not give existing DAW projects a new plug-in identity');
  assert.match(read('../../../CE/src/InstrumentHost/HostRuntimeMain.cpp'),
    /CEHOST_PRODUCT_NAME "Hostage"/);
  assert.match(read('../../../CE/src/InstrumentHost/HostPluginProcessor.cpp'),
    /return "Hostage";/);
  assert.match(read('../../../tools/installer/HostProductTemplate.iss'),
    /MyAppExeName "Hostage\.exe"[\s\S]*MyVst3BundleName "Hostage\.vst3"/);
});

test('renaming leaves existing Hostage data and installer identities recoverable', () => {
  const shell = read('../../../CE/src/InstrumentHost/HostRuntimeShell.cpp');
  assert.match(shell, /getChildFile \("CEditorInstrumentHost"\)/,
    'changing the data directory would hide existing sessions and scan catalogues');
  const service = read('../../../CE/src/InstrumentHost/InstrumentHostService.cpp');
  assert.match(service, /the appId never does/);
  assert.match(service, /juce::Uuid\(\)\.toDashedString\(\)/);
});
