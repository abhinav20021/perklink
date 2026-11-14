import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const MandateActionSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'SIMULATE_EXPIRE', 'RETRY']),
  termsAccepted: z.boolean().optional().default(true),
  simulatedPinConfirmed: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = MandateActionSchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);
      if (!mandate) {
        throw new Error('UPI Mandate has not been initialised for this transaction.');
      }

      const nowIso = new Date().toISOString();
      const fromState = tx.status;

      if (body.action === 'RETRY') {
        validateTransitionPreconditions(tx, 'MANDATE_PENDING', session.role, { mandate });
        mandate.status = 'PENDING';
        mandate.expiresAt = new Date(
          Date.now() + db.config.mandateExpiryMinutes * 60 * 1000
        ).toISOString();
        tx.status = 'MANDATE_PENDING';
        tx.updatedAt = nowIso;
      } else if (body.action === 'SIMULATE_EXPIRE') {
        mandate.expiresAt = new Date(Date.now() - 1000).toISOString();
        validateTransitionPreconditions(tx, 'MANDATE_EXPIRED', session.role, { mandate });
        mandate.status = 'EXPIRED';
        tx.status = 'MANDATE_EXPIRED';
        tx.updatedAt = nowIso;
      } else if (body.action === 'REJECT') {
        validateTransitionPreconditions(tx, 'MANDATE_REJECTED', session.role, { mandate });
        mandate.status = 'REJECTED';
        tx.status = 'MANDATE_REJECTED';
        tx.updatedAt = nowIso;
      } else if (body.action === 'APPROVE') {
        if (!body.termsAccepted || !body.simulatedPinConfirmed) {
          throw new Error(
            'Both mandate terms acceptance and simulated 4-digit demo PIN confirmation are required.'
          );
        }
        mandate.termsAccepted = true;
        validateTransitionPreconditions(tx, 'MANDATE_AUTHORISED', session.role, {
          mandate,
        });
        // Separate authorisation from execution: do NOT set executedAt or status='EXECUTED' yet
        mandate.status = 'APPROVED';
        mandate.authorisedAt = nowIso;
        tx.status = 'MANDATE_AUTHORISED';
        tx.updatedAt = nowIso;
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: `UPI_MANDATE_${body.action}`,
        fromState,
        toState: tx.status,
        metadata: {
          mandateRef: mandate.mandateRef,
          amount: mandate.amount,
          frequency: mandate.frequency,
          executionDeferred: true,
        },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({
      data: updated,
      message:
        body.action === 'APPROVE'
          ? 'UPI Mandate Approved Successfully'
          : undefined,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

