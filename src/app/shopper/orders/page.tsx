'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, Info, Package } from 'lucide-react';
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

  function renderNextStepGuide(item: RoleProjectedTransaction) {
    const s = item.transaction.status;
    if (s === 'PROVIDER_MATCHING') {
      return 'Request sent! Switch to Class A: Provider in the top bar and accept this request in /provider/requests.';
    }
    if (s === 'MANDATE_PENDING') {
      return 'Provider accepted! Click "Approve UPI Mandate" to authorise the one-time simulated UPI mandate.';
    }
    if (s === 'MANDATE_AUTHORISED') {
      return 'UPI Mandate approved! Switch to Class A: Provider and open Card Checkout to complete simulated card payment.';
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
                      Private Delivery Recipient (Visible to Class B &amp; Merchant Only)
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

