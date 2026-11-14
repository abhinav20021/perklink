import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { getRequiredSession } from '@/lib/auth/session';
import { mutateDatabase, projectTransactionForRole } from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

const AdminVerifySchema = z.object({
  decision: z.enum(['APPROVE', 'REJECT', 'DISPUTE']),
  reviewNotes: z.string().optional(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ invoiceId: string }> }
) {
  try {
    const { invoiceId } = await context.params;
    const session = await getRequiredSession(['ADMIN_OPS']);
    const body = AdminVerifySchema.parse(await req.json());

    const updated = await mutateDatabase((db) => {
      const verification = db.verificationResults.find(
        (v) => v.invoiceId === invoiceId || v.id === invoiceId
      );
      if (!verification) {
        throw new Error(`Verification record for invoice ${invoiceId} not found`);
      }

      const tx = db.transactions.find((t) => t.id === verification.transactionId);
      if (!tx) throw new Error('Linked transaction not found');

      const nowIso = new Date().toISOString();
      const fromState = tx.status;

      if (body.decision === 'APPROVE') {
        validateTransitionPreconditions(tx, 'INVOICE_VERIFIED', session.role);
        verification.status = 'VERIFIED';
        verification.reviewNotes =
          body.reviewNotes || 'Approved by Paytm Operations Admin.';
        verification.verifiedAt = nowIso;
        tx.status = 'INVOICE_VERIFIED';
        tx.flaggedForMismatch = false;
        tx.mismatchReason = undefined;
      } else if (body.decision === 'REJECT') {
        validateTransitionPreconditions(tx, 'VERIFICATION_FAILED', session.role);
        verification.status = 'VERIFICATION_FAILED';
        verification.reviewNotes =
          body.reviewNotes || 'Rejected by Paytm Operations Admin due to mismatch.';
        verification.verifiedAt = nowIso;
        tx.status = 'VERIFICATION_FAILED';
        tx.flaggedForMismatch = true;
        tx.mismatchReason = verification.reviewNotes;
      } else {
        validateTransitionPreconditions(tx, 'DISPUTED', session.role);
        verification.reviewNotes =
          body.reviewNotes || 'Escalated to dispute by Paytm Operations Admin.';
        tx.status = 'DISPUTED';
        tx.flaggedForMismatch = true;
        tx.mismatchReason = verification.reviewNotes;
      }

      tx.updatedAt = nowIso;

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: `ADMIN_INVOICE_${body.decision}`,
        fromState,
        toState: tx.status,
        metadata: { invoiceId: verification.invoiceId, reviewNotes: verification.reviewNotes },
        createdAt: nowIso,
      });

      return projectTransactionForRole(db, tx, session.role);
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    return handleApiError(error);
  }
}

