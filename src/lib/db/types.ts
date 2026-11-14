export type UserRole = 'SHOPPER_B' | 'PROVIDER_A' | 'ADMIN_OPS';

export type TransactionStatus =
  | 'CREATED'
  | 'PRODUCT_ANALYSED'
  | 'OFFER_SELECTED'
  | 'PROVIDER_MATCHING'
  | 'PROVIDER_ACCEPTED'
  | 'MANDATE_PENDING'
  | 'MANDATE_AUTHORISED'
  | 'CARD_PAYMENT_PENDING'
  | 'CARD_PAYMENT_SUCCESS'
  | 'ORDER_CREATED'
  | 'INVOICE_PENDING'
  | 'INVOICE_UNDER_REVIEW'
  | 'INVOICE_VERIFIED'
  | 'SHIPPED'
  | 'DELIVERED'
  | 'RETURN_WINDOW_ACTIVE'
  | 'SETTLEMENT_ELIGIBLE'
  | 'SETTLEMENT_COMPLETED'
  | 'CANCELLED'
  | 'MANDATE_REJECTED'
  | 'MANDATE_EXPIRED'
  | 'PAYMENT_FAILED'
  | 'VERIFICATION_FAILED'
  | 'REFUND_PENDING'
  | 'REFUNDED'
  | 'DISPUTED';

export type DeliveryStatus =
  | 'ORDER_PLACED'
  | 'CONFIRMED'
  | 'SHIPPED'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'RETURN_WINDOW_ACTIVE'
  | 'RETURN_WINDOW_COMPLETED';

export type OfferEligibilityStatus =
  | 'ELIGIBLE'
  | 'POTENTIALLY_ELIGIBLE'
  | 'NOT_ELIGIBLE';

export type VerificationStatus =
  | 'VERIFIED'
  | 'VERIFICATION_FAILED'
  | 'MANUAL_REVIEW_REQUIRED';

export interface User {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  city: string;
  createdAt: string;
}

export interface UserRoleRecord {
  id: string;
  userId: string;
  role: UserRole;
}

export interface ProviderProfile {
  id: string;
  userId: string;
  displayAlias: string;
  rating: number;
  completedOrders: number;
  availabilityStatus: 'ONLINE' | 'BUSY' | 'OFFLINE';
  avgAcceptanceMinutes: number;
  maxTransactionAmount: number;
  supportedOfferCategories: string[];
}

export interface CardProductMetadata {
  id: string;
  providerId: string;
  bankName: string;
  cardNetwork: 'Visa' | 'Mastercard' | 'RuPay';
  cardVariant: string;
  cardCategory: 'Cashback' | 'Rewards' | 'Premium' | 'Co-branded';
  maskedLast4: string; // Synthetic demo label only (never a real PAN)
  rewardPreferenceInr: number;
  isVerifiedDemo: boolean;
  isActive: boolean;
}

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: 'CARD_MATCH_OPT_IN' | 'UPI_MANDATE_TERMS' | 'PRIVACY_MASKING_ACK';
  granted: boolean;
  scopeSummary: string;
  grantedAt: string;
  revokedAt?: string;
}

export interface BankOffer {
  id: string;
  bankName: string;
  cardType: string;
  offerTitle: string;
  rawDescription: string;
  offerType: 'instant_discount' | 'cashback';
  discountType: 'PERCENT' | 'FLAT';
  discountValue: number; // percentage e.g. 10, or flat INR e.g. 1500
  minPurchaseAmount: number;
  maxDiscount: number;
  emiEligible: boolean;
  eligibleCategories: string[];
  eligibleMerchants: string[];
  exclusions: string[];
  validFrom: string;
  validUntil: string;
  isActive: boolean;
}

export interface OfferCondition {
  id: string;
  offerId: string;
  conditionKey: string;
  conditionLabel: string;
  conditionValue: string;
  requiresManualVerification: boolean;
}

export interface Product {
  id: string;
  url: string;
  title: string;
  brand: string;
  model: string;
  merchant: string;
  category: string;
  listedPrice: number;
  imageUrl: string;
  extractionSource: 'AI_LIVE_URL' | 'CURATED_DEMO_FALLBACK' | 'MANUAL_ENTRY';
  specs: Record<string, string>;
  createdAt: string;
}

export interface StructuredParsedOffer {
  offerId?: string;
  bank: string;
  card_type: string;
  discount_percentage: number;
  maximum_discount: number;
  minimum_transaction: number;
  emi_eligible: boolean;
  offer_type: 'instant_discount' | 'cashback';
  eligible_categories: string[];
  eligible_merchants: string[];
  exclusions: string[];
  valid_from?: string;
  valid_until?: string;
  other_conditions?: string[];
}

