import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';

const DeliverySchema = z.object({
  recipientName: z.string().min(2),
  mobileNumber: z.string().min(8).max(18),
  shippingAddress: z.string().min(5),
  pinCode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
  city: z.string().optional(),
  deliveryInstructions: z.string().optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['SHOPPER_B', 'ADMIN_OPS']);
    const body = DeliverySchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id);
      if (!tx) throw new Error(`Transaction ${id} not found`);

      tx.deliveryInfo = body;
      tx.updatedAt = new Date().toISOString();

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: 'SHOPPER_DELIVERY_DETAILS_SAVED_PRIVATELY',
        metadata: { city: body.city ?? 'Specified', pinPrefix: `${body.pinCode.slice(0, 3)}***` },
        createdAt: tx.updatedAt,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

