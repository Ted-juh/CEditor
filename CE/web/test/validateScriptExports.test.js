import test from 'node:test';
import assert from 'node:assert/strict';

import { compareRuns, targetFrameworkFor, validateScriptExportToolchains } from '../scripts/validate-script-exports.mjs';

// One preview problem stopped the whole run: previewRecords threw out of compareRuns, nothing caught it,
// the summary was never printed and the result for every other language was lost. It is a fail for the
// language it belongs to now, and a validator that throws for any other reason is a fail for its own.
test('a preview problem fails its language, and does not stop the run', async () => {
  const rejected = 'void onValueChanged(CeContext ctx, CeEvent e) {\n  double x = ctx.get("a");\n}';
  const mismatch = compareRuns('java', { canonical: [], core: [] }, { canonical: rejected, core: rejected });
  assert.match(mismatch, /^canonical: preview: .*javac rejects/);

  const summary = await validateScriptExportToolchains([
    async function validateBrokenThing() { throw new Error('boom'); },
    async function validateFine() { return { target: 'fine', status: 'pass', detail: 'ok' }; },
  ]);
  assert.deepEqual(summary.results.map((r) => [r.target, r.status]), [['broken-thing', 'fail'], ['fine', 'pass']]);
  assert.match(summary.results[0].detail, /boom/);
  assert.equal(summary.failed.length, 1);
});

// The C# check built for net8.0 whatever was installed, so a machine with only a newer SDK failed it
// (net8.0 needs its targeting pack fetched and a .NET 8 runtime to run). It follows verify-csharp.mjs:
// the generator's own net10.0 when that SDK is here, otherwise the newest SDK that is.
test('the C# check targets an SDK that is installed', () => {
  assert.equal(targetFrameworkFor('8.0.404 [/usr/share/dotnet/sdk]\n'), 'net8.0');
  assert.equal(targetFrameworkFor('9.0.100 [/sdk]\n'), 'net9.0');
  assert.equal(targetFrameworkFor('8.0.1 [/sdk]\n9.0.100 [/sdk]\n'), 'net9.0');
  assert.equal(targetFrameworkFor('8.0.1 [/sdk]\n10.0.100 [/sdk]\n11.0.100-preview.1 [/sdk]\n'), 'net10.0');
});