export interface AIAnalysisResult {
  id: string;
  productId: string;
  transactionId?: string;
  sourceUrl: string;
  usedFallback: boolean;
  fallbackReason?: string;
  productUnderstanding: {
    productName: string;
    brand: string;
    model: string;
    category: string;
    merchant: string;
    listedPrice: number;
    imageUrl: string;
    productUrl: string;
  };
  parsedOffers: StructuredParsedOffer[];
  shopperExplanation: string;
  uncertainties: string[];
  modelUsed: string;
  createdAt: string;
}

export interface OfferConditionCheck {
  label: string;
  passed: boolean | 'uncertain';
  detail: string;
}

export interface SavingsComparison {
  id: string;
  transactionId: string;
  offerId: string;
  bankName: string;
  cardType: string;
  offerTitle: string;
  eligibilityStatus: OfferEligibilityStatus;
  eligibilityReason: string;
  conditionChecks: OfferConditionCheck[];
  originalPrice: number;
  discountPercentage: number;
  maxDiscount: number;
  actualDiscount: number;
  cardChargeAmount: number;
  providerReward: number;
  perkLinkFee: number;
  shopperFinalAmount: number;
  shopperNetSavings: number;
  isRecommended?: boolean;
  createdAt: string;
}

export interface ProviderScoreBreakdown {
  compatibilityScore: number; // max 35
  availabilityScore: number;  // max 20
  capacityScore: number;      // max 15
  fulfilmentScore: number;    // max 12
  responseTimeScore: number;  // max 10
  ratingScore: number;        // max 8
  totalScore: number;         // max 100
}

export interface ProviderMatch {
  id: string;
  transactionId: string;
  providerId: string;
  providerAlias: string;
  cardMetadataId: string;
  bankName: string;
  cardProduct: string;
  cardCategory: string;
  maskedLast4: string;
  availabilityStatus: 'ONLINE' | 'BUSY' | 'OFFLINE';
  completedOrders: number;
  avgAcceptanceMinutes: number;
  rating: number;
  maxTransactionAmount: number;
  offerId: string;
  offeredReward: number;
  matchScore: number;
  scoreBreakdown: ProviderScoreBreakdown;
  aiRationale: string;
  isRecommended: boolean;
  createdAt: string;
}

export interface DeliveryInfo {
  recipientName: string;
  mobileNumber: string;
  shippingAddress: string;
  pinCode: string;
  city?: string;
  deliveryInstructions?: string;
}

export interface PurchaseRequest {
  id: string;
  transactionId: string;
  providerId: string;
  cardMetadataId: string;
  offeredReward: number;
  offerId?: string;
  bankName?: string;
  cardType?: string;
  discountAmount?: number;
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';
  respondedAt?: string;
  rejectionReason?: string;
  createdAt: string;
}

export interface UPIMandate {
  id: string;
  transactionId: string;
  mandateRef: string;
  shopperVpaMasked: string;
  beneficiaryArrangement: string;
  amount: number;
  frequency: 'ONE_TIME';
  purpose: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXPIRED' | 'EXECUTED' | 'CANCELLED';
  expiresAt: string;
  authorisedAt?: string;
  executedAt?: string;
  termsAccepted: boolean;
}

export interface PaymentSimulationRecord {
  paymentOrderId: string;
  paymentGatewayTxId: string;
  amount: number;
  paymentMethod: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  callbackVerified: boolean;
  timestamp: string;
  failureReason?: string;
}

export interface MerchantOrder {
  id: string;
  transactionId: string;
  merchantOrderId: string;
  paymentGatewayTxId: string;
  merchantName: string;
  payerDisplayLabel: string;
  recipientName: string;
  recipientPhone: string;
  shippingAddress: string;
  pinCode: string;
  deliveryInstructions?: string;
  expectedDeliveryDate: string;
  integrationMode: 'SIMULATED_SEPARATED_IDENTITY';
  createdAt: string;
}

export interface InvoiceDocument {
  id: string;
  transactionId: string;
  uploadedByUserId: string;
  fileName: string;
  fileType: 'PDF' | 'PNG' | 'JPG';
  storagePath: string;
  paymentEvidenceRef: string;
  demoPresetId?: string;
  uploadedAt: string;
}

export interface VerificationDiscrepancy {
  field: string;
  expected: string;
  extracted: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
}

