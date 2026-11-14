'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Circle,
  Clock,
  Info,
  Package,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import type { RoleProjectedTransaction } from '@/lib/db/types';
import { AppShell } from '@/components/layout/AppShell';
import { TransactionDetailCard } from '@/components/shared/TransactionTimeline';
import { Badge, Button, Card, CardContent } from '@/components/ui/primitives';

function OrdersContent() {
  const searchParams = useSearchParams();
  const txIdParam = searchParams.get('txId');

  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string>(txIdParam || '');
  const [loading, setLoading] = useState(true);
  const [returning, setReturning] = useState(false);
  const [returnNote, setReturnNote] = useState<string | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      const list: RoleProjectedTransaction[] = data.transactions || [];
      setTransactions(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(txIdParam || list[0].transaction.id);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/transactions')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        const list: RoleProjectedTransaction[] = data.transactions || [];
        setTransactions(list);
        if (list.length > 0) {
          setSelectedId((prev) => prev || txIdParam || list[0].transaction.id);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [txIdParam]);

  const active =
    transactions.find((t) => t.transaction.id === selectedId) ?? transactions[0];

  async function handleRequestReturn(txId: string) {
    if (!confirm('Are you sure you want to request a product cancellation / return for this order?')) return;
    setReturning(true);
    setReturnError(null);
    setReturnNote(null);
    try {
      const res = await fetch(`/api/shopper/transactions/${txId}/return`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Shopper requested product return / cancellation.' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit return request');
      setReturnNote('Return request submitted successfully. Merchant refund tracking is now active.');
      await refresh();
    } catch (err) {
      setReturnError(err instanceof Error ? err.message : 'Return request failed');
    } finally {
      setReturning(false);
    }
  }

  function renderNextStepGuide(item: RoleProjectedTransaction) {
    const s = item.transaction.status;
    if (s === 'PROVIDER_MATCHING') {
      return 'Request sent! Switch to Perk Provider in the top bar and accept this request in /provider/requests.';
    }
    if (s === 'MANDATE_PENDING') {
      return 'Provider accepted! Click "Approve UPI Mandate" to authorise the one-time simulated UPI mandate.';
    }
    if (s === 'MANDATE_AUTHORISED') {
      return 'UPI Mandate approved! Switch to Perk Provider and open Card Checkout to complete simulated card payment.';
    }
    if (s === 'ORDER_CREATED' || s === 'SHIPPED' || s === 'DELIVERED' || s === 'RETURN_WINDOW_ACTIVE') {
      return 'Simulated merchant order is active! Switch to Paytm Ops Admin (/admin/transactions) to progress delivery & simulate settlement.';
    }
    if (s === 'SETTLEMENT_COMPLETED') {
      return 'Full lifecycle complete — order delivered and escrow settlement simulated.';
    }
    return `Current state: ${s.replace(/_/g, ' ')}.`;
  }

  return (
    <AppShell requiredRole="SHOPPER_B">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="blue" className="mb-1.5">
              <Package className="h-3 w-3" />
              Shared Order &amp; Lifecycle Tracking
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Shopper Order Tracker
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {transactions.length > 0 && (
              <select
                value={active?.transaction.id || ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#002970]"
              >
                {transactions.map((t) => (
                  <option key={t.transaction.id} value={t.transaction.id}>
                    {t.transaction.id} — {t.transaction.status}
                  </option>
                ))}
              </select>
            )}
            <Button variant="outline" size="sm" onClick={refresh}>
              Refresh
            </Button>
          </div>
        </div>

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Loading orders...
            </CardContent>
          </Card>
        ) : !active ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No transactions found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card className="border-sky-200 bg-sky-50/70">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="flex items-center gap-2.5 text-sm text-[#002970]">
                  <Info className="h-5 w-5 text-[#00BAF2] shrink-0" />
                  <span>
                    <strong>Process Guide:</strong> {renderNextStepGuide(active)}
                  </span>
                </div>
                {active.transaction.status === 'MANDATE_PENDING' && (
                  <Link href={`/shopper/mandate?txId=${active.transaction.id}`}>
                    <Button size="sm" variant="paytm">
                      Approve UPI Mandate
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
                {active.transaction.status === 'OFFER_SELECTED' && (
                  <Link href={`/shopper/offers?txId=${active.transaction.id}`}>
                    <Button size="sm" variant="paytm">
                      Select Provider
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                )}
              </CardContent>
            </Card>

            {returnNote && (
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3.5 text-xs text-emerald-900 font-semibold flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#00B86B] shrink-0" />
                <span>{returnNote}</span>
              </div>
            )}

            {returnError && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5 text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                <span>{returnError}</span>
              </div>
            )}

            {/* Provider Refund Protection & Shopper Return Request Card */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-[#00B86B]" />
                  <p className="font-bold text-xs text-[#002970]">
                    Provider Refund Protection:{' '}
                    <span className="text-[#00B86B]">
                      {active.providerMandateSummary?.authorized || active.transaction.providerMandateStatus === 'AUTHORISED'
                        ? 'Active ✓'
                        : active.transaction.providerMandateStatus || 'Pending'}
                    </span>
                  </p>
                </div>
                <p className="text-[11px] text-slate-500">
                  Card provider has authorized a refund protection mandate. If you return this item, merchant refunds to provider card are automatically recovered and credited to you.
                </p>
              </div>

              {active.transaction.merchantRefundStatus === 'NONE' &&
                ['ORDER_CREATED', 'INVOICE_PENDING', 'INVOICE_UNDER_REVIEW', 'INVOICE_VERIFIED', 'SHIPPED', 'DELIVERED', 'RETURN_WINDOW_ACTIVE', 'SETTLEMENT_ELIGIBLE', 'SETTLEMENT_COMPLETED'].includes(active.transaction.status) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={returning}
                    onClick={() => handleRequestReturn(active.transaction.id)}
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 font-bold"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
                    {returning ? 'Submitting...' : 'Request Return / Refund'}
                  </Button>
                )}
            </div>

            {/* 4-Step Return & Refund Journey Tracker */}
            {active.transaction.merchantRefundStatus && active.transaction.merchantRefundStatus !== 'NONE' && (
              <Card className="border-2 border-amber-300 bg-amber-50/40">
                <CardContent className="space-y-4 py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-5 w-5 text-amber-600" />
                      <h3 className="font-extrabold text-[#002970] text-sm">
                        Return &amp; Refund Protection Tracker
                      </h3>
                    </div>
                    <Badge
                      variant={
                        active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS'
                          ? 'green'
                          : active.transaction.recoveryStatus === 'RECOVERY_FAILED'
                          ? 'red'
                          : 'amber'
                      }
                    >
                      {active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS'
                        ? 'Reimbursement Completed ✓'
                        : active.transaction.recoveryStatus === 'RECOVERY_FAILED'
                        ? 'Flagged for Ops Review'
                        : 'Refund In Progress'}
                    </Badge>
                  </div>

                  {/* 4 Steps */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Step 1: Return Requested */}
                    <div className="rounded-xl border border-emerald-300 bg-white p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-emerald-700 font-bold text-xs">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span>1. Return Requested</span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Shopper submitted product cancellation/return.
                      </p>
                      <span className="inline-block text-[10px] font-mono font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                        CONFIRMED
                      </span>
                    </div>

                    {/* Step 2: Merchant Refund to Provider Card */}
                    <div
                      className={`rounded-xl border p-3 space-y-1 ${
                        active.transaction.merchantRefundStatus === 'MERCHANT_REFUND_CONFIRMED'
                          ? 'border-emerald-300 bg-white'
                          : 'border-amber-300 bg-amber-50/70'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {active.transaction.merchantRefundStatus === 'MERCHANT_REFUND_CONFIRMED' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Clock className="h-4 w-4 text-amber-600" />
                        )}
                        <span
                          className={
                            active.transaction.merchantRefundStatus === 'MERCHANT_REFUND_CONFIRMED'
                              ? 'text-emerald-700'
                              : 'text-amber-800'
                          }
                        >
                          2. Merchant Refund
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Merchant credits refund to provider card.
                      </p>
                      <span
                        className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                          active.transaction.merchantRefundStatus === 'MERCHANT_REFUND_CONFIRMED'
                            ? 'text-emerald-800 bg-emerald-50'
                            : 'text-amber-800 bg-amber-100'
                        }`}
                      >
                        {active.transaction.merchantRefundStatus}
                      </span>
                    </div>

                    {/* Step 3: Provider Mandate Recovery */}
                    <div
                      className={`rounded-xl border p-3 space-y-1 ${
                        active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS'
                          ? 'border-emerald-300 bg-white'
                          : active.transaction.recoveryStatus === 'RECOVERY_FAILED'
                          ? 'border-rose-300 bg-rose-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : active.transaction.recoveryStatus === 'RECOVERY_FAILED' ? (
                          <AlertCircle className="h-4 w-4 text-rose-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-400" />
                        )}
                        <span
                          className={
                            active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS'
                              ? 'text-emerald-700'
                              : active.transaction.recoveryStatus === 'RECOVERY_FAILED'
                              ? 'text-rose-700'
                              : 'text-slate-600'
                          }
                        >
                          3. Mandate Recovery
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        PerkLink recovers refund via provider mandate.
                      </p>
                      <span
                        className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                          active.transaction.recoveryStatus === 'PROVIDER_RECOVERY_SUCCESS'
                            ? 'text-emerald-800 bg-emerald-50'
                            : active.transaction.recoveryStatus === 'RECOVERY_FAILED'
                            ? 'text-rose-800 bg-rose-100'
                            : 'text-slate-600 bg-slate-100'
                        }`}
                      >
                        {active.transaction.recoveryStatus}
                      </span>
                    </div>

                    {/* Step 4: Shopper Reimbursement */}
                    <div
                      className={`rounded-xl border p-3 space-y-1 ${
                        active.transaction.shopperRefundStatus === 'SHOPPER_REFUND_SUCCESS'
                          ? 'border-emerald-300 bg-white'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 font-bold text-xs">
                        {active.transaction.shopperRefundStatus === 'SHOPPER_REFUND_SUCCESS' ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-400" />
                        )}
                        <span
                          className={
                            active.transaction.shopperRefundStatus === 'SHOPPER_REFUND_SUCCESS'
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }
                        >
                          4. Shopper Refund
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600">
                        Simulated refund credited to shopper account.
                      </p>
                      <span
                        className={`inline-block text-[10px] font-mono font-semibold px-2 py-0.5 rounded ${
                          active.transaction.shopperRefundStatus === 'SHOPPER_REFUND_SUCCESS'
                            ? 'text-emerald-800 bg-emerald-50'
                            : 'text-slate-600 bg-slate-100'
                        }`}
                      >
                        {active.transaction.shopperRefundStatus}
                      </span>
                    </div>
                  </div>

                  {active.transaction.recoveryStatus === 'RECOVERY_FAILED' && (
                    <div className="rounded-xl bg-rose-100/90 border border-rose-300 p-3 text-xs text-rose-900">
                      <p className="font-bold flex items-center gap-1.5 mb-0.5">
                        <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
                        Mandate Recovery Flagged for Operations Review
                      </p>
                      <p>
                        The automatic recovery attempt encountered an issue. PerkLink Operations team has been notified to intervene manually and ensure your reimbursement.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <TransactionDetailCard item={active} />

            {/* Separated Merchant Order & Payment Confirmation Details */}
            {active.merchantOrder && (
              <Card>
                <CardContent className="grid sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="font-bold text-[#002970] text-sm flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-[#00B86B]" />
                      Simulated Merchant Order Confirmation
                    </p>
                    <p>
                      <span className="text-slate-500">Merchant Order ID:</span>{' '}
                      <strong className="font-mono">{active.merchantOrder.merchantOrderId}</strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Payment Authoriser:</span>{' '}
                      <strong>{active.merchantOrder.payerDisplayLabel}</strong>
                    </p>
                    <p>
                      <span className="text-slate-500">Expected Delivery:</span>{' '}
                      <strong>{active.merchantOrder.expectedDeliveryDate}</strong>
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-[#002970] text-sm">
                      Private Delivery Recipient (Visible to Shopper &amp; Merchant Only)
                    </p>
                    <p>
                      <span className="text-slate-500">Recipient:</span>{' '}
                      <strong>{active.merchantOrder.recipientName}</strong> (
                      {active.merchantOrder.recipientPhone})
                    </p>
                    <p>
                      <span className="text-slate-500">Shipping Address:</span>{' '}
                      <strong>{active.merchantOrder.shippingAddress}</strong> —{' '}
                      {active.merchantOrder.pinCode}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function ShopperOrdersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading orders...</div>}>
      <OrdersContent />
    </Suspense>
  );
}

