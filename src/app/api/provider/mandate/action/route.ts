import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';

const ProviderMandateActionSchema = z.object({
  transactionId: z.string().min(1),
  action: z.enum(['APPROVE', 'CANCEL', 'RETRY']),
  simulatedPinConfirmed: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession(['PROVIDER_A', 'ADMIN_OPS']);
    const body = ProviderMandateActionSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === body.transactionId);
      if (!tx) {
        throw new Error(`Transaction ${body.transactionId} not found.`);
      }

      if (!db.providerMandates) db.providerMandates = [];
      let mandate = db.providerMandates.find((m) => m.transactionId === tx.id);

      const nowIso = new Date().toISOString();

      if (!mandate) {
        const purchaseReq = db.purchaseRequests.find((r) => r.transactionId === tx.id);
        mandate = {
          id: `pmand-${Date.now()}`,
          providerId: tx.providerId || 'prov-arjun',
          purchaseRequestId: purchaseReq?.id || `req-${tx.id}`,
          transactionId: tx.id,
          mandateRef: `PLK-PROV-MAND-${Math.floor(1000 + Math.random() * 9000)}`,
          purpose: 'PerkLink Return & Cancellation Protection for Merchant Card Refunds',
          maxAmount: tx.cardChargeAmount,
          status: 'PENDING',
          createdAt: nowIso,
          expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        };
        db.providerMandates.unshift(mandate);
      }

      if (body.action === 'APPROVE') {
        mandate.status = 'AUTHORISED';
        mandate.authorisedAt = nowIso;
        tx.providerMandateStatus = 'AUTHORISED';
        tx.settlementStatus = 'MANDATE_AUTHORISED_SETTLEMENT_HELD';
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PROVIDER_REFUND_PROTECTION_MANDATE_AUTHORISED',
          fromState: 'CARD_PAYMENT_SUCCESS',
          toState: tx.status,
          metadata: {
            mandateRef: mandate.mandateRef,
            maxAmount: mandate.maxAmount,
            settlementStatus: tx.settlementStatus,
            simulatedPinConfirmed: Boolean(body.simulatedPinConfirmed),
          },
          createdAt: nowIso,
        });
      } else if (body.action === 'CANCEL') {
        mandate.status = 'CANCELLED';
        mandate.cancelledAt = nowIso;
        tx.providerMandateStatus = 'CANCELLED';
        tx.settlementStatus = 'BLOCKED_MANDATE_PENDING';
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PROVIDER_REFUND_PROTECTION_MANDATE_CANCELLED',
          fromState: tx.status,
          toState: tx.status,
          metadata: {
            mandateRef: mandate.mandateRef,
            settlementStatus: tx.settlementStatus,
          },
          createdAt: nowIso,
        });
      } else if (body.action === 'RETRY') {
        mandate.status = 'PENDING';
        mandate.cancelledAt = undefined;
        tx.providerMandateStatus = 'PENDING';
        tx.settlementStatus = 'BLOCKED_MANDATE_PENDING';
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PROVIDER_REFUND_PROTECTION_MANDATE_RETRY',
          fromState: tx.status,
          toState: tx.status,
          metadata: {
            mandateRef: mandate.mandateRef,
            settlementStatus: tx.settlementStatus,
          },
          createdAt: nowIso,
        });
      }

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({
      data: result,
      message:
        body.action === 'APPROVE'
          ? 'Refund Protection Mandate successfully authorised.'
          : body.action === 'CANCEL'
          ? 'Refund Protection Mandate cancelled. Settlement remains blocked.'
          : 'Mandate setup reset for retry.',
    });
  } catch (error) {
    return handleApiError(error);
  }
}
