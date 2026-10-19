// unknownCalls.js — a call written ce.<module>.<name> that the module does not have. It fails the
// moment it runs, in every language (a nil call in Lua, a TypeError in JavaScript, an
// AttributeError in Python), and nothing said so before it did: ce.panel.on looked like on() to
// the editor's own check, and Python's ce.midi.send_note like nothing at all. The editor's check
// (scriptValidate.js) and the Values tab (scriptValues.js) both ask here, with what was meant.
//
// Only a module the contract has is asked about, by its two-part name: every member the WebView
// runtime defines under one is in its map (scriptValues.test.js holds that), so a call it has is
// never named. ce.components.<family>.<verb> and the top-level ce.has and ce.version are not asked.

import { allModules, memberMapFor } from './panelApi.js';
import { closest } from './closestWord.js';

const TWO_PART = /^ce\.([A-Za-z_]\w*)$/;

/**
 * `callee` (dotted, spaces aside: "ce.panel.on") when its module does not have the name:
 * { moduleId, name, suggestion }, where `suggestion` is the call probably meant or ''. Null for a
 * call the module has, and for anything that is not ce.<module>.<name> under a module of the
 * contract.
 */
export function unknownModuleCall(callee) {
  const m = /^ce\.([A-Za-z_]\w*)\.([A-Za-z_$][\w$]*)$/.exec(String(callee ?? '').replace(/\s+/g, ''));
  if (!m) return null;
  const moduleId = `ce.${m[1]}`;
  const name = m[2];
  const modules = allModules().filter((x) => TWO_PART.test(x.id));
  if (!modules.some((x) => x.id === moduleId)) return null;
  const own = Object.keys(memberMapFor(moduleId));
  if (own.includes(name)) return null;
  // What was meant: the camelCase of a snake_case name (Python's send_note), the same name in the
  // module that has it (ce.panel.on is ce.core.on), else the nearest spelling in this module.
  const camel = name.replace(/_+([A-Za-z0-9])/g, (_, c) => c.toUpperCase());
  let suggestion = '';
  if (camel !== name && own.includes(camel)) suggestion = `${moduleId}.${camel}`;
  else {
    const elsewhere = modules.find((x) => x.id !== moduleId && Object.hasOwn(memberMapFor(x.id), camel));
    if (elsewhere) suggestion = `${elsewhere.id}.${camel}`;
    else {
      const near = closest(camel, own);
      if (near) suggestion = `${moduleId}.${near}`;
    }
  }
  return { moduleId, name, suggestion };
}

/** What is said of one: "ce.panel.on is not a call ce.panel has, … Did you mean ce.core.on?" */
export function unknownModuleCallMessage(callee, found) {
  return `${callee} is not a call ${found.moduleId} has, so the script stops with an error here when it runs.`
    + (found.suggestion ? ` Did you mean ${found.suggestion}?` : '');
}
