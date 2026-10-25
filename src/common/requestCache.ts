/** Bounded response cache with request coalescing and safe invalidation. */
export class RequestCache<T> {
  private readonly entries = new Map<string, { expires: number; value: T }>();
  private readonly inFlight = new Map<string, Promise<T>>();
  private generation = 0;

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inFlight.clear();
  }

  async get(url: string, cacheSeconds: number, load: () => Promise<T>): Promise<T> {
    const cached = this.entries.get(url);
    if (cached && cached.expires > Date.now()) return cached.value;
    if (cached) this.entries.delete(url);
    const pending = this.inFlight.get(url);
    if (pending) return pending;

    const generation = this.generation;
    // Register before invoking the loader, including loaders that throw synchronously.
    const request = Promise.resolve().then(load);
    this.inFlight.set(url, request);
    try {
      const value = await request;
      if (cacheSeconds > 0 && generation === this.generation) {
        if (this.entries.size >= 64) {
          const oldestKey = this.entries.keys().next().value;
          if (oldestKey !== undefined) this.entries.delete(oldestKey);
        }
        this.entries.set(url, { expires: Date.now() + cacheSeconds * 1000, value });
      }
      return value;
    } finally {
      // An older request must not remove a newer request started after clear().
      if (this.inFlight.get(url) === request) this.inFlight.delete(url);
    }
  }
}
