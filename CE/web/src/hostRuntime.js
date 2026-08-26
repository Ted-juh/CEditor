// hostRuntime.js — entry point for the GENERATED product's interface (VIP-successor Stage 1).
//
// The standalone target and the outer VST3's editor both load host.html from their embedded
// web bundle and land here. The page is the Instrument Host workspace and nothing else — the
// generated product carries the runtime views the Host Project enables, never CEditor's
// authoring editors (the baseline's product boundary).
import { mount } from 'svelte';
import HostRuntime from './HostRuntime.svelte';

mount(HostRuntime, { target: document.getElementById('app') });
