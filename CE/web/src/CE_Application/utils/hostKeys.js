/**
 * hostKeys.js — the keys an exported plug-in's page does not use, handed to the DAW.
 *
 * In a DAW on Windows the plug-in's window is a webview, and while it has keyboard focus every key
 * goes to the page: Space does not start the transport and the host's shortcuts are dead until the
 * user clicks outside the plug-in (docs/known-issues.md). JUCE hands a key its own components do not
 * use to the host's window; a key inside the webview never reaches that code. So the page says which
 * keys it did not use, and PlayerHost posts each one to the host's window as that key.
 *
 * "Did not use" is decided after every other handler has had the key: the decision is a listener
 * added to the window while the key is on its way in (the capture phase), which puts it at the end
 * of the window's own listeners on the way out. A handler that used the key (it called
 * preventDefault, as the panel's panic key does, or stopped the key going further, as the
 * combobox's search box does) keeps it. So does anything a person is typing into, Tab (moving the
 * focus around the page), a key held for a menu or a list the page has open, and a bare modifier,
 * which the host reads from the keyboard itself. Everything else, Space and Enter included, goes to
 * the host, and the page does nothing with it: no scrolling, no button pressed by Space, no reload by
 * F5. A key-up goes after the key-down it belongs to, and only then.
 *
 * Except Space and Enter on a control that a click gave the focus. The panel presses the focused
 * control on either, which is right for someone moving through it with Tab and wrong for someone who
 * has just turned a knob with the mouse and presses Space to hear it: every focusable control takes
 * the focus when clicked. So once the focus came from a click, those two are the host's before any
 * control sees them, unless the page keeps them anyway (`pageKeeps`: a panic key bound to one).
 * Tab hands them back to the controls. The arrows on a clicked knob still turn it.
 *
 * Only where it does something: PlayerHost tells the page in window.__CE_PLAYER_SESSION__.hostKeys,
 * which it sets for a plug-in on Windows. Elsewhere (the CEditor Player app, Linux, where a host
 * already gets the keys the view leaves, the editor) the page keeps every key, as it always did.
 */
import { isTextEntryTarget } from './textEntry.js';

/** The keys that press the focused control. */
const ACTIVATION_KEYS = new Set([' ', 'Enter']);

/** Keys that only modify another, or lock. The host reads their state from the keyboard. */
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Hyper', 'Super',
  'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Symbol', 'SymbolLock']);

/** Roles whose element drives itself from the keyboard while it is open or focused. */
const KEYBOARD_ROLES = new Set(['menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'listbox', 'option',
  'combobox', 'textbox', 'searchbox', 'spinbutton', 'grid', 'tree', 'treeitem']);

function inKeyboardWidget(target) {
  for (let node = target; node && node.nodeType === 1; node = node.parentElement) {
    const role = node.getAttribute?.('role');
    if (role && KEYBOARD_ROLES.has(role)) return true;
  }
  return false;
}

/**
 * Whether a key-down is the host's: one nothing on the page used, pressed outside anything being
 * typed into. `event` needs only what a KeyboardEvent has.
 */
export function keyIsForTheHost(event) {
  if (!event || event.defaultPrevented) return false;
  if (event.isComposing || event.keyCode === 229) return false;   // an input method is composing
  const key = String(event.key ?? '');
  if (!key || MODIFIERS.has(key) || key === 'Tab' || key === 'Unidentified' || key === 'Dead') return false;
  const target = event.target;
  if (isTextEntryTarget(target) || inKeyboardWidget(target)) return false;
  return true;
}

/** What PlayerHost is told for a key: enough to make the Windows key message from. */
export function hostKeyPayload(event, type) {
  return {
    type,
    keyCode: Number(event.keyCode) || 0,
    code: String(event.code ?? ''),
    key: String(event.key ?? ''),
    repeat: event.repeat === true,
    ctrl: event.ctrlKey === true,
    shift: event.shiftKey === true,
    alt: event.altKey === true,
    meta: event.metaKey === true,
  };
}

/**
 * Listen on `target` (the page's window) and send each key the host should have to `send(payload)`,
 * while `enabled()` says so. `pageKeeps(event)` names a key the page keeps even where it would
 * otherwise be taken before the page sees it. Returns the function that stops it.
 */
export function installHostKeyForwarding({ target = window, enabled, send, pageKeeps = () => false }) {
  const handedOver = new Set();   // codes whose key-down went to the host, so their key-up does too
  const takenEarly = new Set();   // ...and of those, the ones no control saw
  const tails = { keydown: null, keyup: null };
  let focusByClick = false;       // the focus came from a click, not from Tab

  // Space or Enter with a clicked control focused, or the key-up of one taken so: the host's, before
  // any handler on the page sees it.
  const takeEarly = (event) => {
    if (event.type === 'keyup') {
      if (!takenEarly.has(event.code)) return false;
      takenEarly.delete(event.code);
      handedOver.delete(event.code);
    } else {
      if (!focusByClick || !ACTIVATION_KEYS.has(event.key) || !enabled()) return false;
      if (pageKeeps(event) || !keyIsForTheHost(event)) return false;
      takenEarly.add(event.code);
      handedOver.add(event.code);
    }
    event.preventDefault();
    event.stopPropagation();
    send(hostKeyPayload(event, event.type === 'keydown' ? 'down' : 'up'));
    return true;
  };

  const decide = (event) => {
    if (!enabled()) return;
    if (event.type === 'keydown') {
      if (!keyIsForTheHost(event)) return;
      handedOver.add(event.code);
      event.preventDefault();
      send(hostKeyPayload(event, 'down'));
    } else if (handedOver.has(event.code)) {
      handedOver.delete(event.code);
      event.preventDefault();
      send(hostKeyPayload(event, 'up'));
    }
  };

  // On the way in, put the decision at the end of the way out. A listener added to the window while
  // the key passes it inbound runs after every listener already there when the key comes back out,
  // whatever order the page's own handlers were registered in. One that stopped the key never sees
  // it come back out, and is removed with the next key.
  const onCapture = (event) => {
    if (event.type === 'keydown' && event.key === 'Tab') focusByClick = false;
    if (takeEarly(event)) return;
    const type = event.type;
    if (tails[type]) target.removeEventListener(type, tails[type]);
    const tail = (outbound) => {
      target.removeEventListener(type, tail);
      if (tails[type] === tail) tails[type] = null;
      if (outbound === event) decide(outbound);
    };
    tails[type] = tail;
    target.addEventListener(type, tail);
  };
  const forget = () => { handedOver.clear(); takenEarly.clear(); };
  const onPointerDown = () => { focusByClick = true; };

  target.addEventListener('keydown', onCapture, true);
  target.addEventListener('keyup', onCapture, true);
  target.addEventListener('pointerdown', onPointerDown, true);
  target.addEventListener('blur', forget);
  return () => {
    target.removeEventListener('keydown', onCapture, true);
    target.removeEventListener('keyup', onCapture, true);
    target.removeEventListener('pointerdown', onPointerDown, true);
    target.removeEventListener('blur', forget);
    for (const type of ['keydown', 'keyup']) if (tails[type]) target.removeEventListener(type, tails[type]);
    forget();
  };
}
