import test from 'node:test';
import assert from 'node:assert/strict';
import { parameterFeedback, parameterGroup, parameterAccent } from '../src/CE_Application/utils/parameterStatus.js';

const binding={deviceRole:'GAIA',parameterId:'cutoff'};
const feedback=(received,writes)=>({GAIA:{received:{cutoff:received},writes:{cutoff:writes}}});
test('parameter confirmation requires matching feedback newer than the latest write',()=>{
  assert.equal(parameterFeedback(binding,64).text,'NOT READ FROM SYNTH');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1})).text,'HARDWARE CONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1},{value:64,sequence:2,state:'unverified'})).text,'LOCAL / UNCONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:3},{value:64,sequence:2,state:'unverified'})).text,'HARDWARE CONFIRMED');
  assert.equal(parameterFeedback(binding,65,feedback({value:64,sequence:3})).text,'LOCAL / UNCONFIRMED');
  assert.equal(parameterFeedback(binding,64,feedback({value:64,sequence:1},{sequence:2,state:'error',error:'Failed'})).text,'SEND ERROR');
  assert.equal(parameterFeedback(binding,false,feedback({value:'off',sequence:1})).text,'HARDWARE CONFIRMED');
});
test('context and colours distinguish tones while grouping related controls',()=>{
  assert.equal(parameterGroup('tone2.filter.envAttackTime'),'tone2.filter');
  assert.equal(parameterGroup('system.masterTune'),'system');
  assert.equal(new Set([1,2,3].map(t=>parameterAccent(`tone${t}.filter.cutoff`))).size,3);
});
