'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Lock,
  ShieldCheck,
  Smartphone,
  XCircle,
} from 'lucide-react';
import type { RoleProjectedTransaction } from '@/lib/db/types';
import { formatDateTime, formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  TransactionStatusBadge,
} from '@/components/ui/primitives';

type MandateScreenStage = 'REVIEW' | 'UPI_HANDOFF' | 'DEMO_PIN' | 'SUCCESS';

function MandateContent() {
  const searchParams = useSearchParams();
  const txIdParam = searchParams.get('txId');

  const [allTxs, setAllTxs] = useState<RoleProjectedTransaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState(txIdParam || '');
  const [detail, setDetail] = useState<RoleProjectedTransaction | null>(null);
  const [stage, setStage] = useState<MandateScreenStage>('REVIEW');
  const [termsAccepted, setTermsAccepted] = useState(true);
  const [demoPin, setDemoPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/transactions')
      .then((res) => res.json())
      .then(async (data) => {
        if (!active) return;
        const list: RoleProjectedTransaction[] = data.transactions || [];
        setAllTxs(list);
        const pick =
          txIdParam ||
          list.find((t) =>
            ['MANDATE_PENDING', 'MANDATE_EXPIRED', 'MANDATE_REJECTED'].includes(
              t.transaction.status
            )
          )?.transaction.id ||
          list.find((t) => Boolean(t.upiMandate))?.transaction.id ||
          '';
        setSelectedTxId(pick);
        if (pick) {
          const dRes = await fetch(`/api/transactions/${pick}`);
          const dData = await dRes.json();
          if (!active || !dData.data) return;
          setDetail(dData.data);
          setStage(dData.data.upiMandate?.status === 'APPROVED' ? 'SUCCESS' : 'REVIEW');
        }
      });
    return () => {
      active = false;
    };
  }, [txIdParam]);

  async function selectTx(id: string) {
    setSelectedTxId(id);
    setError(null);
    const res = await fetch(`/api/transactions/${id}`);
    const d = await res.json();
    if (d.data) {
      setDetail(d.data);
      setStage(d.data.upiMandate?.status === 'APPROVED' ? 'SUCCESS' : 'REVIEW');
      setDemoPin('');
    }
  }

  async function executeMandateAction(
    action: 'APPROVE' | 'REJECT' | 'SIMULATE_EXPIRE' | 'RETRY'
  ) {
    if (!detail) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/transactions/${detail.transaction.id}/mandate/action`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            termsAccepted,
            simulatedPinConfirmed: action === 'APPROVE' ? demoPin.length === 4 : false,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mandate action failed');
      setDetail(data.data);
      if (action === 'APPROVE') {
        setStage('SUCCESS');
      } else {
        setStage('REVIEW');
        setDemoPin('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSubmitting(false);
    }
  }

  function handlePinDigit(digit: string) {
    if (demoPin.length < 4) {
      setDemoPin((p) => p + digit);
    }
  }

  const mandate = detail?.upiMandate;

  return (
    <AppShell requiredRole="SHOPPER_B">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="amber" className="mb-1.5">
              <ShieldCheck className="h-3 w-3" />
              SIMULATION MODE — ONE-TIME UPI MANDATE
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              One-Time UPI Mandate Authorisation
            </h1>
            <p className="text-sm text-slate-600">
              Mandate authorisation locks your escrow commitment without immediate execution. Funds are only simulated for settlement after order fulfilment.
            </p>
          </div>

          {allTxs.filter((t) => t.upiMandate).length > 0 && (
            <select
              value={selectedTxId}
              onChange={(e) => selectTx(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#002970]"
            >
              {allTxs
                .filter((t) => t.upiMandate)
                .map((t) => (
                  <option key={t.transaction.id} value={t.transaction.id}>
                    {t.transaction.id} — {t.upiMandate?.status} ({formatInr(t.transaction.mandateAmount)})
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

        {!detail || !mandate ? (
          <Card>
            <CardContent className="py-12 text-center space-y-3">
              <p className="text-sm text-slate-600">
                No active UPI Mandate is currently pending. First select an offer &amp; provider, and wait for Class A to accept the request.
              </p>
              <Link href="/shopper/orders">
                <Button variant="primary" size="sm">
                  View Your Transactions
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Stage 1: Mandate Review */}
            {stage === 'REVIEW' && (
              <Card className="overflow-hidden border-2 border-[#002970]/20">
                <CardHeader className="bg-gradient-to-r from-[#002970] to-[#0055b8] text-white flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-sky-200 font-semibold">
                      PAYTM UPI AUTOPAY / ONE-TIME MANDATE (SIMULATION)
                    </p>
                    <h2 className="text-lg font-extrabold">
                      {detail.product.title}
                    </h2>
                  </div>
                  <TransactionStatusBadge status={detail.transaction.status} />
                </CardHeader>

                <CardContent className="space-y-5">
                  <div className="rounded-2xl bg-sky-50 border border-sky-200 p-5 flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-700">
                        Exact One-Time Mandate Amount
                      </p>
                      <p className="text-3xl font-black text-[#002970] tabular-nums mt-0.5">
                        {formatInr(mandate.amount)}
                      </p>
                      <p className="text-xs text-slate-600 mt-1">
                        Authorisation only — NOT executed immediately upon approval.
                      </p>
                    </div>
                    <div className="text-right space-y-1">
                      <Badge variant="navy">Frequency: ONE TIME</Badge>
                      <p className="text-xs font-mono text-slate-600 block">
                        Ref: {mandate.mandateRef}
                      </p>
                    </div>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-sm">
                    <div className="rounded-xl border border-slate-200 p-3">
                      <span className="text-xs text-slate-400 block">Beneficiary Arrangement</span>
                      <strong className="text-slate-900">{mandate.beneficiaryArrangement}</strong>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <span className="text-xs text-slate-400 block">Mandate Purpose</span>
                      <strong className="text-slate-900">{mandate.purpose}</strong>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <span className="text-xs text-slate-400 block">Shopper VPA (Masked)</span>
                      <strong className="text-slate-900">{mandate.shopperVpaMasked}</strong>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3">
                      <span className="text-xs text-slate-400 block">Mandate Expiry</span>
                      <strong className="text-slate-900 flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-[#00BAF2]" />
                        {formatDateTime(mandate.expiresAt)}
                      </strong>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-xs text-slate-600 space-y-2">
                    <p className="font-bold text-slate-800">
                      Terms &amp; Cancellation Conditions (Simulation)
                    </p>
                    <p>
                      • This one-time mandate authorises up to {formatInr(mandate.amount)} solely for PerkLink transaction {detail.transaction.id}.
                    </p>
                    <p>
                      • Execution occurs only after the card provider pays the merchant, order delivery completes, and return checks pass. You may cancel before card payment or if the order fails.
                    </p>
                    <label className="flex items-center gap-2 pt-1 font-semibold text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300 text-[#002970]"
                      />
                      I accept the simulated one-time UPI mandate terms &amp; cancellation policy.
                    </label>
                  </div>

                  {/* State-dependent Action Controls */}
                  {mandate.status === 'PENDING' && (
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={submitting}
                          onClick={() => executeMandateAction('REJECT')}
                        >
                          <XCircle className="h-3.5 w-3.5 text-rose-600" />
                          Reject Mandate
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={submitting}
                          onClick={() => executeMandateAction('SIMULATE_EXPIRE')}
                        >
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                          Simulate Expiry
                        </Button>
                      </div>

                      <Button
                        size="lg"
                        variant="paytm"
                        disabled={!termsAccepted}
                        onClick={() => setStage('UPI_HANDOFF')}
                      >
                        Approve UPI Mandate
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}

                  {(mandate.status === 'REJECTED' || mandate.status === 'EXPIRED') && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-amber-900">
                        Mandate is currently <strong>{mandate.status}</strong>. You can re-initialise a fresh one-time mandate to continue.
                      </p>
                      <Button
                        variant="primary"
                        size="sm"
                        disabled={submitting}
                        onClick={() => executeMandateAction('RETRY')}
                      >
                        Re-Initiate Mandate
                      </Button>
                    </div>
                  )}

                  {mandate.status === 'EXECUTED' && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 font-semibold">
                      This mandate has already been executed as part of completed settlement on{' '}
                      {formatDateTime(mandate.executedAt)}.
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Stage 2: Simulated UPI App Handoff */}
            {stage === 'UPI_HANDOFF' && (
              <Card className="max-w-md mx-auto overflow-hidden border-2 border-[#00BAF2] shadow-lg">
                <div className="bg-[#002970] text-white p-5 text-center space-y-2">
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-[#00BAF2] text-[#002970] px-3 py-0.5 text-[11px] font-bold">
                    SIMULATION MODE — UPI APP HANDOFF
                  </div>
                  <Smartphone className="h-10 w-10 mx-auto text-[#00BAF2] mt-2" />
                  <h2 className="text-lg font-extrabold">Paytm UPI Mandate Request</h2>
                  <p className="text-xs text-sky-200">
                    Simulated handoff — no external UPI app or bank rail is invoked
                  </p>
                </div>
                <CardContent className="space-y-4">
                  <div className="text-center py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-500">Authorising One-Time Mandate</p>
                    <p className="text-3xl font-black text-[#002970] tabular-nums">
                      {formatInr(mandate.amount)}
                    </p>
                    <Badge variant="blue" className="mt-1">
                      Frequency: ONE TIME
                    </Badge>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Beneficiary</span>
                      <span className="font-bold text-slate-900">
                        {mandate.beneficiaryArrangement}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Purpose</span>
                      <span className="font-semibold text-slate-900 text-right max-w-[60%]">
                        {mandate.purpose}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Transaction Ref</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {mandate.mandateRef}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStage('REVIEW')}
                    >
                      Back
                    </Button>
                    <Button
                      variant="paytm"
                      className="flex-1"
                      onClick={() => setStage('DEMO_PIN')}
                    >
                      Continue to Security PIN
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stage 3: Simulated 4-Digit PIN Entry */}
            {stage === 'DEMO_PIN' && (
              <Card className="max-w-md mx-auto overflow-hidden border-2 border-[#002970] shadow-xl">
                <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold text-[#00BAF2]">
                      SECURITY PIN SIMULATION
                    </p>
                    <p className="text-sm font-bold">
                      Enter 4-Digit Security PIN
                    </p>
                  </div>
                  <span className="text-sm font-extrabold tabular-nums">
                    {formatInr(mandate.amount)}
                  </span>
                </div>

                <CardContent className="space-y-5">
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-[11px] text-amber-900 flex items-center gap-2">
                    <Lock className="h-4 w-4 shrink-0 text-amber-700" />
                    <span>
                      <strong>SIMULATION MODE:</strong> Never enter a real UPI PIN. Tap any 4 digits below or use Quick Fill.
                    </span>
                  </div>

                  {/* 4 Masked Digit Placeholders */}
                  <div className="flex items-center justify-center gap-4 py-2">
                    {[0, 1, 2, 3].map((idx) => {
                      const filled = idx < demoPin.length;
                      return (
                        <div
                          key={idx}
                          className={`h-12 w-12 rounded-xl border-2 flex items-center justify-center text-2xl font-black transition ${
                            filled
                              ? 'border-[#002970] bg-sky-50 text-[#002970]'
                              : 'border-slate-300 bg-white text-slate-300'
                          }`}
                        >
                          {filled ? '•' : '○'}
                        </div>
                      );
                    })}
                  </div>

                  {/* Numeric Keypad */}
                  <div className="grid grid-cols-3 gap-2">
                    {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'Clear', '0', 'Fill'].map(
                      (key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            if (key === 'Clear') setDemoPin('');
                            else if (key === 'Fill') setDemoPin('1234');
                            else handlePinDigit(key);
                          }}
                          className="h-11 rounded-xl border border-slate-200 bg-slate-50 hover:bg-sky-50 font-bold text-slate-800 text-sm cursor-pointer transition"
                        >
                          {key}
                        </button>
                      )
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setStage('UPI_HANDOFF')}
                    >
                      Back
                    </Button>
                    <Button
                      variant="success"
                      className="flex-1"
                      disabled={demoPin.length !== 4 || submitting}
                      onClick={() => executeMandateAction('APPROVE')}
                    >
                      {submitting ? 'Authorising...' : 'Confirm & Authorise'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Stage 4: Mandate Approved Confirmation Animation */}
            {stage === 'SUCCESS' && (
              <Card className="max-w-lg mx-auto border-2 border-emerald-300 overflow-hidden shadow-lg">
                <div className="bg-gradient-to-br from-emerald-600 to-[#00B86B] text-white p-8 text-center space-y-3">
                  <div className="relative inline-flex items-center justify-center">
                    <span className="absolute h-20 w-20 rounded-full bg-white/30 animate-pulse-ring" />
                    <div className="h-16 w-16 rounded-full bg-white text-[#00B86B] flex items-center justify-center shadow-md">
                      <CheckCircle2 className="h-10 w-10" />
                    </div>
                  </div>
                  <h2 className="text-2xl font-extrabold">
                    UPI Mandate Approved Successfully
                  </h2>
                  <p className="text-sm text-emerald-50">
                    Your one-time payment mandate has been authorised in the PerkLink simulation environment.
                  </p>
                </div>
                <CardContent className="space-y-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Transaction ID</span>
                      <span className="font-mono font-bold text-[#002970]">
                        {detail.transaction.id}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mandate Reference</span>
                      <span className="font-mono font-semibold">{mandate.mandateRef}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Authorised Amount (ONE TIME)</span>
                      <span className="font-extrabold text-[#002970]">
                        {formatInr(mandate.amount)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mandate Status</span>
                      <Badge variant="green">{mandate.status} (Execution Deferred)</Badge>
                    </div>
                  </div>

                  <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-xs text-[#002970]">
                    <strong>Next Step:</strong> Switch to <strong>Class A: Provider</strong> (top switcher) and open <strong>Card Checkout</strong> to complete the simulated card payment and merchant order creation.
                  </div>

                  <div className="flex justify-between gap-2">
                    <Link href={`/shopper/orders?txId=${detail.transaction.id}`} className="flex-1">
                      <Button variant="primary" className="w-full">
                        Track Order &amp; Next Steps
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function MandatePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading UPI Mandate...</div>}>
      <MandateContent />
    </Suspense>
  );
}

