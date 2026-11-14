import { describe, expect, it, beforeEach } from 'vitest';
import { readDatabase, mutateDatabase, resetDatabase } from '../db/store';

describe('Serverless Storage Resilience (Vercel Compatibility)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('initializes and returns complete seed database with all entities', async () => {
    const db = await readDatabase();
    expect(db.products.length).toBeGreaterThan(0);
    expect(db.bankOffers.length).toBeGreaterThan(0);
    expect(db.providerProfiles.length).toBeGreaterThan(0);
    expect(db.transactions.length).toBeGreaterThan(0);
    expect(db.users.length).toBeGreaterThan(0);
  });

  it('preserves in-memory state across mutations even in ephemeral environments', async () => {
    await mutateDatabase((db) => {
      db.config.defaultProviderRewardInr = 300;
    });

    const updated = await readDatabase();
    expect(updated.config.defaultProviderRewardInr).toBe(300);
  });

  it('resets cleanly back to initial seed data on reset request', async () => {
    await mutateDatabase((db) => {
      db.config.defaultProviderRewardInr = 999;
    });

    const reset = await resetDatabase();
    expect(reset.config.defaultProviderRewardInr).toBe(250);

    const read = await readDatabase();
    expect(read.config.defaultProviderRewardInr).toBe(250);
  });
});
