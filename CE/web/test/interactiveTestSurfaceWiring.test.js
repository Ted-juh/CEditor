import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
  resolve(here, '..', 'src', 'CE_Application', 'components', 'InteractiveTestSurface.svelte'),
  'utf8',
);

function functionBody(name, next = '\n  function ') {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = source.indexOf(next, start + 10);
  return source.slice(start, end < 0 ? source.length : end);
}

test('the standalone preview exposes state and enables CanvasControl value editing', () => {
  assert.match(source, /aria-checked=\{previewAriaChecked\}/);
  assert.match(source, /aria-controls=\{isComboboxControl \? comboboxListboxId/);
  assert.match(source, /aria-activedescendant=\{isComboboxControl && comboboxOpen/);
  assert.match(source, /previewTabIndex=\{-1\}/);
  assert.match(source, /readOnly: isReadOnly \|\| behavior\?\.keyboardEnabled === false/);
});

test('typed numeric values remain buffered until one explicit commit', () => {
  const input = functionBody('handleRangeFieldInput');
  assert.match(input, /valueInputBuffer: rawValue/);
  assert.doesNotMatch(input, /ValueOverride|valueOverride/);

  const keydown = functionBody('handleRangeFieldKeyDown');
  assert.match(keydown, /commitRangeFieldInput\(event\?\.currentTarget\?\.value\)/);
  assert.match(keydown, /suppressNextRangeFieldBlurCommit = true/);

  const blur = functionBody('handleRangeFieldBlur');
  assert.match(blur, /if \(!suppressNextRangeFieldBlurCommit\)/);

  const hitbox = functionBody('handleRangeTextInput');
  const sliderTyping = hitbox.slice(hitbox.indexOf('let nextBuffer'), hitbox.indexOf('return true;', hitbox.indexOf('let nextBuffer')));
  assert.doesNotMatch(sliderTyping, /ValueOverride|valueOverride/,
    'slider hitbox typing must not write a device-bound value before Enter');
  const rangeTypingStart = hitbox.lastIndexOf('let nextBuffer');
  const rangeTyping = hitbox.slice(rangeTypingStart, hitbox.indexOf('return true;', rangeTypingStart));
  assert.doesNotMatch(rangeTyping, /ValueOverride|valueOverride/,
    'range hitbox typing must stay reversible until Enter');
});

test('keyboard releases require an owned press and read-only controls stay inert', () => {
  const keydown = functionBody('handleKeyDown');
  assert.match(keydown, /event\.target !== event\.currentTarget/);
  assert.match(keydown, /keyboardActivationKey = event\.key/);

  const keyup = functionBody('handleKeyUp', '\n</script>');
  assert.match(keyup, /isReadOnly \|\| isDisabled/);
  assert.match(keyup, /event\.key !== keyboardActivationKey/);
  assert.match(keyup, /keyboardActivationKey = ''/);
});

test('radio gaps do not select a fallback and combobox layout reserves popup space', () => {
  const commit = functionBody('commitSelectAction');
  assert.match(commit, /nextValue !== undefined && String\(nextValue \?\? ''\)\.trim\(\) === ''/);
  assert.match(source, /usableHeight \/ previewLayoutHeight/);
  assert.match(source, /comboboxMenuHeight \+ 4/);
  const keyup = functionBody('handleKeyUp', '\n</script>');
  assert.match(keyup, /currentRadioValue\(\)/,
    'Space/Enter on a radio group must keep its current row instead of falling back to the default');
});

test('button controllers emit only real activation edges and clean up clocks', () => {
  const binding = functionBody('bindingValueForPatch');
  assert.match(binding, /resolvePreviewTriggerBindingValue/);

  const release = functionBody('releaseTriggerPatch');
  assert.match(release, /shouldPulseTriggerOnRelease/);
  assert.match(source, /momentaryButtonPreview\.destroy\(\)/);
  assert.match(source, /for \(const timer of oneShotTimers\.values\(\)\) clearTimeout\(timer\)/);
});
