import { flatControls } from '../../../CE/web/src/CE_Application/utils/containment.js';
import { createScript } from '../../../CE/web/src/CE_Application/scripting/scriptModel.js';

// SH-01 wire values: https://cdn.roland.com/assets/media/pdf/SH-01_MI.pdf
// Meaning inferred from Roland's identical SH-201 option set, owner manual pp.66-67:
// https://static.roland.com/assets/media/pdf/SH-201_OM.pdf
// Presentation only: never rename IDs or alter send/receive values.
export const ARP_LABELS = {
  'arp.grid': ['1/4 straight', '1/8 straight', '1/8 light shuffle', '1/8 heavy shuffle', '1/8 triplet',
    '1/16 straight', '1/16 light shuffle', '1/16 heavy shuffle', '1/16 triplet'],
  'arp.duration': ['30%', '40%', '50%', '60%', '70%', '80%', '90%', '100%', '120%', 'Full (legato)'],
  'arp.motif': ['Up · keep low', 'Up · keep low+high', 'Up · no fixed note',
    'Down · keep low', 'Down · keep low+high', 'Down · no fixed note',
    'Up/down · keep low', 'Up/down · keep low+high', 'Up/down · no fixed note',
    'Random · keep low', 'Random · no fixed note', 'Phrase · last key'],
};
export const ARP_HELP = {
  'arp.grid': 'Step timing relative to a quarter-note beat. Straight: evenly spaced; light/heavy shuffle: uneven pairs; triplet: three 1/8 steps or six 1/16 steps per beat. This changes timing, not the number of steps.',
  'arp.duration': 'Gate length as a percentage of a step (for a tied note, its final step). Full / FUL sustains until the next note event, even across untied steps; it is not simply 100%. Note-block length is edited separately in the pattern grid.',
  'arp.motif': 'How held keys are assigned when the chord has more notes than the pattern. Keep low (L): retain the lowest key across repetitions. Keep low+high (L&H): retain both extremes. No fixed note (_): rotate without retaining either extreme. Up/down describes the direction of this rotation, not a new note pattern. Phrase uses the last-played key to transpose the phrase.',
  'arp.velocity': 'REAL (wire value 0): use your played key velocity; this is not silence. Values 1-127 set a fixed playing velocity. Individual pattern-note velocities and ACCENT shape the resulting dynamics.',
  'arp.accentRate': 'Pattern accent strength. 0%: even dynamics. 100%: the full velocity differences programmed in the pattern. Intermediate settings reduce those differences; this is not output volume.',
  'arp.octaveRange': 'Octave cycling from -3 to +3. Zero keeps the played octave range; positive values extend upward, negative values downward. This does not transpose the stored note blocks.',
};

export function arpKnobCaption(parameter, raw) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n)) return '';
  if (parameter === 'arp.velocity') return 'VELOCITY\n' + (n === 0 ? 'REAL (played)' : n + ' (fixed)');
  if (parameter === 'arp.accentRate') return 'ACCENT\n' + n + '%' + (n === 0 ? ' (even)' : n === 100 ? ' (pattern)' : '');
  const oct = n - 64;
  return 'OCTAVE RANGE\n' + (oct === 0 ? '0 (played)' : (oct > 0 ? '+' : '') + oct + (Math.abs(oct) === 1 ? ' octave' : ' octaves'));
}

export function arpCaptionScript(entries) {
  return `${arpKnobCaption.toString().replace(/\r\n/g, '\n')}
var ENTRIES = ${JSON.stringify(entries)};
function onPanelLoad() {
  ENTRIES.forEach(function (e) {
    function refresh() {
      var text = arpKnobCaption(e.parameter, get(e.control + ".value"));
      if (text) set(e.caption + ".text.content", text);
    }
    refresh();
    watch(e.control + ".value", refresh);
  });
}
`;
}

