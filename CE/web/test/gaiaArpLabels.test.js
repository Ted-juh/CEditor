import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGaiaPanel } from '../../../tools/scripts/gaia-panel/make-gaia-panel.mjs';
import { ARP_LABELS, arpKnobCaption, applyArpeggioLabels } from '../../../tools/scripts/gaia-panel/arpeggio-labels.mjs';
import { flatControls } from '../src/CE_Application/utils/containment.js';
import { mountPanel, loadScript, controlNamed, idOf, moveChannel } from './support/gaiaScriptHarness.mjs';
import { syncDeviceParameterToPanelPreview } from '../src/CE_Application/utils/deviceBindingSync.js';

test('all arpeggio choices retain their original wire mapping and identifiers', () => {
  const panel = buildGaiaPanel();
  for (const [name, labels] of Object.entries(ARP_LABELS)) {
    const c = controlNamed(panel, name), rows=c._children.Value.rows;
    assert.equal(rows.length,labels.length);
    rows.forEach((r,i)=>{
      assert.equal(r.sendValue,i); assert.equal(r.receiveValue,i);
      assert.equal(r.displayText,labels[i]); assert.ok(r.originalCode);
    });
    assert.equal(c._children.DeviceBindings.bindings[0].adoptMetadata,false);
    assert.ok(c._children.Core.tooltip.includes('Hardware codes:'));
  }
  assert.equal(controlNamed(panel,'arp.grid')._children.Value.rows[2].id,'08l');
  assert.equal(controlNamed(panel,'arp.motif')._children.Value.rows[7].id,'updownlh');
  assert.equal(controlNamed(panel,'arp.duration')._children.Value.rows[9].id,'ful');
  // On the flat layout the pass was written for: the finished panel has been sectioned since.
  const flat=buildGaiaPanel({sections:false});
  const once=JSON.stringify(flat); applyArpeggioLabels(flat); assert.equal(JSON.stringify(flat),once,'migration is idempotent');
});
test('special values are readable without adding an input or changing the stored range',()=>{
  assert.equal(arpKnobCaption('arp.velocity',0),'VELOCITY\nREAL (played)');
  assert.equal(arpKnobCaption('arp.velocity',1),'VELOCITY\n1 (fixed)');
  assert.equal(arpKnobCaption('arp.velocity',127),'VELOCITY\n127 (fixed)');
  assert.equal(arpKnobCaption('arp.octaveRange',61),'OCTAVE RANGE\n-3 octaves');
  assert.equal(arpKnobCaption('arp.octaveRange',67),'OCTAVE RANGE\n+3 octaves');
  assert.equal(arpKnobCaption('arp.accentRate',100),'ACCENT\n100% (pattern)');
  for(const name of ['arp.velocity','arp.accentRate','arp.octaveRange']){
    const c=controlNamed(buildGaiaPanel(),name);
    assert.ok(!Object.values(c._children.Parts._children).some(p=>p.role==='customValueField'));
    assert.equal(c._children.Core.tooltip.includes('send live'),true);
  }
});
test('real script runtime updates captions from local and incoming values without MIDI writes',()=>{
  const panel=buildGaiaPanel(), mounted=mountPanel(panel);
  const script=loadScript(panel.scripts.find(s=>s.id==='gaia_arpeggio_captions').source);
  script.onPanelLoad();
  const text=name=>mounted.controls().find(c=>c._children.Core.name===`${name.replace(/\./g,'_')}_caption`)._children.Text.content;
  assert.equal(text('arp.velocity'),'VELOCITY\nREAL (played)');
  moveChannel(idOf(controlNamed(panel,'arp.velocity')),{value:96}); script.settle();
  assert.equal(text('arp.velocity'),'VELOCITY\n96 (fixed)');
  syncDeviceParameterToPanelPreview('Roland GAIA SH-01','arp.velocity',0); script.settle();
  assert.equal(text('arp.velocity'),'VELOCITY\nREAL (played)');
  syncDeviceParameterToPanelPreview('Roland GAIA SH-01','arp.octaveRange',67); script.settle();
  assert.equal(text('arp.octaveRange'),'OCTAVE RANGE\n+3 octaves');
  assert.deepEqual(script.writes,[]);
});
