import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import { resetDatabase } from '@/lib/db/store';

export async function POST() {
  try {
    const fresh = await resetDatabase();
    return NextResponse.json({
      ok: true,
      message: 'Demo database reset to initial PerkLink hackathon seed.',
      transactionCount: fresh.transactions.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

