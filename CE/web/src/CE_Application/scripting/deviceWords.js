// deviceWords.js — what the runtime says of a device parameter id the profile does not have, in one
// place, so the Values tab's rows (scriptValueKinds.js) say it in the runtime's words and the
// runtime (panelRuntime.js) is not loaded to say them.
//
// write's words are the plug-in's too: CE/src/Player/PluginProcessor.h says them from its
// deviceWrite, and test/deviceParameterTable.test.js holds the two to the same text.

/** ce.device.write of an id the profile's whole table does not have: refused, nothing sent. */
export function deviceWriteUnknownWords(id, role) {
  return `ce.device.write: "${id}" is not a parameter of the ${role} profile, so nothing was sent.`;
}

/** ce.device.bind of such an id: said, and bound anyway, since the parameter may still arrive. */
export function deviceBindUnknownWords(control, id) {
  return `bind("${control}", "${id}"): neither the profile nor this panel's declarations know "${id}" yet. `
    + 'The binding is made anyway — it works if the parameter arrives — but check the id if the control stays dead.';
}
