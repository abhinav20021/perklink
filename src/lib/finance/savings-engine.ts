import type {
  BankOffer,
  OfferConditionCheck,
  OfferEligibilityStatus,
  PlatformConfig,
  Product,
  SavingsComparison,
} from '@/lib/db/types';

export interface EvaluateOfferOptions {
  isEmiPurchase?: boolean;
  providerRewardInr?: number;
  platformFeeInr?: number;
  now?: Date;
}

export function evaluateOfferForProduct(
  product: Product,
  offer: BankOffer,
  transactionId: string,
  config: PlatformConfig,
  options: EvaluateOfferOptions = {}
): SavingsComparison {
  const now = options.now ?? new Date();
  const isEmiPurchase = options.isEmiPurchase ?? false;
  const providerReward = options.providerRewardInr ?? config.defaultProviderRewardInr;
  const perkLinkFee = options.platformFeeInr ?? config.defaultPlatformFeeInr;

  const conditionChecks: OfferConditionCheck[] = [];
  let hasHardFailure = false;
  let hasUncertainty = false;

  // 1. Offer active & validity date check
  const validFrom = new Date(offer.validFrom);
  const validUntil = new Date(`${offer.validUntil}T23:59:59Z`);
  const isWithinDates = offer.isActive && now >= validFrom && now <= validUntil;
  conditionChecks.push({
    label: 'Offer Validity Window',
    passed: isWithinDates,
    detail: isWithinDates
      ? `Valid through ${offer.validUntil}`
      : `Offer expired or inactive (ended ${offer.validUntil})`,
  });
  if (!isWithinDates) hasHardFailure = true;

  // 2. Minimum transaction amount check
  const meetsMinAmount = product.listedPrice >= offer.minPurchaseAmount;
  conditionChecks.push({
    label: 'Minimum Transaction Amount',
    passed: meetsMinAmount,
    detail: meetsMinAmount
      ? `Product price ₹${product.listedPrice.toLocaleString('en-IN')} meets ₹${offer.minPurchaseAmount.toLocaleString('en-IN')} minimum`
      : `Requires minimum ₹${offer.minPurchaseAmount.toLocaleString('en-IN')} (product is ₹${product.listedPrice.toLocaleString('en-IN')})`,
  });
  if (!meetsMinAmount) hasHardFailure = true;

  // 3. Merchant eligibility check
  const merchantMatches =
    offer.eligibleMerchants.includes('All') ||
    offer.eligibleMerchants.some(
      (m) => m.toLowerCase() === product.merchant.toLowerCase()
    );
  conditionChecks.push({
    label: 'Merchant Eligibility',
    passed: merchantMatches,
    detail: merchantMatches
      ? `Valid on ${product.merchant}`
      : `Valid only on ${offer.eligibleMerchants.join(', ')} (not ${product.merchant})`,
  });
  if (!merchantMatches) hasHardFailure = true;

  // 4. Category eligibility check
  const categoryMatches =
    offer.eligibleCategories.includes('All') ||
    offer.eligibleCategories.some(
      (c) => c.toLowerCase() === product.category.toLowerCase()
    );
  conditionChecks.push({
    label: 'Product Category',
    passed: categoryMatches,
    detail: categoryMatches
      ? `Category "${product.category}" is covered`
      : `Applies only to ${offer.eligibleCategories.join(', ')}`,
  });
  if (!categoryMatches) hasHardFailure = true;

  // 5. EMI restriction check
  const isEmiOnlyOffer =
    offer.cardType.toLowerCase().includes('emi') ||
    offer.exclusions.some((e) => e.toLowerCase().includes('full-swipe'));
  const emiCheckPassed = isEmiOnlyOffer
    ? isEmiPurchase
    : isEmiPurchase
    ? offer.emiEligible
    : true;
  conditionChecks.push({
    label: 'EMI Restriction',
    passed: emiCheckPassed,
    detail: isEmiOnlyOffer
      ? isEmiPurchase
        ? 'EMI checkout selected (matches EMI-only offer)'
        : 'Valid exclusively on EMI transactions (not valid on full-swipe checkout)'
      : offer.emiEligible
      ? 'Valid on both full-swipe and EMI transactions'
      : isEmiPurchase
      ? 'Not valid on EMI transactions'
      : 'Full-swipe non-EMI checkout selected (complies with non-EMI rule)',
  });
  if (!emiCheckPassed) hasHardFailure = true;

  // 6. Card variant / BIN verification check (selected cards require matched provider BIN/variant check)
  const requiresVariantCheck =
    offer.cardType.toLowerCase().includes('selected') ||
    offer.exclusions.some((e) => e.toLowerCase().includes('corporate'));

  if (requiresVariantCheck) {
    conditionChecks.push({
      label: 'Card Variant & Exclusions',
      passed: 'uncertain',
      detail: `Applies to ${offer.cardType}; matched provider's registered card variant must satisfy issuer rules`,
    });
    hasUncertainty = true;
  } else {
    conditionChecks.push({
      label: 'Card Variant & Exclusions',
      passed: true,
      detail: `Covers standard retail ${offer.cardType}`,
    });
  }

  // Deterministic discount calculation
  const discountPercentage =
    offer.discountType === 'PERCENT'
      ? offer.discountValue
      : Math.round((offer.discountValue / Math.max(1, product.listedPrice)) * 1000) / 10;

  let rawDiscount =
    offer.discountType === 'PERCENT'
      ? Math.round((product.listedPrice * offer.discountValue) / 100)
      : offer.discountValue;

  rawDiscount = Math.min(rawDiscount, offer.maxDiscount);
  const actualDiscount = hasHardFailure ? 0 : rawDiscount;

  const cardChargeAmount = Math.max(0, product.listedPrice - actualDiscount);
  const shopperFinalAmount = hasHardFailure
    ? product.listedPrice
    : cardChargeAmount + providerReward + perkLinkFee;
  const shopperNetSavings = hasHardFailure
    ? 0
    : Math.max(0, product.listedPrice - shopperFinalAmount);

  let eligibilityStatus: OfferEligibilityStatus = 'ELIGIBLE';
  let eligibilityReason = `Confirmed eligible: ₹${actualDiscount.toLocaleString('en-IN')} discount yields ₹${shopperNetSavings.toLocaleString('en-IN')} net savings.`;

  if (hasHardFailure) {
    eligibilityStatus = 'NOT_ELIGIBLE';
    const failed = conditionChecks.find((c) => c.passed === false);
    eligibilityReason = failed ? failed.detail : 'Offer conditions not met.';
  } else if (hasUncertainty && offer.cardType.toLowerCase().includes('select-only')) {
    eligibilityStatus = 'POTENTIALLY_ELIGIBLE';
    eligibilityReason =
      'Potentially eligible — requires verification of exact registered card variant against issuer exclusions.';
  } else if (
    offer.cardType.toLowerCase().includes('selected') &&
    offer.exclusions.some((e) => e.toLowerCase().includes('bin verification'))
  ) {
    eligibilityStatus = 'POTENTIALLY_ELIGIBLE';
    eligibilityReason =
      'Potentially eligible — verification required for selected card BIN tier.';
  }

  return {
    id: `sav-${transactionId}-${offer.id}`,
    transactionId,
    offerId: offer.id,
    bankName: offer.bankName,
    cardType: offer.cardType,
    offerTitle: offer.offerTitle,
    eligibilityStatus,
    eligibilityReason,
    conditionChecks,
    originalPrice: product.listedPrice,
    discountPercentage,
    maxDiscount: offer.maxDiscount,
    actualDiscount,
    cardChargeAmount,
    providerReward,
    perkLinkFee,
    shopperFinalAmount,
    shopperNetSavings,
    createdAt: new Date().toISOString(),
  };
}

export function evaluateAllOffers(
  product: Product,
  offers: BankOffer[],
  transactionId: string,
  config: PlatformConfig,
  options: EvaluateOfferOptions = {}
): SavingsComparison[] {
  const evaluated = offers.map((offer) =>
    evaluateOfferForProduct(product, offer, transactionId, config, options)
  );

  // Rank: ELIGIBLE first (highest net savings), then POTENTIALLY_ELIGIBLE, then NOT_ELIGIBLE
  const rankWeight: Record<OfferEligibilityStatus, number> = {
    ELIGIBLE: 0,
    POTENTIALLY_ELIGIBLE: 1,
    NOT_ELIGIBLE: 2,
  };

  evaluated.sort((a, b) => {
    const statusDiff = rankWeight[a.eligibilityStatus] - rankWeight[b.eligibilityStatus];
    if (statusDiff !== 0) return statusDiff;
    return b.shopperNetSavings - a.shopperNetSavings;
  });

  // Mark top confirmed ELIGIBLE offer with positive savings as recommended
  const topEligible = evaluated.find(
    (e) => e.eligibilityStatus === 'ELIGIBLE' && e.shopperNetSavings > 0
  );
  if (topEligible) {
    topEligible.isRecommended = true;
  }

  return evaluated;
}
