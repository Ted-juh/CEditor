import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareRestoredScriptBinding,reconnectScriptBinding} from '../src/CE_Application/scripting/scriptPanelBinding.js';
import {sanitizeScriptDocument} from '../src/CE_Application/scripting/scriptDocumentModel.js';
const panel={id:31,name:'Dropdown',panelGuid:'dropdown-guid',filePath:'C:/panels/dropdown.cepanel',scripts:[{id:'dropdown-script'}]};
const draft={id:'workspace',name:'Dropdown · Scripts',panelId:'31',scripts:[{id:'dropdown-script',source:'log("unsaved");'}],modified:true};
test('reload refuses a recycled session id then binds the same file under its new id',()=>{
 const persisted=sanitizeScriptDocument(reconnectScriptBinding(draft,[panel]));
 const restored=prepareRestoredScriptBinding(persisted);
 const wrong={...panel,id:31,name:'Range',panelGuid:'range-guid',filePath:'C:/panels/range.cepanel'};
 assert.equal(reconnectScriptBinding(restored,[wrong]).panelId,'');
 const result=reconnectScriptBinding(restored,[wrong,{...panel,id:3}]);
 assert.equal(result.panelId,'3'); assert.equal(result.modified,true); assert.deepEqual(result.scripts,persisted.scripts);
 assert.equal(reconnectScriptBinding(result,[wrong,{...panel,id:3}]),result);
});
test('unsaved panels reconnect by guid, never by matching title',()=>{
 const restored=prepareRestoredScriptBinding(reconnectScriptBinding(draft,[{...panel,filePath:''}]));
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:2,panelGuid:'other',filePath:''}]).panelId,'');
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:8,filePath:''}]).panelId,'8');
});
test('legacy migration requires title and script identity; ambiguous matches stay detached',()=>{
 const restored=prepareRestoredScriptBinding(draft);
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:3,scripts:[]}]).panelId,'');
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:3},{...panel,id:4}]).panelId,'');
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:3}]).panelId,'3');
});
test('standalone workspaces remain standalone; file identity is case and separator tolerant',()=>{
 const standalone={...draft,panelId:''}; assert.equal(prepareRestoredScriptBinding(standalone),standalone);
 const restored=prepareRestoredScriptBinding(reconnectScriptBinding(draft,[panel]));
 assert.equal(reconnectScriptBinding(restored,[{...panel,id:5,filePath:'c:\\panels\\DROPDOWN.cepanel'}]).panelId,'5');
});

test('store restoration keeps runtime detached until its panel loads and saves its draft to that panel',async()=>{
 const {get}=await import('svelte/store');
 const {panels,activeEditorTab,scriptRuntimePanelId}=await import('../src/CE_Application/stores/panels.js');
 const {scriptDocuments}=await import('../src/CE_Application/stores/scriptWorkspace.js');
 try {
  panels.set([{...panel,id:31,panelGuid:'wrong',filePath:'C:/panels/other.cepanel'}]);
  const restored=prepareRestoredScriptBinding(reconnectScriptBinding(draft,[panel]));
  scriptDocuments.set([restored]); activeEditorTab.set({type:'script',id:draft.id});
  assert.equal(get(scriptRuntimePanelId),null);
  panels.update(list=>[...list,{...panel,id:7}]);
  assert.equal(get(scriptRuntimePanelId),7);
  assert.equal(get(scriptDocuments)[0].scripts[0].source,draft.scripts[0].source);
  assert.equal(get(scriptDocuments)[0].modified,true);
 } finally {activeEditorTab.set({type:'panel',id:null});scriptDocuments.set([]);panels.set([]);}
});
