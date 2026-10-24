import test from 'node:test';
import assert from 'node:assert/strict';
import {createControl} from '../src/CE_Application/models/componentTypes.js';
import {createRangeVariantSections} from '../src/CE_Application/utils/rangeVariant.js';
test('Range variant roundtrip preserves behavior and rebuilds accurate spinner labels',()=>{
 const c=createControl('Range',{name:'range'});const b={...c._children.Behavior,min:-10,max:10,step:0.25,valueType:'float',defaultStartValue:-2.5,defaultEndValue:2.5,returnMode:'center',returnTime:250,returnCurve:'linear',keyboardEnabled:false,wheelEnabled:false,valueFlow:'display'};
 const slider=createRangeVariantSections(b,'slider');const spinner=createRangeVariantSections(slider.Behavior,'spinner');
 for(const result of [slider,spinner])for(const key of ['min','max','step','valueType','defaultStartValue','defaultEndValue','returnMode','returnTime','returnCurve','keyboardEnabled','wheelEnabled','valueFlow'])assert.equal(result.Behavior[key],b[key],key);
 assert.equal(slider.Behavior.role,'slider');assert.equal(spinner.Behavior.role,'spinbox');
 assert.equal(spinner.Parts._children.lowField._children.Text.content,'-2.5');assert.equal(spinner.Parts._children.highField._children.Text.content,'2.5');
 assert.equal(b.role,'spinbox');
});
