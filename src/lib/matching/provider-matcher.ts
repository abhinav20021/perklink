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

  const establishedMatches: ProviderMatch[] = [];
  const newMatches: ProviderMatch[] = [];

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
      // Mandatory eligibility: Only match cards from the offer's bank
      if (card.bankName.toLowerCase() !== offer.bankName.toLowerCase()) {
        continue;
      }

      // Mandatory eligibility: Category support
      const supportsCategory =
        provider.supportedOfferCategories.includes('All') ||
        provider.supportedOfferCategories.some(
          (cat) => cat.toLowerCase() === product.category.toLowerCase()
        );
      if (!supportsCategory) continue;

      // Mandatory eligibility: Transaction capacity
      const hasCapacity = provider.maxTransactionAmount >= cardChargeAmount;
      if (!hasCapacity) continue;

      // Mandatory eligibility: Account status and availability
      if (provider.availabilityStatus === 'OFFLINE') continue;

      const isNew = Boolean(
        provider.isNewProvider ||
        ((!provider.completedOrders || provider.completedOrders === 0) &&
         (!provider.rating || provider.rating === 0))
      );

      if (isNew) {
        // Newly enrolled provider:
        // Do NOT assign fabricated ratings, completed orders count, response times, or match score.
        newMatches.push({
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
          completedOrders: 0,
          avgAcceptanceMinutes: undefined,
          rating: undefined,
          maxTransactionAmount: provider.maxTransactionAmount,
          offerId: offer.id,
          offeredReward: card.rewardPreferenceInr,
          matchScore: null,
          isNewProvider: true,
          aiRationale: `${provider.displayAlias} is a newly enrolled verified cardholder with an active ${card.bankName} ${card.cardVariant} card (${card.cardCategory}), currently ${provider.availabilityStatus.toLowerCase()}, with transaction limit up to ₹${provider.maxTransactionAmount.toLocaleString('en-IN')}.`,
          isRecommended: false,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Established provider: evaluate full deterministic 100-pt scoring
        let compatibilityScore = 25; // bank matches
        if (supportsCategory) compatibilityScore += 5;
        if (card.isVerifiedDemo) compatibilityScore += 5;

        const availabilityScore =
          provider.availabilityStatus === 'ONLINE'
            ? 20
            : provider.availabilityStatus === 'BUSY'
            ? 10
            : 0;

        const capacityScore = 15;

        const fulfilmentScore = Math.min(
          12,
          Math.round((Math.min(provider.completedOrders ?? 0, 40) / 40) * 12)
        );

        const responseTimeScore = Math.max(
          2,
          Math.min(10, Math.round(11 - (provider.avgAcceptanceMinutes ?? 5)))
        );

        const ratingScore = Math.round(((provider.rating ?? 4.5) / 5) * 8);

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

        const aiRationale = `${provider.displayAlias} holds an active ${card.bankName} ${card.cardVariant} card (${card.cardCategory}), is currently ${provider.availabilityStatus.toLowerCase()}, supports up to ₹${provider.maxTransactionAmount.toLocaleString('en-IN')}, and has ${provider.completedOrders} completed orders at a ${(provider.rating ?? 5).toFixed(1)}★ rating (~${provider.avgAcceptanceMinutes}m response).`;

        establishedMatches.push({
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
          completedOrders: provider.completedOrders ?? 0,
          avgAcceptanceMinutes: provider.avgAcceptanceMinutes ?? 5,
          rating: provider.rating ?? 5.0,
          maxTransactionAmount: provider.maxTransactionAmount,
          offerId: offer.id,
          offeredReward: card.rewardPreferenceInr,
          matchScore: totalScore,
          scoreBreakdown,
          isNewProvider: false,
          aiRationale,
          isRecommended: false,
          createdAt: new Date().toISOString(),
        });
      }
    }
  }

  // Rank established providers by matchScore descending
  establishedMatches.sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));

  // Rank new providers by capacity and availability
  newMatches.sort((a, b) => b.maxTransactionAmount - a.maxTransactionAmount);

  // Combine into unified ordered list: established providers first, then newly added providers
  const matches = [...establishedMatches, ...newMatches];

  matches.forEach((m, idx) => {
    const maskedLabel = `Provider ${String(idx + 1).padStart(2, '0')}`;
    m.providerAlias = maskedLabel;
    if (m.isNewProvider) {
      m.aiRationale = `${maskedLabel} is a newly enrolled verified cardholder with an active ${m.cardProduct} (${m.cardCategory}), currently ${m.availabilityStatus.toLowerCase()}, with transaction limit up to ₹${m.maxTransactionAmount.toLocaleString('en-IN')}.`;
    } else {
      m.aiRationale = `${maskedLabel} holds an active ${m.cardProduct} (${m.cardCategory}), is currently ${m.availabilityStatus.toLowerCase()}, supports up to ₹${m.maxTransactionAmount.toLocaleString('en-IN')}, and has ${m.completedOrders} completed orders at a ${(m.rating ?? 5).toFixed(1)}★ rating (~${m.avgAcceptanceMinutes}m response).`;
    }
    if (idx === 0) {
      m.isRecommended = true;
    }
  });

  return matches;
}

