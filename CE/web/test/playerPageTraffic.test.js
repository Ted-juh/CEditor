// playerPageTraffic.test.js — what the plug-in sends its page, and how the page rests when unseen.
//
// Release checks #17 watched the player's pages from inside (tools/scripts/watch-webview-pages.mjs)
// and found two things no test here could: each window was pushed the device service's whole MIDI
// monitor log, up to 120 KB, with every MIDI message, for a page that shows no monitor; and a
// minimised plug-in window's page went on drawing at sixty frames a second, because a plug-in's
// window is a child of the host's and Windows tells a child nothing when the host is minimised.
// The first is fixed in PlayerHost.cpp. The second was first fixed by hiding the webview, which
// broke more than it saved (below); now the page is told, and stops only its redrawing. All of it
// lives where WebView2 is needed to run it, so this reads the source, the way
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
const PREVIEW = readFileSync(join(REPO, 'CE/web/src/CE_Application/editor/PanelPreviewSurface.svelte'), 'utf8');

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

test('nothing hides the webview to save work while the window is open', () => {
  // Tried and taken out (release checks #18 measured it, a review found what it cost). Hidden, the
  // webview component drops every event emitEventIfBrowserIsVisible would send (paramSync,
  // hostTransport, MIDI in), while the editor's timer records each as pushed; and a hidden page
  // asks for no frames and runs its timers once a second, while the window-open page is what drives
  // free-running modulators, panel scripts' timers and automation out to the hardware (the
  // processor takes those over only when the editor is closed).
  assert.ok(!/webView->setVisible\s*\(/.test(HOST_CPP), 'PlayerHost hides the webview again; see above for what that stops');
  assert.ok(HOST_CPP.includes('.withKeepPageLoadedWhenBrowserIsHidden()'), 'a page hidden by its host would be unloaded');
});

test('a minimised or hidden host window is told to the page, on Windows', () => {
  assert.match(HOST_H, /class PlayerHost : public juce::Component,\s*private juce::Timer/);
  const tick = body(HOST_CPP, 'void PlayerHost::timerCallback()');
  for (const piece of ['GetAncestor (window, GA_ROOT)', 'IsIconic (top)', 'IsWindowVisible (window)', 'sendHostWindow();'])
    assert.ok(tick.includes(piece), `the host-window check lost ${piece}`);
  assert.ok(tick.indexOf('#if JUCE_WINDOWS') < tick.indexOf('GetAncestor'), 'the check is Windows-only');
  assert.ok(body(HOST_CPP, 'void PlayerHost::sendHostWindow()').includes('emitToWebView ("hostWindow"'));
  const started = HOST_CPP.indexOf('startTimerHz (4);');
  assert.ok(started > HOST_CPP.indexOf('addAndMakeVisible (*webView);'), 'the check starts before there is a webview');
  assert.ok(HOST_CPP.lastIndexOf('#if JUCE_WINDOWS', started) > HOST_CPP.indexOf('addAndMakeVisible (*webView);'), 'the check starts off Windows too');
  // A page loaded while the host is already minimised is told when its panel is in.
  assert.ok(/requestParamSync[\s\S]{0,300}if \(! hostWindowShown\) sendHostWindow\(\);/.test(HOST_CPP), 'a page loaded behind a minimised host is never told');
  // The page keeps it, and puts it back when its listeners go.
  assert.ok(PLAYER.includes("backend.addEventListener('hostWindow', (payload) => hostWindowShown.set(payload?.shown !== false))"));
  assert.ok(PLAYER.includes('hostWindowShown.set(true);'), 'a page torn down while minimised stays minimised for the next');
});

test('unseen, the preview stops redrawing and its tickers carry on', () => {
  // The shared frame moves the clock and the steps shown, which is what redraws the running
  // controls; only that waits while the host is minimised. What the tickers send (values to bound
  // targets, MIDI, notes, script events) is sent from the ticker loops, which must not look.
  assert.match(PREVIEW, /sharedAnimationFrame\(\(\) => \{ if \(hostShown\) \{ orbitClock = Date\.now\(\); noteShownSteps\(\); \} \}\)/);
  assert.match(PREVIEW, /if \(hostShown && !wasShown\) \{ orbitClock = Date\.now\(\); noteShownSteps\(\); \}/, 'shown again, nothing redraws until it moves');
  for (const ticker of ['ensureOrbitTicker', 'ensureLooperTicker', 'ensureTuringTicker', 'ensureKineticTicker', 'ensureConstTicker', 'ensureArpTicker', 'ensureRecorderTicker', 'ensurePhraseTicker']) {
    const start = PREVIEW.indexOf(`function ${ticker}()`);
    assert.ok(start > -1, `${ticker} is gone`);
    const loop = PREVIEW.slice(start, PREVIEW.indexOf('\n  }\n', start));
    assert.ok(!loop.includes('hostShown'), `${ticker} waits for the host window; what it sends must not`);
  }
});
