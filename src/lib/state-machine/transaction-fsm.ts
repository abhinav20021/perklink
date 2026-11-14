import type {
  DeliveryEvent,
  Transaction,
  TransactionStatus,
  UPIMandate,
  UserRole,
  VerificationResult,
} from '@/lib/db/types';

export interface TransitionRule {
  from: TransactionStatus;
  to: TransactionStatus;
  allowedRoles: UserRole[];
  description: string;
}

export const ALL_TRANSACTION_STATES: TransactionStatus[] = [
  'CREATED',
  'PRODUCT_ANALYSED',
  'OFFER_SELECTED',
  'PROVIDER_MATCHING',
  'PROVIDER_ACCEPTED',
  'MANDATE_PENDING',
  'MANDATE_AUTHORISED',
  'CARD_PAYMENT_PENDING',
  'CARD_PAYMENT_SUCCESS',
  'ORDER_CREATED',
  'INVOICE_PENDING',
  'INVOICE_UNDER_REVIEW',
  'INVOICE_VERIFIED',
  'SHIPPED',
  'DELIVERED',
  'RETURN_WINDOW_ACTIVE',
  'SETTLEMENT_ELIGIBLE',
  'SETTLEMENT_COMPLETED',
  'CANCELLED',
  'MANDATE_REJECTED',
  'MANDATE_EXPIRED',
  'PAYMENT_FAILED',
  'VERIFICATION_FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'DISPUTED',
];

