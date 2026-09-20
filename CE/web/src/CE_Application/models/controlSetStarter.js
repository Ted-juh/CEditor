import { createControl } from './componentTypes.js';
import { getControlSet } from './controlSets.js';
import { resolveControlForSet } from './controlSetFamilies.js';
import { createPanel } from '../stores/panelModel.js';
import { setAnatomy } from './controlAnatomy.js';
import { starterDirection } from './controlSetCoverage.js';

// Gallery and starter share ordinary controls. Materialization exposes design values in the
// inspector; the pin keeps the design when the user copies a control to another panel.
export function createControlSetStarter(setId, { materialize = true } = {}) {
  const set = getControlSet(setId);
  if (!set) throw new Error(`Unknown control set: ${setId}`);
  const direction = starterDirection(setId);
  const controls = [];
  function place(type, x, y, width, height, extra = {}) {
    let c = createControl(type, { Core: { controlSetId: setId, ...(setId === 'graphite' && setAnatomy(type, setId) ? { controlForm: setAnatomy(type, setId), formFaceColour: '{surface}', formInkColour: '{text.primary}', formLabelColour: '{text.primary}', formAccentColour: '{accent}' } : {}) }, Transform: { x, y, width, height }, ...extra });
    if (materialize) c = resolveControlForSet(c, set);
    controls.push(c);
    return c;
  }
  function label(title, x, y, width = 250, size = 13) {
    place('Label', x, y, width, 26, { Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } }, Text: { content: title, _children: { Font: { size } } } });
  }
  if(direction?.physical) {
    label(set.name.toUpperCase(),26,16,650,24);
    label(direction.title,26,48,650,12);
    label('OSCILLATOR / FILTER',26,85,300); label('ENVELOPE',356,85,210); label('PERFORMANCE',586,85,250);
    place('Knob',26,120,150,164,{Behavior:{defaultCurrentValue:.63}});
    place('Knob',194,120,150,164,{Behavior:{defaultCurrentValue:.35}});
    label('TUNE',26,280,150,11);label('CUTOFF',194,280,150,11);
    for(const [i,title] of ['A','D','S','R'].entries()) {
      const c=place('Slider',356+i*50,120,44,173,{Behavior:{orientation:'vertical',direction:'btt',defaultCurrentValue:[.2,.55,.7,.35][i],showMinMaxLabels:false,showValueReadout:false}});
      c._children.Parts._children.labelTitle._children.Text.content=title;
    }
    place('Button',586,126,116,76,{Text:{content:'TRIGGER'}});
    place('ToggleButton',728,126,124,76,{Text:{content:'HOLD'},Behavior:{defaultValue:true}});
    place('CyclicButton',586,218,116,34,{Text:{content:'MODE'}});
    place('Combobox',728,218,124,34);
    place('Number',586,267,116,42);
    place('TextInput',728,267,124,36,{Text:{content:'Init patch'}});
    label('PADS / MODULATION',26,318,360);label('OUTPUT / ROUTING',540,318,300);
    place('DrumPads',26,356,228,206,{DrumPads:{rows:2,cols:2,showHeader:false,showNotes:false}});
    place('Envelope',284,356,220,70);
    place('Crossfader',284,435,220,42);
    place('StepSequencer',284,489,220,77,{StepSequencer:{steps:8,trackHeaderWidth:38,running:false,tracks:[{id:'kick',label:'Kick',note:36,channel:10},{id:'hat',label:'Hat',note:42,channel:10}],pattern:{'kick:0':{on:true,velocity:100},'kick:4':{on:true,velocity:100},'hat:0':{on:true,velocity:70},'hat:2':{on:true,velocity:70},'hat:4':{on:true,velocity:70},'hat:6':{on:true,velocity:70}}}});
    place('Meter',540,352,312,92,{Meter:{orientation:'horizontal',value:.7,valuePrecision:2}});
    place('Matrix',540,466,166,100,{Matrix:{rows:['LFO','ENV','VEL'],cols:['OSC','FLT','AMP'],amounts:[.6,0,-.4,0,.7,0,0,.4,.8]}});
    place('VectorJoystick',728,466,124,100);
    label('Editable synthesizer controls — copy individual controls into your panel.',26,590,820,12);
    return {...createPanel(),name:`${set.name} — starter`,width:880,height:636,description:direction.detail,controls,controlSet:{id:setId},modified:true};
  }
  label(set.name.toUpperCase(), 26, 16, 650, 24);
  label(direction?.title ?? 'Control set', 26, 48, 650, 12);
  label('TURN / SLIDE', 26, 82);
  label('PRESS / SELECT', 580, 82);
  place('Knob', 26, 112, 190, 190, { Behavior: { defaultCurrentValue: 0.63 } });
  place('Knob', 220, 125, 128, 158, { Behavior: { defaultCurrentValue: 0.35 } });
  const slider = place('Slider', 364, 133, 190, 78, { Behavior: { defaultCurrentValue: 0.66 } });
  slider._children.Parts._children.labelTitle._children.Text.content = 'LEVEL';
  place('Crossfader', 364, 234, 190, 62);
  place('Button', 576, 118, 124, 84, { Text: { content: 'TRIGGER' } });
  place('ToggleButton', 716, 118, 136, 84, { Text: { content: 'HOLD' }, Behavior: { defaultValue: true } });
  place('CyclicButton', 576, 220, 124, 36, { Text: { content: 'CYCLE' } });
  place('Combobox', 716, 220, 136, 36);
  place('Number', 576, direction?.padForm ? 265 : 273, 124, direction?.padForm ? 46 : 32);
  place('TextInput', 716, 273, 136, 32, { Text: { content: 'Studio A' } });
  label('PLAY / SHAPE', 26, 310);
  label('MEASURE / ROUTE', 540, 310);
  place('DrumPads', 26, 348, 228, 214, { DrumPads: { rows: 2, cols: 2, showHeader: false, showNotes: false } });
  place('Envelope', 284, 348, 220, 120);
  place('Ribbon', 284, 484, 220, 76, { Ribbon: { orientation: 'horizontal', showValue: false } });
  place('Meter', 540, 342, 312, 108, { Meter: { orientation: 'horizontal', value: 0.7, valuePrecision: 2 } });
  place('Matrix', 540, 466, 166, 100, { Matrix: { rows: ['LFO', 'ENV', 'VEL'], cols: ['OSC', 'FLT', 'AMP'], amounts: [.6, 0, -.4, 0, .7, 0, 0, .4, .8] } });
  place('VectorJoystick', 728, 466, 124, 100);
  if (direction?.padForm) {
    // A compact, stopped rhythm is editable immediately; no notes start on opening.
    place('StepSequencer', 284, 466, 220, 100, { StepSequencer: { steps: 8, trackHeaderWidth: 38, running: false,
      tracks: [{id:'kick',label:'Kick',note:36,channel:10},{id:'hat',label:'Hat',note:42,channel:10}],
      pattern: {'kick:0':{on:true,velocity:100},'kick:4':{on:true,velocity:100},'hat:0':{on:true,velocity:70},'hat:2':{on:true,velocity:70},'hat:4':{on:true,velocity:70},'hat:6':{on:true,velocity:70}} } });
    const ribbon=controls.find(c=>c._children.Core.controlType==='Ribbon');
    ribbon._children.Transform={...ribbon._children.Transform,x:284,y:427,width:220,height:30};
    const envelope=controls.find(c=>c._children.Core.controlType==='Envelope');
    envelope._children.Transform.height=70;
  }
  label('Copy a control into your panel. Its pinned design travels with it.', 26, 590, 820, 12);
  return { ...createPanel(), name: `${set.name} — starter`, width: 880, height: 636,
    description: direction?.detail ?? set.description, controls, controlSet: { id: setId }, modified: true };
}
