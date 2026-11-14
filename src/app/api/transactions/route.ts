import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { projectTransactionForRole, readDatabase } from '@/lib/db/store';

export async function GET() {
  try {
    const session = await getRequiredSession();
    const db = await readDatabase();

    let visible = db.transactions;
    if (session.role === 'SHOPPER_B') {
      visible = db.transactions.filter((t) => t.shopperId === session.userId);
    } else if (session.role === 'PROVIDER_A') {
      visible = db.transactions.filter((t) => t.providerId === session.providerId);
    }

    const projected = visible
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((t) => projectTransactionForRole(db, t, session.role));

    return NextResponse.json({
      role: session.role,
      transactions: projected,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

