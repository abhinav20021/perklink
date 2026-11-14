'use client';

import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  ShieldCheck,
  Truck,
  Wallet,
} from 'lucide-react';
import type { DeliveryStatus, RoleProjectedTransaction } from '@/lib/db/types';
import { formatDateTime, formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { TransactionDetailCard } from '@/components/shared/TransactionTimeline';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/primitives';

const PROGRESSION_ORDER: DeliveryStatus[] = [
  'ORDER_PLACED',
  'CONFIRMED',
  'SHIPPED',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'RETURN_WINDOW_ACTIVE',
  'RETURN_WINDOW_COMPLETED',
];

export default function AdminTransactionsPage() {
  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const [settlementBanner, setSettlementBanner] = useState<{
    payout: number;
    fee: number;
    ref: string;
    settledAt: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadAll(preserveSelection = true) {
    const res = await fetch('/api/transactions');
    const data = await res.json();
    const list: RoleProjectedTransaction[] = data.transactions || [];
    setTransactions(list);
    if (!preserveSelection || !selectedId) {
      const interesting =
        list.find((t) =>
          [
            'ORDER_CREATED',
            'INVOICE_VERIFIED',
            'SHIPPED',
            'DELIVERED',
            'RETURN_WINDOW_ACTIVE',
            'SETTLEMENT_ELIGIBLE',
          ].includes(t.transaction.status)
        ) ?? list[0];
      if (interesting) setSelectedId(interesting.transaction.id);
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
        const interesting =
          list.find((t) =>
            [
              'ORDER_CREATED',
              'INVOICE_VERIFIED',
              'SHIPPED',
              'DELIVERED',
              'RETURN_WINDOW_ACTIVE',
              'SETTLEMENT_ELIGIBLE',
            ].includes(t.transaction.status)
          ) ?? list[0];
        if (interesting) setSelectedId(interesting.transaction.id);
      });
    return () => {
      active = false;
    };
  }, []);

  const active =
    transactions.find((t) => t.transaction.id === selectedId) ?? transactions[0];

  function getNextDeliveryStep(item: RoleProjectedTransaction): DeliveryStatus | null {
    if (!item.merchantOrder) return null;
    const latest = item.deliveryEvents[item.deliveryEvents.length - 1]?.status;
    if (!latest) return 'SHIPPED';
    const idx = PROGRESSION_ORDER.indexOf(latest);
    if (idx === -1 || idx >= PROGRESSION_ORDER.length - 1) return null;
    return PROGRESSION_ORDER[idx + 1];
  }

  async function advanceDelivery(nextStatus: DeliveryStatus) {
    if (!active) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/transactions/${active.transaction.id}/delivery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nextStatus }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not update delivery');
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delivery update failed');
    } finally {
      setBusy(false);
    }
  }

  async function simulateSettlement() {
    if (!active) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/transactions/${active.transaction.id}/settle`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Settlement blocked by state machine');
      const s = data.data.settlementRecord;
      setSettlementBanner({
        payout: s.providerTotalPayout,
        fee: s.platformFee,
        ref: s.partnerRef,
        settledAt: s.settledAt,
      });
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Settlement failed');
    } finally {
      setBusy(false);
    }
  }

  async function triggerRefund() {
    if (!active) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/transactions/${active.transaction.id}/refund`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reason: 'Admin simulated refund / mandate release after failure or dispute.',
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Refund failed');
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refund failed');
    } finally {
      setBusy(false);
    }
  }

  async function simulateMerchantRefund(amount?: number, simulateFailure = false) {
    if (!active) return;
    setError(null);
    setBusy(true);
    try {
      const refundAmount = amount ?? active.transaction.cardChargeAmount;
      const res = await fetch('/api/integrations/merchant-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: active.transaction.id,
          merchantRefundId: `mref-sim-${Date.now()}`,
          refundAmount,
          originalCardTxId:
            active.transaction.paymentSimulation?.paymentGatewayTxId || 'sim-card-tx',
          reason: 'Merchant issued return refund directly to provider card.',
          simulateFailure,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Merchant refund simulation failed');
      await loadAll(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merchant refund simulation failed');
    } finally {
      setBusy(false);
    }
  }

  const nextDelivery = active ? getNextDeliveryStep(active) : null;
  const isMandateAuthorised = active?.transaction.providerMandateStatus === 'AUTHORISED';
  const hasPendingRefund =
    active?.transaction.merchantRefundStatus &&
    active?.transaction.merchantRefundStatus !== 'NONE';
  const canSettle =
    active?.transaction.status === 'SETTLEMENT_ELIGIBLE' &&
    isMandateAuthorised &&
    !hasPendingRefund;
  const canRefund = active
    ? ['PAYMENT_FAILED', 'VERIFICATION_FAILED', 'DISPUTED'].includes(
        active.transaction.status
      )
    : false;

  return (
    <AppShell requiredRole="ADMIN_OPS">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="amber" className="mb-1.5">
              <ShieldCheck className="h-3 w-3" />
              SIMULATION MODE — DELIVERY &amp; SETTLEMENT ORCHESTRATION
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Transaction Lifecycle &amp; Settlement Console
            </h1>
          </div>

          {transactions.length > 0 && (
            <select
              value={active?.transaction.id || ''}
              onChange={(e) => {
                setSelectedId(e.target.value);
                setSettlementBanner(null);
                setError(null);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-[#002970]"
            >
              {transactions.map((t) => (
                <option key={t.transaction.id} value={t.transaction.id}>
                  {t.transaction.id} — {t.transaction.status} ({t.product.title.slice(0, 24)})
                </option>
              ))}
            </select>
          )}
        </div>

        {error && (
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
            {error}
          </div>
        )}

        {settlementBanner && (
          <Card className="border-2 border-emerald-400 bg-emerald-50">
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-8 w-8 text-[#00B86B] shrink-0" />
                <div>
                  <h2 className="text-lg font-extrabold text-emerald-950">
                    Settlement Completed Successfully
                  </h2>
                  <p className="text-sm text-emerald-900 tabular-nums">
                    Provider payout: <strong>{formatInr(settlementBanner.payout)}</strong> • Paytm platform fee:{' '}
                    <strong>{formatInr(settlementBanner.fee)}</strong>
                  </p>
                  <p className="text-xs text-emerald-800 font-mono mt-0.5">
                    Ref: {settlementBanner.ref} • Timestamp: {formatDateTime(settlementBanner.settledAt)}
                  </p>
                </div>
              </div>
              <Badge variant="green">Simulated Escrow Partner • No Real Funds Moved</Badge>
            </CardContent>
          </Card>
        )}

        {active && (
          <>
            {/* Interactive Operations Controls */}
            <Card className="border-2 border-[#002970]/20">
              <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-bold text-sm text-[#002970]">
                  Interactive Admin Controls for {active.transaction.id}
                </span>
                <span className="text-xs text-slate-500">
                  Server FSM enforces preconditions before unlocking settlement
                </span>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  {nextDelivery && !['PAYMENT_FAILED', 'CANCELLED', 'REFUNDED'].includes(active.transaction.status) && (
                    <Button
                      variant="primary"
                      size="md"
                      disabled={busy}
                      onClick={() => advanceDelivery(nextDelivery)}
                    >
                      <Truck className="h-4 w-4 text-[#00BAF2]" />
                      Advance Delivery → {nextDelivery.replace(/_/g, ' ')}
                    </Button>
                  )}

                  {canRefund && (
                    <Button
                      variant="outline"
                      size="md"
                      disabled={busy}
                      onClick={triggerRefund}
                    >
                      <RotateCcw className="h-4 w-4 text-rose-600" />
                      Simulate Refund / Release Mandate
                    </Button>
                  )}
                </div>

                <Button
                  variant="success"
                  size="lg"
                  disabled={!canSettle || busy}
                  onClick={simulateSettlement}
                >
                  <Wallet className="h-4 w-4" />
                  {active.transaction.status === 'SETTLEMENT_COMPLETED'
                    ? 'Settlement Completed'
                    : canSettle
                    ? 'Simulate Settlement'
                    : !isMandateAuthorised
                    ? 'Settlement Locked (Mandate Pending/Missing)'
                    : hasPendingRefund
                    ? 'Settlement Blocked (Return In Progress)'
                    : 'Settlement Locked (Complete Delivery & Return Window)'}
                </Button>
              </CardContent>

              {/* Merchant Refund & Mandate Recovery Simulation Panel */}
              <div className="border-t border-slate-200 bg-slate-50/80 px-6 py-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <p className="font-bold text-[#002970] flex items-center gap-1.5">
                    <RotateCcw className="h-4 w-4 text-amber-600" />
                    Simulate Merchant Card Refund &amp; Mandate Recovery (Scenarios C, D, E)
                  </p>
                  <p className="text-slate-500 text-[11px]">
                    Tests recovery against Class A&apos;s refund protection mandate and subsequent Class B reimbursement.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !['ORDER_CREATED', 'INVOICE_VERIFIED', 'SHIPPED', 'DELIVERED', 'RETURN_WINDOW_ACTIVE', 'SETTLEMENT_ELIGIBLE', 'SETTLEMENT_COMPLETED'].includes(active.transaction.status)}
                    onClick={() => simulateMerchantRefund()}
                    className="border-emerald-300 text-emerald-800 hover:bg-emerald-50"
                  >
                    Simulate Full Refund ({formatInr(active.transaction.cardChargeAmount)})
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || !['ORDER_CREATED', 'INVOICE_VERIFIED', 'SHIPPED', 'DELIVERED', 'RETURN_WINDOW_ACTIVE', 'SETTLEMENT_ELIGIBLE', 'SETTLEMENT_COMPLETED'].includes(active.transaction.status)}
                    onClick={() => simulateMerchantRefund(5000)}
                    className="border-amber-300 text-amber-800 hover:bg-amber-50"
                  >
                    Simulate Partial Refund (₹5,000)
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => simulateMerchantRefund(active.transaction.cardChargeAmount, true)}
                    className="border-rose-300 text-rose-800 hover:bg-rose-50"
                  >
                    Simulate Recovery Failure (Scenario E)
                  </Button>
                </div>
              </div>
            </Card>

            <TransactionDetailCard item={active} />

            {/* Immutable Audit Log */}
            <Card>
              <CardHeader>
                <h3 className="font-bold text-sm text-[#002970]">
                  Immutable Audit Log ({active.auditLogs.length} events)
                </h3>
              </CardHeader>
              <CardContent className="space-y-2 max-h-72 overflow-y-auto">
                {active.auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                  >
                    <div>
                      <span className="font-bold text-[#002970]">{log.action}</span>{' '}
                      <span className="text-slate-500">
                        by {log.actorRole}
                        {log.fromState && log.toState
                          ? ` (${log.fromState} → ${log.toState})`
                          : ''}
                      </span>
                    </div>
                    <span className="text-slate-400">{formatDateTime(log.createdAt)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

