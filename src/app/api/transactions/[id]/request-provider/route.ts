import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const RequestProviderSchema = z.object({
  providerId: z.string().min(1),
  cardMetadataId: z.string().min(1),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = RequestProviderSchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      const provider = db.providerProfiles.find((p) => p.id === body.providerId);
      const card = db.cardProductMetadata.find((c) => c.id === body.cardMetadataId);
      if (!provider || !card) {
        throw new Error('Selected provider or card metadata not found.');
      }

      validateTransitionPreconditions(tx, 'PROVIDER_MATCHING', session.role);
      const fromState = tx.status;

      tx.providerId = provider.id;
      tx.providerReward = card.rewardPreferenceInr;
      tx.mandateAmount =
        tx.cardChargeAmount + tx.providerReward + tx.platformFee;
      tx.shopperSavings = Math.max(0, tx.listedPrice - tx.mandateAmount);
      tx.status = 'PROVIDER_MATCHING';
      tx.updatedAt = new Date().toISOString();

      // Supersede any old pending request on this transaction
      for (const existing of db.purchaseRequests) {
        if (existing.transactionId === tx.id && existing.status === 'PENDING') {
          existing.status = 'EXPIRED';
        }
      }

      db.purchaseRequests.unshift({
        id: `req-${Date.now()}`,
        transactionId: tx.id,
        providerId: provider.id,
        cardMetadataId: card.id,
        offeredReward: tx.providerReward,
        status: 'PENDING',
        createdAt: tx.updatedAt,
      });

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PURCHASE_REQUEST_SENT_TO_PROVIDER',
        fromState,
        toState: 'PROVIDER_MATCHING',
        metadata: {
          providerId: provider.id,
          cardMetadataId: card.id,
          offeredReward: tx.providerReward,
        },
        createdAt: tx.updatedAt,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

