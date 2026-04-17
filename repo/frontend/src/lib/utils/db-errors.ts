/**
 * Returns true if the error is Dexie's DatabaseClosedError, which fires when
 * an in-flight query resolves after the DB was closed or deleted (tab close,
 * HMR, test teardown). Callers that kick off fire-and-forget DB reads on
 * mount use this to distinguish legitimate shutdown races from real bugs.
 */
export function isDatabaseClosedError(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'DatabaseClosedError';
}

/**
 * Catch-block helper for fire-and-forget DB reads: swallow DatabaseClosedError
 * (a legitimate shutdown race) and rethrow anything else. Keeps the branch
 * inside the helper so call sites stay branch-free.
 */
export function swallowDbClosed(err: unknown): void {
  if (isDatabaseClosedError(err)) return;
  throw err;
}
