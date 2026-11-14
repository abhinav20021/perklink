import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { runProductAndOfferIntelligence } from '@/lib/ai/offer-intelligence';
import { generateRecommendationExplanation } from '@/lib/ai/recommendation-intelligence';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, readDatabase } from '@/lib/db/store';
import type { AIAnalysisResult, Product, Transaction } from '@/lib/db/types';
import { evaluateAllOffers } from '@/lib/finance/savings-engine';
import { rankProvidersForOffer } from '@/lib/matching/provider-matcher';

const ExtractProductSchema = z.object({
  url: z.string().optional().default(''),
  manualInput: z
    .object({
      title: z.string().min(2),
      brand: z.string().optional(),
      model: z.string().optional(),
      merchant: z.string().min(2),
      category: z.string().min(2),
      listedPrice: z.number().positive(),
    })
    .optional(),
  customOfferText: z.string().optional(),
  isEmiPurchase: z.boolean().optional().default(false),
});

export async function POST(req: Request) {
  try {
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = ExtractProductSchema.parse(await req.json());

    if (!body.url?.trim() && !body.manualInput) {
      return NextResponse.json(
        { error: 'Please paste a product URL or enter product details manually.' },
        { status: 400 }
      );
    }

    const dbSnapshot = await readDatabase();
    const aiOutput = await runProductAndOfferIntelligence({
      url: body.url.trim(),
      manualInput: body.manualInput,
      customOfferText: body.customOfferText,
      curatedProducts: dbSnapshot.products,
      bankOffers: dbSnapshot.bankOffers,
    });

    const result = await mutateDatabase(async (db) => {
      const nowIso = new Date().toISOString();

      // Reuse matching curated product or create new extracted product record
      let product: Product | undefined = db.products.find(
        (p) =>
          p.title.toLowerCase() ===
            aiOutput.productUnderstanding.productName.toLowerCase() &&
          p.listedPrice === aiOutput.productUnderstanding.listedPrice
      );

      if (!product) {
        product = {
          id: `prod-${Date.now()}`,
          url: aiOutput.productUnderstanding.productUrl,
          title: aiOutput.productUnderstanding.productName,
          brand: aiOutput.productUnderstanding.brand,
          model: aiOutput.productUnderstanding.model,
          merchant: aiOutput.productUnderstanding.merchant,
          category: aiOutput.productUnderstanding.category,
          listedPrice: aiOutput.productUnderstanding.listedPrice,
          imageUrl: aiOutput.productUnderstanding.imageUrl || '/images/laptop-asus.svg',
          extractionSource: body.manualInput
            ? 'MANUAL_ENTRY'
            : aiOutput.usedFallback
            ? 'CURATED_DEMO_FALLBACK'
            : 'AI_LIVE_URL',
          specs: {
            Brand: aiOutput.productUnderstanding.brand,
            Model: aiOutput.productUnderstanding.model,
            Merchant: aiOutput.productUnderstanding.merchant,
          },
          createdAt: nowIso,
        };
        db.products.unshift(product);
      }

      const nextNum = 1001 + db.transactions.length;
      const transactionId = `PLK-2026-${nextNum}`;

      // Deterministic backend savings calculation across all DB offers
      const savingsComparisons = evaluateAllOffers(
        product,
        db.bankOffers,
        transactionId,
        db.config,
        { isEmiPurchase: body.isEmiPurchase }
      );
      db.savingsComparisons.push(...savingsComparisons);

      const recommendedSavings =
        savingsComparisons.find((s) => s.isRecommended) ?? savingsComparisons[0];
      const recommendedOffer = recommendedSavings
        ? db.bankOffers.find((o) => o.id === recommendedSavings.offerId)
        : undefined;

      // Rank providers for the top recommended offer right away so the Recommendation screen has rich data
      const providerMatches =
        recommendedOffer && recommendedSavings
          ? rankProvidersForOffer({
              transactionId,
              product,
              offer: recommendedOffer,
              cardChargeAmount: recommendedSavings.cardChargeAmount,
              providers: db.providerProfiles,
              cards: db.cardProductMetadata,
              consents: db.consentRecords,
            })
          : [];
      db.providerMatches.push(...providerMatches);

      const aiRec =
        recommendedSavings && providerMatches.length >= 0
          ? await generateRecommendationExplanation({
              product,
              savingsComparisons,
              selectedOffer: recommendedSavings,
              providerMatches,
            })
          : null;

      const aiAnalysis: AIAnalysisResult = {
        id: `ai-${Date.now()}`,
        productId: product.id,
        transactionId,
        sourceUrl: body.url.trim() || product.url,
        usedFallback: aiOutput.usedFallback,
        fallbackReason: aiOutput.fallbackReason,
        productUnderstanding: aiOutput.productUnderstanding,
        parsedOffers: aiOutput.parsedOffers,
        shopperExplanation: aiOutput.shopperExplanation,
        uncertainties: aiOutput.uncertainties,
        modelUsed: aiOutput.modelUsed,
        createdAt: nowIso,
      };
      db.aiAnalysisResults.unshift(aiAnalysis);

      const newTx: Transaction = {
        id: transactionId,
        status: 'PRODUCT_ANALYSED',
        shopperId: session.userId,
        productId: product.id,
        listedPrice: product.listedPrice,
        bankDiscount: 0,
        cardChargeAmount: product.listedPrice,
        providerReward: db.config.defaultProviderRewardInr,
        platformFee: db.config.defaultPlatformFeeInr,
        mandateAmount: product.listedPrice,
        shopperSavings: 0,
        aiRecommendationExplanation: aiRec?.providerRecommendationReason,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      db.transactions.unshift(newTx);

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'AI_PRODUCT_AND_OFFER_ANALYSIS',
        fromState: 'CREATED',
        toState: 'PRODUCT_ANALYSED',
        metadata: {
          usedFallback: aiOutput.usedFallback,
          modelUsed: aiOutput.modelUsed,
          eligibleOffersCount: savingsComparisons.filter(
            (s) => s.eligibilityStatus === 'ELIGIBLE'
          ).length,
        },
        createdAt: nowIso,
      });

      return {
        transaction: newTx,
        product,
        aiAnalysis,
        savingsComparisons,
        providerMatches,
        aiRecommendation: aiRec,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

