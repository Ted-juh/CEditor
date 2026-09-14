/**
 * behaviourWalkthrough.mjs — C4: create → configure → bind → preview → export → save/share, in one
 * run, on one panel, as a user would walk it.
 *
 * The per-component suites answer "does this property work". This answers a different question —
 * does the CHAIN hold: does a control configured in step two still carry that configuration when it
 * is bound in step three, does the binding still fire in step four, does the parameter a DAW would
 * see in step five describe the control as configured, and does all of it survive being packaged
 * and opened again in step six. Every step here reads the output of the one before it rather than
 * re-authoring from scratch, which is the whole point.
 *
 * WHERE THE LINE FALLS OFF WINDOWS, stated plainly because C4 has been carrying "stale" as a whole
 * row when only part of it is:
 *
 *   create, configure, bind, preview, export PARAMETERS, package, reopen   run here
 *   the VST3 binary itself                                                 does not
 *
 * The parameters are the half a DAW actually reads — name, range, default, unit, kind, and which
 * device parameter the control drives — and they are derived in the browser by
 * `deriveExportParameters`, the same function `panelExportPreparation` calls on the way out. What
 * needs Windows is `tools/scripts/export-panel-vst3.mjs` and the build that wraps them into a
 * plugin. So a green run here is not a plugin; it is everything up to the compiler.
 *
 * THREE FIXTURE FACTS, each of which silently costs a step and two of which cost one here:
 *
 * A device binding is only acted on when it carries `kind: 'deviceParameter'`. `activeDeviceBindings`
 * filters on exactly that, so a binding written with the right role, the right parameter and no
 * `kind` is stored, saved, reopened and ignored — the panel looks wired while nothing fires. It is
 * also `port`, not `portId`.
 *
 * The two leaks a package must not carry are stripped in `documentToShare`, which is in
 * `panelSharingActions.js` — one layer ABOVE `packagePanelForSharing`, which strips nothing and
 * clones the whole document. So a fixture that calls the packager directly, on a panel that was
 * never saved and never bound to hardware, finds no file path and no device session and reports a
 * pass it did not earn. Step six therefore PUTS both on the panel and goes through
 * `sharePanelToFile`, reading the bytes off the bridge as the user's disk would receive them.
 *
 * A control's id is `_children.Core.id`. A deserialised control has no top-level `id`, so the
 * obvious reader returns '' and a renderer check keyed on it measures nothing and says so quietly.
 *
 * AND ONE PRODUCT FACT WORTH NOT RE-DERIVING: `int` is not a host parameter kind. `PanelParameters.h`
 * turns `valueKind` into an AudioParameterChoice, an AudioParameterBool or an AudioParameterFloat and
 * has no fourth branch, so an int range exports as a float lane over its own min..max. The step is
 * not lost, it is applied at the other end — `getCurrentRangeValue` runs every incoming value through
 * `snapRangeValue`, which rounds to the step and then to a whole number for `valueType: int`. Step
 * four measures that on the wire rather than asserting it from the source.
 *
 * TWO STEPS ARE COVERED BETTER ELSEWHERE and are referenced rather than repeated. The bind step's
 * own UI — the device picker, parameter adoption, MIDI in/out selection and the dry-run toggle — is
 * driven through the real toolbar by `browser-checks/releaseWorkflow.mjs`. The share step's native
 * file dialogs are Windows, and were walked on 13 September 2026.
 */
import assert from 'node:assert/strict';
import { boot, Ledger } from './behaviourKit.mjs';

const kit = await boot();
const led = new Ledger('walkthrough');
const W = 'Walkthrough';

const activePanel = () => kit.page.evaluate(async () => {
  const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
  const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
  return get(panels).find((p) => p.id === get(activePanelId)) ?? null;
});

