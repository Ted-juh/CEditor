// One instance's own value of a repeated block's parameter (a drum key's name, a part's default).
//
// The model keeps them as dpd.schema.json says: `perInstance: { field: [one value per instance] }`,
// laid over the parameter's own value by resolve.mjs (instanceParam), and only in a block that names
// its instances (idTemplate). An array holds every instance, so an instance with nothing of its own
// carries the block's value; `{n}` in it is filled per instance, as in the block's. An absent value is
// null, as the converter writes it. When no instance differs from the block any more, the array goes,
// and `perInstance` with it once it is empty: a model edited back is the model it was.

const fill = (v, n) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v).replaceAll('{n}', String(n))));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Whether instance `idx` (numbered `first + idx`) has a value of its own for `field`. */
export function hasOwn(param, field, idx, first = 1) {
  const values = param?.perInstance?.[field];
  return Array.isArray(values) && idx < values.length && !same(fill(values[idx], first + idx), fill(param[field], first + idx));
}

/**
 * Sets instance `idx`'s own value for `field` (null: back to the block's). `count` is the number of
 * instances and `first` the first one's number. A value equal to the block's, filled for that
 * instance, is the block's: it is not kept as the instance's own.
 */
export function setInstanceValue(param, field, idx, { count, first = 1 }, value) {
  const block = param[field] === undefined ? null : JSON.parse(JSON.stringify(param[field]));
  const current = param.perInstance?.[field];
  const values = Array.isArray(current) ? JSON.parse(JSON.stringify(current)) : [];
  while (values.length < count) values.push(block);
  values[idx] = value == null ? block : value;
  if (values.every((v, i) => same(fill(v, first + i), fill(block, first + i)))) {
    if (param.perInstance) {
      delete param.perInstance[field];
      if (!Object.keys(param.perInstance).length) delete param.perInstance;
    }
    return;
  }
  if (!param.perInstance) param.perInstance = {};
  param.perInstance[field] = values;
}
