import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import type { RefundRecoveryRecord } from '@/lib/db/types';

const MerchantRefundSchema = z.object({
  transactionId: z.string().min(1),
  merchantRefundId: z.string().min(1),
  originalCardTxId: z.string().min(1),
  refundAmount: z.number().positive(),
  simulateRecoveryFailure: z.boolean().optional().default(false),
  simulateFailure: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession(['ADMIN_OPS', 'SHOPPER_B', 'PROVIDER_A']);
    const body = MerchantRefundSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === body.transactionId);
      if (!tx) {
        throw new Error(`Transaction ${body.transactionId} not found.`);
      }

      if (!db.refundRecoveries) db.refundRecoveries = [];

      // 1. Idempotency Protection: prevent duplicate recovery or shopper refund records
      const existing = db.refundRecoveries.find(
        (r) => r.merchantRefundId === body.merchantRefundId
      );
      if (existing) {
        return {
          projected: projectTransactionForRole(db, tx, session.role),
          recovery: existing,
          isDuplicate: true,
          message: 'Idempotency protection active: refund recovery already executed.',
        };
      }

      // 2. Verify original card transaction ID matches
      const expectedCardTxId = tx.paymentSimulation?.paymentGatewayTxId;
      if (expectedCardTxId && expectedCardTxId !== body.originalCardTxId) {
        throw new Error(
          `Original card transaction ID mismatch. Expected ${expectedCardTxId}, received ${body.originalCardTxId}.`
        );
      }

      // 3. Verify refund amount does not exceed original card charge amount
      if (body.refundAmount > tx.cardChargeAmount) {
        throw new Error(
          `Refund amount ₹${body.refundAmount} exceeds original card charge amount ₹${tx.cardChargeAmount}.`
        );
      }

      const nowIso = new Date().toISOString();

      // 4. Check that provider mandate is AUTHORISED and valid
      const mandate = (db.providerMandates ?? []).find(
        (m) => m.transactionId === tx.id && m.status === 'AUTHORISED'
      );
      const isMandateValid =
        mandate &&
        new Date(mandate.expiresAt).getTime() > Date.now() &&
        !mandate.cancelledAt;

      // Handle missing mandate, expired mandate, or simulated recovery failure
      const shouldFail = !isMandateValid || body.simulateRecoveryFailure || body.simulateFailure;
      if (shouldFail) {
        const failureReason = (body.simulateRecoveryFailure || body.simulateFailure)
          ? 'Simulated recovery debit from provider bank account failed.'
          : !mandate
          ? 'Provider Refund Protection Mandate not found or not authorised.'
          : 'Provider Refund Protection Mandate has expired or was cancelled.';

        const failRecord: RefundRecoveryRecord = {
          id: `rec-${Date.now()}`,
          providerId: tx.providerId || 'prov-unassigned',
          purchaseRequestId: mandate?.purchaseRequestId || `req-${tx.id}`,
          transactionId: tx.id,
          originalCardTxId: body.originalCardTxId,
          merchantRefundId: body.merchantRefundId,
          confirmedMerchantRefundAmount: body.refundAmount,
          recoveryAmount: 0,
          providerMandateId: mandate?.id || 'none',
          recoveryStatus: 'RECOVERY_FAILED',
          shopperRefundStatus: 'SHOPPER_REFUND_PENDING',
          failureReason: `${failureReason} Flagged for Admin Ops manual review.`,
          createdAt: nowIso,
        };
        db.refundRecoveries.unshift(failRecord);

        tx.merchantRefundStatus = 'MERCHANT_REFUND_CONFIRMED';
        tx.recoveryStatus = 'RECOVERY_FAILED';
        tx.shopperRefundStatus = 'SHOPPER_REFUND_PENDING';
        tx.settlementStatus = 'RECOVERY_FAILED';
        tx.flaggedForMismatch = true;
        tx.mismatchReason = failureReason;
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PROVIDER_MANDATE_RECOVERY_FAILED',
          fromState: tx.status,
          toState: tx.status,
          metadata: {
            merchantRefundId: body.merchantRefundId,
            refundAmount: body.refundAmount,
            reason: failureReason,
            flaggedForAdminReview: true,
          },
          createdAt: nowIso,
        });

        return {
          projected: projectTransactionForRole(db, tx, session.role),
          recovery: failRecord,
          isDuplicate: false,
          message: 'Recovery failed. Flagged for Admin review.',
        };
      }

      // 5. Success Path: Recover actual confirmed refund amount (handles partial refunds cleanly)
      const recoveryAmount = Math.min(body.refundAmount, mandate.maxAmount);

      const successRecord: RefundRecoveryRecord = {
        id: `rec-${Date.now()}`,
        providerId: tx.providerId || mandate.providerId,
        purchaseRequestId: mandate.purchaseRequestId,
        transactionId: tx.id,
        originalCardTxId: body.originalCardTxId,
        merchantRefundId: body.merchantRefundId,
        confirmedMerchantRefundAmount: body.refundAmount,
        recoveryAmount,
        providerMandateId: mandate.id,
        recoveryStatus: 'PROVIDER_RECOVERY_SUCCESS',
        shopperRefundStatus: 'SHOPPER_REFUND_SUCCESS',
        createdAt: nowIso,
        recoveredAt: nowIso,
        shopperRefundedAt: nowIso,
      };
      db.refundRecoveries.unshift(successRecord);

      // Record simulated refund to shopper
      db.refundRecords.unshift({
        id: `ref-${Date.now()}`,
        transactionId: tx.id,
        amount: recoveryAmount,
        reason: `Merchant refund (${body.merchantRefundId}) recovered via Perk Provider Protection Mandate & returned to Shopper.`,
        status: 'COMPLETED',
        initiatedAt: nowIso,
        completedAt: nowIso,
      });

      tx.merchantRefundStatus = 'MERCHANT_REFUND_CONFIRMED';
      tx.recoveryStatus = 'PROVIDER_RECOVERY_SUCCESS';
      tx.shopperRefundStatus = 'SHOPPER_REFUND_SUCCESS';
      tx.settlementStatus = 'RECOVERED';
      tx.updatedAt = nowIso;

      db.auditLogs.push({
        id: `aud-${Date.now()}-rec`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PROVIDER_MANDATE_RECOVERY_SUCCESS',
        fromState: tx.status,
        toState: tx.status,
        metadata: {
          merchantRefundId: body.merchantRefundId,
          recoveredAmount: recoveryAmount,
          mandateRef: mandate.mandateRef,
        },
        createdAt: nowIso,
      });

      db.auditLogs.push({
        id: `aud-${Date.now()}-shop`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'SHOPPER_REFUND_SUCCESS',
        fromState: tx.status,
        toState: tx.status,
        metadata: {
          refundAmount: recoveryAmount,
          recoveredFromProvider: true,
        },
        createdAt: nowIso,
      });

      return {
        projected: projectTransactionForRole(db, tx, session.role),
        recovery: successRecord,
        isDuplicate: false,
        message: 'Merchant refund confirmed, provider recovered & shopper refunded successfully.',
      };
    });

    return NextResponse.json({
      data: result.projected,
      recovery: result.recovery,
      isDuplicate: result.isDuplicate,
      message: result.message,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
