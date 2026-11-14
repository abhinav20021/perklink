import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import {
  mutateDatabase,
  projectTransactionForRole,
  readDatabase,
} from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession();
    const db = await readDatabase();
    const tx = db.transactions.find((t) => t.id === id);

    if (!tx) {
      return NextResponse.json({ error: `Transaction ${id} not found` }, { status: 404 });
    }

    if (session.role === 'SHOPPER_B' && tx.shopperId !== session.userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (
      session.role === 'PROVIDER_A' &&
      tx.providerId &&
      tx.providerId !== session.providerId
    ) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      data: projectTransactionForRole(db, tx, session.role),
    });
  } catch (error) {
    return handleApiError(error);
  }
}

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);

    const cancelled = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      validateTransitionPreconditions(tx, 'CANCELLED', session.role);
      const fromState = tx.status;
      tx.status = 'CANCELLED';
      tx.updatedAt = new Date().toISOString();

      const mandate = db.upiMandates.find((m) => m.transactionId === tx.id);
      if (mandate && mandate.status !== 'EXECUTED') {
        mandate.status = 'CANCELLED';
      }

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'TRANSACTION_CANCELLED',
        fromState,
        toState: 'CANCELLED',
        metadata: {},
        createdAt: tx.updatedAt,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: cancelled });
  } catch (error) {
    return handleApiError(error);
  }
}

