import { AuditAction } from '../generated/prisma/client';

/**
 * What an audit row is allowed to carry, expressed as types rather than as a
 * rule somebody has to remember.
 *
 * ⚠️ **These shapes are an allowlist, and that is the whole design.** The
 * tempting version — snapshot the Prisma row, strip the secrets — is a
 * *blocklist*, and `architecture.md` already refuses that pattern for request
 * logging: the absence of a path, not a filter over one. A blocklist is a list
 * to maintain at every future column, and its failure mode is silent (the new
 * field simply appears in the table and nothing says so). Here the compiler
 * refuses to build a payload that was never declared, so a secret cannot reach
 * this table by omission — only by somebody writing it in on purpose.
 *
 * Never declared anywhere below, on any entity: `password`, `setupCode`,
 * `setupCodeExpiresAt`, `tokenVersion`. A revocation is recorded as an
 * **action** (`PASSWORD_CHANGED`, `PASSWORD_RESET_BY_ADMIN` — both of which bump
 * the counter), never as the counter's value.
 *
 * ⚠️ These are `type` aliases, not `interface`s, and that is load-bearing rather
 * than stylistic: Prisma's `InputJsonValue` requires an implicit index
 * signature, which TypeScript grants to a type alias and withholds from an
 * interface. Written as interfaces they do not compile against `auditLog.create`
 * ("Index signature for type 'string' is missing"), which is a confusing error
 * to meet from the far end. Measured, not remembered.
 */

/** `TimeEntry` — the hours themselves. §13 gap 2's subject. */
export type ShiftSnapshot = {
  startTime: string;
  endTime: string | null;
  notes: string | null;
};

/**
 * `User` — only the three fields an admin can change and a reader would ask
 * about. `email` and `role` are absent because no endpoint changes either.
 */
export type EmployeeSnapshot = {
  name: string;
  hourlyRate: number | null;
  isActive: boolean;
};

/**
 * `UserRate` — a queued raise.
 *
 * ⚠️ This is the one snapshot that records something otherwise **unrecoverable**.
 * `updateEmployee` upserts on `(userId, effectiveFrom)`, so a second raise
 * entered in the same cycle overwrites the first and leaves no trace that the
 * first figure was ever entered. `before` here is the only place that survives.
 */
export type RateSnapshot = {
  hourlyRate: number;
  effectiveFrom: string;
};

/** `AppSettings` — the cycle boundary, whose blast radius is every past cycle. */
export type SettingsSnapshot = {
  cycleStartDay: number;
  cycleEndDay: number;
};

/**
 * One recorded act.
 *
 * `actorId`/`subjectId` are separate and both required at the type level (null
 * being an explicit answer, never an omission), because the pair is the question
 * this table exists to answer: 8g's gap was not "the password changed" but
 * "which admin changed whose password".
 */
interface AuditEntryBase {
  action: AuditAction;
  /**
   * Who acted. `null` only for `ACCOUNT_ACTIVATED` — the single mutation in this
   * system performed without a session, where the actor is the subject.
   */
  actorId: number | null;
  /** Who it was done to. `null` for `SETTINGS_UPDATED`, which has no subject. */
  subjectId: number | null;
  /** The row, `null` for the `AppSettings` singleton. */
  entityId: number | null;
}

export type AuditEntry =
  | (AuditEntryBase & {
      action:
        | typeof AuditAction.SHIFT_CREATED
        | typeof AuditAction.SHIFT_UPDATED
        | typeof AuditAction.SHIFT_DELETED;
      entityType: 'TimeEntry';
      before: ShiftSnapshot | null;
      after: ShiftSnapshot | null;
    })
  | (AuditEntryBase & {
      action:
        | typeof AuditAction.EMPLOYEE_CREATED
        | typeof AuditAction.EMPLOYEE_UPDATED
        | typeof AuditAction.EMPLOYEE_DEACTIVATED
        | typeof AuditAction.EMPLOYEE_REACTIVATED
        | typeof AuditAction.SETUP_CODE_REISSUED
        | typeof AuditAction.PASSWORD_RESET_BY_ADMIN
        | typeof AuditAction.PASSWORD_CHANGED
        | typeof AuditAction.ACCOUNT_ACTIVATED;
      entityType: 'User';
      before: EmployeeSnapshot | null;
      after: EmployeeSnapshot | null;
    })
  | (AuditEntryBase & {
      action: typeof AuditAction.RATE_QUEUED;
      entityType: 'UserRate';
      before: RateSnapshot | null;
      after: RateSnapshot;
    })
  | (AuditEntryBase & {
      action: typeof AuditAction.SETTINGS_UPDATED;
      entityType: 'AppSettings';
      before: SettingsSnapshot;
      after: SettingsSnapshot;
    });

/**
 * The allowlist, applied.
 *
 * ⚠️ Each of these takes a **narrow structural type**, never the Prisma model.
 * Accepting `User` would let a caller hand over the whole row and rely on this
 * function to pick — which works until somebody destructures instead. Asking
 * only for what is copied means a secret is never in scope to begin with.
 */
export function toShiftSnapshot(row: {
  startTime: Date;
  endTime: Date | null;
  notes: string | null;
}): ShiftSnapshot {
  return {
    startTime: row.startTime.toISOString(),
    endTime: row.endTime?.toISOString() ?? null,
    notes: row.notes,
  };
}

export function toEmployeeSnapshot(row: {
  name: string;
  hourlyRate: number | null;
  isActive: boolean;
}): EmployeeSnapshot {
  return {
    name: row.name,
    hourlyRate: row.hourlyRate,
    isActive: row.isActive,
  };
}

export function toRateSnapshot(row: {
  hourlyRate: number;
  effectiveFrom: Date;
}): RateSnapshot {
  return {
    hourlyRate: row.hourlyRate,
    effectiveFrom: row.effectiveFrom.toISOString(),
  };
}

export function toSettingsSnapshot(row: {
  cycleStartDay: number;
  cycleEndDay: number;
}): SettingsSnapshot {
  return {
    cycleStartDay: row.cycleStartDay,
    cycleEndDay: row.cycleEndDay,
  };
}
