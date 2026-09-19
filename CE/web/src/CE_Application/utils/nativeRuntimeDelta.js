// The native cache does not decode live CC/individual parameter SysEx. A later
// block reply includes unrelated, older cache values. Only changed cache fields
// are new information; the reply's explicit values are authoritative even when
// they happen to equal a previous cached value.
export function createNativeRuntimeDelta() {
  let previous = {};
  return (snapshot, authoritative = {}) => {
    const delta = {};
    if (snapshot && typeof snapshot === 'object') {
      for (const [role, values] of Object.entries(snapshot)) {
        for (const [id, value] of Object.entries(values ?? {})) {
          if (!Object.is(previous[role]?.[id], value)) (delta[role] ??= {})[id] = value;
        }
      }
      previous = snapshot;
    }
    for (const [role, values] of Object.entries(authoritative)) {
      Object.assign(delta[role] ??= {}, values);
    }
    return delta;
  };
}
