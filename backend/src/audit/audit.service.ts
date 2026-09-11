import { Injectable } from '@nestjs/common';

import type { Prisma } from '../generated/prisma/client';
import type { AuditEntry } from './audit-entry.types';

/**
 * Writes the audit trail: who changed what, and what it said before.
 *
 * Closes spec §13 gap 2 and the half of step 8g's gap that no single endpoint
 * could close. ⚠️ It does **not** overlap step 17's operational logging, which
 * answers a different question for a different reader: that writes a line per
 * *failed* request and is deliberately silent on 2xx, so a **successful** write
 * — an admin resetting a password, an employee deleting a shift — left no trace
 * anywhere. This writes only successes, because only a success changed anything.
 *
 * ⚠️ **Every method takes an explicit `Prisma.TransactionClient`, and there is
 * no overload that does not.** The audit row and the mutation it describes are
 * written in one transaction, so they cannot be observed apart and cannot
 * survive apart: if the audit insert fails the mutation rolls back with it.
 * That is the user-facing decision — a change without a trace is exactly the
 * state this table exists to make unreachable, so it is preferable for the
 * request to fail loudly than to succeed silently and unrecorded.
 *
 * Taking `tx` as a parameter rather than injecting `PrismaService` and opening
 * its own transaction is what makes that enforceable: a caller cannot
 * accidentally record outside the transaction it is already in, because there
 * is no client here to do it with.
 *
 * This is also why the audit write is **not** an interceptor. An interceptor
 * sees a request and a response, never the row as it stood *before* the write —
 * and `before` is the point. It could not join the transaction either.
 */
@Injectable()
export class AuditService {
  /**
   * Record one act.
   *
   * The entry is a discriminated union (`audit-entry.types.ts`), so the fields a
   * given action may carry are fixed by the compiler rather than by convention —
   * which is what keeps `password`/`setupCode`/`tokenVersion` out of this table
   * by construction rather than by care.
   */
  async record(tx: Prisma.TransactionClient, entry: AuditEntry): Promise<void> {
    await tx.auditLog.create({
      // Listed field by field rather than spread. The entry type is already
      // narrow, but an explicit mapping is what stops a future field on that
      // type from reaching the table just because somebody added it there.
      data: {
        action: entry.action,
        actorId: entry.actorId,
        subjectId: entry.subjectId,
        entityType: entry.entityType,
        entityId: entry.entityId,
        before: entry.before ?? undefined,
        after: entry.after ?? undefined,
      },
    });
  }

  /**
   * Record several acts from one request, in order.
   *
   * ⚠️ Exists because `PUT /users/:id` can do two distinct things at once —
   * rename an employee *and* queue a raise — and they are two rows, not one.
   * Collapsing them would lose which of the two a given request actually did,
   * and the rate row is the one carrying the figure that the upsert would
   * otherwise overwrite without trace.
   *
   * Sequential rather than `Promise.all`: these share one transaction, and the
   * order they are written in is the order they happened.
   */
  async recordAll(
    tx: Prisma.TransactionClient,
    entries: AuditEntry[],
  ): Promise<void> {
    for (const entry of entries) {
      await this.record(tx, entry);
    }
  }
}
