import { type SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

type WriteOperation<T> = (db: SQLiteDatabase) => Promise<T>;

/**
 * Platform-aware write serialization queue.
 *
 * On native platforms: delegates to expo-sqlite's withExclusiveTransactionAsync
 * which provides native-level write locking.
 *
 * On web (wa-sqlite): uses a FIFO queue to serialize writes in JavaScript,
 * because wa-sqlite does not support withExclusiveTransactionAsync.
 */
export class WriteQueue {
  private queue: Array<{
    operation: WriteOperation<any>;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private processing = false;

  constructor(private db: SQLiteDatabase) {}

  async execute<T>(operation: WriteOperation<T>): Promise<T> {
    if (Platform.OS !== 'web') {
      let result: T;
      await this.db.withExclusiveTransactionAsync(async (txn) => {
        result = await operation(txn as unknown as SQLiteDatabase);
      });
      return result!;
    }

    return new Promise<T>((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.processQueue();
    });
  }

  private async processQueue(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift()!;
      try {
        const result = await operation(this.db);
        resolve(result);
      } catch (error) {
        reject(error);
      }
    }

    this.processing = false;
  }
}
