// playerPageTraffic.test.js — what the plug-in sends its page, and when the page may rest.
//
// Release checks #17 watched the player's pages from inside (tools/scripts/watch-webview-pages.mjs)
// and found two things no test here could: each window was pushed the device service's whole MIDI
// monitor log, up to 120 KB, with every MIDI message, for a page that shows no monitor; and a
// minimised plug-in window's page went on drawing at sixty frames a second, because a plug-in's
// window is a child of the host's and Windows tells a child nothing when the host is minimised.
// Both live in PlayerHost.cpp, which needs WebView2 to run, so this reads the source, the way
// playerRestorePush.test.js does.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const HOST_H = readFileSync(join(REPO, 'CE/src/Player/PlayerHost.h'), 'utf8');
const HOST_CPP = readFileSync(join(REPO, 'CE/src/Player/PlayerHost.cpp'), 'utf8');
const PLAYER = readFileSync(join(REPO, 'CE/web/src/Player.svelte'), 'utf8');

const body = (source, signature) => {
  const start = source.indexOf(signature);
  assert.ok(start > -1, `${signature} is gone`);
  return source.slice(start, source.indexOf('\n}\n', start));
};

test('the player page is not sent the MIDI monitor log', () => {
  // Every device event reaches the page through emitToWebView, the service's own and the replies to
  // the page's requests alike, so that is where the log stops.
  const emit = body(HOST_CPP, 'void PlayerHost::emitToWebView');
  const dropped = emit.indexOf('if (eventName == "midiMonitorEvents")');
  assert.ok(dropped > -1, 'midiMonitorEvents reaches the player page again');
  assert.ok(dropped < emit.indexOf('emitEventIfBrowserIsVisible'), 'dropped after it was sent');
  // ...which is right only while nothing on the player's page reads it. A Player that shows a MIDI
  // monitor has to ask for the log in some smaller form, not take this back.
  for (const reader of ['midiMonitorEvents', 'MidiMonitorTab', 'ParameterBrowserTab'])
    assert.ok(!PLAYER.includes(reader), `Player.svelte now uses ${reader}; the log it needs is dropped in PlayerHost::emitToWebView`);
});

test('a hidden or minimised host window hides the webview, on Windows', () => {
  assert.match(HOST_H, /class PlayerHost : public juce::Component,\s*private juce::Timer/);
  const tick = body(HOST_CPP, 'void PlayerHost::timerCallback()');
  for (const piece of ['GetAncestor (window, GA_ROOT)', 'IsIconic (top)', 'IsWindowVisible (window)', 'webView->setVisible (! hidden)'])
    assert.ok(tick.includes(piece), `the host-window check lost ${piece}`);
  assert.ok(tick.indexOf('#if JUCE_WINDOWS') < tick.indexOf('GetAncestor'), 'the check is Windows-only');
  // Started where the webview is made, on Windows only; and the page must survive being hidden,
  // which is what keeping it loaded is for.
  const started = HOST_CPP.indexOf('startTimerHz (4);');
  assert.ok(started > HOST_CPP.indexOf('addAndMakeVisible (*webView);'), 'the check starts before there is a webview to hide');
  assert.ok(HOST_CPP.lastIndexOf('#if JUCE_WINDOWS', started) > HOST_CPP.indexOf('addAndMakeVisible (*webView);'), 'the check starts off Windows too');
  assert.ok(HOST_CPP.includes('.withKeepPageLoadedWhenBrowserIsHidden()'), 'hiding the webview would unload the page');
});
