import { $ as get_abort_signal_outside_reaction, B as async_mode_flag, C as boundary, E as fork, F as getContext, G as set_hydrate_node, H as hydrate_next, I as hasContext, J as hydration_mismatch, K as set_hydrating, L as pop, M as component_context, N as createContext, P as getAllContexts, Q as HYDRATION_ERROR, R as push, T as flushSync, U as hydrate_node, V as legacy_mode_flag, W as hydrating, X as lifecycle_double_unmount, Y as invalid_raw_snippet_render, Z as state_proxy_unmount, _ as create_text, a as set_active_reaction, at as lifecycle_outside_component, b as init_operations, c as untrack, ct as STATE_SYMBOL, dt as is_array, et as hydratable_missing_but_required, g as create_element, h as clear_text_content, i as set_active_effect, it as experimental_async_required, l as component_root, lt as array_from, m as user_effect, n as active_reaction, nt as lifecycle_legacy_only, o as settled, p as teardown, rt as rune_outside_svelte, s as tick, t as active_effect, tt as hydration_failed, ut as define_property, v as get_first_child, y as get_next_sibling, z as setContext } from "./runtime-BHv2h3MP.js";
/**
* Subset of delegated events which should be passive by default.
* These two are already passive via browser defaults on window, document and body.
* But since
* - we're delegating them
* - they happen often
* - they apply to mobile which is generally less performant
* we're marking them as passive by default for other elements, too.
*/
var PASSIVE_EVENTS = ["touchstart", "touchmove"];
/**
* Returns `true` if `name` is a passive event
* @param {string} name
*/
function is_passive_event(name) {
	return PASSIVE_EVENTS.includes(name);
}
//#endregion
//#region CE/web/node_modules/svelte/src/internal/client/dom/elements/events.js
/**
* Used on elements, as a map of event type -> event handler,
* and on events themselves to track which element handled an event
*/
var event_symbol = Symbol("events");
/** @type {Set<string>} */
var all_registered_events = /* @__PURE__ */ new Set();
/** @type {Set<(events: Array<string>) => void>} */
var root_event_handles = /* @__PURE__ */ new Set();
var last_propagated_event = null;
/**
* @this {EventTarget}
* @param {Event} event
* @returns {void}
*/
function handle_event_propagation(event) {
	var handler_element = this;
	var owner_document = handler_element.ownerDocument;
	var event_name = event.type;
	var path = event.composedPath?.() || [];
	var current_target = path[0] || event.target;
	last_propagated_event = event;
	var path_idx = 0;
	var handled_at = last_propagated_event === event && event[event_symbol];
	if (handled_at) {
		var at_idx = path.indexOf(handled_at);
		if (at_idx !== -1 && (handler_element === document || handler_element === window)) {
			event[event_symbol] = handler_element;
			return;
		}
		var handler_idx = path.indexOf(handler_element);
		if (handler_idx === -1) return;
		if (at_idx <= handler_idx) path_idx = at_idx;
	}
	current_target = path[path_idx] || event.target;
	if (current_target === handler_element) return;
	define_property(event, "currentTarget", {
		configurable: true,
		get() {
			return current_target || owner_document;
		}
	});
	var previous_reaction = active_reaction;
	var previous_effect = active_effect;
	set_active_reaction(null);
	set_active_effect(null);
	try {
		/**
		* @type {unknown}
		*/
		var throw_error;
		/**
		* @type {unknown[]}
		*/
		var other_errors = [];
		while (current_target !== null) {
			if (current_target === handler_element) break;
			try {
				var delegated = current_target[event_symbol]?.[event_name];
				if (delegated != null && (!current_target.disabled || event.target === current_target)) delegated.call(current_target, event);
			} catch (error) {
				if (throw_error) other_errors.push(error);
				else throw_error = error;
			}
			if (event.cancelBubble) break;
			path_idx++;
			current_target = path_idx < path.length ? path[path_idx] : null;
		}
		if (throw_error) {
			for (let error of other_errors) queueMicrotask(() => {
				throw error;
			});
			throw throw_error;
		}
	} finally {
		event[event_symbol] = handler_element;
		delete event.currentTarget;
		set_active_reaction(previous_reaction);
		set_active_effect(previous_effect);
	}
}
//#endregion
//#region CE/web/node_modules/svelte/src/internal/client/dom/reconciler.js
var policy = globalThis?.window?.trustedTypes && /* @__PURE__ */ globalThis.window.trustedTypes.createPolicy("svelte-trusted-html", { 
/** @param {string} html */
createHTML: (html) => {
	return html;
} });
/** @param {string} html */
function create_trusted_html(html) {
	return policy?.createHTML(html) ?? html;
}
/**
* @param {string} html
*/
function create_fragment_from_html(html) {
	var elem = create_element("template");
	elem.innerHTML = create_trusted_html(html.replaceAll("<!>", "<!---->"));
	return elem.content;
}
//#endregion
//#region CE/web/node_modules/svelte/src/internal/client/dom/template.js
/** @import { Effect, EffectNodes, TemplateNode } from '#client' */
/** @import { TemplateStructure } from './types' */
/**
* @param {TemplateNode} start
* @param {TemplateNode | null} end
*/
function assign_nodes(start, end) {
	var effect = active_effect;
	if (effect.nodes === null) effect.nodes = {
		start,
		end,
		a: null,
		t: null
	};
}
/**
* Mounts a component to the given target and returns the exports and potentially the props (if compiled with `accessors: true`) of the component.
* Transitions will play during the initial render unless the `intro` option is set to `false`.
*
* @template {Record<string, any>} Props
* @template {Record<string, any>} Exports
* @param {ComponentType<SvelteComponent<Props>> | Component<Props, Exports, any>} component
* @param {MountOptions<Props>} options
* @returns {Exports}
*/
function mount(component, options) {
	return _mount(component, options);
}
/**
* Hydrates a component on the given target and returns the exports and potentially the props (if compiled with `accessors: true`) of the component
*
* @template {Record<string, any>} Props
* @template {Record<string, any>} Exports
* @param {ComponentType<SvelteComponent<Props>> | Component<Props, Exports, any>} component
* @param {{} extends Props ? {
* 		target: Document | Element | ShadowRoot;
* 		props?: Props;
* 		events?: Record<string, (e: any) => any>;
*  	context?: Map<any, any>;
* 		intro?: boolean;
* 		recover?: boolean;
*		transformError?: (error: unknown) => unknown;
* 	} : {
* 		target: Document | Element | ShadowRoot;
* 		props: Props;
* 		events?: Record<string, (e: any) => any>;
*  	context?: Map<any, any>;
* 		intro?: boolean;
* 		recover?: boolean;
*		transformError?: (error: unknown) => unknown;
* 	}} options
* @returns {Exports}
*/
function hydrate(component, options) {
	init_operations();
	options.intro = options.intro ?? false;
	const target = options.target;
	const was_hydrating = hydrating;
	const previous_hydrate_node = hydrate_node;
	try {
		var anchor = /* @__PURE__ */ get_first_child(target);
		while (anchor && (anchor.nodeType !== 8 || anchor.data !== "[")) anchor = /* @__PURE__ */ get_next_sibling(anchor);
		if (!anchor) throw HYDRATION_ERROR;
		set_hydrating(true);
		set_hydrate_node(anchor);
		const instance = _mount(component, {
			...options,
			anchor
		});
		set_hydrating(false);
		return instance;
	} catch (error) {
		if (error instanceof Error && error.message.split("\n").some((line) => line.startsWith("https://svelte.dev/e/"))) throw error;
		if (error !== HYDRATION_ERROR) console.warn("Failed to hydrate: ", error);
		if (options.recover === false) hydration_failed();
		init_operations();
		clear_text_content(target);
		set_hydrating(false);
		return mount(component, options);
	} finally {
		set_hydrating(was_hydrating);
		set_hydrate_node(previous_hydrate_node);
	}
}
/** @type {Map<EventTarget, Map<string, number>>} */
var listeners = /* @__PURE__ */ new Map();
/**
* @template {Record<string, any>} Exports
* @param {ComponentType<SvelteComponent<any>> | Component<any>} Component
* @param {MountOptions} options
* @returns {Exports}
*/
function _mount(Component, { target, anchor, props = {}, events, context, intro = true, transformError }) {
	init_operations();
	/** @type {Exports} */
	var component = void 0;
	var unmount = component_root(() => {
		var anchor_node = anchor ?? target.appendChild(create_text());
		boundary(anchor_node, { pending: () => {} }, (anchor_node) => {
			push({});
			var ctx = component_context;
			if (context) ctx.c = context;
			if (events)
 /** @type {any} */ props.$$events = events;
			if (hydrating) assign_nodes(anchor_node, null);
			component = Component(anchor_node, props) || {};
			if (hydrating) {
				/** @type {Effect & { nodes: EffectNodes }} */ active_effect.nodes.end = hydrate_node;
				if (hydrate_node === null || hydrate_node.nodeType !== 8 || hydrate_node.data !== "]") {
					hydration_mismatch();
					throw HYDRATION_ERROR;
				}
			}
			pop();
		}, transformError);
		/** @type {Set<string>} */
		var registered_events = /* @__PURE__ */ new Set();
		/** @param {Array<string>} events */
		var event_handle = (events) => {
			for (var i = 0; i < events.length; i++) {
				var event_name = events[i];
				if (registered_events.has(event_name)) continue;
				registered_events.add(event_name);
				var passive = is_passive_event(event_name);
				for (const node of [target, document]) {
					var counts = listeners.get(node);
					if (counts === void 0) {
						counts = /* @__PURE__ */ new Map();
						listeners.set(node, counts);
					}
					var count = counts.get(event_name);
					if (count === void 0) {
						node.addEventListener(event_name, handle_event_propagation, { passive });
						counts.set(event_name, 1);
					} else counts.set(event_name, count + 1);
				}
			}
		};
		event_handle(array_from(all_registered_events));
		root_event_handles.add(event_handle);
		return () => {
			for (var event_name of registered_events) for (const node of [target, document]) {
				var counts = listeners.get(node);
				var count = counts.get(event_name);
				if (--count == 0) {
					node.removeEventListener(event_name, handle_event_propagation);
					counts.delete(event_name);
					if (counts.size === 0) listeners.delete(node);
				} else counts.set(event_name, count);
			}
			root_event_handles.delete(event_handle);
			if (anchor_node !== anchor) anchor_node.parentNode?.removeChild(anchor_node);
		};
	});
	mounted_components.set(component, unmount);
	return component;
}
/**
* References of the components that were mounted or hydrated.
* Uses a `WeakMap` to avoid memory leaks.
*/
var mounted_components = /* @__PURE__ */ new WeakMap();
/**
* Unmounts a component that was previously mounted using `mount` or `hydrate`.
*
* Since 5.13.0, if `options.outro` is `true`, [transitions](https://svelte.dev/docs/svelte/transition) will play before the component is removed from the DOM.
*
* Returns a `Promise` that resolves after transitions have completed if `options.outro` is true, or immediately otherwise (prior to 5.13.0, returns `void`).
*
* ```js
* import { mount, unmount } from 'svelte';
* import App from './App.svelte';
*
* const app = mount(App, { target: document.body });
*
* // later...
* unmount(app, { outro: true });
* ```
* @param {Record<string, any>} component
* @param {{ outro?: boolean }} [options]
* @returns {Promise<void>}
*/
function unmount(component, options) {
	const fn = mounted_components.get(component);
	if (fn) {
		mounted_components.delete(component);
		return fn(options);
	}
	if (STATE_SYMBOL in component) state_proxy_unmount();
	else lifecycle_double_unmount();
	return Promise.resolve();
}
//#endregion
//#region CE/web/node_modules/svelte/src/internal/client/dom/blocks/snippet.js
/** @import { Snippet } from 'svelte' */
/** @import { TemplateNode } from '#client' */
/** @import { Getters } from '#shared' */
/**
* Create a snippet programmatically
* @template {unknown[]} Params
* @param {(...params: Getters<Params>) => {
*   render: () => string
*   setup?: (element: Element) => void | (() => void)
* }} fn
* @returns {Snippet<Params>}
*/
function createRawSnippet(fn) {
	return (anchor, ...params) => {
		var snippet = fn(...params);
		/** @type {Element} */
		var element;
		if (hydrating) {
			element = hydrate_node;
			hydrate_next();
		} else {
			var fragment = create_fragment_from_html(snippet.render().trim());
			element = /* @__PURE__ */ get_first_child(fragment);
			if (/* @__PURE__ */ get_next_sibling(element) !== null || element.nodeType !== 1) invalid_raw_snippet_render();
			anchor.before(element);
		}
		const result = snippet.setup?.(element);
		assign_nodes(element, element);
		if (typeof result === "function") teardown(result);
	};
}
if (typeof HTMLElement === "function");
//#endregion
//#region CE/web/node_modules/svelte/src/internal/client/hydratable.js
/**
* @template T
* @param {string} key
* @param {() => T} fn
* @returns {T}
*/
function hydratable(key, fn) {
	if (!async_mode_flag) experimental_async_required("hydratable");
	if (hydrating) {
		const store = window.__svelte?.h;
		if (store?.has(key)) return store.get(key);
		hydratable_missing_but_required(key);
	}
	return fn();
}
{
	/**
	* @param {string} rune
	*/
	function throw_rune_error(rune) {
		if (!(rune in globalThis)) {
			/** @type {any} */
			let value;
			Object.defineProperty(globalThis, rune, {
				configurable: true,
				get: () => {
					if (value !== void 0) return value;
					rune_outside_svelte(rune);
				},
				set: (v) => {
					value = v;
				}
			});
		}
	}
	throw_rune_error("$state");
	throw_rune_error("$effect");
	throw_rune_error("$derived");
	throw_rune_error("$inspect");
	throw_rune_error("$props");
	throw_rune_error("$bindable");
}
/**
* Returns an [`AbortSignal`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal) that aborts when the current [derived](https://svelte.dev/docs/svelte/$derived) or [effect](https://svelte.dev/docs/svelte/$effect) re-runs or is destroyed.
*
* Must be called while a derived or effect is running.
*
* ```svelte
* <script>
* 	import { getAbortSignal } from 'svelte';
*
* 	let { id } = $props();
*
* 	async function getData(id) {
* 		const response = await fetch(`/items/${id}`, {
* 			signal: getAbortSignal()
* 		});
*
* 		return await response.json();
* 	}
*
* 	const data = $derived(await getData(id));
* <\/script>
* ```
*/
function getAbortSignal() {
	if (active_reaction === null) get_abort_signal_outside_reaction();
	return (active_reaction.ac ??= new AbortController()).signal;
}
/**
* `onMount`, like [`$effect`](https://svelte.dev/docs/svelte/$effect), schedules a function to run as soon as the component has been mounted to the DOM.
* Unlike `$effect`, the provided function only runs once.
*
* It must be called during the component's initialisation (but doesn't need to live _inside_ the component;
* it can be called from an external module). If a function is returned _synchronously_ from `onMount`,
* it will be called when the component is unmounted.
*
* `onMount` functions do not run during [server-side rendering](https://svelte.dev/docs/svelte/svelte-server#render).
*
* @template T
* @param {() => NotFunction<T> | Promise<NotFunction<T>> | (() => any)} fn
* @returns {void}
*/
function onMount(fn) {
	if (component_context === null) lifecycle_outside_component("onMount");
	if (legacy_mode_flag && component_context.l !== null) init_update_callbacks(component_context).m.push(fn);
	else user_effect(() => {
		const cleanup = untrack(fn);
		if (typeof cleanup === "function") return cleanup;
	});
}
/**
* Schedules a callback to run immediately before the component is unmounted.
*
* Out of `onMount`, `beforeUpdate`, `afterUpdate` and `onDestroy`, this is the
* only one that runs inside a server-side component.
*
* @param {() => any} fn
* @returns {void}
*/
function onDestroy(fn) {
	if (component_context === null) lifecycle_outside_component("onDestroy");
	onMount(() => () => untrack(fn));
}
/**
* @template [T=any]
* @param {string} type
* @param {T} [detail]
* @param {any}params_0
* @returns {CustomEvent<T>}
*/
function create_custom_event(type, detail, { bubbles = false, cancelable = false } = {}) {
	return new CustomEvent(type, {
		detail,
		bubbles,
		cancelable
	});
}
/**
* Creates an event dispatcher that can be used to dispatch [component events](https://svelte.dev/docs/svelte/legacy-on#Component-events).
* Event dispatchers are functions that can take two arguments: `name` and `detail`.
*
* Component events created with `createEventDispatcher` create a
* [CustomEvent](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent).
* These events do not [bubble](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Events#Event_bubbling_and_capture).
* The `detail` argument corresponds to the [CustomEvent.detail](https://developer.mozilla.org/en-US/docs/Web/API/CustomEvent/detail)
* property and can contain any type of data.
*
* The event dispatcher can be typed to narrow the allowed event names and the type of the `detail` argument:
* ```ts
* const dispatch = createEventDispatcher<{
*  loaded: null; // does not take a detail argument
*  change: string; // takes a detail argument of type string, which is required
*  optional: number | null; // takes an optional detail argument of type number
* }>();
* ```
*
* @deprecated Use callback props and/or the `$host()` rune instead — see [migration guide](https://svelte.dev/docs/svelte/v5-migration-guide#Event-changes-Component-events)
* @template {Record<string, any>} [EventMap = any]
* @returns {EventDispatcher<EventMap>}
*/
function createEventDispatcher() {
	const active_component_context = component_context;
	if (active_component_context === null) lifecycle_outside_component("createEventDispatcher");
	/**
	* @param [detail]
	* @param [options]
	*/
	return (type, detail, options) => {
		const events = active_component_context.s.$$events?.[type];
		if (events) {
			const callbacks = is_array(events) ? events.slice() : [events];
			const event = create_custom_event(type, detail, options);
			for (const fn of callbacks) fn.call(active_component_context.x, event);
			return !event.defaultPrevented;
		}
		return true;
	};
}
/**
* Schedules a callback to run immediately before the component is updated after any state change.
*
* The first time the callback runs will be before the initial `onMount`.
*
* In runes mode use `$effect.pre` instead.
*
* @deprecated Use [`$effect.pre`](https://svelte.dev/docs/svelte/$effect#$effect.pre) instead
* @param {() => void} fn
* @returns {void}
*/
function beforeUpdate(fn) {
	if (component_context === null) lifecycle_outside_component("beforeUpdate");
	if (component_context.l === null) lifecycle_legacy_only("beforeUpdate");
	init_update_callbacks(component_context).b.push(fn);
}
/**
* Schedules a callback to run immediately after the component has been updated.
*
* The first time the callback runs will be after the initial `onMount`.
*
* In runes mode use `$effect` instead.
*
* @deprecated Use [`$effect`](https://svelte.dev/docs/svelte/$effect) instead
* @param {() => void} fn
* @returns {void}
*/
function afterUpdate(fn) {
	if (component_context === null) lifecycle_outside_component("afterUpdate");
	if (component_context.l === null) lifecycle_legacy_only("afterUpdate");
	init_update_callbacks(component_context).a.push(fn);
}
/**
* Legacy-mode: Init callbacks object for onMount/beforeUpdate/afterUpdate
* @param {ComponentContext} context
*/
function init_update_callbacks(context) {
	var l = context.l;
	return l.u ??= {
		a: [],
		b: [],
		m: []
	};
}
//#endregion
export { afterUpdate, beforeUpdate, createContext, createEventDispatcher, createRawSnippet, flushSync, fork, getAbortSignal, getAllContexts, getContext, hasContext, hydratable, hydrate, mount, onDestroy, onMount, setContext, settled, tick, unmount, untrack };
