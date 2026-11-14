import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, readDatabase } from '@/lib/db/store';

const UpdateConfigSchema = z.object({
  defaultProviderRewardInr: z.number().min(0).max(5000).optional(),
  defaultPlatformFeeInr: z.number().min(0).max(1000).optional(),
  mandateExpiryMinutes: z.number().min(5).max(120).optional(),
});

export async function GET() {
  const db = await readDatabase();
  return NextResponse.json({ config: db.config });
}

export async function PATCH(req: Request) {
  try {
    const session = await getRequiredSession(['ADMIN_OPS']);
    const body = UpdateConfigSchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      db.config = { ...db.config, ...body };
      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'PLATFORM_CONFIG_UPDATED',
        metadata: body,
        createdAt: new Date().toISOString(),
      });
      return db.config;
    });

    return NextResponse.json({ config: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

