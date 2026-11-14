import { describe, expect, it } from 'vitest';
import { createSeedDatabase } from '../db/seed';
import { rankProvidersForOffer } from '../matching/provider-matcher';

describe('Shopper Offers & Provider Matching Enhancements', () => {
  it('correctly partitions established and new providers across all banks', () => {
    const db = createSeedDatabase();
    const laptop = db.products.find((p) => p.id === 'prod-laptop-asus')!;
    const offers = db.bankOffers;

    for (const bank of ['SBI', 'HDFC', 'Axis Bank']) {
      const bankOffer = offers.find((o) => o.bankName === bank && o.minPurchaseAmount <= laptop.listedPrice);
      if (!bankOffer) continue;

      const matches = rankProvidersForOffer({
        transactionId: `PLK-TEST-${bank}`,
        product: laptop,
        offer: bankOffer,
        cardChargeAmount: laptop.listedPrice - 2000,
        providers: db.providerProfiles,
        cards: db.cardProductMetadata,
        consents: db.consentRecords,
      });

      const established = matches.filter((m) => !m.isNewProvider);
      const newlyAdded = matches.filter((m) => m.isNewProvider);

      expect(established.length).toBeGreaterThan(0);
      expect(newlyAdded.length).toBeGreaterThan(0);

      // Verify established providers have consolidated matchScore
      for (const est of established) {
        expect(typeof est.matchScore).toBe('number');
        expect(est.matchScore).toBeGreaterThanOrEqual(50);
        expect(est.matchScore).toBeLessThanOrEqual(100);
        expect(typeof est.rating).toBe('number');
        expect(typeof est.completedOrders).toBe('number');
        expect(est.providerAlias).toMatch(/^Provider \d{2}$/);
      }

      // Verify newly enrolled providers have honest null / non-fabricated scores
      for (const np of newlyAdded) {
        expect(np.isNewProvider).toBe(true);
        expect(np.matchScore).toBeNull();
        expect(np.rating).toBeUndefined();
        expect(np.completedOrders).toBe(0);
        expect(np.providerAlias).toMatch(/^Provider \d{2}$/);
        expect(np.aiRationale).toContain('newly enrolled');
      }
    }
  });

  it('ensures distinct sequential masked provider aliases (Provider 01, Provider 02, etc.)', () => {
    const db = createSeedDatabase();
    const laptop = db.products.find((p) => p.id === 'prod-laptop-asus')!;
    const sbiOffer = db.bankOffers.find((o) => o.id === 'offer-sbi-10')!;

    const matches = rankProvidersForOffer({
      transactionId: 'PLK-TEST-ALIASES',
      product: laptop,
      offer: sbiOffer,
      cardChargeAmount: 46999,
      providers: db.providerProfiles,
      cards: db.cardProductMetadata,
      consents: db.consentRecords,
    });

    const aliases = matches.map((m) => m.providerAlias);
    // Every alias is unique
    expect(new Set(aliases).size).toBe(aliases.length);

    // Matches contain Provider 01, Provider 02 ... Provider 07, etc.
    expect(aliases[0]).toBe('Provider 01');
    expect(aliases[1]).toBe('Provider 02');
    expect(aliases.some((a) => a === 'Provider 07')).toBe(true);
  });
});
