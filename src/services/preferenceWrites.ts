const writes = new Map<
  string,
  { run: () => Promise<void>; promise: Promise<void>; failed: boolean }
>();
export function writePreference(key: string, run: () => Promise<void>) {
  const previous = writes.get(key);
  const entry = { run, promise: Promise.resolve(), failed: false };
  entry.promise = (previous?.promise ?? Promise.resolve())
    .catch(() => {})
    .then(run)
    .catch((error) => {
      entry.failed = true;
      throw error;
    });
  writes.set(key, entry);
  void entry.promise
    .finally(() => {
      if (!entry.failed && writes.get(key) === entry) writes.delete(key);
    })
    .catch(() => {});
  return entry.promise;
}
export async function flushPreferences() {
  while (writes.size) {
    const pending = [...writes.entries()];
    for (const [key, entry] of pending) {
      if (entry.failed) await writePreference(key, entry.run);
      else await entry.promise;
    }
  }
}
