export interface RubricCriterion {
  weight: number;
  score: number;
  maxScore: number;
}

export class InvalidRubricError extends Error {}

const EPSILON = 0.001;

/** Validates rubric weights sum to 1 and each score is within bounds. */
export function validateRubric(criteria: RubricCriterion[]): void {
  const totalWeight = criteria.reduce((sum, c) => sum + c.weight, 0);
  if (Math.abs(totalWeight - 1) > EPSILON) {
    throw new InvalidRubricError(`Rubric weights must sum to 1, got ${totalWeight}`);
  }
  for (const c of criteria) {
    if (c.score < 0 || c.score > c.maxScore) {
      throw new InvalidRubricError(`Score ${c.score} out of bounds [0, ${c.maxScore}]`);
    }
  }
}

/** Computes the weighted total score, rounded to two decimal places. */
export function computeTotalScore(criteria: RubricCriterion[]): number {
  validateRubric(criteria);
  const total = criteria.reduce(
    (sum, c) => sum + (c.score / c.maxScore) * c.weight * 100,
    0,
  );
  return Math.round(total * 100) / 100;
}
