import test from 'node:test';
import assert from 'node:assert/strict';
import { scriptApiForTesting, setRuntimeHost, resetScriptStateForTesting } from '../src/CE_Application/scripting/panelRuntime.js';

test('preset event delivery with an active unrelated script does not break subsequent events', () => {
  resetScriptStateForTesting();
  setRuntimeHost({panel:{id:'recall-regression', controls:[]}, scripts:[{id:'logger',event:'onPanelReady',enabled:true}]});
  try {
    const api=scriptApiForTesting();
    const received=[];
    api.on('*','onPresetChange',data=>received.push(data.program));
    assert.doesNotThrow(()=>api.emit('onPresetChange',{program:1}));
    assert.doesNotThrow(()=>api.emit('onPresetChange',{program:8}));
    assert.deepEqual(received,[1,8]);
  } finally {setRuntimeHost(null);resetScriptStateForTesting();}
});

