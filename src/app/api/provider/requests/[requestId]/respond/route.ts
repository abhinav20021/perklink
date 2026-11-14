import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const RespondSchema = z.object({
  decision: z.enum(['ACCEPT', 'DECLINE']),
  reason: z.string().optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ requestId: string }> }
) {
  try {
    const { requestId } = await context.params;
    const session = await getRequiredSession(['PROVIDER_A', 'ADMIN_OPS']);
    const body = RespondSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const request = db.purchaseRequests.find((r) => r.id === requestId);
      if (!request) throw new Error(`Purchase request ${requestId} not found`);

      if (
        session.role === 'PROVIDER_A' &&
        request.providerId !== session.providerId
      ) {
        throw new Error('Cannot respond to another provider request.');
      }

      if (request.status !== 'PENDING') {
        throw new Error(`Request is already ${request.status}.`);
      }

      const tx = db.transactions.find((t) => t.id === request.transactionId);
      if (!tx) throw new Error(`Transaction ${request.transactionId} not found`);

      const nowIso = new Date().toISOString();
      request.respondedAt = nowIso;

      if (body.decision === 'DECLINE') {
        validateTransitionPreconditions(tx, 'OFFER_SELECTED', session.role);
        request.status = 'REJECTED';
        request.rejectionReason =
          body.reason ?? 'Provider unavailable at this moment.';
        tx.status = 'OFFER_SELECTED';
        tx.providerId = undefined;
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PROVIDER_DECLINED_REQUEST',
          fromState: 'PROVIDER_MATCHING',
          toState: 'OFFER_SELECTED',
          metadata: { requestId, reason: request.rejectionReason },
          createdAt: nowIso,
        });

        return projectTransactionForRole(db, tx, session.role);
      }

      // ACCEPT -> PROVIDER_ACCEPTED -> MANDATE_PENDING
      validateTransitionPreconditions(tx, 'PROVIDER_ACCEPTED', session.role);
      request.status = 'ACCEPTED';
      tx.status = 'PROVIDER_ACCEPTED';

      validateTransitionPreconditions(tx, 'MANDATE_PENDING', session.role);
      tx.status = 'MANDATE_PENDING';
      tx.updatedAt = nowIso;

      const product = db.products.find((p) => p.id === tx.productId)!;
      const existingMandate = db.upiMandates.find(
        (m) => m.transactionId === tx.id
      );
      if (!existingMandate) {
        db.upiMandates.unshift({
          id: `mnd-${Date.now()}`,
          transactionId: tx.id,
          mandateRef: `UPI-MND-${tx.id}`,
          shopperVpaMasked: 'rahul***@paytm',
          beneficiaryArrangement: 'Paytm PerkLink Escrow Simulation',
          amount: tx.mandateAmount,
          frequency: 'ONE_TIME',
          purpose: `${product.title} Purchase Orchestration`,
          status: 'PENDING',
          expiresAt: new Date(
            Date.now() + db.config.mandateExpiryMinutes * 60 * 1000
          ).toISOString(),
          termsAccepted: false,
        });
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PROVIDER_ACCEPTED_AND_MANDATE_INITIALISED',
        fromState: 'PROVIDER_MATCHING',
        toState: 'MANDATE_PENDING',
        metadata: {
          requestId,
          mandateAmount: tx.mandateAmount,
        },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: result });
  } catch (error) {
    return handleApiError(error);
  }
}

