import { createControl } from './componentTypes.js';
import { getControlSet } from './controlSets.js';
import { resolveControlForSet, writeControlPath } from './controlSetFamilies.js';
import { KNOB_FORMS_AS_PARTS, knobFormFamily } from './knobFormParts.js';
import { meterFormFamily } from './meterFormParts.js';
import { createPanel } from '../stores/panelModel.js';
import { setAnatomy } from './controlAnatomy.js';
import { starterDirection } from './controlSetCoverage.js';
import { labelTreatmentFor } from './labelDesigns.js';
import { makeAttachedLabel, wordsWidth } from '../utils/attachedLabelFactory.js';
import { attachedLabelRect } from '../utils/attachedLabels.js';

// Gallery and starter share ordinary controls. Materialization exposes design values in the
// inspector; the pin keeps the design when the user copies a control to another panel.
//
// `nextId` numbers the controls. Left out, each one gets the editor's own id and name, as any new
// control does — taken from a counter that starts at the clock, so no two starters opened from the
// gallery share one. The starters that ship as files pass a fixed sequence instead, so a file is
// the same on every export and a test can hold it to the code (scripts/export-control-set-starters.mjs).
// `set`: draw the sample with this set rather than the built-in `setId` names (whose layout it still
// takes): the Settings page's preview of a set being edited, which is not registered anywhere yet.
export function createControlSetStarter(setId, { materialize = true, nextId = null, set: setOverride = null } = {}) {
  const set = setOverride ?? getControlSet(setId);
  if (!set) throw new Error(`Unknown control set: ${setId}`);
  const direction = starterDirection(setId);
  const controls = [];
  function place(type, x, y, width, height, extra = {}) {
    // Given a number, the id and the name createControl would have made from it.
    const n = nextId?.();
    // Graphite's starter draws Graphite's forms; a form that is parts now (models/knobFormParts.js,
    // models/meterFormParts.js) is written as the control's own parts instead of named.
    const graphiteForm = setId === 'graphite' ? setAnatomy(type, setId) : '';
    const recipe = !graphiteForm ? null
      : type === 'Knob' ? (KNOB_FORMS_AS_PARTS.includes(graphiteForm) ? knobFormFamily(graphiteForm, { ink: '{text.primary}' }) : null)
        : meterFormFamily(type, graphiteForm, { ink: '{text.primary}' });
    const asParts = !!recipe;
    let c = createControl(type, { ...(n == null ? {} : { name: `${type}_${n}` }), Core: { ...(n == null ? {} : { id: `ctrl_${n}` }), controlSetId: setOverride?.id ?? setId, ...(graphiteForm && !asParts ? { controlForm: graphiteForm, formFaceColour: '{surface}', formInkColour: '{text.primary}', formLabelColour: '{text.primary}', formAccentColour: '{accent}' } : {}) }, Transform: { x, y, width, height }, ...extra });
    if (asParts) {
      for (const [path, value] of Object.entries(recipe.component)) c = writeControlPath(c, path, value);
      for (const [part, patch] of Object.entries(recipe.parts)) {
        for (const [path, value] of Object.entries(patch)) c = writeControlPath(c, `Parts.${part}.${path}`, value);
      }
    }
    if (materialize) c = resolveControlForSet(c, set);
    controls.push(c);
    return c;
  }
  // A caption is drawn the way the set draws a Label: printed on the panel, engraved, lit, on a brass
  // plate or in a hairline frame (models/labelDesigns.js). Only Graphite has no Label design, and
  // there the starter takes off the box every control is born with. Doing that under every set, as
  // the starter did before sets designed labels, kept the plate sets' dark plate lettering and
  // removed the plate it is lettered on.
  const bareCaption = labelTreatmentFor(set) ? {} : { Background: { _children: { Fill: { colour: '00000000' }, Border: { enabled: false, thickness: 0 } } } };
  function label(title, x, y, width = 250, size = 13, owner = null) {
    const made = place('Label', x, y, width, 26, { ...bareCaption, Text: { content: title, _children: { Font: { size } } } });
    // A knob's caption is attached to it: it moves, copies and deletes with it (utils/attachedLabels.js).
    if (owner) made._children.Core.attachedTo = owner._children.Core.id;
    return made;
  }
  // A Label of a knob's or slider's own: its value, or its title in its own words. A knob draws no
  // text of its own; these are what it had (utils/attachedLabelFactory.js).
  function attach(owner, shows, options = {}) {
    // A title in its own words is a caption like the others, attached where its part would be.
    if (!shows) {
      const r = attachedLabelRect(owner, options.at || 'name', { size: 11, width: wordsWidth(options.content, 11) });
      return label(options.content, r.x, r.y - (26 - r.height) / 2, r.width, 11, owner);
    }
    const n = nextId?.();
    let made = makeAttachedLabel(owner, shows, { ...options, core: { ...(n == null ? {} : { id: `ctrl_${n}`, name: `Label_${n}` }), controlSetId: setOverride?.id ?? setId } });
    if (materialize) made = resolveControlForSet(made, set);
    controls.push(made);
    return made;
  }
  if(direction?.physical) {
    label(set.name.toUpperCase(),26,16,650,24);
    label(direction.title,26,48,650,12);
    label('OSCILLATOR / FILTER',26,85,300); label('ENVELOPE',356,85,210); label('PERFORMANCE',586,85,250);
    const tune=place('Knob',26,120,150,150,{Behavior:{defaultCurrentValue:.63}});
    const cutoff=place('Knob',194,120,150,150,{Behavior:{defaultCurrentValue:.35}});
    attach(tune,'value');attach(cutoff,'value');
    label('TUNE',26,292,150,11,tune);label('CUTOFF',194,292,150,11,cutoff);
    for(const [i,title] of ['A','D','S','R'].entries()) {
      const c=place('Slider',356+i*50,120,44,155,{Behavior:{orientation:'vertical',direction:'btt',defaultCurrentValue:[.2,.55,.7,.35][i]}});
      attach(c,'',{content:title,at:'value'});
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
    return {...createPanel(),name:`${set.name} — starter`,width:880,height:636,description:direction.detail,controls,controlSet:{id:setId},controlSets:[],modified:true};
  }
  label(set.name.toUpperCase(), 26, 16, 650, 24);
  label(direction?.title ?? 'Control set', 26, 48, 650, 12);
  label('TURN / SLIDE', 26, 82);
  label('PRESS / SELECT', 580, 82);
  const big = place('Knob', 36, 112, 170, 170, { Behavior: { defaultCurrentValue: 0.63 } });
  const small = place('Knob', 228, 132, 112, 112, { Behavior: { defaultCurrentValue: 0.35 } });
  attach(big, 'value');
  attach(small, 'value');
  const slider = place('Slider', 364, 150, 190, 48, { Behavior: { defaultCurrentValue: 0.66 } });
  attach(slider, '', { content: 'LEVEL' });
  attach(slider, 'value');
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
    description: direction?.detail ?? set.description, controls, controlSet: { id: setId },
    // A starter shows a built-in; it must not carry the user's library default along with it.
    controlSets: [], modified: true };
}
