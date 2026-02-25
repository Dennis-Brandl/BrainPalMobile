// ID generator implementation using crypto.randomUUID().
// Available in React Native Hermes engine and web environments.

import type { IIdGenerator } from '@brainpal/engine';

export class IdGenerator implements IIdGenerator {
  generateId(): string {
    return crypto.randomUUID();
  }
}
