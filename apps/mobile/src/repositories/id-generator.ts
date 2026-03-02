// ID generator using a portable UUID v4 implementation.
// crypto.randomUUID() is not available in all React Native engines.

import type { IIdGenerator } from '@brainpal/engine';

function uuidV4(): string {
  // RFC 4122 version 4 UUID using Math.random
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class IdGenerator implements IIdGenerator {
  generateId(): string {
    return uuidV4();
  }
}
