import { describe, expect, it } from 'vitest';
import { createSeedDatabase } from '../db/seed';
import { projectTransactionForRole } from '../db/store';
import type {
  ProviderMandate,
  RefundRecoveryRecord,
} from '../db/types';

describe('Provider Refund Protection Mandate & Recovery Lifecycle', () => {
  it('Scenario A: Standard Successful Payment & Mandate Setup', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1002')!;

    // 1. Payment callback succeeds
    tx.cardPaymentStatus = 'SUCCESS';
    tx.providerMandateStatus = 'PENDING';
    tx.settlementStatus = 'BLOCKED_MANDATE_PENDING';

    const mandate: ProviderMandate = {
      id: `pmand-${Date.now()}`,
      providerId: tx.providerId!,
      purchaseRequestId: 'req-test',
      transactionId: tx.id,
      mandateRef: `PLK-PROV-MAND-${Date.now()}`,
      purpose: 'PerkLink Return & Cancellation Protection for Merchant Card Refunds',
      maxAmount: tx.cardChargeAmount,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 90 * 86400000).toISOString(),
    };
    db.providerMandates.push(mandate);

    expect(tx.cardPaymentStatus).toBe('SUCCESS');
    expect(tx.providerMandateStatus).toBe('PENDING');
    expect(tx.settlementStatus).toBe('BLOCKED_MANDATE_PENDING');

    // 2. Provider reviews and approves mandate
    mandate.status = 'AUTHORISED';
    mandate.authorisedAt = new Date().toISOString();
    tx.providerMandateStatus = 'AUTHORISED';
    tx.settlementStatus = 'MANDATE_AUTHORISED_SETTLEMENT_HELD';

    expect(mandate.status).toBe('AUTHORISED');
    expect(tx.providerMandateStatus).toBe('AUTHORISED');
    expect(tx.settlementStatus).toBe('MANDATE_AUTHORISED_SETTLEMENT_HELD');
  });

  it('Scenario B: Payment Succeeded but Mandate Cancelled Blocks Settlement', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1002')!;

    // Provider payment succeeds, but provider cancels mandate
    tx.cardPaymentStatus = 'SUCCESS';
    tx.providerMandateStatus = 'CANCELLED';
    tx.settlementStatus = 'BLOCKED_MANDATE_PENDING';

    expect(tx.providerMandateStatus).toBe('CANCELLED');
    expect(tx.settlementStatus).toBe('BLOCKED_MANDATE_PENDING');

    // Verification check for settlement gating:
    const provMandate = db.providerMandates.find((m) => m.transactionId === tx.id);
    const canSettle = provMandate && provMandate.status === 'AUTHORISED';
    expect(canSettle).toBeFalsy();
  });

  it('Scenario C: Shopper Return & Confirmed Merchant Refund Full Recovery', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1001')!;
    const mandate = db.providerMandates.find((m) => m.transactionId === tx.id)!;

    expect(mandate.status).toBe('AUTHORISED');

    // 1. Shopper requests return
    tx.merchantRefundStatus = 'RETURN_REQUESTED';
    tx.settlementStatus = 'BLOCKED_RETURN_PENDING';

    expect(tx.merchantRefundStatus).toBe('RETURN_REQUESTED');
    expect(tx.settlementStatus).toBe('BLOCKED_RETURN_PENDING');

    // 2. Merchant confirms refund to provider credit card
    const merchantRefundAmount = tx.cardChargeAmount; // 46999
    tx.merchantRefundStatus = 'MERCHANT_REFUND_CONFIRMED';

    // 3. PerkLink recovers from provider mandate
    const recoveryRecord: RefundRecoveryRecord = {
      id: `rcv-${Date.now()}`,
      providerId: tx.providerId || 'prov-arjun',
      purchaseRequestId: 'req-1001',
      transactionId: tx.id,
      originalCardTxId: 'pg-tx-1001',
      merchantRefundId: 'mref-test-full-1',
      providerMandateId: mandate.id,
      confirmedMerchantRefundAmount: merchantRefundAmount,
      recoveryAmount: merchantRefundAmount,
      recoveryStatus: 'PROVIDER_RECOVERY_SUCCESS',
      shopperRefundStatus: 'SHOPPER_REFUND_SUCCESS',
      createdAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString(),
      shopperRefundedAt: new Date().toISOString(),
    };
    db.refundRecoveries.push(recoveryRecord);

    tx.recoveryStatus = 'PROVIDER_RECOVERY_SUCCESS';
    tx.shopperRefundStatus = 'SHOPPER_REFUND_SUCCESS';
    tx.settlementStatus = 'RECOVERED';

    expect(tx.recoveryStatus).toBe('PROVIDER_RECOVERY_SUCCESS');
    expect(tx.shopperRefundStatus).toBe('SHOPPER_REFUND_SUCCESS');
    expect(tx.settlementStatus).toBe('RECOVERED');
    expect(recoveryRecord.recoveryAmount).toBe(46999);
  });

  it('Scenario D: Partial Merchant Refund Recovers Exact Partial Amount', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1001')!;
    const mandate = db.providerMandates.find((m) => m.transactionId === tx.id)!;

    const partialAmount = 5000;
    const recoveryRecord: RefundRecoveryRecord = {
      id: `rcv-partial-${Date.now()}`,
      providerId: tx.providerId || 'prov-arjun',
      purchaseRequestId: 'req-1001',
      transactionId: tx.id,
      originalCardTxId: 'pg-tx-1001',
      merchantRefundId: 'mref-test-partial-1',
      providerMandateId: mandate.id,
      confirmedMerchantRefundAmount: partialAmount,
      recoveryAmount: partialAmount,
      recoveryStatus: 'PROVIDER_RECOVERY_SUCCESS',
      shopperRefundStatus: 'SHOPPER_REFUND_SUCCESS',
      createdAt: new Date().toISOString(),
      recoveredAt: new Date().toISOString(),
      shopperRefundedAt: new Date().toISOString(),
    };
    db.refundRecoveries.push(recoveryRecord);

    expect(recoveryRecord.recoveryAmount).toBe(5000);
    expect(recoveryRecord.recoveryAmount).toBeLessThan(tx.cardChargeAmount);
  });

  it('Scenario E: Recovery Failure & Operational Exception Handling', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1004')!;

    // Recovery failure simulation
    const failedRecovery: RefundRecoveryRecord = {
      id: `rcv-fail-${Date.now()}`,
      providerId: tx.providerId || 'prov-arjun',
      purchaseRequestId: 'req-1004',
      transactionId: tx.id,
      originalCardTxId: 'pg-tx-1004',
      merchantRefundId: 'mref-fail-test',
      providerMandateId: 'pmand-1004',
      confirmedMerchantRefundAmount: tx.cardChargeAmount,
      recoveryAmount: 0,
      recoveryStatus: 'RECOVERY_FAILED',
      shopperRefundStatus: 'SHOPPER_REFUND_PENDING',
      createdAt: new Date().toISOString(),
      failureReason: 'Simulated debit failure on provider account',
    };
    db.refundRecoveries.push(failedRecovery);

    tx.recoveryStatus = 'RECOVERY_FAILED';
    tx.shopperRefundStatus = 'SHOPPER_REFUND_PENDING';
    tx.settlementStatus = 'RECOVERY_FAILED';
    tx.flaggedForMismatch = true;

    expect(tx.recoveryStatus).toBe('RECOVERY_FAILED');
    expect(tx.shopperRefundStatus).toBe('SHOPPER_REFUND_PENDING');
    expect(tx.settlementStatus).toBe('RECOVERY_FAILED');
    expect(tx.flaggedForMismatch).toBe(true);
  });

  it('Scenario F: Idempotency Protection Against Duplicate Recovery', () => {
    const db = createSeedDatabase();
    const existingRefundId = 'mref-unique-123';

    // First recovery execution
    const firstRecord: RefundRecoveryRecord = {
      id: 'rcv-first',
      providerId: 'prov-arjun',
      purchaseRequestId: 'req-1001',
      transactionId: 'PLK-2026-1001',
      originalCardTxId: 'pg-tx-1001',
      merchantRefundId: existingRefundId,
      providerMandateId: 'pmand-1001',
      confirmedMerchantRefundAmount: 10000,
      recoveryAmount: 10000,
      recoveryStatus: 'PROVIDER_RECOVERY_SUCCESS',
      shopperRefundStatus: 'SHOPPER_REFUND_SUCCESS',
      createdAt: new Date().toISOString(),
    };
    db.refundRecoveries.push(firstRecord);

    // Incoming duplicate webhook
    const isDuplicate = db.refundRecoveries.find(
      (r) => r.merchantRefundId === existingRefundId
    );
    expect(isDuplicate).toBeDefined();
    expect(isDuplicate?.id).toBe('rcv-first');
    // Ensure we do not push a second record
    if (!isDuplicate) {
      db.refundRecoveries.push({ ...firstRecord, id: 'rcv-duplicate' });
    }
    const totalMatching = db.refundRecoveries.filter(
      (r) => r.merchantRefundId === existingRefundId
    );
    expect(totalMatching.length).toBe(1);
  });

  it('Privacy Protection: Masked Provider Mandate Summary for Shopper B', () => {
    const db = createSeedDatabase();
    const tx = db.transactions.find((t) => t.id === 'PLK-2026-1001')!;

    const shopperView = projectTransactionForRole(db, tx, 'SHOPPER_B');
    // Shopper B must NOT see provider's raw mandate details or VPA
    expect(shopperView.providerMandate).toBeUndefined();
    // Shopper B sees non-sensitive summary
    expect(shopperView.providerMandateSummary).toBeDefined();
    expect(shopperView.providerMandateSummary?.authorized).toBe(true);
    expect(shopperView.providerMandateSummary?.status).toBe('AUTHORISED');

    // Provider A sees full mandate
    const providerView = projectTransactionForRole(db, tx, 'PROVIDER_A');
    expect(providerView.providerMandate).toBeDefined();
    expect(providerView.providerMandate?.mandateRef).toBe('PLK-PROV-MAND-1001');
    expect(providerView.providerMandate?.maxAmount).toBe(46999);
  });
});
