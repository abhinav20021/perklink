import { NextResponse } from 'next/server';
import { handleApiError } from '@/lib/api-response';
import {
  type DemoInvoicePreset,
  verifyInvoiceEvidence,
} from '@/lib/ai/invoice-ocr';
import { getRequiredSession } from '@/lib/auth/session';
import {
  mutateDatabase,
  projectTransactionForRole,
  readDatabase,
  saveUploadedInvoiceFile,
} from '@/lib/db/store';
import { validateTransitionPreconditions } from '@/lib/state-machine/transaction-fsm';

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const session = await getRequiredSession(['PROVIDER_A', 'ADMIN_OPS']);

    const contentType = req.headers.get('content-type') || '';
    let paymentEvidenceRef = `PG-SIM-${Date.now().toString().slice(-6)}`;
    let demoPreset: DemoInvoicePreset | undefined;
    let fileName = 'demo-invoice-verified.svg';
    let fileType: 'PDF' | 'PNG' | 'JPG' = 'PNG';
    let storagePath = '/demo-invoices/invoice-verified-laptop.svg';
    let fileBuffer: Buffer | undefined;
    let mimeType: string | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const evidence = formData.get('paymentEvidenceRef');
      const preset = formData.get('demoPreset');

      if (typeof evidence === 'string' && evidence.trim()) {
        paymentEvidenceRef = evidence.trim();
      }
      if (
        preset === 'verified_match' ||
        preset === 'amount_mismatch' ||
        preset === 'manual_review'
      ) {
        demoPreset = preset;
      }

      if (file && file.size > 0) {
        const lower = file.name.toLowerCase();
        if (!lower.endsWith('.pdf') && !lower.endsWith('.png') && !lower.endsWith('.jpg') && !lower.endsWith('.jpeg')) {
          return NextResponse.json(
            { error: 'Only PDF, PNG, or JPG invoice files are permitted.' },
            { status: 400 }
          );
        }
        fileName = file.name;
        fileType = lower.endsWith('.pdf') ? 'PDF' : lower.endsWith('.png') ? 'PNG' : 'JPG';
        mimeType = file.type;
        const arrayBuf = await file.arrayBuffer();
        fileBuffer = Buffer.from(arrayBuf);
        storagePath = await saveUploadedInvoiceFile(fileName, fileBuffer);
      }
    } else {
      const json = (await req.json()) as {
        paymentEvidenceRef?: string;
        demoPreset?: DemoInvoicePreset;
      };
      if (json.paymentEvidenceRef) paymentEvidenceRef = json.paymentEvidenceRef;
      demoPreset = json.demoPreset ?? 'verified_match';
      if (demoPreset === 'amount_mismatch') {
        fileName = 'demo-invoice-mismatch.svg';
        storagePath = '/demo-invoices/invoice-mismatch.svg';
      } else if (demoPreset === 'manual_review') {
        fileName = 'demo-invoice-manual-review.svg';
        storagePath = '/demo-invoices/invoice-manual-review.svg';
      }
    }

    const dbSnapshot = await readDatabase();
    const txSnap = dbSnapshot.transactions.find((t) => t.id === id);
    if (!txSnap) {
      return NextResponse.json({ error: `Transaction ${id} not found` }, { status: 404 });
    }
    const productSnap = dbSnapshot.products.find((p) => p.id === txSnap.productId)!;
    const orderSnap = dbSnapshot.merchantOrders.find((o) => o.transactionId === id);

    const invoiceId = `inv-${Date.now()}`;
    const verification = await verifyInvoiceEvidence({
      invoiceId,
      transaction: txSnap,
      product: productSnap,
      merchantOrder: orderSnap,
      fileBuffer,
      mimeType,
      demoPreset,
    });

    const updated = await mutateDatabase((db) => {
      const tx = db.transactions.find((t) => t.id === id)!;
      const nowIso = new Date().toISOString();
      const fromState = tx.status;

      db.invoiceDocuments.unshift({
        id: invoiceId,
        transactionId: tx.id,
        uploadedByUserId: session.userId,
        fileName,
        fileType,
        storagePath,
        paymentEvidenceRef,
        demoPresetId: demoPreset,
        uploadedAt: nowIso,
      });
      db.verificationResults.unshift(verification);

      // Transition to INVOICE_UNDER_REVIEW first, then branch based on verification result
      if (tx.status !== 'INVOICE_UNDER_REVIEW') {
        validateTransitionPreconditions(tx, 'INVOICE_UNDER_REVIEW', session.role);
        tx.status = 'INVOICE_UNDER_REVIEW';
      }

      if (verification.status === 'VERIFIED') {
        validateTransitionPreconditions(tx, 'INVOICE_VERIFIED', session.role);
        tx.status = 'INVOICE_VERIFIED';
        tx.flaggedForMismatch = false;
        tx.mismatchReason = undefined;
      } else if (verification.status === 'VERIFICATION_FAILED') {
        validateTransitionPreconditions(tx, 'VERIFICATION_FAILED', session.role);
        tx.status = 'VERIFICATION_FAILED';
        tx.flaggedForMismatch = true;
        tx.mismatchReason = verification.reviewNotes;
      } else {
        // MANUAL_REVIEW_REQUIRED stays in INVOICE_UNDER_REVIEW flagged for Admin
        tx.flaggedForMismatch = true;
        tx.mismatchReason = verification.reviewNotes;
      }

      tx.updatedAt = nowIso;

      db.auditLogs.push({
        id: `aud-${Date.now()}`,
        transactionId: tx.id,
        actorUserId: session.userId,
        actorRole: session.role,
        action: `FALLBACK_INVOICE_${verification.status}`,
        fromState,
        toState: tx.status,
        metadata: {
          invoiceId,
          extractedAmount: verification.extractedAmount,
          discrepanciesCount: verification.discrepancies.length,
        },
        createdAt: nowIso,
      });

      return {
        projected: projectTransactionForRole(db, tx, session.role),
        verification,
      };
    });

    return NextResponse.json({
      data: updated.projected,
      verification: updated.verification,
    });
  } catch (error) {
    return handleApiError(error);
  }
}

