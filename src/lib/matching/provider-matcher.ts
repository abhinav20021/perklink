import type {
  BankOffer,
  CardProductMetadata,
  ConsentRecord,
  Product,
  ProviderMatch,
  ProviderProfile,
  ProviderScoreBreakdown,
} from '@/lib/db/types';

export interface RankProvidersInput {
  transactionId: string;
  product: Product;
  offer: BankOffer;
  cardChargeAmount: number;
  providers: ProviderProfile[];
  cards: CardProductMetadata[];
  consents: ConsentRecord[];
}

/**
 * Transparent 100-point deterministic provider scoring algorithm:
 * 1. Card/Offer Compatibility (35 pts): Bank match + category/variant compatibility + active consent
 * 2. Provider Availability (20 pts): ONLINE (20), BUSY (10), OFFLINE (0)
 * 3. Transaction Amount Capacity (15 pts): maxTransactionAmount >= cardChargeAmount
 * 4. Previous Successful Fulfilment (12 pts): normalized completedOrders (max at 40+ orders)
 * 5. Average Response Time (10 pts): faster acceptance minutes score higher
 * 6. Provider Rating (8 pts): rating / 5 * 8
 */
export function rankProvidersForOffer(input: RankProvidersInput): ProviderMatch[] {
  const {
    transactionId,
    product,
    offer,
    cardChargeAmount,
    providers,
    cards,
    consents,
  } = input;

  const matches: ProviderMatch[] = [];

  for (const provider of providers) {
    const hasConsent = consents.some(
      (c) =>
        c.userId === provider.userId &&
        c.consentType === 'CARD_MATCH_OPT_IN' &&
        c.granted &&
        !c.revokedAt
    );
    if (!hasConsent) continue;

    const providerCards = cards.filter(
      (c) => c.providerId === provider.id && c.isActive
    );

    for (const card of providerCards) {
      // Only match cards from the offer's bank
      if (card.bankName.toLowerCase() !== offer.bankName.toLowerCase()) {
        continue;
      }

      // 1. Card / Offer compatibility (35)
      let compatibilityScore = 25; // bank matches
      const supportsCategory =
        provider.supportedOfferCategories.includes('All') ||
        provider.supportedOfferCategories.some(
          (cat) => cat.toLowerCase() === product.category.toLowerCase()
        );
      if (supportsCategory) compatibilityScore += 5;
      if (card.isVerifiedDemo) compatibilityScore += 5;

      // 2. Availability (20)
      const availabilityScore =
        provider.availabilityStatus === 'ONLINE'
          ? 20
          : provider.availabilityStatus === 'BUSY'
          ? 10
          : 0;

      // 3. Transaction capacity (15)
      const hasCapacity = provider.maxTransactionAmount >= cardChargeAmount;
      const capacityScore = hasCapacity ? 15 : 0;

      // Skip providers with zero capacity or offline if online ones exist, but include busy for comparison
      if (!hasCapacity || provider.availabilityStatus === 'OFFLINE') {
        continue;
      }

      // 4. Previous successful fulfilment (12)
      const fulfilmentScore = Math.min(
        12,
        Math.round((Math.min(provider.completedOrders, 40) / 40) * 12)
      );

      // 5. Response time (10)
      const responseTimeScore = Math.max(
        2,
        Math.min(10, Math.round(11 - provider.avgAcceptanceMinutes))
      );

      // 6. Rating (8)
      const ratingScore = Math.round((provider.rating / 5) * 8);

      const totalScore =
        compatibilityScore +
        availabilityScore +
        capacityScore +
        fulfilmentScore +
        responseTimeScore +
        ratingScore;

      const scoreBreakdown: ProviderScoreBreakdown = {
        compatibilityScore,
        availabilityScore,
        capacityScore,
        fulfilmentScore,
        responseTimeScore,
        ratingScore,
        totalScore,
      };

      const aiRationale = `${provider.displayAlias} holds an active ${card.bankName} ${card.cardVariant} card (${card.cardCategory}), is currently ${provider.availabilityStatus.toLowerCase()}, supports up to ₹${provider.maxTransactionAmount.toLocaleString('en-IN')}, and has ${provider.completedOrders} completed orders at a ${provider.rating.toFixed(1)}★ rating (~${provider.avgAcceptanceMinutes}m response).`;

      matches.push({
        id: `pm-${transactionId}-${provider.id}-${card.id}`,
        transactionId,
        providerId: provider.id,
        providerAlias: provider.displayAlias,
        cardMetadataId: card.id,
        bankName: card.bankName,
        cardProduct: `${card.bankName} ${card.cardVariant}`,
        cardCategory: card.cardCategory,
        maskedLast4: card.maskedLast4,
        availabilityStatus: provider.availabilityStatus,
        completedOrders: provider.completedOrders,
        avgAcceptanceMinutes: provider.avgAcceptanceMinutes,
        rating: provider.rating,
        maxTransactionAmount: provider.maxTransactionAmount,
        offerId: offer.id,
        offeredReward: card.rewardPreferenceInr,
        matchScore: totalScore,
        scoreBreakdown,
        aiRationale,
        isRecommended: false,
        createdAt: new Date().toISOString(),
      });
    }
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  if (matches.length > 0) {
    matches[0].isRecommended = true;
  }

  return matches;
}

