export interface GradingSaveStep {
  name: string;
  run: () => Promise<void>;
  compensate: () => Promise<void>;
}

/**
 * Runs the grading-result save and submission-sync steps as a single
 * logical unit: if a later step fails, prior steps are compensated
 * (rolled back) so no partial state is left committed.
 */
export async function runTransactionalSave(
  steps: GradingSaveStep[],
): Promise<void> {
  const completed: GradingSaveStep[] = [];
  try {
    for (const step of steps) {
      await step.run();
      completed.push(step);
    }
  } catch (err) {
    for (const step of completed.reverse()) {
      await step.compensate();
    }
    throw err;
  }
}
