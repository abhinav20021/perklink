import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

/**
 * Initiates the Provider's simulated secure hosted card checkout session
 * (MANDATE_AUTHORISED -> CARD_PAYMENT_PENDING or PAYMENT_FAILED retry -> CARD_PAYMENT_PENDING).
 */
export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['PROVIDER_A']);

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);
      if (tx.providerId !== session.providerId) {
        throw new Error('Only the matched Perk Provider can initiate card checkout.');
      }

      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);
      if (tx.status !== 'CARD_PAYMENT_PENDING') {
        validateTransitionPreconditions(tx, 'CARD_PAYMENT_PENDING', session.role, {
          mandate,
        });
      }

      const fromState = tx.status;
      const nowIso = new Date().toISOString();
      const card = db.cardProductMetadata.find(
        (c) =>
          c.providerId === session.providerId &&
          (!tx.offerId ||
            db.bankOffers
              .find((o) => o.id === tx.offerId)
              ?.bankName.toLowerCase() === c.bankName.toLowerCase())
      );

      const paymentOrderId = `PAY-ORD-${Date.now().toString().slice(-6)}`;
      const paymentGatewayTxId = `PG-SIM-${Math.floor(10000000 + Math.random() * 89999999)}`;

      tx.status = 'CARD_PAYMENT_PENDING';
      tx.updatedAt = nowIso;
      tx.paymentSimulation = {
        paymentOrderId,
        paymentGatewayTxId,
        amount: tx.cardChargeAmount,
        paymentMethod: card
          ? `${card.cardVariant} •••• ${card.maskedLast4} (Simulated 3DS)`
          : 'Registered Credit Card (Simulated 3DS)',
        status: 'PENDING',
        callbackVerified: false,
        timestamp: nowIso,
      };

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PROVIDER_HOSTED_CHECKOUT_INITIATED',
        fromState,
        toState: 'CARD_PAYMENT_PENDING',
        metadata: {
          paymentOrderId,
          expectedCardCharge: tx.cardChargeAmount,
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

