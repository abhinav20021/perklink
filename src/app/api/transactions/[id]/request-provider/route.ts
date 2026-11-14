import { NextResponse } from 'next/server';
import { z } from 'zod';
import { ApiError, handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { evaluateOfferForProduct } from '@/lib/finance/savings-engine';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const RequestProviderSchema = z.object({
  providerId: z.string().min(1),
  cardMetadataId: z.string().min(1),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = RequestProviderSchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      let resolvedProviderId = body.providerId;
      let resolvedCardMetadataId = body.cardMetadataId;

      // Transparent resolution for masked Class B provider references
      if (
        body.providerId.startsWith('prov-masked-') ||
        body.providerId.startsWith('Provider ') ||
        body.cardMetadataId.startsWith('card-masked-')
      ) {
        const txMatches = db.providerMatches.filter((m) => m.transactionId === tx.id);
        let matchIdx = -1;
        if (body.providerId.startsWith('prov-masked-')) {
          matchIdx = parseInt(body.providerId.replace('prov-masked-', ''), 10) - 1;
        } else if (body.providerId.startsWith('Provider ')) {
          matchIdx = parseInt(body.providerId.replace('Provider ', ''), 10) - 1;
        }

        const matched = (matchIdx >= 0 && txMatches[matchIdx]) ? txMatches[matchIdx] : txMatches[0];
        if (matched) {
          resolvedProviderId = matched.providerId;
          resolvedCardMetadataId = matched.cardMetadataId;
        }
      }

      const provider = db.providerProfiles.find((p) => p.id === resolvedProviderId);
      const card = db.cardProductMetadata.find((c) => c.id === resolvedCardMetadataId);
      if (!provider || !card) {
        throw new Error('Selected provider or card metadata not found.');
      }

      if (!tx.offerId) {
        throw new ApiError('No eligible bank offer selected for this purchase request.', 400);
      }

      const product = db.products.find((p) => p.id === tx.productId);
      const offer = db.bankOffers.find((o) => o.id === tx.offerId);
      if (!product || !offer) {
        throw new ApiError('Product or selected bank offer not found.', 404);
      }

      // Revalidate offer eligibility before purchase-request submission
      const evalResult = evaluateOfferForProduct(product, offer, tx.id, db.config);
      if (evalResult.eligibilityStatus !== 'ELIGIBLE') {
        throw new ApiError(`Selected offer is no longer eligible: ${evalResult.eligibilityReason}`, 400);
      }

      validateTransitionPreconditions(tx, 'PROVIDER_MATCHING', session.role);
      const fromState = tx.status;

      tx.providerId = provider.id;
      tx.providerReward = card.rewardPreferenceInr;
      tx.mandateAmount =
        tx.cardChargeAmount + tx.providerReward + tx.platformFee;
      tx.shopperSavings = Math.max(0, tx.listedPrice - tx.mandateAmount);
      tx.selectedOfferSnapshot = {
        offerId: offer.id,
        bankName: offer.bankName,
        cardType: offer.cardType,
        offerTitle: offer.offerTitle,
        discountPercentage: evalResult.discountPercentage,
        maxDiscount: evalResult.maxDiscount,
        actualDiscount: evalResult.actualDiscount,
        cardChargeAmount: evalResult.cardChargeAmount,
        shopperNetSavings: evalResult.shopperNetSavings,
      };
      tx.status = 'PROVIDER_MATCHING';
      tx.updatedAt = new Date().toISOString();

      // Supersede any old pending request on this transaction
      for (const existing of db.purchaseRequests) {
        if (existing.transactionId === tx.id && existing.status === 'PENDING') {
          existing.status = 'EXPIRED';
        }
      }

      db.purchaseRequests.unshift({
        id: `req-${Date.now()}`,
        transactionId: tx.id,
        providerId: provider.id,
        cardMetadataId: card.id,
        offeredReward: tx.providerReward,
        offerId: offer.id,
        bankName: offer.bankName,
        cardType: offer.cardType,
        discountAmount: evalResult.actualDiscount,
        status: 'PENDING',
        createdAt: tx.updatedAt,
      });

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PURCHASE_REQUEST_SENT_TO_PROVIDER',
        fromState,
        toState: 'PROVIDER_MATCHING',
        metadata: {
          providerId: provider.id,
          cardMetadataId: card.id,
          offeredReward: tx.providerReward,
        },
        createdAt: tx.updatedAt,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