try {
  await kit.fresh();

  // =============================================================================================
  // 1. CREATE — a panel with a control on it.
  // =============================================================================================
  const cutoff = await kit.make('Slider', { 'Transform.x': 70, 'Transform.y': 110,
    'Transform.width': 300, 'Transform.height': 70, 'Core.name': 'Cutoff' });
  led.check(W, '1. create', 'a control is placed on a blank panel and carries the name it was given, which is what every later step addresses it by',
    'Cutoff', await kit.read(cutoff, 'Core.name'));

  // =============================================================================================
  // 2. CONFIGURE — give it a real parameter's range and feel.
  // =============================================================================================
  await kit.set(cutoff, {
    'Behavior.min': 0, 'Behavior.max': 127, 'Behavior.step': 1,
    'Behavior.valueType': 'int', 'Behavior.precision': 0,
    'Behavior.defaultCurrentValue': 64, 'Behavior.showTicks': true,
    'Behavior.majorTickCount': 5, 'Behavior.unit': 'Hz',
  });
  await kit.settle(500);
  led.check(W, '2. configure', 'the range, the step, the value type and the default are the ones authored — this is the state every later step has to preserve',
    { min: 0, max: 127, step: 1, valueType: 'int', defaultCurrentValue: 64 },
    { min: await kit.read(cutoff, 'Behavior.min'),
      max: await kit.read(cutoff, 'Behavior.max'),
      step: await kit.read(cutoff, 'Behavior.step'),
      valueType: await kit.read(cutoff, 'Behavior.valueType'),
      defaultCurrentValue: await kit.read(cutoff, 'Behavior.defaultCurrentValue') });

  // =============================================================================================
  // 3. BIND — point it at a device parameter.
  // =============================================================================================
  await kit.wire('mainSynth');
  await kit.set(cutoff, { 'DeviceBindings.bindings': [
    { id: 'b1', kind: 'deviceParameter', deviceRole: 'mainSynth',
      parameterId: 'filter.cutoff', port: 'value', dryRun: false },
  ] });
  await kit.settle(500);
  const binding = await kit.read(cutoff, 'DeviceBindings.bindings');
  led.check(W, '3. bind', 'the control names a device role and a parameter on it, which is the whole of what a binding is — and it sits on the control rather than in a table beside it, so it travels with the control',
    { role: 'mainSynth', parameter: 'filter.cutoff', dryRun: false },
    { role: binding?.[0]?.deviceRole, parameter: binding?.[0]?.parameterId, dryRun: binding?.[0]?.dryRun });
  led.check(W, '3. bind (the configuration survived it)',
    'and binding did not rewrite what step two authored — the range is still the one that was set, which is worth asserting because adopting a parameter CAN legitimately overwrite it, and that is a different action from this one',
    { min: 0, max: 127 },
    { min: await kit.read(cutoff, 'Behavior.min'), max: await kit.read(cutoff, 'Behavior.max') });

  // =============================================================================================
  // 4. PREVIEW — operate it, and watch the wire.
  // =============================================================================================
  await kit.preview(true);
  await kit.settle(700);
  await kit.forgetSent();
  const before = (await kit.session(cutoff))?.valueOverride ?? null;
  const box = await kit.box(cutoff);
  await kit.drag({ x: box.x + box.w * 0.15, y: box.y + box.h / 2 },
    { x: box.x + box.w * 0.9, y: box.y + box.h / 2 });
  await kit.settle(800);
  const sent = await kit.sent();
  const device = await kit.page.evaluate(async () => {
    const dv = await import('/src/CE_Application/stores/deviceParameterValues.js');
    const dp = await import('/src/CE_Application/stores/deviceProfiles.js');
    const read = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    return {
      recorded: dv.deviceParameterValue('mainSynth', 'filter.cutoff'),
      refusal: read(dp.latestMidiPreview),
      destination: read(dp.deviceRoleMappings)?.mainSynth?.midiDestination?.type ?? '',
    };
  });

  led.check(W, '4. preview (the control works)',
    'the control moves under the pointer in preview, which is the panel doing its job whatever the device end of the chain is doing',
    true, (await kit.session(cutoff))?.valueOverride !== before);
  led.check(W, '4. preview (and the value reaches the bound device parameter)',
    'the parameter the binding named now holds the value the control was dragged to — `recordDeviceParameterValue` runs only AFTER `resolveParameterSend` succeeds, so a recorded value is proof the binding resolved against the profile mapped to its role rather than being refused',
    { recorded: true, nearTheTop: true, refused: null },
    { recorded: device.recorded !== undefined, nearTheTop: Number(device.recorded) > 100,
      refused: device.refusal });
  led.check(W, '4. preview (and it reaches it as the kind of number step two asked for)',
    'the value on the wire is a WHOLE number, because step two set `valueType: int` and `step: 1` — this is the assertion that matters for step five, where the host lane cannot carry a step and does not need to: `snapRangeValue` quantises at the panel end, so what leaves for the device is already on the grid the author authored whatever resolution the value arrived at',
    true, Number.isInteger(Number(device.recorded)));
  led.check(W, '4. preview (and no bytes leave, because nothing has been pointed at a port)',
    'the role`s destination is Preview Only, which is what a panel that has not been given a MIDI output has — so the parameter resolves and records and the raw door stays shut. That is the safe default and the reason a green run here is not evidence that hardware was driven',
    { onTheRawDoor: 0, destination: 'previewOnly' },
    { onTheRawDoor: sent.length, destination: device.destination });
  await kit.preview(false);
  await kit.settle(400);

  // =============================================================================================
  // 5. EXPORT — the parameters a DAW would see.
  // =============================================================================================
  const params = await kit.page.evaluate(async () => {
    const { deriveExportParameters } = await import('/src/CE_Application/utils/exportParameters.js');
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const live = get(panels).find((p) => p.id === get(activePanelId));
    return deriveExportParameters(live);
  });
  const exported = params.find((p) => String(p?.name ?? '').includes('Cutoff'))
    ?? params.find((p) => String(p?.id ?? '').includes('Cutoff'));
  led.check(W, '5. export (the control reaches the parameter list)',
    'the configured control appears among the parameters a host would be offered, which is the only part of "export" that is about the panel rather than about a compiler',
    true, !!exported);
  led.check(W, '5. export (and it describes the control as configured)',
    'its range, its default and its unit are the ones step two authored — a parameter that reached the host describing a 0..1 unitless float would automate the wrong thing at the wrong resolution, and the unit is what the DAW writes beside the number in its automation lane',
    { min: 0, max: 127, def: 64, unit: 'Hz' },
    { min: Number(exported?.min), max: Number(exported?.max),
      def: Number(exported?.defaultValue), unit: String(exported?.unit ?? '') });
  // THE HOST VOCABULARY IS THREE WORDS, and `int` is not one of them. `PanelParameters.h` turns
  // `valueKind` into an AudioParameterChoice, an AudioParameterBool or an AudioParameterFloat, and
  // there is no fourth branch — so an int range is a float lane over its own min..max, which is the
  // honest export rather than a lossy one. The step is not thrown away, it is applied at the other
  // end: `getCurrentRangeValue` runs every incoming value through `snapRangeValue`, which rounds to
  // the step and then to an integer for `valueType: int`. Step four measured that on the wire.
  // Asserted here so that a later change of the vocabulary has to come past this row.
  led.check(W, '5. export (as one of the three kinds a host understands)',
    'a numeric control exports as `float`, the DAW-side vocabulary, with the authored range on it — bool and choice being the other two, and the int-ness living at the panel end where the value is snapped rather than in the automation lane, which has no way to carry it',
    'float', String(exported?.valueKind ?? ''));
  led.check(W, '5. export (the binding travels with it)',
    'and the parameter names the device parameter the control drives, so the host lane and the synth parameter are the same thing rather than two things that happen to move together',
    'filter.cutoff',
    String(exported?.parameterId ?? exported?.deviceParameterId ?? exported?.wire?.parameterId ?? ''));

  // =============================================================================================
  // 6. SAVE / SHARE — package it through the real command, and open it again.
  //
  // THROUGH `sharePanelToFile`, NOT `packagePanelForSharing`. That distinction cost a probe and is
  // the whole reason this step is worth writing: the two things a package must not carry are
  // stripped in `documentToShare` — one layer ABOVE the packager — so a fixture that calls the
  // packager directly measures a panel that was never stripped and never saved, and reports the
  // absence of the author's file path as a pass. It was passing for the fixture's reason. So this
  // step gives the panel both leaks first, then goes through the door the File menu goes through,
  // and reads the bytes off the bridge as the user's disk would receive them.
  // =============================================================================================
  const AUTHOR_PATH = 'C:/Users/authorname/Panels/Cutoff Rig.cepanel';
  const AUTHOR_PORT = 'UMC404HD MIDI Out (author machine)';
  await kit.page.evaluate(async ({ path, port }) => {
    // A tap on the package door, layered over the MIDI one `kit.wire()` installed in step three.
    window.__pkgOut = [];
    const backend = window.__JUCE__.backend;
    const inner = backend.emitEvent.bind(backend);
    backend.emitEvent = (name, payload) => {
      if (name === 'savePanelPackageAs') window.__pkgOut.push(payload);
      return inner(name, payload);
    };
    const { panels, activePanelId } = await import('/src/CE_Application/stores/panels.js');
    const get = (s) => { let v; s.subscribe((x) => { v = x; })(); return v; };
    const id = get(activePanelId);
    panels.update((list) => list.map((p) => {
      if (p.id !== id) return p;
      // `name` alongside `filePath`, because that is what a real save leaves behind: the panel-saved
      // handler sets both together, and the package is named from the NAME. Setting only the path
      // produces a panel no save has ever produced, and the package then comes out called
      // "Untitled 1" — the fixture's doing, not the product's.
      p.filePath = path;
      p.name = 'Cutoff Rig';
      p.deviceSession = { selectedDestinationId: port, selectedInputId: port };
      return p;
    }));
  }, { path: AUTHOR_PATH, port: AUTHOR_PORT });
  await kit.settle(300);

  const shared = await kit.page.evaluate(async () => {
    const { sharePanelToFile } = await import('/src/CE_Application/stores/panelSharingActions.js');
    const result = await sharePanelToFile();
    const emitted = (window.__pkgOut ?? [])[0] ?? null;
    return {
      ok: result?.ok === true,
      issues: result?.issues ?? [],
      fileName: String(emitted?.suggestedName ?? ''),
      text: String(emitted?.data ?? ''),
    };
  });

  led.check(W, '6. share (the panel packages cleanly, through the command the menu calls)',
    'File → Share Panel… packages the panel and hands the bridge a named file — the format validates it, which is the step a bare .cepanel cannot do, because that one holds absolute paths to its artwork and so looks perfect on the author`s disk and arrives with no pictures',
    { ok: true, issues: [], named: 'Cutoff Rig.cepanelpkg', hasBytes: true },
    { ok: shared.ok, issues: shared.issues, named: shared.fileName, hasBytes: shared.text.length > 100 });
  led.check(W, '6. share (and it does not carry the author with it)',
    'the bytes the bridge was handed contain neither the author`s file path nor the name of the MIDI hardware the panel was bound to on their machine — both were PUT on the panel a moment ago, so this is the strip being measured rather than their absence being assumed, and both are leaks nobody notices until the panel is in somebody else`s hands',
    { path: false, port: false },
    { path: shared.text.includes(AUTHOR_PATH), port: shared.text.includes(AUTHOR_PORT) });

  const reopened = await kit.page.evaluate(async (text) => {
    const { openPackageText } = await import('/src/CE_Application/stores/panelSharingActions.js');
    const panel = await openPackageText(text, 'Shared');
    const back = (panel?.controls ?? [])
      .find((c) => String(c?._children?.Core?.name ?? '') === 'Cutoff');
    return {
      opened: !!panel,
      // The new panel deliberately has NO file path: it came out of a package, so Save should ask
      // where to put it rather than writing a .cepanel next to somebody else`s package.
      filePath: panel?.filePath ?? null,
      // `_children.Core.id`, not `control.id`: a control's identity lives in its Core section, and
      // a deserialised control has no top-level `id` at all — so the obvious reader returns '' and
      // the renderer check below silently measures nothing.
      controlId: String(back?.id ?? back?._children?.Core?.id ?? ''),
      isActive: (await (async () => {
        const { activePanelId } = await import('/src/CE_Application/stores/panels.js');
        let v; activePanelId.subscribe((x) => { v = x; })();
        return v === panel?.id;
      })()),
      control: back ? {
        min: back._children?.Behavior?.min,
        max: back._children?.Behavior?.max,
        valueType: back._children?.Behavior?.valueType,
        parameterId: back._children?.DeviceBindings?.bindings?.[0]?.parameterId,
        kind: back._children?.DeviceBindings?.bindings?.[0]?.kind,
      } : null,
    };
  }, shared.text);
  await kit.settle(600);

  led.check(W, '6. reopen (the whole chain survives the round trip)',
    'opening the package gives back the control with the range from step two and the binding from step three still on it — including the binding`s `kind`, which is the field that decides whether it is acted on at all, so a round trip that dropped it would return a panel that looks wired and fires nothing. This is the end of the chain, and the only assertion that fails if ANY earlier step was written somewhere the format does not carry',
    { min: 0, max: 127, valueType: 'int', parameterId: 'filter.cutoff', kind: 'deviceParameter' },
    reopened.control);
  led.check(W, '6. reopen (and it is a new document, not the author`s file)',
    'the reopened panel carries no file path, so Save asks where to put it instead of silently writing over the .cepanel the package came from — the receiving half of the same decision the strip above makes on the way out',
    { opened: true, filePath: null }, { opened: reopened.opened, filePath: reopened.filePath });

  // The round trip landed in a real tab, so the last word goes to the renderer rather than to the
  // model: a control that deserialises correctly and does not mount is not a panel that survived.
  const backBox = reopened.controlId ? await kit.box(reopened.controlId) : null;
  led.check(W, '6. reopen (and it is on screen, not merely in the document)',
    'the package landed in its own tab, that tab is the active one, and the control out of it is mounted and laid out at the size step one gave it — measured through the real renderer, because every assertion above this one reads a document, and a document is not a panel until something draws it. The active-tab half is not decoration: it is what says the box below belongs to the REOPENED panel rather than to the original, whose controls carry the same ids and are still in the DOM`s reach',
    { inItsOwnActiveTab: true, mounted: true, width: 300, height: 70 },
    { inItsOwnActiveTab: reopened.isActive, mounted: !!backBox,
      width: Math.round(backBox?.w ?? 0), height: Math.round(backBox?.h ?? 0) });

  led.closed(W, 'the bytes themselves, once a port IS chosen',
    'what a bound control puts on the wire when the role has a real MIDI output',
    'browser-checks/releaseWorkflow.mjs for the choosing — it selects a MIDI output and input through the real toolbar and asserts the BACKEND was told (`setDeviceRoleMapping` carrying the chosen input), not merely that a dropdown changed — and behaviourOutbound.mjs for the door itself, 53 verified rows of real bytes measured on `triggerRawMidiAction`. This suite stops one step short on purpose: it proves the parameter resolved and the value landed in the device state, which is everything the PANEL is responsible for; which port those values go out of is the user`s choice and the toolbar`s job.');
  led.closed(W, 'the bind step`s own user interface',
    'the device picker, parameter adoption, MIDI in/out selection and the dry-run toggle',
    'browser-checks/releaseWorkflow.mjs, which drives the real toolbar rather than the model: it opens the device picker, clicks a parameter, and asserts that ADOPTION configures the control — min 0, max 127, default 64, valueType int, dryRun false — then selects a MIDI output and input and asserts the backend was told, not just the dropdown. That is the authoring stage this suite deliberately does not re-author, because a fixture that writes the binding by hand cannot fail the way the picker can.');
  led.unverified(W, 'the VST3 binary, and the installed application',
    'build the configured panel into a plugin and run it in a host',
    'Windows only, and not attempted here. `tools/scripts/export-panel-vst3.mjs` and `build-export-vst3.bat` do the wrapping, and the compiler is not on this machine. Everything this suite covers is upstream of that step: a green run here says the panel, its configuration, its binding, the parameters a host would be offered and the shareable package are all correct and consistent — and says nothing about the plugin. That half needs the Windows checkout, and the previous release record`s native evidence predates D-1 to D-19.');

  led.report();
  assert.deepEqual(kit.failures, [], 'page errors during the pass');
  assert.deepEqual(led.failures, [], 'defects');
  console.log('\n--- ledger ---\n' + led.markdown());
} finally {
  await kit.close();
}
