import { NextResponse } from 'next/server';
import { readDatabase } from '@/lib/db/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await readDatabase();
  return NextResponse.json({
    offers: db.bankOffers,
    products: db.products,
    config: db.config,
  });
}

