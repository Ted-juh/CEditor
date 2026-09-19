import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';
import { toneCopyScript } from './tone-copy.mjs';

const EXTRA = 112;

export function applyToneDividers(panel) {
  const all = flatControls(panel.controls);
  const plate = all.find(c => c._children.Core.name === 'plate')?._children.Transform;
  for (const tone of [2, 3]) {
    const name = `tone${tone}.divider`;
    if (all.some(c => c._children.Core.name === name)) continue;
    const rail = all.find(c => c._children.Core.name === `tone${tone}.signalFlow`);
    if (!rail) continue;
    panel.controls.push(createControl('Background', {
      Core: { id: `gaia_tone${tone}_divider`, name },
      Transform: { x: plate?.x ?? 10, y: rail._children.Transform.y - 5,
        width: plate?.width ?? panel.width - 20, height: 3 },
      Background: { _children: {
        Fill: { colour: panel.bgColour || 'FFFFFFFF' },
        Border: { enabled: false, thickness: 0 },
        Corners: { radius: 0 },
      } },
    }));
  }
  return panel;
}

function removeNamed(controls, names) {
  for (let i = controls.length - 1; i >= 0; i--) {
    if (names.has(controls[i]._children?.Core?.name)) controls.splice(i, 1);
    else {
      const children = controls[i]._children?.Children?._children;
      if (children) {
        for (const [key, child] of Object.entries(children)) {
          const kept = [child]; removeNamed(kept, names);
          if (!kept.length) delete children[key];
        }
      }
    }
  }
}

// Also applies to a saved, customized panel: move existing controls and retain
// their IDs/bindings, rather than replacing the user's panel with the template.
export function applyToneControls(panel) {
  if (flatControls(panel.controls).some(c => c._children.Core.name === 'tone1.copy')) return applyToneDividers(panel);
  const all = flatControls(panel.controls);
  const named = name => all.find(c => c._children.Core.name === name);
  const pairs = [1,2,3].map(t => ({ tone: t, select: named(`common.tone${t}Select`), on: named(`common.tone${t}Switch`), rail: named(`tone${t}.signalFlow`) }));
  if (pairs.some(p => !p.select || !p.on || !p.rail)) throw new Error('GAIA tone controls/rails missing');
  const remove = new Set(['box_TONE','tab_TONE', ...pairs.flatMap(p => [p.select._children.Core.name,p.on._children.Core.name])]);
  removeNamed(panel.controls, remove);
  for (const { rail } of pairs) {
    const top = rail._children.Transform.y;
    for (const c of panel.controls) {
      const tr = c._children.Transform;
      if (tr && tr.y >= top && tr.y < top + 364) tr.x += EXTRA;
    }
  }
  const top = named('top_pages');
  if (top) {
    top._children.Transform.width += EXTRA;
    // Close the former TONE gap; give the output controls the recovered space.
    for (const c of Object.values(top._children.Children?._children ?? {})) {
      const tr = c._children.Transform;
      if (!tr || tr.y > 196 || tr.x < 700) continue;
      const output = tr.x >= 1400;
      tr.x -= 220;
      if (output) tr.x += 220 + EXTRA;
      if (c._children.Core.name === 'box_EFFECTS / OUTPUT') tr.width += 220 + EXTRA;
    }
  }
  panel.width += EXTRA;
  const plate = named('plate');
  if (plate) plate._children.Transform.width += EXTRA;
  panel.scripts ??= [];
  panel.scripts.push(createScript({ id: 'gaia_tone_copy', name: 'Copy tone with hardware readback', scope: 'panel', target: '*', language: 'javascript', event: 'onPanelLoad', source: toneCopyScript() }));
  for (const {tone,select,on,rail} of pairs) {
    const y = rail._children.Transform.y + 30;
    for (const [control,offset,text,fill,edge] of [
      [select,0,`TONE ${tone} SELECT`,'FF237348','FF77E4A4'],
      [on,46,`TONE ${tone} ON`,'FFAA3445','FFFF7B8B'],
    ]) {
      Object.assign(control._children.Transform,{x:16,y:y+offset,width:96,height:34});
      delete control._children.Core.tabPageId;
      control._children.Text.content=text;
      control._children.States._children.Selected.patches.component={ 'Background.Fill.colour':fill,'Background.Border.colour':edge,'Text.Fill.colour':'FFFFFFFF' };
      panel.controls.push(control);
    }
    const name = `tone${tone}.copy`;
    panel.controls.push(createControl('Button',{
      Core:{id:`gaia_tone${tone}_copy`,name,tooltip:`Copy Tone ${tone} to another tone in the current sound.`},
      Transform:{x:16,y:y+92,width:96,height:34},
      Text:{content:'COPY…',_children:{Font:{size:10},Fill:{colour:'FF211D10'}}},
      Background:{_children:{Fill:{colour:'FFE2BD48'},Border:{colour:'FFFFDF75',thickness:1},Corners:{radius:4}}},
    }));
    panel.controls.push(createControl('Label',{
      Core:{id:`gaia_tone${tone}_copy_status`,name:`tone${tone}_copy_status`},
      Transform:{x:16,y:y+136,width:96,height:72},
      Text:{content:'',_children:{Font:{size:10},Fill:{colour:'FFD6DBDF'},Multiline:{wrapMode:'word',maxLines:5,fitMode:'shrink'}}},
      Background:{_children:{Fill:{colour:'00000000'},Border:{enabled:false,thickness:0}}},
    }));
    panel.scripts.push(createScript({id:`gaia_tone${tone}_copy_click`,name:`Copy Tone ${tone}`,scope:'panel',target:name,language:'javascript',event:'onClick',source:`function onClick() { run('gaiaToneCopy', ${tone}); }`}));
  }
  return applyToneDividers(panel);
}
