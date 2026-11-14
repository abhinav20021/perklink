import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import type { DeliveryStatus, TransactionStatus } from '@/lib/db/types';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const DeliveryAdvanceSchema = z.object({
  nextStatus: z.enum([
    'SHIPPED',
    'OUT_FOR_DELIVERY',
    'DELIVERED',
    'RETURN_WINDOW_ACTIVE',
    'RETURN_WINDOW_COMPLETED',
  ]),
});

const DELIVERY_DESCRIPTIONS: Record<DeliveryStatus, string> = {
  ORDER_PLACED: 'Order placed via simulated merchant checkout.',
  CONFIRMED: 'Merchant confirmed order.',
  SHIPPED: 'Dispatched from fulfilment hub to Class B city.',
  OUT_FOR_DELIVERY: 'Out for delivery with local courier partner.',
  DELIVERED: 'Delivered to Class B recipient (masked from Class A).',
  RETURN_WINDOW_ACTIVE: 'Merchant return & inspection window active.',
  RETURN_WINDOW_COMPLETED:
    'Return window completed cleanly; all settlement conditions satisfied.',
};

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['ADMIN_OPS']);
    const { nextStatus } = DeliveryAdvanceSchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const order = db.merchantOrders.find((o) => o.transactionId === tx.id);
      if (!order) {
        throw new Error('Cannot progress delivery before merchant order creation.');
      }

      const nowIso = new Date().toISOString();
      const fromState = tx.status;

      const existingEvents = db.deliveryEvents.filter(
        (e) => e.transactionId === tx.id
      );
      const verificationResults = db.verificationResults.filter(
        (v) => v.transactionId === tx.id
      );

      const newEvent = {
        id: `del-${Date.now()}`,
        transactionId: tx.id,
        merchantOrderId: order.merchantOrderId,
        status: nextStatus,
        description: DELIVERY_DESCRIPTIONS[nextStatus],
        timestamp: nowIso,
        actor: 'Paytm Operations Simulation',
      };
      const allEvents = [...existingEvents, newEvent];

      let targetTxState: TransactionStatus = tx.status;
      if (nextStatus === 'SHIPPED') targetTxState = 'SHIPPED';
      else if (nextStatus === 'OUT_FOR_DELIVERY') targetTxState = 'SHIPPED';
      else if (nextStatus === 'DELIVERED') targetTxState = 'DELIVERED';
      else if (nextStatus === 'RETURN_WINDOW_ACTIVE')
        targetTxState = 'RETURN_WINDOW_ACTIVE';
      else if (nextStatus === 'RETURN_WINDOW_COMPLETED')
        targetTxState = 'SETTLEMENT_ELIGIBLE';

      if (targetTxState !== tx.status) {
        validateTransitionPreconditions(tx, targetTxState, session.role, {
          deliveryEvents: allEvents,
          verificationResults,
        });
        tx.status = targetTxState;
      }

      db.deliveryEvents.push(newEvent);
      tx.updatedAt = nowIso;

      if (tx.status === 'SETTLEMENT_ELIGIBLE') {
        const existingSet = db.settlementRecords.find(
          (s) => s.transactionId === tx.id
        );
        if (!existingSet) {
          db.settlementRecords.unshift({
            id: `set-${Date.now()}`,
            transactionId: tx.id,
            partnerRef: `SET-SIM-${tx.id}`,
            buyerMandateAmount: tx.mandateAmount,
            providerCardCharge: tx.cardChargeAmount,
            providerReward: tx.providerReward,
            providerTotalPayout: tx.cardChargeAmount + tx.providerReward,
            platformFee: tx.platformFee,
            refundAmount: 0,
            status: 'ELIGIBLE',
            partnerName: 'Paytm PerkLink Escrow Simulation',
          });
        } else {
          existingSet.status = 'ELIGIBLE';
        }
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: `DELIVERY_PROGRESSED_${nextStatus}`,
        fromState,
        toState: tx.status,
        metadata: { deliveryStatus: nextStatus, merchantOrderId: order.merchantOrderId },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

