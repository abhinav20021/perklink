import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import {
  mutateDatabase,
  projectTransactionForRole,
  readDatabase,
} from '@/lib/db/store';

export const dynamic = 'force-dynamic';

const UpdateProviderSettingsSchema = z.object({
  availabilityStatus: z.enum(['ONLINE', 'BUSY', 'OFFLINE']).optional(),
  consentGranted: z.boolean().optional(),
});

export async function GET() {
  try {
    const session = await getRequiredSession(['PROVIDER_A', 'ADMIN_OPS']);
    const db = await readDatabase();

    const provider =
      db.providerProfiles.find((p) => p.id === session.providerId) ??
      db.providerProfiles[0];

    const cards = db.cardProductMetadata.filter(
      (c) => c.providerId === provider.id
    );
    const consent = db.consentRecords.find(
      (c) =>
        c.userId === provider.userId && c.consentType === 'CARD_MATCH_OPT_IN'
    );

    const providerTransactions = db.transactions
      .filter((t) => t.providerId === provider.id)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => projectTransactionForRole(db, t, 'PROVIDER_A'));

    const incomingRequests = db.purchaseRequests
      .filter((r) => r.providerId === provider.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    const totalEarnedRewards = db.settlementRecords
      .filter((s) => {
        const tx = db.transactions.find((t) => t.id === s.transactionId);
        return tx?.providerId === provider.id && s.status === 'SETTLED';
      })
      .reduce((sum, s) => sum + s.providerReward, 0);

    return NextResponse.json({
      provider,
      cards,
      consent,
      totalEarnedRewards,
      incomingRequests,
      transactions: providerTransactions,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function PATCH(req: Request) {
  try {
    const session = await getRequiredSession(['PROVIDER_A']);
    const body = UpdateProviderSettingsSchema.parse(await req.json());

    const result = await mutateDatabase((db) => {
      const provider = db.providerProfiles.find(
        (p) => p.id === session.providerId
      );
      if (!provider) throw new Error('Provider profile not found');

      if (body.availabilityStatus) {
        provider.availabilityStatus = body.availabilityStatus;
      }

      if (typeof body.consentGranted === 'boolean') {
        const consent = db.consentRecords.find(
          (c) =>
            c.userId === provider.userId &&
            c.consentType === 'CARD_MATCH_OPT_IN'
        );
        if (consent) {
          consent.granted = body.consentGranted;
          consent.revokedAt = body.consentGranted
            ? undefined
            : new Date().toISOString();
        }
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PROVIDER_PREFERENCES_UPDATED',
        metadata: body,
        createdAt: new Date().toISOString(),
      });

      return { provider };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error);
  }
}

