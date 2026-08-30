export interface EnrollmentRecord {
  userId: string;
  courseId: string;
  enrolledAt: Date;
}

/** Builds the durable, uniquely-keyed identifier for an enrollment row. */
export function enrollmentKey(userId: string, courseId: string): string {
  return `${userId}:${courseId}`;
}

/**
 * Idempotently inserts an enrollment into a durable store keyed by
 * (userId, courseId); repeated calls return the existing record instead
 * of creating duplicates.
 */
export function enrollIdempotent(
  store: Map<string, EnrollmentRecord>,
  userId: string,
  courseId: string,
): EnrollmentRecord {
  const key = enrollmentKey(userId, courseId);
  const existing = store.get(key);
  if (existing) return existing;
  const record: EnrollmentRecord = { userId, courseId, enrolledAt: new Date() };
  store.set(key, record);
  return record;
}
