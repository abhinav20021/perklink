import { NextResponse } from 'next/server';
import {
  DEMO_IDENTITIES,
  buildSessionForEmail,
  getActiveSession,
} from '@/lib/auth/session';
import { readDatabase } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await readDatabase();
  const active = (await getActiveSession()) ?? buildSessionForEmail('shopper@perklink.demo', db);

  return NextResponse.json({
    session: active,
    identities: DEMO_IDENTITIES,
    simulationMode: true,
  });
}

