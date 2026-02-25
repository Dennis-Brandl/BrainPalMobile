import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { SCHEMA_SQL } from './schema';
import { SEED_SQL } from './seed';

/**
 * Initializes the BrainPal Mobile SQLite database.
 *
 * Called by SQLiteProvider's onInit callback, which blocks rendering
 * until this function completes -- no race conditions possible.
 *
 * - Enables WAL mode on native platforms (wa-sqlite does not support it)
 * - Enables foreign key enforcement
 * - Creates all 18 tables with indexes on first run (user_version < 1)
 * - Sets schema version to 1 via PRAGMA user_version
 * - Inserts dev seed data in __DEV__ mode
 */
export async function initializeDatabase(db: SQLiteDatabase): Promise<void> {
  // WAL mode: native only (wa-sqlite does not support it)
  if (Platform.OS !== 'web') {
    await db.execAsync('PRAGMA journal_mode = WAL');
  }

  // Foreign key enforcement
  await db.execAsync('PRAGMA foreign_keys = ON');

  // Check current schema version
  const versionResult = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  const currentVersion = versionResult?.user_version ?? 0;

  if (currentVersion < 1) {
    // Drop and recreate during v1 development
    await db.execAsync(SCHEMA_SQL);
    await db.execAsync('PRAGMA user_version = 1');

    // Seed with development data
    if (__DEV__) {
      await db.execAsync(SEED_SQL);
    }
  }
}
