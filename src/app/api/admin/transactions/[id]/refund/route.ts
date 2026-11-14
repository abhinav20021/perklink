import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const RefundSchema = z.object({
  reason: z.string().min(3),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['ADMIN_OPS']);
    const { reason } = RefundSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const nowIso = new Date().toISOString();
      const fromState = tx.status;

      if (tx.status !== 'REFUND_PENDING') {
        validateTransitionPreconditions(tx, 'REFUND_PENDING', session.role);
        tx.status = 'REFUND_PENDING';
      }
      validateTransitionPreconditions(tx, 'REFUNDED', session.role);
      tx.status = 'REFUNDED';
      tx.updatedAt = nowIso;

      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);
      if (mandate && mandate.status !== 'EXECUTED') {
        mandate.status = 'CANCELLED';
      }

      db.refundRecords.unshift({
        id: `ref-${Date.now()}`,
        transactionId: tx.id,
        amount: tx.mandateAmount,
        reason,
        status: 'COMPLETED',
        initiatedAt: nowIso,
        completedAt: nowIso,
      });

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'SIMULATED_REFUND_AND_MANDATE_RELEASE',
        fromState,
        toState: 'REFUNDED',
        metadata: { amount: tx.mandateAmount, reason },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

