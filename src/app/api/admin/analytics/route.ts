import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { readDatabase } from '@/lib/db/store';

export async function GET() {
  try {
    await getRequiredSession(['ADMIN_OPS', 'SHOPPER_B', 'PROVIDER_A']);
    const db = await readDatabase();

    const totalTransactions = db.transactions.length;
    const completedSettlements = db.settlementRecords.filter(
      (s) => s.status === 'SETTLED'
    );
    const totalGmv = db.transactions.reduce((sum, t) => sum + t.listedPrice, 0);
    const totalShopperSavings = db.transactions
      .filter((t) => t.status !== 'CANCELLED' && t.status !== 'PAYMENT_FAILED')
      .reduce((sum, t) => sum + t.shopperSavings, 0);
    const totalPlatformRevenue = completedSettlements.reduce(
      (sum, s) => sum + s.platformFee,
      0
    );

    const totalRequests = db.purchaseRequests.length;
    const acceptedRequests = db.purchaseRequests.filter(
      (r) => r.status === 'ACCEPTED'
    ).length;
    const matchAcceptanceRate = totalRequests
      ? Math.round((acceptedRequests / totalRequests) * 100)
      : 0;

    const totalVerifications = db.verificationResults.length;
    const passedVerifications = db.verificationResults.filter(
      (v) => v.status === 'VERIFIED'
    ).length;
    const verificationPassRate = totalVerifications
      ? Math.round((passedVerifications / totalVerifications) * 100)
      : 100;

    const bankOfferBreakdown = db.bankOffers
      .reduce<Array<{ bank: string; transactions: number; savings: number }>>(
        (acc, offer) => {
          const matchingTxs = db.transactions.filter(
            (t) => t.offerId === offer.id
          );
          const existing = acc.find((a) => a.bank === offer.bankName);
          const addSavings = matchingTxs.reduce(
            (s, t) => s + t.shopperSavings,
            0
          );
          if (existing) {
            existing.transactions += matchingTxs.length;
            existing.savings += addSavings;
          } else {
            acc.push({
              bank: offer.bankName,
              transactions: matchingTxs.length,
              savings: addSavings,
            });
          }
          return acc;
        },
        []
      );

    const statusDistribution = Object.entries(
      db.transactions.reduce<Record<string, number>>((acc, tx) => {
        acc[tx.status] = (acc[tx.status] ?? 0) + 1;
        return acc;
      }, {})
    ).map(([status, count]) => ({ status, count }));

    return NextResponse.json({
      kpis: {
        totalTransactions,
        settledCount: completedSettlements.length,
        totalGmv,
        totalShopperSavings,
        totalPlatformRevenue,
        matchAcceptanceRate,
        verificationPassRate,
        // Clearly marked pilot scorecard reference hypotheses from pitch deck
        pilotHypotheses: {
          baselineDropOff: '30–35%',
          baselineDeferral: '20–25%',
          competitorLeakage: '15–20%',
        },
      },
      bankOfferBreakdown,
      statusDistribution,
      settlementRecords: db.settlementRecords,
      flaggedTransactions: db.transactions.filter((t) => t.flaggedForMismatch),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

