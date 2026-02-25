// ID generator interface.
// Abstracts UUID generation so the engine works in both Node.js (tests)
// and React Native (runtime via expo-crypto).

export interface IIdGenerator {
  generateId(): string;
}
