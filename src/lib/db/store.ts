import fs from 'node:fs/promises';
import path from 'node:path';
import { createSeedDatabase } from './seed';
import type {
  PerkLinkDatabase,
  RoleProjectedTransaction,
  Transaction,
  UserRole,
} from './types';

const DATA_DIR = path.join(process.cwd(), '.data');
const DB_PATH = path.join(DATA_DIR, 'perklink-db.json');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

let writeLock: Promise<void> = Promise.resolve();

async function ensureDataDirs(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function readDatabase(): Promise<PerkLinkDatabase> {
  await ensureDataDirs();
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    return JSON.parse(raw) as PerkLinkDatabase;
  } catch {
    const seed = createSeedDatabase();
    await fs.writeFile(DB_PATH, JSON.stringify(seed, null, 2), 'utf-8');
    return seed;
  }
}

export async function mutateDatabase<T>(
  mutator: (db: PerkLinkDatabase) => Promise<T> | T
): Promise<T> {
  let result!: T;
  const next = writeLock.then(async () => {
    const db = await readDatabase();
    result = await mutator(db);
    await ensureDataDirs();
    const tmpPath = `${DB_PATH}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(db, null, 2), 'utf-8');
    await fs.rename(tmpPath, DB_PATH);
  });
  writeLock = next.catch(() => {});
  await next;
  return result;
}

export async function resetDatabase(): Promise<PerkLinkDatabase> {
  return mutateDatabase((db) => {
    const fresh = createSeedDatabase();
    Object.assign(db, fresh);
    return fresh;
  });
}

export async function saveUploadedInvoiceFile(
  fileName: string,
  buffer: Buffer
): Promise<string> {
  await ensureDataDirs();
  const safeName = `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const fullPath = path.join(UPLOADS_DIR, safeName);
  await fs.writeFile(fullPath, buffer);
  return `.data/uploads/${safeName}`;
}

export function maskDestination(tx: Transaction): string {
  if (!tx.deliveryInfo) return 'Protected (Hyderabad, 500***)';
  const city = tx.deliveryInfo.city || 'Verified City';
  const pinPrefix = tx.deliveryInfo.pinCode
    ? `${tx.deliveryInfo.pinCode.slice(0, 3)}***`
    : '500***';
  return `${city}, ${pinPrefix} (Full address private to Class B & Merchant)`;
}

export function projectTransactionForRole(
  db: PerkLinkDatabase,
  tx: Transaction,
  role: UserRole
): RoleProjectedTransaction {
  const product = db.products.find((p) => p.id === tx.productId)!;
  const offer = tx.offerId ? db.bankOffers.find((o) => o.id === tx.offerId) : undefined;
  const aiAnalysis = db.aiAnalysisResults.find(
    (a) => a.transactionId === tx.id || a.productId === tx.productId
  );
  const savingsComparisons = db.savingsComparisons.filter(
    (s) => s.transactionId === tx.id
  );
  const providerMatches = db.providerMatches.filter(
    (m) => m.transactionId === tx.id
  );
  const purchaseRequest = db.purchaseRequests.find(
    (r) => r.transactionId === tx.id
  );
  const providerProfile = tx.providerId
    ? db.providerProfiles.find((p) => p.id === tx.providerId)
    : undefined;
  const cardMetadata = purchaseRequest
    ? db.cardProductMetadata.find((c) => c.id === purchaseRequest.cardMetadataId)
    : providerProfile
    ? db.cardProductMetadata.find((c) => c.providerId === providerProfile.id)
    : undefined;
  const upiMandate = db.upiMandates.find((m) => m.transactionId === tx.id);
  const merchantOrder = db.merchantOrders.find((o) => o.transactionId === tx.id);
  const invoiceDocuments = db.invoiceDocuments.filter(
    (i) => i.transactionId === tx.id
  );
  const verificationResults = db.verificationResults.filter(
    (v) => v.transactionId === tx.id
  );
  const deliveryEvents = db.deliveryEvents
    .filter((d) => d.transactionId === tx.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const settlementRecord = db.settlementRecords.find(
    (s) => s.transactionId === tx.id
  );
  const refundRecords = db.refundRecords.filter((r) => r.transactionId === tx.id);
  const auditLogs = db.auditLogs
    .filter((l) => l.transactionId === tx.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const maskedDest = maskDestination(tx);
  const isProvider = role === 'PROVIDER_A';
  const isShopper = role === 'SHOPPER_B';

  // Strict privacy guard: NEVER send Class B shipping address, phone, or delivery instructions to Class A
  const { deliveryInfo, ...txWithoutDelivery } = tx;

  // Mask Class A identities for Class B shopper (Provider 01, Provider 02, etc.)
  const projectedMatches = isShopper
    ? providerMatches.map((m, idx) => {
        const maskedLabel = `Provider ${String(idx + 1).padStart(2, '0')}`;
        return {
          ...m,
          providerAlias: maskedLabel,
          providerId: `prov-masked-${String(idx + 1).padStart(2, '0')}`,
          cardMetadataId: `card-masked-${String(idx + 1).padStart(2, '0')}`,
          id: `pm-masked-${tx.id}-${String(idx + 1).padStart(2, '0')}`,
          aiRationale: m.aiRationale.replace(/^[^\s]+ holds/, `${maskedLabel} holds`),
        };
      })
    : providerMatches;

  let shopperProviderLabel = 'Verified Card Provider';
  const matchIdx = providerMatches.findIndex((m) => m.providerId === tx.providerId);
  if (matchIdx >= 0) {
    shopperProviderLabel = `Provider ${String(matchIdx + 1).padStart(2, '0')}`;
  }

  const projectedProviderProfile =
    isShopper && providerProfile
      ? {
          ...providerProfile,
          id: `prov-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
          displayAlias: shopperProviderLabel,
          userId: 'usr-provider-masked',
        }
      : providerProfile;

  const projectedCardMetadata =
    isShopper && cardMetadata
      ? {
          ...cardMetadata,
          id: `card-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
          providerId: `prov-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
        }
      : cardMetadata;

  const projectedPurchaseRequest =
    isShopper && purchaseRequest
      ? {
          ...purchaseRequest,
          providerId: `prov-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
          cardMetadataId: `card-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
        }
      : purchaseRequest;

  let sanitizedExplanation = tx.aiRecommendationExplanation;
  if (isShopper && sanitizedExplanation) {
    sanitizedExplanation = sanitizedExplanation.replace(
      /Arjun M\.|Arjun|Neha K\.|Neha|Priya N\.|Priya|Vikram R\.|Vikram|Rohit V\.|Rohit|Ananya I\.|Ananya/g,
      'Provider 01'
    );
  }

  return {
    transaction: {
      ...txWithoutDelivery,
      ...(isShopper && tx.providerId
        ? {
            providerId: `prov-masked-${matchIdx >= 0 ? String(matchIdx + 1).padStart(2, '0') : '01'}`,
            aiRecommendationExplanation: sanitizedExplanation,
          }
        : {}),
      ...(isShopper && sanitizedExplanation ? { aiRecommendationExplanation: sanitizedExplanation } : {}),
      ...(isProvider ? {} : { deliveryInfo }),
      maskedDestination: maskedDest,
    },
    product,
    offer,
    aiAnalysis,
    savingsComparisons:
      isShopper
        ? savingsComparisons.filter((s) => s.eligibilityStatus === 'ELIGIBLE')
        : savingsComparisons,
    providerMatches: projectedMatches,
    purchaseRequest: projectedPurchaseRequest,
    providerProfile: projectedProviderProfile,
    cardMetadata: projectedCardMetadata,
    upiMandate,
    merchantOrder: merchantOrder
      ? {
          id: merchantOrder.id,
          transactionId: merchantOrder.transactionId,
          merchantOrderId: merchantOrder.merchantOrderId,
          paymentGatewayTxId: merchantOrder.paymentGatewayTxId,
          merchantName: merchantOrder.merchantName,
          payerDisplayLabel: merchantOrder.payerDisplayLabel,
          recipientName: isProvider
            ? 'Verified Class B Recipient (Masked)'
            : merchantOrder.recipientName,
          pinCode: isProvider
            ? `${merchantOrder.pinCode.slice(0, 3)}***`
            : merchantOrder.pinCode,
          expectedDeliveryDate: merchantOrder.expectedDeliveryDate,
          integrationMode: merchantOrder.integrationMode,
          createdAt: merchantOrder.createdAt,
          maskedDestination: maskedDest,
          ...(isProvider
            ? {}
            : {
                recipientPhone: merchantOrder.recipientPhone,
                shippingAddress: merchantOrder.shippingAddress,
                deliveryInstructions: merchantOrder.deliveryInstructions,
              }),
        }
      : undefined,
    invoiceDocuments,
    verificationResults,
    deliveryEvents,
    settlementRecord,
    refundRecords,
    auditLogs,
  };
}

