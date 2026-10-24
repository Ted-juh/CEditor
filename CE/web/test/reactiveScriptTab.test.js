import test from 'node:test';
import assert from 'node:assert/strict';
import {get} from 'svelte/store';
import {scriptApiForTesting,resetScriptStateForTesting,setRuntimeHost,runReactiveForTesting} from '../src/CE_Application/scripting/panelRuntime.js';
import {panels,activePanelId,activeEditorTab,resolvedActivePanelId} from '../src/CE_Application/stores/panels.js';
import {scriptDocuments} from '../src/CE_Application/stores/scriptWorkspace.js';
import {createControl} from '../src/CE_Application/models/componentTypes.js';
import {scriptTrace,clearScriptTrace} from '../src/CE_Application/stores/scriptConsole.js';

test('computed authored properties settle on the script-bound panel while a script tab is selected',()=>{
 resetScriptStateForTesting(); setRuntimeHost(null);
 const control=createControl('Slider',{name:'release_slider'});
 panels.set([{id:'slider-panel',name:'Slider',controls:[control]}]);
 activePanelId.set('slider-panel');
 scriptDocuments.set([{id:'script-tab',panelId:'slider-panel'}]);
 activeEditorTab.set({type:'script',id:'script-tab'});
 clearScriptTrace();
 try {
  assert.equal(get(resolvedActivePanelId),null);
  const api=scriptApiForTesting('','compute-regression');
  api.compute('release_slider.Core.tooltip',()=> 'Value '+api.get('release_slider.value'));
  api.set('release_slider.value',3);
  runReactiveForTesting();
  assert.equal(api.get('release_slider.Core.tooltip'),'Value 3');
  api.set('release_slider.value',7);
  runReactiveForTesting();
  assert.equal(api.get('release_slider.Core.tooltip'),'Value 7');
  assert.equal(get(scriptTrace).filter(t=>t.kind==='error').length,0);
 } finally {
  resetScriptStateForTesting(); activeEditorTab.set({type:'panel',id:null});
  scriptDocuments.set([]); panels.set([]); activePanelId.set(null);
 }
});
