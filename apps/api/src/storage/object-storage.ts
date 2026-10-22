import type { ObjectStorage } from "../types/storage.js";

export class StorageUnavailableError extends Error {
  constructor() {
    super("object-storage-unavailable");
  }
}

export function unavailableObjectStorage(): ObjectStorage {
  return {
    provider: "s3",
    async createPresignedPut() {
      throw new StorageUnavailableError();
    },
    async inspectObject() {
      throw new StorageUnavailableError();
    },
  };
}
