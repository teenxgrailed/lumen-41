/**
 * One write at a time per key. A task's PUT carries its revision
 * (If-Match: updatedAt), so two PUTs in flight for the same task send the
 * same revision and the second gets 409. Each write here starts only after
 * the previous one for that key has settled, so it reads the revision the
 * previous one left behind. A failed write does not block the next.
 */
const tails = new Map<string, Promise<unknown>>();

export function serialByKey<T>(key: string, run: () => Promise<T>) {
  const prev = tails.get(key) ?? Promise.resolve();
  const next = prev.then(run, run);
  const tail = next.then(
    () => undefined,
    () => undefined
  );
  tails.set(key, tail);
  void tail.then(() => {
    if (tails.get(key) === tail) tails.delete(key);
  });
  return next;
}
