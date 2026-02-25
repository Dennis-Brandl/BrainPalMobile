/**
 * Enforces the SQLite-before-Zustand ordering contract.
 *
 * All state mutations must flow through this helper:
 * 1. Write to SQLite first (crash-safe persistence)
 * 2. Update Zustand store (in-memory cache)
 *
 * If the app crashes between step 1 and step 2, the SQLite
 * write is preserved and Zustand rebuilds from SQLite on restart.
 */
export async function writeAhead<T>(
  sqliteWrite: () => Promise<T>,
  stateUpdate: (result: T) => void,
): Promise<T> {
  const result = await sqliteWrite();
  stateUpdate(result);
  return result;
}
