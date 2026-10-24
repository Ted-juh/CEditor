// deviceParameterTable.js — every parameter a profile has, loaded whole, for the readers that must
// know whether an id is one of them.
//
// profileParameters is not that list. It is the Device Profile Designer's page: the host lists
// parameters 160 at a time by default and 500 at most (DeviceProfileService::listProfileParameters),
// and the Designer's search replaces the page with what matches. So a profile with more parameters
// than a page, or one searched in the Designer, left a list that looked whole and was not, and the
// readers that asked "is this id in the profile?" of it answered no for a parameter that was there:
// a send was refused as "not in profile", ce.device.parameter() answered nothing, bind() said the
// id was unknown.
//
// This asks for the table itself, page after page with no filter, under request ids of its own, and
// keeps it apart from the Designer's page, which it never touches. Until the last page is in, there
// is no table: the readers say the table is not loaded rather than answer from part of it.

import { writable, get } from 'svelte/store';
import { listProfileParameters } from '../bridge/bridge.js';

const REQUEST = 'parameter-table:';
// The host's ceiling for one page: asking for more gets 500.
const PAGE = 500;

/** { [profileId]: { parameters: [...], complete: boolean, loading: boolean, role } } */
export const profileParameterTables = writable({});

let send = listProfileParameters;
// deviceProfileSession.js hands over its initDeviceProfileBridge, so a table asked for before anything
// else used the device bridge still has the listener its pages come back to. Handed over rather than
// imported: that module imports this one.
let ensureBridge = () => {};
export function setParameterTableBridge(init) { ensureBridge = typeof init === 'function' ? init : () => {}; }
/** Tests stand in for the bridge: `fn(payload)` gets each request the table would make. */
export function setParameterTableRequesterForTest(fn) { send = fn ?? listProfileParameters; }

/** The whole table for a profile, or null while it is not all in (or was never asked for). */
export function parameterTable(profileId) {
  const entry = get(profileParameterTables)[String(profileId ?? '')];
  return entry?.complete ? entry.parameters : null;
}

/** Ask for a profile's whole table, unless it is in or on its way. */
export function requestParameterTable(profileId, deviceRole = 'mainSynth') {
  const id = String(profileId ?? '');
  if (!id) return;
  const entry = get(profileParameterTables)[id];
  if (entry?.complete || entry?.loading) return;
  ensureBridge();
  profileParameterTables.update((tables) => ({ ...tables, [id]: { parameters: [], complete: false, loading: true, role: deviceRole } }));
  requestPage(id, deviceRole, 0);
}

function requestPage(profileId, deviceRole, offset) {
  send({ requestId: `${REQUEST}${profileId}:${offset}`, profileId, deviceRole, offset, limit: PAGE });
}

/** Whether a listing is one of this table's pages, which the Designer's page must not take. */
export function isParameterTablePage(payload) {
  return String(payload?.requestId ?? '').startsWith(REQUEST);
}

/**
 * Take one page: add it, ask for the next while there is one, and mark the table whole after the
 * last. A page that does not follow the one before (a profile reloaded meanwhile) or an error starts
 * nothing new and leaves no table, so the next reader asks again.
 */
export function acceptParameterTablePage(payload) {
  const requested = String(payload?.requestId ?? '').slice(REQUEST.length);
  const cut = requested.lastIndexOf(':');
  const profileId = requested.slice(0, cut);
  const offset = Number(requested.slice(cut + 1));
  const entry = get(profileParameterTables)[profileId];
  if (!entry?.loading) return;
  const parameters = Array.isArray(payload?.parameters) ? payload.parameters : [];
  if (payload?.ok !== true || offset !== entry.parameters.length) {
    forgetParameterTable(profileId);
    return;
  }
  // More promised and nothing given would never end; it is a table that cannot be had now.
  if (payload.hasMore === true && parameters.length === 0) {
    forgetParameterTable(profileId);
    return;
  }
  const all = [...entry.parameters, ...parameters];
  const more = payload.hasMore === true;
  profileParameterTables.update((tables) => ({
    ...tables,
    [profileId]: { ...entry, parameters: all, complete: !more, loading: more },
  }));
  if (more) requestPage(profileId, entry.role, all.length);
}

/** Drop a profile's table, so the next reader loads it again: its source changed. */
export function forgetParameterTable(profileId) {
  const id = String(profileId ?? '');
  profileParameterTables.update((tables) => {
    if (!(id in tables)) return tables;
    const { [id]: _gone, ...rest } = tables;
    return rest;
  });
}
