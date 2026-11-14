'use client';

import React from 'react';
import {
  CheckCircle2,
  Circle,
  Clock,
  RotateCcw,
  ShieldAlert,
  Truck,
  Wallet,
} from 'lucide-react';
import type { RoleProjectedTransaction } from '@/lib/db/types';
import { formatDateTime, formatInr } from '@/lib/utils';
import { Badge, Card, CardContent, CardHeader, TransactionStatusBadge } from '@/components/ui/primitives';

const JOURNEY_STEPS = [
  { key: 'AI_ANALYSIS', label: 'AI Product & Offer Analysis' },
  { key: 'OFFER_MATCH', label: 'Offer & Provider Match' },
  { key: 'MANDATE', label: 'One-Time UPI Mandate' },
  { key: 'CARD_PAY', label: 'Provider Card Checkout' },
  { key: 'MERCHANT_ORDER', label: 'Merchant Order Created' },
  { key: 'DELIVERY', label: 'Delivery & Return Window' },
  { key: 'SETTLED', label: 'Escrow Settlement' },
];

function getStepProgress(item: RoleProjectedTransaction): number {
  const s = item.transaction.status;
  if (s === 'SETTLEMENT_COMPLETED') return 7;
  if (
    ['SHIPPED', 'DELIVERED', 'RETURN_WINDOW_ACTIVE', 'SETTLEMENT_ELIGIBLE'].includes(s)
  )
    return 6;
  if (
    ['ORDER_CREATED', 'INVOICE_PENDING', 'INVOICE_UNDER_REVIEW', 'INVOICE_VERIFIED'].includes(s)
  )
    return 5;
  if (['CARD_PAYMENT_PENDING', 'CARD_PAYMENT_SUCCESS'].includes(s)) return 4;
  if (['PROVIDER_ACCEPTED', 'MANDATE_PENDING', 'MANDATE_AUTHORISED'].includes(s))
    return 3;
  if (['OFFER_SELECTED', 'PROVIDER_MATCHING'].includes(s)) return 2;
  return 1;
}