/** Shared by the generator and a narrow migration of an already-saved panel. */
export function applyArpeggioLabels(panel) {
  const controls = flatControls(panel.controls);
  const named = name => controls.find(c => c._children.Core.name === name);
  const compact = named('box_ARPEGGIO')._children.Core.tabPageId === 'arpeggiator';
  const box = named('box_ARPEGGIO')._children.Transform;
  const entries = [];
  for (const [name, help] of Object.entries(ARP_HELP)) {
    const control = named(name);
    if (!control) throw new Error(`Missing ${name}`);
    const t = control._children.Transform;
    const captionName = `${name}.caption`;
    const caption = named(captionName) ?? controls.find(c => c._children.Text && c._children.Core.name === 'label'
      && Math.abs(c._children.Transform.y - (t.y + (ARP_LABELS[name] ? -13 : 44))) < 1
      && Math.abs((c._children.Transform.x + c._children.Transform.width / 2) - (t.x + t.width / 2)) < 1);
    if (!caption) throw new Error(`Missing caption for ${name}`);
    caption._children.Core.name = captionName;
    control._children.Core.tooltip = help + '\nThese performance controls send live; only note blocks and END STEP use Send Pattern.';
    caption._children.Core.tooltip = control._children.Core.tooltip;
    if (ARP_LABELS[name]) {
      const labels = ARP_LABELS[name];
      const codes = control._children.Value.rows.map(r => r.originalCode ?? r.displayText);
      for (const row of control._children.Value.rows) {
        if (!labels[row.sendValue]) throw new Error(`Unknown ${name} wire value ${row.sendValue}`);
        row.originalCode ??= row.displayText;
        row.displayText = labels[row.sendValue];
      }
      control._children.Core.tooltip += '\nHardware codes: ' + codes.map((code, i) => code + ' = ' + labels[i]).join('; ');
      // Protect authored names from automatic metadata adoption; wire mapping stays unchanged.
      for (const binding of control._children.DeviceBindings.bindings) binding.adoptMetadata = false;
      const layout = { 'arp.grid': [12, 174, 'GRID / STEP TIMING'], 'arp.duration': [194, 102, 'DURATION'], 'arp.motif': [304, 198, 'MOTIF / NOTE ORDER'] }[name];
      if (!compact) { t.x = box.x + layout[0]; t.width = layout[1]; }
      control._children.Text ??= {};
      control._children.Text._children ??= {};
      control._children.Text._children.Font = { ...control._children.Text._children.Font, size: 11 };
      Object.assign(caption._children.Transform, { x: t.x, width: t.width });
      caption._children.Text.content = layout[2];
    } else {
      if (!compact) Object.assign(caption._children.Transform, { x: t.x + t.width / 2 - 79, width: 158, height: 28 });
      const text = caption._children.Text;
      text._children.Multiline = { ...text._children.Multiline, maxLines: compact ? 3 : 2, lineHeight: 1.15, wrapMode: 'word', fitMode: 'shrink' };
      text.content = arpKnobCaption(name, control._children.ValueChannels._children.value.currentValue ?? control._children.ValueChannels._children.value.defaultValue);
      entries.push({ parameter: name, control: control._children.Core.id, caption: caption._children.Core.id });
    }
  }
  // Put ARP on/off in the header, leaving a full row for the three choice menus.
  const on = named('common.switch');
  if (!compact) Object.assign(on._children.Transform, { x: box.x + 438, y: box.y + 5, width: 64, height: 22 });
  const script = createScript({ id: 'gaia_arpeggio_captions', name: 'Arpeggio readable values', language: 'javascript',
    scope: 'panel', event: 'onPanelLoad', target: '*', source: arpCaptionScript(entries),
    description: 'Read-only value captions for the existing rotary controls. No duplicate inputs and no MIDI writes.' });
  const existing = (panel.scripts ?? []).findIndex(s => s.id === script.id);
  if (existing < 0) panel.scripts = [...(panel.scripts ?? []), script];
  else panel.scripts[existing] = script;
  return panel;
}
