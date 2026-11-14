import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';

const ReturnRequestSchema = z.object({
  reason: z.string().min(3),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = ReturnRequestSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found.`);

      const nowIso = new Date().toISOString();

      tx.merchantRefundStatus = 'RETURN_REQUESTED';
      tx.settlementStatus = 'BLOCKED_RETURN_PENDING';
      tx.updatedAt = nowIso;

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'SHOPPER_RETURN_REQUESTED',
        fromState: tx.status,
        toState: tx.status,
        metadata: {
          reason: body.reason,
          settlementStatus: tx.settlementStatus,
        },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({
      data: result,
      message: 'Return request submitted. Awaiting merchant refund confirmation.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
