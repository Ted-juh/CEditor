// Harness entry: mounts a real SceneryGround in a real browser so the bake path — mount into a
// detached node, read innerHTML, unmount, replay as one element — is exercised for real. None of it
// runs under server rendering, which is where every other scenery test lives.
import { mount } from 'svelte';
import Harness from './Harness.svelte';
import { _sceneryBakeCacheSize } from '../src/CE_Application/editor/SceneryGround.svelte';

const app = mount(Harness, { target: document.getElementById('host') });
window.__scenery = {
  cacheSize: () => _sceneryBakeCacheSize(),
  hide: (id) => app.setHidden([id]),
  unhide: () => app.setHidden([]),
  groundIds: app.groundIds,
};