export const TRANSITION_RULES: TransitionRule[] = [
  { from: 'CREATED', to: 'PRODUCT_ANALYSED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'AI product & offer analysis completed' },
  { from: 'CREATED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper cancelled before analysis' },

  { from: 'PRODUCT_ANALYSED', to: 'OFFER_SELECTED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper locked eligible bank offer' },
  { from: 'PRODUCT_ANALYSED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper cancelled after analysis' },

  { from: 'OFFER_SELECTED', to: 'PROVIDER_MATCHING', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Purchase request dispatched to matched Perk Provider' },
  { from: 'OFFER_SELECTED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper cancelled before provider request' },

  { from: 'PROVIDER_MATCHING', to: 'PROVIDER_ACCEPTED', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Matched Perk Provider accepted request' },
  { from: 'PROVIDER_MATCHING', to: 'OFFER_SELECTED', allowedRoles: ['PROVIDER_A', 'SHOPPER_B', 'ADMIN_OPS'], description: 'Provider declined; shopper may choose another provider' },
  { from: 'PROVIDER_MATCHING', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper cancelled during provider matching' },

  { from: 'PROVIDER_ACCEPTED', to: 'MANDATE_PENDING', allowedRoles: ['SHOPPER_B', 'PROVIDER_A', 'ADMIN_OPS'], description: 'One-time UPI mandate initialised for shopper approval' },
  { from: 'PROVIDER_ACCEPTED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Cancelled before mandate setup' },

  { from: 'MANDATE_PENDING', to: 'MANDATE_AUTHORISED', allowedRoles: ['SHOPPER_B'], description: 'Shopper approved one-time UPI mandate in simulation' },
  { from: 'MANDATE_PENDING', to: 'MANDATE_REJECTED', allowedRoles: ['SHOPPER_B'], description: 'Shopper rejected one-time UPI mandate' },
  { from: 'MANDATE_PENDING', to: 'MANDATE_EXPIRED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'One-time UPI mandate expired prior to authorisation' },
  { from: 'MANDATE_PENDING', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Cancelled while mandate pending' },

  { from: 'MANDATE_REJECTED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Transaction closed after mandate rejection' },
  { from: 'MANDATE_REJECTED', to: 'MANDATE_PENDING', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper re-initiated UPI mandate' },
  { from: 'MANDATE_EXPIRED', to: 'MANDATE_PENDING', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shopper refreshed expired UPI mandate' },
  { from: 'MANDATE_EXPIRED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Transaction closed after mandate expiry' },

  { from: 'MANDATE_AUTHORISED', to: 'CARD_PAYMENT_PENDING', allowedRoles: ['PROVIDER_A'], description: 'Provider initiated simulated secure card checkout' },
  { from: 'MANDATE_AUTHORISED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Cancelled & mandate released before card payment' },

  { from: 'CARD_PAYMENT_PENDING', to: 'CARD_PAYMENT_SUCCESS', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Simulated payment gateway callback verified order & amount' },
  { from: 'CARD_PAYMENT_PENDING', to: 'PAYMENT_FAILED', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Simulated card checkout failed issuer authentication' },

  { from: 'PAYMENT_FAILED', to: 'CARD_PAYMENT_PENDING', allowedRoles: ['PROVIDER_A'], description: 'Provider retried simulated card checkout' },
  { from: 'PAYMENT_FAILED', to: 'REFUND_PENDING', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Mandate release / refund initiated after payment failure' },
  { from: 'PAYMENT_FAILED', to: 'CANCELLED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Transaction cancelled after payment failure' },

  { from: 'CARD_PAYMENT_SUCCESS', to: 'ORDER_CREATED', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Simulated merchant order created with separated payer/recipient' },

  // Normal flow (no mandatory invoice block) + optional fallback invoice verification flow
  { from: 'ORDER_CREATED', to: 'SHIPPED', allowedRoles: ['ADMIN_OPS'], description: 'Order dispatched by simulated merchant' },
  { from: 'ORDER_CREATED', to: 'INVOICE_PENDING', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Optional/fallback invoice evidence requested' },
  { from: 'ORDER_CREATED', to: 'INVOICE_UNDER_REVIEW', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Optional invoice uploaded for AI verification' },

  { from: 'INVOICE_PENDING', to: 'INVOICE_UNDER_REVIEW', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Invoice uploaded and analysed by OCR/AI' },
  { from: 'INVOICE_PENDING', to: 'SHIPPED', allowedRoles: ['ADMIN_OPS'], description: 'Merchant shipped order without blocking on optional invoice' },

  { from: 'INVOICE_UNDER_REVIEW', to: 'INVOICE_VERIFIED', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Invoice passed AI & deterministic verification' },
  { from: 'INVOICE_UNDER_REVIEW', to: 'VERIFICATION_FAILED', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Invoice mismatch detected during verification' },
  { from: 'INVOICE_UNDER_REVIEW', to: 'DISPUTED', allowedRoles: ['ADMIN_OPS'], description: 'Flagged for manual dispute resolution' },

  { from: 'VERIFICATION_FAILED', to: 'INVOICE_UNDER_REVIEW', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Provider re-uploaded corrected invoice' },
  { from: 'VERIFICATION_FAILED', to: 'DISPUTED', allowedRoles: ['ADMIN_OPS', 'SHOPPER_B'], description: 'Escalated to operations dispute' },
  { from: 'VERIFICATION_FAILED', to: 'REFUND_PENDING', allowedRoles: ['ADMIN_OPS'], description: 'Refund initiated due to verification failure' },

  { from: 'INVOICE_VERIFIED', to: 'SHIPPED', allowedRoles: ['ADMIN_OPS'], description: 'Verified order shipped' },
  { from: 'INVOICE_VERIFIED', to: 'DELIVERED', allowedRoles: ['ADMIN_OPS'], description: 'Verified order marked delivered' },
  { from: 'INVOICE_VERIFIED', to: 'SETTLEMENT_ELIGIBLE', allowedRoles: ['ADMIN_OPS'], description: 'Verified after delivery & return window completion' },

  { from: 'SHIPPED', to: 'DELIVERED', allowedRoles: ['ADMIN_OPS'], description: 'Simulated merchant order delivered to Shopper' },
  { from: 'SHIPPED', to: 'INVOICE_UNDER_REVIEW', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Fallback invoice submitted while in transit' },
  { from: 'SHIPPED', to: 'DISPUTED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Shipment issue reported' },

  { from: 'DELIVERED', to: 'RETURN_WINDOW_ACTIVE', allowedRoles: ['ADMIN_OPS'], description: 'Merchant return window opened' },
  { from: 'DELIVERED', to: 'DISPUTED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Post-delivery issue reported' },

  { from: 'RETURN_WINDOW_ACTIVE', to: 'SETTLEMENT_ELIGIBLE', allowedRoles: ['ADMIN_OPS'], description: 'Return window completed with all checks satisfied' },
  { from: 'RETURN_WINDOW_ACTIVE', to: 'DISPUTED', allowedRoles: ['SHOPPER_B', 'ADMIN_OPS'], description: 'Return or mismatch dispute opened' },

  { from: 'DISPUTED', to: 'REFUND_PENDING', allowedRoles: ['ADMIN_OPS'], description: 'Operations approved buyer refund' },
  { from: 'DISPUTED', to: 'SETTLEMENT_ELIGIBLE', allowedRoles: ['ADMIN_OPS'], description: 'Dispute resolved in provider favour' },
  { from: 'DISPUTED', to: 'INVOICE_UNDER_REVIEW', allowedRoles: ['PROVIDER_A', 'ADMIN_OPS'], description: 'Fallback invoice uploaded to resolve dispute' },

  { from: 'SETTLEMENT_ELIGIBLE', to: 'SETTLEMENT_COMPLETED', allowedRoles: ['ADMIN_OPS'], description: 'Simulated escrow settlement executed' },

  { from: 'REFUND_PENDING', to: 'REFUNDED', allowedRoles: ['ADMIN_OPS'], description: 'Simulated refund / mandate release completed' },
];

export interface TransitionContext {
  mandate?: UPIMandate;
  deliveryEvents?: DeliveryEvent[];
  verificationResults?: VerificationResult[];
}

export class StateTransitionError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'StateTransitionError';
    this.statusCode = statusCode;
  }
}

export function canTransition(
  from: TransactionStatus,
  to: TransactionStatus,
  actorRole: UserRole
): { allowed: boolean; reason?: string } {
  if (from === to) {
    return { allowed: false, reason: `Transaction is already in state ${from}.` };
  }

  const rule = TRANSITION_RULES.find((r) => r.from === from && r.to === to);
  if (!rule) {
    return {
      allowed: false,
      reason: `Illegal state transition from ${from} to ${to}. Server state machine blocks skipping stages.`,
    };
  }

  if (!rule.allowedRoles.includes(actorRole)) {
    return {
      allowed: false,
      reason: `Role ${actorRole} is not authorised to perform transition ${from} -> ${to}.`,
    };
  }

  return { allowed: true };
}

export function validateTransitionPreconditions(
  tx: Transaction,
  targetState: TransactionStatus,
  actorRole: UserRole,
  context: TransitionContext = {}
): void {
  const check = canTransition(tx.status, targetState, actorRole);
  if (!check.allowed) {
    throw new StateTransitionError(check.reason ?? 'Transition not permitted', 409);
  }

  if (targetState === 'OFFER_SELECTED' && !tx.offerId) {
    throw new StateTransitionError('An offer must be selected before locking OFFER_SELECTED.', 400);
  }

  if (targetState === 'PROVIDER_MATCHING' && !tx.deliveryInfo) {
    throw new StateTransitionError(
      'Shopper delivery information is required before requesting a card provider.',
      400
    );
  }

  if (targetState === 'MANDATE_AUTHORISED') {
    if (!context.mandate) {
      throw new StateTransitionError('UPI mandate record not found.', 400);
    }
    if (!context.mandate.termsAccepted) {
      throw new StateTransitionError('Mandate terms must be accepted before authorisation.', 400);
    }
    if (new Date(context.mandate.expiresAt).getTime() < Date.now()) {
      throw new StateTransitionError('Cannot authorise an expired UPI mandate.', 409);
    }
  }

  if (targetState === 'CARD_PAYMENT_PENDING') {
    if (!context.mandate || context.mandate.status !== 'APPROVED') {
      throw new StateTransitionError(
        'Shopper one-time UPI mandate must be APPROVED before provider card checkout.',
        409
      );
    }
  }

  if (targetState === 'SETTLEMENT_ELIGIBLE') {
    if (tx.flaggedForMismatch) {
      const hasVerifiedInvoice = (context.verificationResults ?? []).some(
        (v) => v.status === 'VERIFIED'
      );
      if (!hasVerifiedInvoice) {
        throw new StateTransitionError(
          'Flagged mismatch requires verified fallback invoice before settlement eligibility.',
          409
        );
      }
    }
    const events = context.deliveryEvents ?? [];
    const returnCompleted = events.some((e) => e.status === 'RETURN_WINDOW_COMPLETED');
    if (!returnCompleted) {
      throw new StateTransitionError(
        'Delivery return window must be completed before SETTLEMENT_ELIGIBLE.',
        409
      );
    }
  }

  if (targetState === 'SETTLEMENT_COMPLETED') {
    if (tx.status !== 'SETTLEMENT_ELIGIBLE') {
      throw new StateTransitionError(
        'Cannot simulate settlement until transaction reaches SETTLEMENT_ELIGIBLE.',
        409
      );
    }
    if (!context.mandate || context.mandate.status !== 'APPROVED') {
      throw new StateTransitionError(
        'An approved one-time UPI mandate is required to execute settlement.',
        409
      );
    }
  }
}

