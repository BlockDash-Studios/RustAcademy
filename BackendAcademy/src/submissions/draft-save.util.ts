export interface DraftRecord {
  submissionId: string;
  content: string;
  version: number;
  updatedAt: Date;
}

export class DraftConflictError extends Error {
  constructor(public readonly currentVersion: number) {
    super(`Draft save conflict: current version is ${currentVersion}`);
  }
}

/**
 * Saves a draft only if the client's expected version matches the
 * stored version, preventing autosave races from overwriting newer
 * content across tabs/retries.
 */
export function saveDraftIfCurrent(
  current: DraftRecord,
  expectedVersion: number,
  newContent: string,
): DraftRecord {
  if (current.version !== expectedVersion) {
    throw new DraftConflictError(current.version);
  }
  return {
    ...current,
    content: newContent,
    version: current.version + 1,
    updatedAt: new Date(),
  };
}
