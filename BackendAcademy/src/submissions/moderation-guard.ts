export type ModerationState = 'NONE' | 'FLAGGED' | 'ESCALATED' | 'RESOLVED' | 'DISMISSED';
export type ModerationAction = 'flag' | 'dismiss' | 'escalate' | 'resolve';

const LEGAL_TRANSITIONS: Record<ModerationAction, ModerationState[]> = {
  flag: ['NONE'],
  dismiss: ['FLAGGED'],
  escalate: ['FLAGGED'],
  resolve: ['FLAGGED', 'ESCALATED'],
};

const NEXT_STATE: Record<ModerationAction, ModerationState> = {
  flag: 'FLAGGED',
  dismiss: 'DISMISSED',
  escalate: 'ESCALATED',
  resolve: 'RESOLVED',
};

export interface ModerationAuditRecord {
  action: ModerationAction;
  actorId: string;
  fromState: ModerationState;
  toState: ModerationState;
  reason: string;
  at: Date;
}

/** Validates a moderation transition and returns its immutable audit record. */
export function applyModerationTransition(
  current: ModerationState,
  action: ModerationAction,
  actorId: string,
  reason: string,
): ModerationAuditRecord {
  if (!LEGAL_TRANSITIONS[action].includes(current)) {
    throw new Error(`Illegal moderation transition: ${action} from ${current}`);
  }
  return {
    action,
    actorId,
    fromState: current,
    toState: NEXT_STATE[action],
    reason,
    at: new Date(),
  };
}
