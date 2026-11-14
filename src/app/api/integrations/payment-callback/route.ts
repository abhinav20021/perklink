import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const PaymentCallbackSchema = z.object({
  transactionId: z.string().min(1),
  paymentOrderId: z.string().min(1),
  paymentGatewayTxId: z.string().min(1),
  amount: z.number().positive(),
  outcome: z.enum(['SUCCESS', 'FAILURE']),
  failureReason: z.string().optional(),
});

/**
 * Simulated payment gateway callback/webhook.
 * Validates orderId & amount server-side against expected transaction values
 * before transitioning to CARD_PAYMENT_SUCCESS and triggering Merchant Order Creation.
 */
export async function POST(req: Request) {
  try {
    const session = await getRequiredSession(['PROVIDER_A', 'ADMIN_OPS']);
    const payload = PaymentCallbackSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === payload.transactionId);
      if (!tx) throw new Error(`Transaction ${payload.transactionId} not found`);

      const sim = tx.paymentSimulation;
      if (!sim || sim.paymentOrderId !== payload.paymentOrderId) {
        throw new Error(
          'Callback validation failed: paymentOrderId does not match active checkout session.'
        );
      }

      if (payload.amount !== tx.cardChargeAmount) {
        throw new Error(
          `Callback validation failed: callback amount ₹${payload.amount} does not match expected card charge ₹${tx.cardChargeAmount}.`
        );
      }

      const nowIso = new Date().toISOString();
      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);

      if (payload.outcome === 'FAILURE') {
        validateTransitionPreconditions(tx, 'PAYMENT_FAILED', session.role, {
          mandate,
        });
        sim.status = 'FAILED';
        sim.callbackVerified = false;
        sim.timestamp = nowIso;
        sim.failureReason =
          payload.failureReason ??
          'Simulated issuer 3DS authentication declined.';
        tx.status = 'PAYMENT_FAILED';
        tx.cardPaymentStatus = 'FAILED';
        tx.providerMandateStatus = 'NOT_CREATED';
        tx.settlementStatus = 'BLOCKED_PAYMENT_PENDING';
        tx.updatedAt = nowIso;

        db.auditLogs.push({
          id: `aud-${Date.now()}`,
          transactionId: tx.id,
          actorUserId: session.userId,
          actorRole: session.role,
          action: 'PAYMENT_CALLBACK_FAILED',
          fromState: 'CARD_PAYMENT_PENDING',
          toState: 'PAYMENT_FAILED',
          metadata: {
            paymentOrderId: payload.paymentOrderId,
            reason: sim.failureReason,
          },
          createdAt: nowIso,
        });

        return projectTransactionForRole(db, tx, session.role);
      }

      // SUCCESS: validate and transition CARD_PAYMENT_PENDING -> CARD_PAYMENT_SUCCESS -> ORDER_CREATED
      validateTransitionPreconditions(tx, 'CARD_PAYMENT_SUCCESS', session.role, {
        mandate,
      });
      sim.status = 'SUCCESS';
      sim.callbackVerified = true;
      sim.timestamp = nowIso;
      tx.status = 'CARD_PAYMENT_SUCCESS';
      tx.cardPaymentStatus = 'SUCCESS';

      // Automatically create mandatory Provider Refund Protection Mandate on successful payment
      if (!db.providerMandates) db.providerMandates = [];
      let provMandate = db.providerMandates.find((m) => m.transactionId === tx.id);
      const purchaseReq = db.purchaseRequests.find((r) => r.transactionId === tx.id);
      if (!provMandate) {
        provMandate = {
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
        db.providerMandates.unshift(provMandate);
      }
      tx.providerMandateStatus = provMandate.status;
      tx.settlementStatus =
        provMandate.status === 'AUTHORISED'
          ? 'MANDATE_AUTHORISED_SETTLEMENT_HELD'
          : 'BLOCKED_MANDATE_PENDING';

      db.auditLogs.push({
        id: `aud-${Date.now()}-1`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PAYMENT_CALLBACK_VERIFIED_SUCCESS',
        fromState: 'CARD_PAYMENT_PENDING',
        toState: 'CARD_PAYMENT_SUCCESS',
        metadata: {
          paymentOrderId: payload.paymentOrderId,
          paymentGatewayTxId: payload.paymentGatewayTxId,
          amount: payload.amount,
        },
        createdAt: nowIso,
      });

      // Automatically trigger Simulated Merchant Order Creation (separate from payment confirmation)
      validateTransitionPreconditions(tx, 'ORDER_CREATED', session.role, {
        mandate,
      });
      const product = db.products.find((p) => p.id === tx.productId)!;
      const provider = db.providerProfiles.find((p) => p.id === tx.providerId);
      const card = db.cardProductMetadata.find(
        (c) =>
          c.providerId === tx.providerId &&
          (!tx.offerId ||
            db.bankOffers
              .find((o) => o.id === tx.offerId)
              ?.bankName.toLowerCase() === c.bankName.toLowerCase())
      );

      const merchantPrefix = product.merchant
        .slice(0, 2)
        .toUpperCase();
      const merchantOrderId = `MER-${merchantPrefix}-${Math.floor(
        100000 + Math.random() * 899999
      )}`;
      const expectedDeliveryDate = new Date(
        Date.now() + 3 * 24 * 3600 * 1000
      )
        .toISOString()
        .slice(0, 10);

      const deliveryInfo = tx.deliveryInfo ?? {
        recipientName: 'Rahul Sharma',
        mobileNumber: '+91 98100 44321',
        shippingAddress: 'Flat 402, Lake View Residency, Madhapur, Hyderabad',
        pinCode: '500081',
      };

      db.merchantOrders.unshift({
        id: `mo-${Date.now()}`,
        transactionId: tx.id,
        merchantOrderId,
        paymentGatewayTxId: payload.paymentGatewayTxId,
        merchantName: product.merchant,
        payerDisplayLabel: `${provider?.displayAlias ?? 'Verified Provider'} • ${card?.bankName ?? 'Bank'} •••• ${card?.maskedLast4 ?? '4387'}`,
        recipientName: deliveryInfo.recipientName,
        recipientPhone: deliveryInfo.mobileNumber,
        shippingAddress: deliveryInfo.shippingAddress,
        pinCode: deliveryInfo.pinCode,
        deliveryInstructions: deliveryInfo.deliveryInstructions,
        expectedDeliveryDate,
        integrationMode: 'SIMULATED_SEPARATED_IDENTITY',
        createdAt: nowIso,
      });

      db.deliveryEvents.push(
        {
          id: `del-${Date.now()}-1`,
          transactionId: tx.id,
          merchantOrderId,
          status: 'ORDER_PLACED',
          description: `Simulated merchant order placed on ${product.merchant} with separated Perk Provider payer and Shopper recipient identities.`,
          timestamp: nowIso,
          actor: 'Simulated Merchant Checkout',
        },
        {
          id: `del-${Date.now()}-2`,
          transactionId: tx.id,
          merchantOrderId,
          status: 'CONFIRMED',
          description: `${product.merchant} confirmed order ${merchantOrderId}. Expected delivery ${expectedDeliveryDate}.`,
          timestamp: nowIso,
          actor: `${product.merchant} Simulation`,
        }
      );

      tx.status = 'ORDER_CREATED';
      tx.updatedAt = nowIso;

      db.auditLogs.push({
        id: `aud-${Date.now()}-2`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'MERCHANT_ORDER_CREATED_SEPARATED_IDENTITY',
        fromState: 'CARD_PAYMENT_SUCCESS',
        toState: 'ORDER_CREATED',
        metadata: {
          merchantOrderId,
          expectedDeliveryDate,
          payerRole: 'CLASS_A_PROVIDER',
          recipientRole: 'CLASS_B_SHOPPER_MASKED',
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

