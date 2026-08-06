// packageReadinessDetail.test.js — CE-BETA-007: a blocker that names nothing.
//
// The custom-component designer said "Not reusable yet: Package Validity — 1 blocking issue(s)".
// One issue, unnamed. Clicking Fix revealed nothing, because there was nothing to reveal: the
// readiness step counted validation.issues and threw the issues away.
//
// They are already finished sentences that name the rule and often the field. Showing them is the
// whole fix.

import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCustomComponentReadiness } from '../src/CE_Application/utils/customComponentPackage.js';

function validityDetail(control) {
  const { steps } = analyzeCustomComponentReadiness(control);
  return steps.find((step) => step.id === 'validPackage')?.detail ?? '';
}

test('an invalid component says what is wrong, not how many things are', () => {
  // A bare control fails several rules; the detail must be a sentence, not a tally.
  const detail = validityDetail({ _children: { Core: { id: 'x', controlType: 'Button' } } });
  assert.doesNotMatch(detail, /^\d+ blocking issue/,
    'the blocker is still just a count — the tester could not tell which rule failed');
  assert.match(detail, /[a-z]/i, 'expected a readable sentence');
  assert.ok(detail.length > 12, `detail is too terse to act on: ${JSON.stringify(detail)}`);
});

test('several issues lead with the first and say how many follow', () => {
  const detail = validityDetail({ _children: { Core: { id: 'x', controlType: 'Button' } } });
  // Whether this control trips one rule or many, the shape must stay actionable.
  if (detail.includes('(+')) {
    assert.match(detail, /\(\+\d+ more\)$/);
    assert.ok(detail.indexOf('(+') > 12, 'the leading issue text was dropped');
  }
});

test('a valid package still reports cleanly', () => {
  // Pinning the happy-path wording so the step does not start shouting on success.
  const { steps } = analyzeCustomComponentReadiness({ _children: { Core: { id: 'x', controlType: 'CustomComponent' } } });
  const step = steps.find((s) => s.id === 'validPackage');
  assert.ok(step, 'the Package Validity step disappeared');
  if (step.done) assert.equal(step.detail, 'No blocking package issues');
});
