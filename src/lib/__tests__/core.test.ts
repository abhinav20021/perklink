import { describe, expect, it } from 'vitest';
import { deterministicParseOfferText } from '../ai/offer-intelligence';
import { createSeedDatabase } from '../db/seed';
import { projectTransactionForRole } from '../db/store';
import { evaluateAllOffers } from '../finance/savings-engine';
import { rankProvidersForOffer } from '../matching/provider-matcher';
import {
  StateTransitionError,
  canTransition,
  validateTransitionPreconditions,
} from '../state-machine/transaction-fsm';

describe('PerkLink Core Deterministic Engines', () => {
  it('computes exact Laptop reference transaction numbers (₹48,999 -> ₹47,298 mandate, ₹1,701 savings)', () => {
    const db = createSeedDatabase();
    const laptop = db.products.find((p) => p.id === 'prod-laptop-asus')!;
    const comparisons = evaluateAllOffers(
      laptop,
      db.bankOffers,
      'PLK-TEST-1',
      db.config,
      { now: new Date('2026-11-12T12:00:00Z') }
    );

    const sbi = comparisons.find((c) => c.offerId === 'offer-sbi-10')!;
    expect(sbi.eligibilityStatus).toBe('ELIGIBLE');
    expect(sbi.isRecommended).toBe(true);
    expect(sbi.originalPrice).toBe(48999);
    expect(sbi.actualDiscount).toBe(2000);
    expect(sbi.cardChargeAmount).toBe(46999);
    expect(sbi.providerReward).toBe(250);
    expect(sbi.perkLinkFee).toBe(49);
    expect(sbi.shopperFinalAmount).toBe(47298);
    expect(sbi.shopperNetSavings).toBe(1701);

    const icici = comparisons.find((c) => c.offerId === 'offer-icici-60k')!;
    expect(icici.eligibilityStatus).toBe('NOT_ELIGIBLE');
    expect(icici.actualDiscount).toBe(0);

    const sbiEmi = comparisons.find((c) => c.offerId === 'offer-sbi-emi')!;
    expect(sbiEmi.eligibilityStatus).toBe('NOT_ELIGIBLE');

    const hdfcSelect = comparisons.find((c) => c.offerId === 'offer-hdfc-select')!;
    expect(hdfcSelect.eligibilityStatus).toBe('POTENTIALLY_ELIGIBLE');
  });

  it('ranks established and newly enrolled matching SBI providers with Arjun as top pick', () => {
    const db = createSeedDatabase();
    const laptop = db.products.find((p) => p.id === 'prod-laptop-asus')!;
    const sbiOffer = db.bankOffers.find((o) => o.id === 'offer-sbi-10')!;

    const matches = rankProvidersForOffer({
      transactionId: 'PLK-TEST-1',
      product: laptop,
      offer: sbiOffer,
      cardChargeAmount: 46999,
      providers: db.providerProfiles,
      cards: db.cardProductMetadata,
      consents: db.consentRecords,
    });

    const established = matches.filter((m) => !m.isNewProvider);
    const newlyEnrolled = matches.filter((m) => m.isNewProvider);

    expect(established.length).toBe(6);
    expect(established[0].providerId).toBe('prov-arjun');
    expect(established[0].isRecommended).toBe(true);
    expect(established[0].matchScore!).toBeGreaterThan(established[1].matchScore!);
    expect(established[0].providerAlias).toBe('Provider 01');

    // New providers are included without disqualification, with honest null score/rating
    expect(newlyEnrolled.length).toBe(3);
    for (const newProv of newlyEnrolled) {
      expect(newProv.isNewProvider).toBe(true);
      expect(newProv.matchScore).toBeNull();
      expect(newProv.rating).toBeUndefined();
      expect(newProv.completedOrders).toBe(0);
      expect(newProv.maxTransactionAmount).toBeGreaterThanOrEqual(46999);
      expect(newProv.providerAlias).toMatch(/^Provider \d{2}$/);
    }
  });

  it('blocks illegal state jumps and enforces preconditions on server FSM', () => {
    const db = createSeedDatabase();
    const pendingTx = db.transactions.find((t) => t.id === 'PLK-2026-1003')!;

    // Cannot jump straight to SETTLEMENT_COMPLETED
    const jump = canTransition(pendingTx.status, 'SETTLEMENT_COMPLETED', 'ADMIN_OPS');
    expect(jump.allowed).toBe(false);

    // Shopper cannot approve a provider request
    const roleCheck = canTransition('PROVIDER_MATCHING', 'PROVIDER_ACCEPTED', 'SHOPPER_B');
    expect(roleCheck.allowed).toBe(false);

    // Settlement requires SETTLEMENT_ELIGIBLE + approved mandate
    expect(() =>
      validateTransitionPreconditions(pendingTx, 'SETTLEMENT_COMPLETED', 'ADMIN_OPS')
    ).toThrow(StateTransitionError);
  });

  it('strictly masks Shopper PII (address, phone, delivery instructions) from Perk Provider projection', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1001')!;

    const providerView = projectTransactionForRole(db, tx, 'PROVIDER_A');
    expect(providerView.transaction.deliveryInfo).toBeUndefined();
    expect(providerView.merchantOrder?.shippingAddress).toBeUndefined();
    expect(providerView.merchantOrder?.recipientPhone).toBeUndefined();
    expect(providerView.merchantOrder?.deliveryInstructions).toBeUndefined();
    expect(providerView.merchantOrder?.maskedDestination).toContain('500***');

    const shopperView = projectTransactionForRole(db, tx, 'SHOPPER_B');
    expect(shopperView.transaction.deliveryInfo?.shippingAddress).toContain('Madhapur');
    expect(shopperView.merchantOrder?.recipientPhone).toBe('+91 98100 44321');
  });

  it('parses natural-language SBI bank offer text into structured JSON fields', () => {
    const parsed = deterministicParseOfferText(
      'Get 10% instant discount up to ₹2,000 on selected SBI credit cards. Minimum transaction ₹10,000. Not valid on EMI transactions.'
    );
    expect(parsed.bank).toBe('SBI');
    expect(parsed.card_type).toBe('Selected Credit Cards');
    expect(parsed.discount_percentage).toBe(10);
    expect(parsed.maximum_discount).toBe(2000);
    expect(parsed.minimum_transaction).toBe(10000);
    expect(parsed.emi_eligible).toBe(false);
    expect(parsed.offer_type).toBe('instant_discount');
  });

  it('filters out ineligible (ICICI 60k, SBI EMI) and unverified (HDFC select) offers from shopper projection', () => {
    const db = createSeedDatabase();
    const laptop = db.products.find((p) => p.id === 'prod-laptop-asus')!;
    const comparisons = evaluateAllOffers(
      laptop,
      db.bankOffers,
      'PLK-TEST-ELIGIBLE',
      db.config,
      { now: new Date('2026-11-12T12:00:00Z') }
    );
    db.savingsComparisons.push(...comparisons);

    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1001')!;
    tx.id = 'PLK-TEST-ELIGIBLE';
    const shopperView = projectTransactionForRole(db, tx, 'SHOPPER_B');

    // Only confirmed ELIGIBLE offers must be visible to the shopper
    expect(shopperView.savingsComparisons.every((c) => c.eligibilityStatus === 'ELIGIBLE')).toBe(true);
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-sbi-10')).toBe(true);
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-hdfc-1500')).toBe(true);
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-axis-1000')).toBe(true);

    // Ineligible and unverified offers must NOT be visible
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-icici-60k')).toBe(false);
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-sbi-emi')).toBe(false);
    expect(shopperView.savingsComparisons.some((c) => c.offerId === 'offer-hdfc-select')).toBe(false);
  });
});
