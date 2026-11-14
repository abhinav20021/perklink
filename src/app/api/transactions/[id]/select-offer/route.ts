import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { generateRecommendationExplanation } from '@/lib/ai/recommendation-intelligence';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { evaluateAllOffers } from '@/lib/finance/savings-engine';
import { rankProvidersForOffer } from '@/lib/matching/provider-matcher';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const SelectOfferSchema = z.object({
  offerId: z.string().min(1),
  isEmiPurchase: z.boolean().optional().default(false),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = SelectOfferSchema.parse(await req.json());

    const result = await mutateDatabase(async (db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const product = db.products.find((p) => p.id === tx.productId)!;
      const offer = db.bankOffers.find((o) => o.id === body.offerId);
      if (!offer) throw new Error(`Offer ${body.offerId} not found`);

      const comparisons = evaluateAllOffers(
        product,
        db.bankOffers,
        tx.id,
        db.config,
        { isEmiPurchase: body.isEmiPurchase }
      );
      const selectedEval = comparisons.find((c) => c.offerId === offer.id)!;

      if (selectedEval.eligibilityStatus === 'NOT_ELIGIBLE') {
        throw new Error(
          `Cannot select ineligible offer: ${selectedEval.eligibilityReason}`
        );
      }

      // Rank providers transparently for this offer
      const providerMatches = rankProvidersForOffer({
        transactionId: tx.id,
        product,
        offer,
        cardChargeAmount: selectedEval.cardChargeAmount,
        providers: db.providerProfiles,
        cards: db.cardProductMetadata,
        consents: db.consentRecords,
      });

      const aiRec = await generateRecommendationExplanation({
        product,
        savingsComparisons: comparisons,
        selectedOffer: selectedEval,
        providerMatches,
      });

      // Replace stored comparisons & provider matches for this transaction
      db.savingsComparisons = db.savingsComparisons.filter(
        (s) => s.transactionId !== tx.id
      );
      db.savingsComparisons.push(...comparisons);

      db.providerMatches = db.providerMatches.filter(
        (m) => m.transactionId !== tx.id
      );
      db.providerMatches.push(...providerMatches);

      const topReward =
        providerMatches[0]?.offeredReward ?? db.config.defaultProviderRewardInr;

      tx.offerId = offer.id;
      tx.bankDiscount = selectedEval.actualDiscount;
      tx.cardChargeAmount = selectedEval.cardChargeAmount;
      tx.providerReward = topReward;
      tx.platformFee = db.config.defaultPlatformFeeInr;
      tx.mandateAmount =
        selectedEval.cardChargeAmount + topReward + tx.platformFee;
      tx.shopperSavings = Math.max(0, tx.listedPrice - tx.mandateAmount);
      tx.aiRecommendationExplanation = aiRec.providerRecommendationReason;

      if (tx.status === 'PRODUCT_ANALYSED') {
        validateTransitionPreconditions(tx, 'OFFER_SELECTED', session.role);
        tx.status = 'OFFER_SELECTED';
      }
      tx.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'OFFER_SELECTED_AND_PROVIDERS_RANKED',
        fromState: 'PRODUCT_ANALYSED',
        toState: tx.status,
        metadata: {
          offerId: offer.id,
          bank: offer.bankName,
          mandateAmount: tx.mandateAmount,
          matchedProviders: providerMatches.length,
        },
        createdAt: tx.updatedAt,
      });

      return {
        data: projectTransactionForRole(db, tx, session.role),
        aiRecommendation: aiRec,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

