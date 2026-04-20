/**
 * Script identifier validation for panel Script IDs.
 * Returns { level, msg } where level is a stoplight:
 *   'red'    — blocks save (empty, bad chars, duplicate)
 *   'yellow' — warning, allowed (non-camelCase convention)
 *   'green'  — valid
 *
 * `existingPanels` is the full panel list used to detect duplicates; `selfId`
 * is the panel being edited so it doesn't count itself as a duplicate.
 */
export function validateScriptId(value, existingPanels, selfId) {
  if (!value) return { level: 'red', msg: 'ID cannot be empty' };
  if (!/^[a-zA-Z_]/.test(value)) return { level: 'red', msg: 'Must start with a letter or underscore' };
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) return { level: 'red', msg: 'Only letters, numbers and underscores allowed' };
  const duplicate = existingPanels.find(p => p.id !== selfId && p.scriptId === value);
  if (duplicate) return { level: 'red', msg: `ID "${value}" is already used by "${duplicate.name}"` };
  if (/^[A-Z]/.test(value)) return { level: 'yellow', msg: 'Convention: start with lowercase (camelCase or snake_case)' };
  return { level: 'green', msg: 'Valid identifier' };
}
