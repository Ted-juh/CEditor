export function hostPartTitle(part) {
  if (!part) return 'No part selected';
  if (part.hardware) return `${part.midiOutputName || 'External hardware'} (HW)`;
  if (part.hasInstrument) return part.pluginName || 'Loaded instrument';
  if (part.unresolved) return `${part.pluginName || part.pluginCeId || 'Instrument'} (missing)`;
  return 'Empty part';
}

export const hostPartNumber = (index) => index >= 0 ? String(index + 1).padStart(2, '0') : '—';
export const hostPartLabel = (part, index) => `${hostPartNumber(index)} · ${hostPartTitle(part)}`;

/** Resolve ownership by stable IDs, never by plug-in name or current keyboard focus. */
export function hostEffectTargets(rack) {
  const owners = [
    ...(rack.parts ?? []).map((part, index) => ({ id: part.partId, label: hostPartLabel(part, index), part, index, effects: part.effects })),
    { id: '@master', label: 'Master', effects: rack.masterEffects },
    ...(rack.buses ?? []).map(bus => ({ id: bus.busId, label: `Bus · ${bus.name}`, effects: bus.effects })),
    ...(rack.returns ?? []).map(chain => ({ id: chain.returnId, label: `Return · ${chain.name}`, effects: chain.effects })),
  ];
  return owners.flatMap(owner => (owner.effects ?? []).map((effect, index) => ({
    effect, ownerId: owner.id, ownerLabel: owner.label, part: owner.part ?? null,
    partIndex: owner.index ?? -1, index, label: `${hostPartNumber(index)} · ${effect.pluginName || 'Effect'}`,
  })));
}

export function hostTargetContext(rack, targetId) {
  const partIndex = (rack.parts ?? []).findIndex(part => part.partId === targetId);
  if (partIndex >= 0) {
    const part = rack.parts[partIndex];
    return { part, partIndex, ownerId: part.partId, ownerLabel: hostPartLabel(part, partIndex), effect: null };
  }
  return hostEffectTargets(rack).find(target => target.effect.effectId === targetId) ?? null;
}
