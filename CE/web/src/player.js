import { mount } from 'svelte';
import Player from './Player.svelte';

const app = mount(Player, {
  target: document.getElementById('app'),
});

export default app;
