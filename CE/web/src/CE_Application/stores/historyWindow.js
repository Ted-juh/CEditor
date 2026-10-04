// historyWindow.js — whether the History window (layout/HistoryWindow.svelte) is showing.
import { writable } from 'svelte/store';

export const historyWindowOpen = writable(false);

export function openHistoryWindow() { historyWindowOpen.set(true); }
export function closeHistoryWindow() { historyWindowOpen.set(false); }
