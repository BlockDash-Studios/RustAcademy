export interface CompletionEvidence {
  userId: string;
  courseId: string;
  verifiedLessonIds: string[];
  verifiedSubmissionIds: string[];
}

export interface CourseRequirements {
  requiredLessonIds: string[];
  requiredSubmissionIds: string[];
}

/**
 * Confirms completion is backed by server-verified lessons/submissions
 * against the course's required set, not client-supplied claims.
 */
export function hasVerifiedCompletion(
  evidence: CompletionEvidence,
  requirements: CourseRequirements,
): boolean {
  const lessonsDone = requirements.requiredLessonIds.every((id) =>
    evidence.verifiedLessonIds.includes(id),
  );
  const submissionsDone = requirements.requiredSubmissionIds.every((id) =>
    evidence.verifiedSubmissionIds.includes(id),
  );
  return lessonsDone && submissionsDone;
}