export interface VerificationResult {
  id: string;
  invoiceId: string;
  transactionId: string;
  ocrProvider: 'GEMINI_VISION' | 'SIMULATED_OCR_FALLBACK';
  extractedInvoiceNumber: string;
  extractedMerchant: string;
  extractedOrderId: string;
  extractedProductName: string;
  extractedAmount: number;
  extractedTax: number;
  extractedPurchaseDate: string;
  discrepancies: VerificationDiscrepancy[];
  status: VerificationStatus;
  reviewNotes?: string;
  verifiedAt: string;
}

export interface DeliveryEvent {
  id: string;
  transactionId: string;
  merchantOrderId: string;
  status: DeliveryStatus;
  description: string;
  timestamp: string;
  actor: string;
}

export interface SettlementRecord {
  id: string;
  transactionId: string;
  partnerRef: string;
  buyerMandateAmount: number;
  providerCardCharge: number;
  providerReward: number;
  providerTotalPayout: number;
  platformFee: number;
  refundAmount: number;
  status: 'PENDING_ELIGIBILITY' | 'ELIGIBLE' | 'SETTLED' | 'FAILED';
  partnerName: string;
  settledAt?: string;
}

export interface RefundRecord {
  id: string;
  transactionId: string;
  amount: number;
  reason: string;
  status: 'INITIATED' | 'PROCESSING' | 'COMPLETED';
  initiatedAt: string;
  completedAt?: string;
}

export interface AuditLog {
  id: string;
  transactionId?: string;
  actorUserId: string;
  actorRole: UserRole;
  action: string;
  fromState?: TransactionStatus;
  toState?: TransactionStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface Transaction {
  id: string;
  status: TransactionStatus;
  shopperId: string;
  providerId?: string;
  productId: string;
  offerId?: string;
  listedPrice: number;
  bankDiscount: number;
  cardChargeAmount: number;
  providerReward: number;
  platformFee: number;
  mandateAmount: number;
  shopperSavings: number;
  deliveryInfo?: DeliveryInfo;
  paymentSimulation?: PaymentSimulationRecord;
  aiRecommendationExplanation?: string;
  selectedOfferSnapshot?: {
    offerId: string;
    bankName: string;
    cardType: string;
    offerTitle: string;
    discountPercentage: number;
    maxDiscount: number;
    actualDiscount: number;
    cardChargeAmount: number;
    shopperNetSavings: number;
  };
  flaggedForMismatch?: boolean;
  mismatchReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformConfig {
  defaultProviderRewardInr: number;
  defaultPlatformFeeInr: number;
  mandateExpiryMinutes: number;
  returnWindowHoursDemo: number;
}

export interface PerkLinkDatabase {
  config: PlatformConfig;
  users: User[];
  userRoles: UserRoleRecord[];
  providerProfiles: ProviderProfile[];
  cardProductMetadata: CardProductMetadata[];
  consentRecords: ConsentRecord[];
  bankOffers: BankOffer[];
  offerConditions: OfferCondition[];
  products: Product[];
  aiAnalysisResults: AIAnalysisResult[];
  savingsComparisons: SavingsComparison[];
  providerMatches: ProviderMatch[];
  transactions: Transaction[];
  purchaseRequests: PurchaseRequest[];
  upiMandates: UPIMandate[];
  merchantOrders: MerchantOrder[];
  invoiceDocuments: InvoiceDocument[];
  verificationResults: VerificationResult[];
  deliveryEvents: DeliveryEvent[];
  settlementRecords: SettlementRecord[];
  refundRecords: RefundRecord[];
  auditLogs: AuditLog[];
}

export interface RoleProjectedTransaction {
  transaction: Omit<Transaction, 'deliveryInfo'> & {
    deliveryInfo?: DeliveryInfo;
    maskedDestination?: string;
  };
  product: Product;
  offer?: BankOffer;
  aiAnalysis?: AIAnalysisResult;
  savingsComparisons: SavingsComparison[];
  providerMatches: ProviderMatch[];
  purchaseRequest?: PurchaseRequest;
  providerProfile?: ProviderProfile;
  cardMetadata?: CardProductMetadata;
  upiMandate?: UPIMandate;
  merchantOrder?: Omit<
    MerchantOrder,
    'recipientPhone' | 'shippingAddress' | 'deliveryInstructions'
  > & {
    recipientPhone?: string;
    shippingAddress?: string;
    deliveryInstructions?: string;
    maskedDestination: string;
  };
  invoiceDocuments: InvoiceDocument[];
  verificationResults: VerificationResult[];
  deliveryEvents: DeliveryEvent[];
  settlementRecord?: SettlementRecord;
  refundRecords: RefundRecord[];
  auditLogs: AuditLog[];
}

