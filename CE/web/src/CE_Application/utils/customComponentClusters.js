// Interact cluster derivation (restructure Stage C1).
//
// A "cluster" is the unit Make Interactive creates: a value channel plus the
// behavior(s) that drive it and the hit zone(s) that feed those behaviors.
// The Interact tab edits clusters instead of three flat lists; membership in
// the cluster IS the wiring, so the magic-string references stay in the data
// but leave the common editing path.
//
// Pure module — operates on the control tree, no Svelte imports.

function children(control, section) {
  return control?._children?.[section]?._children ?? {};
}

function behaviorChannels(behavior) {
  const names = [];
  const primary = String(behavior?.valueChannel ?? '').trim();
  if (primary) names.push(primary);
  for (const name of Array.isArray(behavior?.valueChannels) ? behavior.valueChannels : []) {
    const clean = String(name ?? '').trim();
    if (clean && !names.includes(clean)) names.push(clean);
  }
  return names;
}

/**
 * Derive interact clusters plus orphan buckets.
 *
 * options.hitZones — override the zone map (e.g. the materialized snapshot's
 * zones so generated zones appear inside their cluster). Defaults to the
 * authored HitZones.
 *
 * Returns { clusters, orphans } where each cluster is:
 *   { id, kind: 'channel'|'behavior', label, channels: [name],
 *     behaviors: [name], zones: [{ name, generated, shared }] }
 * and orphans is { channels: [name], behaviors: [name], zones: [name] }.
 */
export function deriveInteractClusters(control, options = {}) {
  const channelMap = children(control, 'ValueChannels');
  const behaviorMap = children(control, 'Behaviors');
  const zoneMap = options.hitZones ?? children(control, 'HitZones');

  const clusters = [];
  const clusterByBehavior = new Map();
  const clusterByChannel = new Map();
  const orphanBehaviors = [];

  for (const [name, behavior] of Object.entries(behaviorMap)) {
    const linked = behaviorChannels(behavior).filter((channel) => channelMap[channel]);
    if (linked.length === 0) {
      orphanBehaviors.push(name);
      continue;
    }
    if (linked.length > 1) {
      // Multi-channel behavior (XY pad, range pair carrier): one cluster
      // keyed on the behavior itself.
      const cluster = {
        id: `behavior:${name}`,
        kind: 'behavior',
        label: name,
        channels: linked,
        behaviors: [name],
        zones: [],
      };
      clusters.push(cluster);
      clusterByBehavior.set(name, cluster);
      continue;
    }
    const channel = linked[0];
    let cluster = clusterByChannel.get(channel);
    if (!cluster) {
      cluster = {
        id: `channel:${channel}`,
        kind: 'channel',
        label: channel,
        channels: [channel],
        behaviors: [],
        zones: [],
      };
      clusters.push(cluster);
      clusterByChannel.set(channel, cluster);
    }
    cluster.behaviors.push(name);
    clusterByBehavior.set(name, cluster);
  }

  // Channels with no behavior are orphans (still real data — e.g. output-only
  // channels driven by bindings; the Interact tab lists them separately).
  const orphanChannels = Object.keys(channelMap).filter((channel) => {
    if (clusterByChannel.has(channel)) return false;
    return ![...clusterByBehavior.values()].some((cluster) => cluster.channels.includes(channel));
  });

  const orphanZones = [];
  for (const [name, zone] of Object.entries(zoneMap)) {
    const generated = zone?.generated === true;
    const targets = new Set();
    const targetBehavior = String(zone?.targetBehavior ?? '').trim();
    if (targetBehavior && clusterByBehavior.has(targetBehavior)) {
      targets.add(clusterByBehavior.get(targetBehavior));
    }
    for (const channelKey of ['targetValueChannel', 'targetValueChannelY']) {
      const channel = String(zone?.[channelKey] ?? '').trim();
      if (!channel) continue;
      const viaChannel = clusterByChannel.get(channel)
        ?? [...clusterByBehavior.values()].find((cluster) => cluster.channels.includes(channel));
      if (viaChannel) targets.add(viaChannel);
    }
    if (targets.size === 0) {
      orphanZones.push(name);
      continue;
    }
    // A zone reaching more than one cluster (e.g. its behavior lives in
    // cluster A but its channel belongs to cluster B) appears in each,
    // tagged shared, so the cross-wiring stays visible.
    const shared = targets.size > 1;
    for (const cluster of targets) {
      cluster.zones.push({ name, generated, shared });
    }
  }

  return {
    clusters,
    orphans: {
      channels: orphanChannels,
      behaviors: orphanBehaviors,
      zones: orphanZones,
    },
  };
}
