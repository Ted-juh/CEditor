import { createControl } from '../../../CE/web/src/CE_Application/models/componentTypes.js';
import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { linkedEnvelopePoints } from '../../../CE/web/src/CE_Application/utils/linkedEnvelope.js';

// Migrate the nine existing drawings in place: keep their IDs and leave the
// faders as the ONLY MIDI-bound controls / authoritative value sources.
export function applyEditableEnvelopes(panel) {
  const controls=flatControls(panel.controls);
  const named=name=>controls.find(c=>c._children.Core.name===name);
  for (const tone of [1,2,3]) for(const kind of ['osc.pitchEnv','filter.env','amp.env']) {
    const first=named(`tone${tone}.${kind}AttackTime`);
    if(!first)throw new Error(`Missing tone ${tone} ${kind} attack fader`);
    const candidates=controls.filter(c=>c._children.Core.name===`env_${kind.replace(/\W+/g,'_')}` || c._children.Core.name===`tone${tone}_${kind.replace(/\W+/g,'_')}_graph`);
    const graph=candidates.find(c=>Math.abs(c._children.Transform.y-first._children.Transform.y)<90);
    if(!graph)throw new Error(`Missing tone ${tone} ${kind} envelope drawing`);
    const ad=kind==='osc.pitchEnv';
    const suffixes=ad ? {attack:'AttackTime',decay:'Decay'} : {attack:'AttackTime',decay:'DecayTime',sustain:'SustainLevel',release:'ReleaseTime'};
    const sources={}, values={};
    for(const [stage,suffix] of Object.entries(suffixes)) {
      const fader=named(`tone${tone}.${kind}${suffix}`);
      const channel=fader?._children.ValueChannels?._children.value;
      if(!channel)throw new Error(`Missing ${kind} ${stage} value channel`);
      sources[stage]={controlId:fader._children.Core.id,channel:'value',min:channel.min,max:channel.max,defaultValue:channel.currentValue??channel.defaultValue};
      values[stage]=sources[stage].defaultValue;
    }
    const alreadyLinked=!!graph._children.Envelope?.stageSources;
    const transform=alreadyLinked ? {...graph._children.Transform}
      : {...graph._children.Transform,y:first._children.Transform.y-70,height:66};
    if(ad && !alreadyLinked)transform.width=146;
    const replacement=createControl('Envelope',{
      Core:{...graph._children.Core,controlType:'Envelope',name:`tone${tone}_${kind.replace(/\W+/g,'_')}_graph`,
        tooltip:`Tone ${tone} ${ad?'pitch AD':kind.startsWith('filter')?'filter ADSR':'amp ADSR'}: A/D${ad?'':'/R'} sideways = stage time.${ad?'':' D up/down = sustain LEVEL. S moves sideways only, at D height: illustrated key-hold duration, not a synth parameter.'} Shift-drag = fine. A/D${ad?'':'/S/R'} keys select a handle; arrows adjust it (D up/down adjusts sustain level). Home/End set time limits; S Home/End changes only the preview hold. Escape cancels the drag. Relative stage settings, not calibrated milliseconds.`,},
      Transform:transform,
      Background:{_children:{Fill:{colour:'FF1B2023'},Border:{enabled:true,thickness:1,colour:'FF46515B'},Corners:{radius:4}}},
      Envelope:{preset:ad?'ad':'adsr',stageSources:sources,holdPreview:graph._children.Envelope?.holdPreview??.15,editable:true,addOnDoubleClick:false,
        sustainIndex:ad?-1:3,showGrid:false,fillUnder:true,lineColour:'FFE0B45C',fillColour:'18E0B45C',
        nodeColour:'FFE4EBEF',sustainColour:'FFE0B45C',gridColour:'FF39434C',nodeRadius:4,lineWidth:1.5,
        showPlayhead:false,xLabel:'Relative stage value',timeUnit:'',timeMax:127},
      DeviceBindings:{enabled:false,bindings:[]},
    });
    replacement._children.Envelope.points=linkedEnvelopePoints(replacement,values);
    Object.keys(graph).forEach(k=>delete graph[k]);Object.assign(graph,replacement);
  }
  for(const note of panel.notepad?.notes??[]) {
    if(note.name==='About this panel') note.content=note.content.replace('Drag A/D/R horizontally and S vertically; Shift-drag is fine.', 'Drag A/D/R horizontally; D vertically sets sustain level. S moves horizontally at the same height and changes only the illustrated key-hold duration. Shift-drag is fine.');
    if(note.name==='About this panel')note.content=note.content.replace(/  The envelope drawings are printed, not driven:[\s\S]*?(?=\n\n|$)/,
      '  The envelope graphs and their faders share the same values in both directions. Drag A/D/R horizontally and S vertically; Shift-drag is fine. The graphs show relative stage settings, not calibrated milliseconds.');
  }
  return panel;
}
