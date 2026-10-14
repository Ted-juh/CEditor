// scriptLimitParity.test.js — one call into a script may run as long in the editor as in the plug-in.
//
// The panel's JavaScript runs in two places: the WebView (the editor's preview, and the plug-in with
// its window open), bounded by scripting/boundedJavascript.js, and the plug-in's own engine with its
// window closed (CE/src/Scripting/JsScriptEngine.cpp). They had different time limits, 250 ms and
// 2 seconds, so a panel could work with the window closed and be stopped with it open. GAIA's
// preset-name script came within a few tens of milliseconds of that on a fast machine.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readText } from './support/readText.mjs';
import { SCRIPT_LIMITS } from '../src/CE_Application/scripting/boundedJavascript.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

test('a call into a script has the same time in the WebView as in the plug-in', () => {
  const cpp = readText(path.join(REPO, 'CE/src/Scripting/JsScriptEngine.cpp'));
  const match = /maximumExecutionTime\s*=\s*juce::RelativeTime::seconds\s*\(\s*([\d.]+)\s*\)/.exec(cpp);
  assert.ok(match, 'JsScriptEngine.cpp sets the engine\'s maximumExecutionTime');
  assert.equal(SCRIPT_LIMITS.milliseconds, Number(match[1]) * 1000);
});
