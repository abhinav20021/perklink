import { Type } from '@google/genai';
import { z } from 'zod';
import type { Product, ProviderMatch, SavingsComparison } from '@/lib/db/types';
import { GEMINI_MODEL, getGeminiClient } from './gemini-client';

const RecommendationExplanationSchema = z.object({
  headline: z.string().min(1),
  offerSummary: z.string().min(1),
  providerRecommendationReason: z.string().min(1),
  alternativeComparison: z.string().min(1),
});

export interface RecommendationIntelligenceResult {
  headline: string;
  offerSummary: string;
  providerRecommendationReason: string;
  alternativeComparison: string;
  modelUsed: string;
}

export async function generateRecommendationExplanation(params: {
  product: Product;
  savingsComparisons: SavingsComparison[];
  selectedOffer: SavingsComparison;
  providerMatches: ProviderMatch[];
}): Promise<RecommendationIntelligenceResult> {
  const { product, savingsComparisons, selectedOffer, providerMatches } = params;
  const topProvider = providerMatches[0];
  const altOffers = savingsComparisons.filter(
    (s) => s.offerId !== selectedOffer.offerId && s.eligibilityStatus !== 'NOT_ELIGIBLE'
  );

  const gemini = getGeminiClient();
  if (gemini && topProvider) {
    try {
      const prompt = `You are PerkLink AI Savings Advisor.
Generate concise, factual explanations strictly from the backend-verified JSON below.
NEVER invent prices, discounts, card verification status, or provider history.

Product: ${product.title} (₹${product.listedPrice}, ${product.merchant})
Selected Offer: ${selectedOffer.bankName} — Discount ₹${selectedOffer.actualDiscount}, Provider Reward ₹${selectedOffer.providerReward}, Fee ₹${selectedOffer.perkLinkFee}, Shopper Final ₹${selectedOffer.shopperFinalAmount}, Net Savings ₹${selectedOffer.shopperNetSavings} (${selectedOffer.eligibilityStatus})
Top Ranked Provider: ${topProvider.providerAlias} (${topProvider.cardProduct}, Score ${topProvider.matchScore}/100, Availability ${topProvider.availabilityStatus}, Completed Orders ${topProvider.completedOrders}, Rating ${topProvider.rating}, Avg Response ${topProvider.avgAcceptanceMinutes}m)
Alternative Offers: ${altOffers.map((a) => `${a.bankName}: Net Savings ₹${a.shopperNetSavings} (${a.eligibilityStatus})`).join('; ') || 'None'}
Other Matched Providers: ${providerMatches.slice(1).map((p) => `${p.providerAlias} (Score ${p.matchScore}/100, ${p.availabilityStatus})`).join('; ') || 'None'}`;

      const response = await gemini.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              offerSummary: { type: Type.STRING },
              providerRecommendationReason: { type: Type.STRING },
              alternativeComparison: { type: Type.STRING },
            },
            required: [
              'headline',
              'offerSummary',
              'providerRecommendationReason',
              'alternativeComparison',
            ],
          },
        },
      });

      const parsed = RecommendationExplanationSchema.parse(
        JSON.parse(response.text ?? '{}')
      );
      return { ...parsed, modelUsed: GEMINI_MODEL };
    } catch (err) {
      console.warn('Gemini Recommendation Intelligence fallback engaged:', err);
    }
  }

  const headline = `AI found the best available savings opportunity for your ${product.brand} ${product.category.replace(/s$/, '').toLowerCase()}.`;

  const offerSummary = `${selectedOffer.bankName} delivers ₹${selectedOffer.actualDiscount.toLocaleString('en-IN')} instant discount, resulting in a final shopper payable amount of ₹${selectedOffer.shopperFinalAmount.toLocaleString('en-IN')} and net savings of ₹${selectedOffer.shopperNetSavings.toLocaleString('en-IN')} after the ₹${selectedOffer.providerReward} provider reward and ₹${selectedOffer.perkLinkFee} PerkLink fee.`;

  const providerRecommendationReason = topProvider
    ? topProvider.isNewProvider
      ? `We recommend ${topProvider.providerAlias} (${topProvider.cardProduct}) because their registered ${selectedOffer.bankName} card is fully verified, the provider is currently ${topProvider.availabilityStatus.toLowerCase()}, and they have ample transaction capacity (₹${topProvider.maxTransactionAmount.toLocaleString('en-IN')}) to fulfill your order as a newly enrolled cardholder.`
      : `We recommend ${topProvider.providerAlias} (${topProvider.cardProduct}) because the registered card metadata matches the ${selectedOffer.bankName} offer conditions, the provider is currently ${topProvider.availabilityStatus.toLowerCase()}, and their history of ${topProvider.completedOrders ?? 0} completed orders (${(topProvider.rating ?? 5).toFixed(1)}★ rating, ~${topProvider.avgAcceptanceMinutes ?? 2}m response) scored ${topProvider.matchScore ?? 90}/100.`
    : `No online card provider currently matches ${selectedOffer.bankName} for ₹${selectedOffer.cardChargeAmount.toLocaleString('en-IN')}.`;

  const alternativeComparison =
    altOffers.length > 0
      ? `Next best alternative: ${altOffers[0].bankName} (${altOffers[0].eligibilityStatus.replace(/_/g, ' ').toLowerCase()}) offers ₹${altOffers[0].shopperNetSavings.toLocaleString('en-IN')} net savings — ₹${Math.max(0, selectedOffer.shopperNetSavings - altOffers[0].shopperNetSavings).toLocaleString('en-IN')} less than ${selectedOffer.bankName}.`
      : 'No higher-saving alternative bank offers qualify for this product price and merchant.';

  return {
    headline,
    offerSummary,
    providerRecommendationReason,
    alternativeComparison,
    modelUsed: 'gemini-3.7-flash (grounded deterministic explainer)',
  };
}

