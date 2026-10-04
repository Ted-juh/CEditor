// Use a fresh execution thread so Wasmoon's timeout closure gets a fresh deadline
// for each load. Returned values move to the long-lived global before the thread
// is closed; handler callbacks have their own functionTimeout in LuaFactory.
export function runBoundedLuaSource(lua, source, milliseconds = 250) {
  if (source.length > 1024 * 1024) throw Error('Script source limit exceeded');
  const thread = lua.global.newThread();
  const index = lua.global.getTop();
  try {
    thread.setTimeout(Date.now() + milliseconds);
    thread.loadString(source);
    const result = thread.runSync();
    if (!result.length) return undefined;
    lua.global.lua.lua_xmove(thread.address, lua.global.address, result.length);
    try { return lua.global.getValue(lua.global.getTop() - result.length + 1); }
    finally { lua.global.pop(result.length); }
  } finally { thread.close(); lua.global.remove(index); }
}
