// Session ids are disposable. Persist document identity and resolve it before scripts run.
export function prepareRestoredScriptBinding(doc) {
 if (!doc.panelId && !doc.panelGuid && !doc.panelFilePath && !doc.panelBindingPending) return doc;
 return {...doc,panelId:'',panelBindingPending:true};
}
const pathKey = path => String(path ?? '').replaceAll('\\','/').toLowerCase();
export function reconnectScriptBinding(doc, panels) {
 let matches;
 if (doc.panelBindingPending) {
  if (doc.panelFilePath) matches=panels.filter(p=>pathKey(p.filePath)===pathKey(doc.panelFilePath) && (!doc.panelGuid || p.panelGuid===doc.panelGuid));
  else if (doc.panelGuid) matches=panels.filter(p=>p.panelGuid===doc.panelGuid);
  else {
   // Migrate old workspaces only with both a matching title and an authored script id.
   const name=doc.name.endsWith(' · Scripts')?doc.name.slice(0,-10):'';
   matches=panels.filter(p=>name && p.name===name && (p.scripts??[]).some(s=>(doc.scripts??[]).some(d=>d.id===s.id)));
  }
 } else matches=panels.filter(p=>doc.panelId && String(p.id)===String(doc.panelId));
 if (matches.length!==1) return doc;
 const p=matches[0];
 const patch={panelId:String(p.id),panelGuid:String(p.panelGuid??''),panelFilePath:String(p.filePath??''),panelBindingPending:false};
 return Object.entries(patch).every(([key,value])=>doc[key]===value)?doc:{...doc,...patch};
}
