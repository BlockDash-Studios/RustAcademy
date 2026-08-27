export type GradingJobStatus = 'PENDING' | 'LEASED' | 'DONE' | 'FAILED';

export interface GradingJobRecord {
  jobId: string;
  status: GradingJobStatus;
  attempts: number;
  leaseOwner?: string;
  leaseExpiresAt?: Date;
}

const LEASE_DURATION_MS = 60_000;

/** Acquires a lease on a job for a worker, only if unleased or expired. */
export function acquireLease(
  job: GradingJobRecord,
  workerId: string,
  now: Date = new Date(),
): GradingJobRecord {
  const leaseActive = job.leaseExpiresAt && job.leaseExpiresAt > now;
  if (job.status === 'LEASED' && leaseActive && job.leaseOwner !== workerId) {
    throw new Error(`Job ${job.jobId} is already leased by another worker`);
  }
  return {
    ...job,
    status: 'LEASED',
    attempts: job.attempts + 1,
    leaseOwner: workerId,
    leaseExpiresAt: new Date(now.getTime() + LEASE_DURATION_MS),
  };
}