export function TransactionDetailCard({
  item,
  hideShopperPII = false,
}: {
  item: RoleProjectedTransaction;
  hideShopperPII?: boolean;
}) {
  const { transaction: tx, product, offer, upiMandate, merchantOrder, deliveryEvents, settlementRecord } =
    item;
  const completedSteps = getStepProgress(item);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-[#002970]/5 via-white to-[#00BAF2]/5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-[#002970] bg-[#00BAF2]/15 px-2.5 py-1 rounded-lg">
              {tx.id}
            </span>
            <TransactionStatusBadge status={tx.status} />
            {tx.flaggedForMismatch && (
              <Badge variant="amber">
                <ShieldAlert className="h-3 w-3" />
                Flagged Mismatch Review
              </Badge>
            )}
          </div>
          <h3 className="font-bold text-slate-900 mt-1.5 text-base">
            {product.title}
          </h3>
          <p className="text-xs text-slate-500">
            {product.merchant} • {product.category} • Updated {formatDateTime(tx.updatedAt)}
          </p>
        </div>

        <div className="text-right tabular-nums">
          <p className="text-xs text-slate-500">Listed Price</p>
          <p className="text-lg font-extrabold text-[#002970]">
            {formatInr(tx.listedPrice)}
          </p>
          {tx.shopperSavings > 0 && (
            <p className="text-xs font-semibold text-[#00B86B]">
              Net Savings {formatInr(tx.shopperSavings)}
            </p>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Visual 7-Stage Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {JOURNEY_STEPS.map((step, idx) => {
            const done = idx < completedSteps;
            const current = idx + 1 === completedSteps;
            return (
              <div
                key={step.key}
                className={`rounded-xl border p-2.5 text-xs transition ${
                  done
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                    : current
                    ? 'border-[#00BAF2] bg-sky-50 text-[#002970]'
                    : 'border-slate-200 bg-slate-50 text-slate-400'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1">
                  {done ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-[#00B86B] shrink-0" />
                  ) : current ? (
                    <Clock className="h-3.5 w-3.5 text-[#00BAF2] shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <span className="font-bold">Step {idx + 1}</span>
                </div>
                <p className="font-medium leading-snug">{step.label}</p>
              </div>
            );
          })}
        </div>

        {/* Economics & Separated Identity Summary */}
        <div className="grid md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5 text-xs tabular-nums">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-[#002970]" />
              Deterministic Pricing Split
            </p>
            <div className="flex justify-between">
              <span className="text-slate-500">Listed Price</span>
              <span className="font-semibold">{formatInr(tx.listedPrice)}</span>
            </div>
            <div className="flex justify-between text-[#00B86B]">
              <span>{offer ? `${offer.bankName} Instant Discount` : 'Bank Discount'}</span>
              <span className="font-semibold">-{formatInr(tx.bankDiscount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Provider Card Charge</span>
              <span className="font-semibold">{formatInr(tx.cardChargeAmount)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Provider Reward</span>
              <span className="font-semibold">+{formatInr(tx.providerReward)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">PerkLink Service Fee</span>
              <span className="font-semibold">+{formatInr(tx.platformFee)}</span>
            </div>
            <div className="border-t border-slate-200 pt-1.5 flex justify-between font-bold text-[#002970]">
              <span>Shopper Mandate Total</span>
              <span>{formatInr(tx.mandateAmount)}</span>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5 text-xs">
            <p className="font-bold text-slate-800">Separated Order & Mandate State</p>
            <p className="text-slate-600">
              <span className="text-slate-400">Shopper UPI Mandate:</span>{' '}
              <strong className="text-slate-800">
                {upiMandate ? `${upiMandate.status} (${upiMandate.frequency})` : 'Not initialised'}
              </strong>
            </p>
            <p className="text-slate-600">
              <span className="text-slate-400">Card Payment:</span>{' '}
              <strong className="text-slate-800">
                {tx.cardPaymentStatus || 'NOT_INITIATED'}
              </strong>
            </p>
            <p className="text-slate-600">
              <span className="text-slate-400">Refund Protection Mandate:</span>{' '}
              {item.providerMandateSummary ? (
                <strong className={item.providerMandateSummary.authorized ? 'text-emerald-700' : 'text-amber-700'}>
                  {item.providerMandateSummary.authorized ? 'Authorised ✓ (Shopper Protected)' : item.providerMandateSummary.status}
                </strong>
              ) : item.providerMandate ? (
                <strong className={item.providerMandate.status === 'AUTHORISED' ? 'text-emerald-700' : 'text-amber-700'}>
                  {item.providerMandate.mandateRef} ({item.providerMandate.status}) • Cap: {formatInr(item.providerMandate.maxAmount)}
                </strong>
              ) : (
                <strong className="text-slate-700">{tx.providerMandateStatus || 'NOT_CREATED'}</strong>
              )}
            </p>
            <p className="text-slate-600">
              <span className="text-slate-400">Settlement Status:</span>{' '}
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 text-slate-800">
                {tx.settlementStatus || 'BLOCKED_PAYMENT_PENDING'}
              </span>
            </p>
            <p className="text-slate-600">
              <span className="text-slate-400">Merchant Order:</span>{' '}
              <strong className="text-slate-800">
                {merchantOrder
                  ? `${merchantOrder.merchantOrderId} (ETA ${merchantOrder.expectedDeliveryDate})`
                  : 'Not created yet'}
              </strong>
            </p>
            <p className="text-slate-600">
              <span className="text-slate-400">Delivery Recipient:</span>{' '}
              <strong className="text-slate-800">
                {hideShopperPII
                  ? item.transaction.maskedDestination
                  : tx.deliveryInfo
                  ? `${tx.deliveryInfo.recipientName} • ${tx.deliveryInfo.city || ''} ${tx.deliveryInfo.pinCode}`
                  : item.transaction.maskedDestination}
              </strong>
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-1.5 text-xs">
            <p className="font-bold text-slate-800 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-[#00BAF2]" />
              Delivery & Escrow Status
            </p>
            {deliveryEvents.length > 0 ? (
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {deliveryEvents.map((ev) => (
                  <div key={ev.id} className="border-l-2 border-[#00BAF2] pl-2">
                    <p className="font-semibold text-slate-800">
                      {ev.status.replace(/_/g, ' ')}
                    </p>
                    <p className="text-[11px] text-slate-500">{ev.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">
                Delivery tracking starts once simulated merchant order is created.
              </p>
            )}
            {settlementRecord && settlementRecord.status === 'SETTLED' && (
              <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-emerald-900">
                <p className="font-bold">Settlement Completed</p>
                <p className="tabular-nums">
                  Provider Payout: {formatInr(settlementRecord.providerTotalPayout)} • Fee:{' '}
                  {formatInr(settlementRecord.platformFee)}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Cancellation, Merchant Refund & Provider Recovery Alert Banner */}
        {tx.merchantRefundStatus && tx.merchantRefundStatus !== 'NONE' && (
          <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-950 flex items-center gap-2">
                <RotateCcw className="h-4 w-4 text-amber-600" />
                Return &amp; Refund Recovery Life-cycle Active
              </span>
              <Badge variant={tx.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS' ? 'green' : tx.recoveryStatus === 'RECOVERY_FAILED' ? 'red' : 'amber'}>
                {tx.recoveryStatus}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                <span className="text-slate-500 block text-[11px]">Merchant Refund</span>
                <strong className="text-slate-900">{tx.merchantRefundStatus}</strong>
              </div>
              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                <span className="text-slate-500 block text-[11px]">Provider Mandate</span>
                <strong className={tx.providerMandateStatus === 'AUTHORISED' ? 'text-emerald-700' : 'text-amber-700'}>
                  {tx.providerMandateStatus}
                </strong>
              </div>
              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                <span className="text-slate-500 block text-[11px]">Provider Recovery</span>
                <strong className={tx.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS' ? 'text-emerald-700' : 'text-amber-700'}>
                  {tx.recoveryStatus}
                </strong>
              </div>
              <div className="bg-white/80 p-2 rounded-lg border border-amber-200">
                <span className="text-slate-500 block text-[11px]">Shopper Refund</span>
                <strong className={tx.shopperRefundStatus === 'SHOPPER_REFUND_SUCCESS' ? 'text-emerald-700' : 'text-amber-700'}>
                  {tx.shopperRefundStatus}
                </strong>
              </div>
            </div>
            {item.refundRecoveries && item.refundRecoveries.length > 0 && (
              <div className="mt-2 text-xs text-slate-700 bg-white/60 p-2 rounded border border-amber-200/60">
                <span className="font-bold">Recovery Records:</span>{' '}
                {item.refundRecoveries.map((rec) => (
                  <span key={rec.id} className="inline-block mr-2 font-mono">
                    [{rec.id}: {formatInr(rec.recoveryAmount)} • {rec.recoveryStatus} • Shopper: {rec.shopperRefundStatus}]
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

