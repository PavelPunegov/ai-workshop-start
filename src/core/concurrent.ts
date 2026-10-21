/** Four workers, with results kept in input order; a failure stops queued work. */
export async function mapConcurrent<T, R>(items: readonly T[], task: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await task(items[index]);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
  return results;
}
