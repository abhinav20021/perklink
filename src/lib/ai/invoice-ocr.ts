import { Type } from '@google/genai';
import type {
  MerchantOrder,
  Product,
  Transaction,
  VerificationDiscrepancy,
  VerificationResult,
  VerificationStatus,
} from '@/lib/db/types';
import { GEMINI_MODEL, getGeminiClient } from './gemini-client';

export type DemoInvoicePreset = 'verified_match' | 'amount_mismatch' | 'manual_review';

export async function verifyInvoiceEvidence(params: {
  invoiceId: string;
  transaction: Transaction;
  product: Product;
  merchantOrder?: MerchantOrder;
  fileBuffer?: Buffer;
  mimeType?: string;
  demoPreset?: DemoInvoicePreset;
}): Promise<VerificationResult> {
  const {
    invoiceId,
    transaction,
    product,
    merchantOrder,
    fileBuffer,
    mimeType,
    demoPreset,
  } = params;

  const expectedOrderId = merchantOrder?.merchantOrderId ?? `MER-${transaction.id}`;
  const expectedAmount = transaction.cardChargeAmount;
  const expectedMerchant = product.merchant;

  let ocrProvider: 'GEMINI_VISION' | 'SIMULATED_OCR_FALLBACK' =
    'SIMULATED_OCR_FALLBACK';
  let extractedInvoiceNumber = `INV-2026-${transaction.id.slice(-4)}`;
  let extractedMerchant = expectedMerchant;
  let extractedOrderId = expectedOrderId;
  let extractedProductName = product.title;
  let extractedAmount = expectedAmount;
  let extractedTax = Math.round(expectedAmount * 0.1525);
  let extractedPurchaseDate = new Date().toISOString().slice(0, 10);

  if (demoPreset === 'amount_mismatch') {
    extractedMerchant = 'Unverified Seller Store';
    extractedOrderId = 'MER-WRONG-0001';
    extractedProductName = 'Generic Electronics Bundle';
    extractedAmount = Math.max(1000, expectedAmount - 5799);
  } else if (demoPreset === 'manual_review') {
    extractedAmount = Math.max(1000, expectedAmount - 490);
    extractedProductName = `${product.brand} ${product.model} (Partial Scan)`;
  } else if (!demoPreset && fileBuffer && mimeType && mimeType.startsWith('image/')) {
    const gemini = getGeminiClient();
    if (gemini) {
      try {
        const res = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: [
            {
              inlineData: {
                mimeType,
                data: fileBuffer.toString('base64'),
              },
            },
            {
              text: 'Extract invoice fields from this purchase document as strict JSON.',
            },
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                invoiceNumber: { type: Type.STRING },
                merchant: { type: Type.STRING },
                orderId: { type: Type.STRING },
                productName: { type: Type.STRING },
                amount: { type: Type.NUMBER },
                tax: { type: Type.NUMBER },
                purchaseDate: { type: Type.STRING },
              },
              required: [
                'invoiceNumber',
                'merchant',
                'orderId',
                'productName',
                'amount',
                'tax',
                'purchaseDate',
              ],
            },
          },
        });
        const parsed = JSON.parse(res.text ?? '{}');
        if (parsed.invoiceNumber && typeof parsed.amount === 'number') {
          ocrProvider = 'GEMINI_VISION';
          extractedInvoiceNumber = String(parsed.invoiceNumber);
          extractedMerchant = String(parsed.merchant || expectedMerchant);
          extractedOrderId = String(parsed.orderId || expectedOrderId);
          extractedProductName = String(parsed.productName || product.title);
          extractedAmount = Number(parsed.amount);
          extractedTax = Number(parsed.tax || 0);
          extractedPurchaseDate = String(
            parsed.purchaseDate || extractedPurchaseDate
          );
        }
      } catch (err) {
        console.warn('Gemini Vision OCR fallback engaged:', err);
      }
    }
  }

  // Deterministic comparison against expected transaction
  const discrepancies: VerificationDiscrepancy[] = [];

  if (extractedMerchant.toLowerCase() !== expectedMerchant.toLowerCase()) {
    discrepancies.push({
      field: 'merchant',
      expected: expectedMerchant,
      extracted: extractedMerchant,
      severity: 'HIGH',
      message: `Merchant mismatch: expected "${expectedMerchant}", extracted "${extractedMerchant}".`,
    });
  }

  if (extractedOrderId.toUpperCase() !== expectedOrderId.toUpperCase()) {
    discrepancies.push({
      field: 'orderId',
      expected: expectedOrderId,
      extracted: extractedOrderId,
      severity: 'HIGH',
      message: `Order ID mismatch: expected "${expectedOrderId}", extracted "${extractedOrderId}".`,
    });
  }

  const amountDelta = Math.abs(extractedAmount - expectedAmount);
  if (amountDelta > 1000) {
    discrepancies.push({
      field: 'amount',
      expected: `₹${expectedAmount.toLocaleString('en-IN')}`,
      extracted: `₹${extractedAmount.toLocaleString('en-IN')}`,
      severity: 'HIGH',
      message: `Major card amount mismatch of ₹${amountDelta.toLocaleString('en-IN')}.`,
    });
  } else if (amountDelta > 0) {
    discrepancies.push({
      field: 'amount',
      expected: `₹${expectedAmount.toLocaleString('en-IN')}`,
      extracted: `₹${extractedAmount.toLocaleString('en-IN')}`,
      severity: 'MEDIUM',
      message: `Minor amount discrepancy of ₹${amountDelta.toLocaleString('en-IN')} requires manual Paytm Ops review.`,
    });
  }

  if (
    !extractedProductName.toLowerCase().includes(product.brand.toLowerCase())
  ) {
    discrepancies.push({
      field: 'productName',
      expected: product.title,
      extracted: extractedProductName,
      severity: 'MEDIUM',
      message: `Product title "${extractedProductName}" does not clearly match "${product.title}".`,
    });
  }

  let status: VerificationStatus = 'VERIFIED';
  if (discrepancies.some((d) => d.severity === 'HIGH')) {
    status = 'VERIFICATION_FAILED';
  } else if (discrepancies.length > 0 || demoPreset === 'manual_review') {
    status = 'MANUAL_REVIEW_REQUIRED';
  }

  const reviewNotes =
    status === 'VERIFIED'
      ? `Verified match: Merchant ${extractedMerchant}, Order ID ${extractedOrderId}, and Amount ₹${extractedAmount.toLocaleString('en-IN')} all match.`
      : discrepancies.map((d) => d.message).join(' ');

  return {
    id: `ver-${Date.now()}`,
    invoiceId,
    transactionId: transaction.id,
    ocrProvider,
    extractedInvoiceNumber,
    extractedMerchant,
    extractedOrderId,
    extractedProductName,
    extractedAmount,
    extractedTax,
    extractedPurchaseDate,
    discrepancies,
    status,
    reviewNotes,
    verifiedAt: new Date().toISOString(),
  };
}

