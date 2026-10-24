import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('existing Dexie records survive SES lockdown and native transactions commit', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import Dexie from 'dexie';
    import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
    import 'ses';
    import { readRecord, writeRecord, removeRecord, resetBrowserDatabaseForTests } from './src/CE_Application/utils/browserDatabase.js';
    globalThis.indexedDB = new IDBFactory();
    globalThis.IDBKeyRange = IDBKeyRange;
    const old = new Dexie('ceditor', { indexedDB, IDBKeyRange });
    old.version(1).stores({ records: 'key' });
    await old.table('records').put({ key: 'legacy', value: { text: 'before sandbox' } });
    old.close();
    lockdown({ errorTaming: 'unsafe', consoleTaming: 'unsafe' });
    assert.equal(Object.isFrozen(Promise), true);
    assert.deepEqual(await readRecord('legacy'), { text: 'before sandbox' });
    assert.equal(await writeRecord('unsavedSession', { text: 'Café 日本語', large: 'x'.repeat(200000) }), true);
    assert.equal((await readRecord('unsavedSession')).large.length, 200000);
    const proxy = new Proxy({ text: 'clone fallback' }, {});
    assert.equal(await writeRecord('proxy', proxy), true);
    assert.deepEqual(await readRecord('proxy'), { text: 'clone fallback' });
    assert.equal(await writeRecord('unsavedSession', { text: '' }), true);
    assert.deepEqual(await readRecord('unsavedSession'), { text: '' });
    await removeRecord('legacy');
    assert.equal(await readRecord('legacy', 'missing'), 'missing');
    assert.equal(await writeRecord('invalid', () => {}), false);
    assert.deepEqual(await readRecord('unsavedSession'), { text: '' });
    await resetBrowserDatabaseForTests();
  `], { cwd: process.cwd(), encoding: 'utf8', timeout: 15000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
