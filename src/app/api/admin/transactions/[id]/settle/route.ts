import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['ADMIN_OPS']);

    const settled = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);
      const deliveryEvents = db.deliveryEvents.filter(
        (e) => e.transactionId === tx.id
      );
      const verificationResults = db.verificationResults.filter(
        (v) => v.transactionId === tx.id
      );

      validateTransitionPreconditions(tx, 'SETTLEMENT_COMPLETED', session.role, {
        mandate,
        deliveryEvents,
        verificationResults,
      });

      const nowIso = new Date().toISOString();
      const fromState = tx.status;
      tx.status = 'SETTLEMENT_COMPLETED';
      tx.updatedAt = nowIso;

      if (mandate) {
        mandate.status = 'EXECUTED';
        mandate.executedAt = nowIso;
      }

      const providerTotalPayout = tx.cardChargeAmount + tx.providerReward;
      let settlement = db.settlementRecords.find(
        (s) => s.transactionId === tx.id
      );
      if (!settlement) {
        settlement = {
          id: `set-${Date.now()}`,
          transactionId: tx.id,
          partnerRef: `SET-SIM-${tx.id}`,
          buyerMandateAmount: tx.mandateAmount,
          providerCardCharge: tx.cardChargeAmount,
          providerReward: tx.providerReward,
          providerTotalPayout,
          platformFee: tx.platformFee,
          refundAmount: 0,
          status: 'SETTLED',
          partnerName: 'Paytm PerkLink Escrow Simulation',
          settledAt: nowIso,
        };
        db.settlementRecords.unshift(settlement);
      } else {
        settlement.status = 'SETTLED';
        settlement.providerTotalPayout = providerTotalPayout;
        settlement.settledAt = nowIso;
      }

      // Increment provider completed orders count in demo profile
      const provider = db.providerProfiles.find((p) => p.id === tx.providerId);
      if (provider) {
        provider.completedOrders += 1;
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'SIMULATED_SETTLEMENT_COMPLETED',
        fromState,
        toState: 'SETTLEMENT_COMPLETED',
        metadata: {
          partnerRef: settlement.partnerRef,
          providerTotalPayout,
          platformFee: tx.platformFee,
          simulationOnly: true,
        },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({
      data: settled,
      message: 'Settlement Completed Successfully',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

