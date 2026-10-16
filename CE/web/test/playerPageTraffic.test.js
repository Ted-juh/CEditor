// playerPageTraffic.test.js — what the plug-in sends its page, and what it must not do to save work.
//
// Release checks #17 watched the player's pages from inside (tools/scripts/watch-webview-pages.mjs)
// and found two things no test here could: each window was pushed the device service's whole MIDI
// monitor log, up to 120 KB, with every MIDI message, for a page that shows no monitor; and a
// minimised plug-in window's page went on drawing at sixty frames a second, because a plug-in's
// window is a child of the host's and Windows tells a child nothing when the host is minimised.
// The first is fixed in PlayerHost.cpp. The second is not, and the way it was first fixed (hiding the
// webview while the host's window is minimised) is guarded against below, for what it broke. Both
// live where WebView2 is needed to run them, so this reads the source, the way
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

test('nothing hides the webview to save work while the window is open', () => {
  // Tried and taken out (release checks #18 measured it, a review found what it cost). Hidden, the
  // webview component drops every event emitEventIfBrowserIsVisible would send (paramSync,
  // hostTransport, MIDI in), while the editor's timer records each as pushed; and a hidden page
  // asks for no frames and runs its timers once a second, while the window-open page is what drives
  // free-running modulators, panel scripts' timers and automation out to the hardware (the
  // processor takes those over only when the editor is closed). A page that should rest while the
  // host is minimised needs those duties handed over first.
  assert.ok(!/webView->setVisible\s*\(/.test(HOST_CPP), 'PlayerHost hides the webview again; see above for what that stops');
  assert.ok(!HOST_CPP.includes('IsIconic'), 'PlayerHost acts on the host window being minimised again; see above');
  assert.match(HOST_H, /class PlayerHost : public juce::Component\s*\{/);
  assert.ok(HOST_CPP.includes('.withKeepPageLoadedWhenBrowserIsHidden()'), 'a page hidden by its host would be unloaded');
});
