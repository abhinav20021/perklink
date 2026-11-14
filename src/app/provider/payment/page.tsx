'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { RoleProjectedTransaction } from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  TransactionStatusBadge,
} from '@/components/ui/primitives';

type CheckoutStep =
  | 'REVIEW'
  | 'ISSUER_3DS'
  | 'MANDATE_SETUP'
  | 'MANDATE_SIMULATION'
  | 'SUCCESS'
  | 'FAILED';

function ProviderPaymentContent() {
  const searchParams = useSearchParams();
  const txIdParam = searchParams.get('txId');

  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState(txIdParam || '');
  const [detail, setDetail] = useState<RoleProjectedTransaction | null>(null);
  const [step, setStep] = useState<CheckoutStep>('REVIEW');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function determineStep(proj: RoleProjectedTransaction): CheckoutStep {
    if (proj.transaction.status === 'CARD_PAYMENT_PENDING') {
      return 'ISSUER_3DS';
    } else if (proj.transaction.status === 'PAYMENT_FAILED') {
      return 'FAILED';
    } else if (
      [
        'CARD_PAYMENT_SUCCESS',
        'ORDER_CREATED',
        'SHIPPED',
        'DELIVERED',
        'RETURN_WINDOW_ACTIVE',
        'SETTLEMENT_ELIGIBLE',
        'SETTLEMENT_COMPLETED',
      ].includes(proj.transaction.status) ||
      proj.transaction.cardPaymentStatus === 'SUCCESS'
    ) {
      if (proj.providerMandate?.status === 'AUTHORISED') {
        return 'SUCCESS';
      }
      return 'MANDATE_SETUP';
    } else {
      return 'REVIEW';
    }
  }

  async function loadTx(id: string) {
    const res = await fetch(`/api/transactions/${id}`);
    const data = await res.json();
    if (data.data) {
      const proj: RoleProjectedTransaction = data.data;
      setDetail(proj);
      setStep(determineStep(proj));
    }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/provider/requests')
      .then((res) => res.json())
      .then(async (data) => {
        if (!active) return;
        const list: RoleProjectedTransaction[] = data.transactions || [];
        setTransactions(list);
        const pick =
          txIdParam ||
          list.find((t) =>
            [
              'MANDATE_AUTHORISED',
              'CARD_PAYMENT_PENDING',
              'CARD_PAYMENT_SUCCESS',
              'ORDER_CREATED',
              'PAYMENT_FAILED',
            ].includes(t.transaction.status)
          )?.transaction.id ||
          list[0]?.transaction.id ||
          '';
        setSelectedTxId(pick);
        if (pick) {
          const txRes = await fetch(`/api/transactions/${pick}`);
          const txData = await txRes.json();
          if (!active || !txData.data) return;
          const proj: RoleProjectedTransaction = txData.data;
          setDetail(proj);
          setStep(determineStep(proj));
        }
      });
    return () => {
      active = false;
    };
  }, [txIdParam]);

  async function initiateSecureCheckout() {
    if (!detail) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(
        `/api/transactions/${detail.transaction.id}/card-payment`,
        { method: 'POST' }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not start checkout');
      setDetail(data.data);
      setStep('ISSUER_3DS');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout initiation failed');
    } finally {
      setBusy(false);
    }
  }

  async function triggerPaymentCallback(outcome: 'SUCCESS' | 'FAILURE') {
    if (!detail?.transaction.paymentSimulation) return;
    setError(null);
    setBusy(true);
    try {
      const sim = detail.transaction.paymentSimulation;
      const res = await fetch('/api/integrations/payment-callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: detail.transaction.id,
          paymentOrderId: sim.paymentOrderId,
          paymentGatewayTxId: sim.paymentGatewayTxId,
          amount: detail.transaction.cardChargeAmount,
          outcome,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Callback verification failed');
      setDetail(data.data);
      if (outcome === 'SUCCESS') {
        // Successful payment automatically moves to mandatory Provider Refund Protection Mandate setup
        setStep('MANDATE_SETUP');
      } else {
        setStep('FAILED');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment confirmation failed');
    } finally {
      setBusy(false);
    }
  }

  async function handleMandateAction(action: 'APPROVE' | 'CANCEL' | 'RETRY') {
    if (!detail) return;
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/provider/mandate/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transactionId: detail.transaction.id,
          action,
          simulatedPinConfirmed: action === 'APPROVE',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Mandate action failed');
      setDetail(data.data);
      if (action === 'APPROVE') {
        setStep('SUCCESS');
      } else {
        setStep('MANDATE_SETUP');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Mandate action failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell requiredRole="PROVIDER_A">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="amber" className="mb-1.5">
              <ShieldCheck className="h-3 w-3" />
              SIMULATION MODE — HOSTED CARD CHECKOUT
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Class A Card Payment Simulation
            </h1>
            <p className="text-sm text-slate-600">
              Complete the simulated issuer checkout after Class B&apos;s UPI mandate is approved. No real card credentials, CVV, or OTP are collected.
            </p>
          </div>

          {transactions.length > 0 && (
            <select
              value={selectedTxId}
              onChange={(e) => {
                setSelectedTxId(e.target.value);
                loadTx(e.target.value);
              }}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#002970]"
            >
              {transactions.map((t) => (
                <option key={t.transaction.id} value={t.transaction.id}>
                  {t.transaction.id} — {t.transaction.status}
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

        {!detail ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              No provider transaction selected.
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Precondition Warning if Mandate not yet authorised */}
            {detail.transaction.status === 'MANDATE_PENDING' && (
              <Card className="border-amber-300 bg-amber-50">
                <CardContent className="flex items-center gap-3 text-sm text-amber-900">
                  <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                  <span>
                    Waiting for Class B Shopper to approve the One-Time UPI Mandate ({formatInr(detail.transaction.mandateAmount)}). Switch to <strong>Class B: Shopper</strong> → <strong>UPI Mandate</strong> first.
                  </span>
                </CardContent>
              </Card>
            )}

            {/* Step 1: Review Card Charge & Offer */}
            {step === 'REVIEW' && (
              <Card className="overflow-hidden border-2 border-[#002970]/20">
                <CardHeader className="bg-[#002970] text-white flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs text-sky-200">
                      HOSTED MERCHANT PAYMENT PARTNER (SIMULATION)
                    </p>
                    <h2 className="text-lg font-extrabold">{detail.product.title}</h2>
                  </div>
                  <TransactionStatusBadge status={detail.transaction.status} />
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-4 tabular-nums">
                    <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 space-y-1">
                      <span className="text-xs font-bold text-sky-700 uppercase">
                        Card Charge Amount
                      </span>
                      <p className="text-3xl font-black text-[#002970]">
                        {formatInr(detail.transaction.cardChargeAmount)}
                      </p>
                      <p className="text-xs text-slate-600">
                        Includes {detail.offer?.bankName} instant discount of -
                        {formatInr(detail.transaction.bankDiscount)}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 space-y-1">
                      <span className="text-xs font-bold text-emerald-700 uppercase">
                        Agreed Provider Reward
                      </span>
                      <p className="text-3xl font-black text-[#00B86B]">
                        +{formatInr(detail.transaction.providerReward)}
                      </p>
                      <p className="text-xs text-emerald-800">
                        Reimbursement + reward settled after delivery verification
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs space-y-1.5">
                    <p className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Lock className="h-3.5 w-3.5 text-[#002970]" />
                      Separated Identity &amp; Credential Protection
                    </p>
                    <p className="text-slate-600">
                      • Registered Card: <strong>{detail.cardMetadata?.cardVariant ?? 'SBI Cashback Credit Card'} •••• {detail.cardMetadata?.maskedLast4 ?? '4387'}</strong>
                    </p>
                    <p className="text-slate-600">
                      • Delivery Destination (Masked): <strong>{detail.transaction.maskedDestination}</strong>
                    </p>
                    <p className="text-slate-600">
                      • Class B UPI Mandate Status: <strong>{detail.upiMandate?.status ?? 'PENDING'}</strong>
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button
                      size="lg"
                      variant="paytm"
                      disabled={
                        busy || detail.transaction.status !== 'MANDATE_AUTHORISED'
                      }
                      onClick={initiateSecureCheckout}
                    >
                      <CreditCard className="h-4 w-4" />
                      {busy ? 'Opening Checkout...' : 'Proceed to Secure Payment'}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Simulated Issuer 3DS Authentication Screen */}
            {step === 'ISSUER_3DS' && (
              <Card className="max-w-lg mx-auto overflow-hidden border-2 border-[#00BAF2] shadow-xl">
                <div className="bg-gradient-to-r from-[#002970] to-[#0055b8] text-white p-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold bg-[#00BAF2] text-[#002970] px-2.5 py-0.5 rounded-full">
                      SIMULATION MODE — ISSUER 3DS AUTH
                    </span>
                    <Lock className="h-4 w-4 text-sky-200" />
                  </div>
                  <h2 className="text-lg font-extrabold pt-1">
                    {detail.offer?.bankName ?? 'Bank'} Card Issuer Authentication
                  </h2>
                  <p className="text-xs text-sky-100">
                    Order Ref: {detail.transaction.paymentSimulation?.paymentOrderId}
                  </p>
                </div>

                <CardContent className="space-y-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Merchant</span>
                      <strong className="text-slate-900">{detail.product.merchant}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Card Product</span>
                      <strong className="text-slate-900">
                        {detail.cardMetadata?.cardVariant ?? 'SBI Credit Card'} ••••{' '}
                        {detail.cardMetadata?.maskedLast4 ?? '4387'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Payable Amount</span>
                      <strong className="text-base text-[#002970]">
                        {formatInr(detail.transaction.cardChargeAmount)}
                      </strong>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900">
                    <strong>No Real Credentials Collected:</strong> PerkLink never requests real card numbers, CVV, PIN, or live OTPs. Click <strong>Confirm Payment</strong> to simulate verified issuer callback approval.
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => triggerPaymentCallback('FAILURE')}
                    >
                      Simulate Decline
                    </Button>
                    <Button
                      variant="success"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => triggerPaymentCallback('SUCCESS')}
                    >
                      {busy ? 'Validating Callback...' : 'Confirm Payment'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Mandatory Provider Refund Protection Mandate Setup */}
            {step === 'MANDATE_SETUP' && (
              <Card className="border-2 border-[#002970] overflow-hidden shadow-lg">
                <CardHeader className="bg-[#002970] text-white flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-bold bg-[#00BAF2] text-[#002970] px-2.5 py-0.5 rounded-full uppercase">
                      Mandatory Step 2 of 2
                    </span>
                    <h2 className="text-xl font-extrabold pt-1">
                      Provider Refund Protection Mandate
                    </h2>
                  </div>
                  <Badge variant="amber">
                    Settlement Status: {detail.transaction.settlementStatus ?? 'BLOCKED_MANDATE_PENDING'}
                  </Badge>
                </CardHeader>

                <CardContent className="space-y-5 pt-5">
                  {/* Explanation box verbatim as specified */}
                  <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-xs text-[#002970] leading-relaxed space-y-2">
                    <p className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                      <ShieldCheck className="h-4 w-4 text-[#00BAF2]" />
                      Why This Mandate Is Required
                    </p>
                    <p>
                      To protect shoppers against cancellations and product returns, PerkLink requires a refund protection mandate from card providers.
                    </p>
                    <p>
                      In case the merchant refunds the purchase amount directly to your credit card following a shopper cancellation or return, PerkLink may recover the corresponding refunded amount through your authorised mandate and process the shopper&apos;s refund.
                    </p>
                    <p className="font-semibold text-rose-800">
                      Your settlement will remain blocked until this mandate is successfully authorised.
                    </p>
                  </div>

                  {/* Mandatory Details Grid */}
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2.5 text-xs tabular-nums">
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Purchase Request ID</span>
                      <strong className="font-mono text-slate-800">
                        {detail.purchaseRequest?.id ?? detail.providerMandate?.purchaseRequestId ?? `req-${detail.transaction.id}`}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Transaction ID</span>
                      <strong className="font-mono text-[#002970]">{detail.transaction.id}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Product Name</span>
                      <strong className="text-slate-900">{detail.product.title}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Merchant Name</span>
                      <strong className="text-slate-900">{detail.product.merchant}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Original Card Transaction Amount</span>
                      <strong className="text-slate-900">
                        {formatInr(detail.transaction.cardChargeAmount)}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2 text-sm bg-sky-100/60 p-2 rounded-lg">
                      <span className="font-bold text-[#002970]">
                        Maximum Authorised Recovery Amount
                      </span>
                      <strong className="font-black text-[#002970] text-base">
                        {formatInr(detail.providerMandate?.maxAmount ?? detail.transaction.cardChargeAmount)}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Mandate Purpose</span>
                      <strong className="text-slate-800 text-right max-w-xs">
                        {detail.providerMandate?.purpose ?? 'PerkLink Return & Cancellation Protection for Merchant Card Refunds'}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200/80 pb-2">
                      <span className="text-slate-500">Mandate Status</span>
                      <Badge variant={detail.providerMandate?.status === 'AUTHORISED' ? 'green' : 'amber'}>
                        {detail.providerMandate?.status ?? 'PENDING'}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Applicable Validity / Return-Protection Period</span>
                      <strong className="text-slate-800">30 Days (Standard Merchant Return Window)</strong>
                    </div>
                  </div>

                  {/* Settlement Status disclosure banner */}
                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <strong>Settlement Status: BLOCKED_MANDATE_PENDING.</strong>
                      <p className="mt-0.5">
                        Your reimbursement and reward payout ({formatInr(detail.transaction.cardChargeAmount + detail.transaction.providerReward)}) remains on hold until you authorise this refund protection mandate.
                      </p>
                    </div>
                  </div>

                  {/* Mandatory action */}
                  <div className="flex justify-end pt-2">
                    <Button
                      size="lg"
                      variant="paytm"
                      disabled={busy}
                      onClick={() => setStep('MANDATE_SIMULATION')}
                    >
                      <ShieldCheck className="h-4 w-4 mr-1.5" />
                      Set Up Refund Protection Mandate
                      <ArrowRight className="h-4 w-4 ml-1.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 4: Realistic UPI Mandate Authorisation Simulation */}
            {step === 'MANDATE_SIMULATION' && (
              <Card className="max-w-lg mx-auto overflow-hidden border-2 border-[#00BAF2] shadow-xl">
                <div className="bg-gradient-to-r from-[#002970] to-[#0055b8] text-white p-5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold bg-[#00BAF2] text-[#002970] px-2.5 py-0.5 rounded-full">
                      UPI MANDATE SIMULATION
                    </span>
                    <Lock className="h-4 w-4 text-sky-200" />
                  </div>
                  <h2 className="text-lg font-extrabold pt-1">
                    Simulated UPI Autopay / Mandate Authorisation
                  </h2>
                  <p className="text-xs text-sky-100">
                    Ref: {detail.providerMandate?.mandateRef ?? `PLK-PROV-MAND-${detail.transaction.id}`}
                  </p>
                </div>

                <CardContent className="space-y-4 pt-4">
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-xs tabular-nums">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Beneficiary</span>
                      <strong className="text-slate-900">Paytm PerkLink Escrow Pool</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Provider Account</span>
                      <strong className="text-slate-900">
                        {detail.providerProfile?.displayAlias ?? 'Verified Card Provider'}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mandate Reference</span>
                      <strong className="font-mono text-[#002970]">
                        {detail.providerMandate?.mandateRef ?? `PLK-PROV-MAND-${detail.transaction.id}`}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Max Recovery Amount Limit</span>
                      <strong className="text-base text-[#002970]">
                        {formatInr(detail.providerMandate?.maxAmount ?? detail.transaction.cardChargeAmount)}
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Mandate Purpose</span>
                      <strong className="text-slate-700 text-right max-w-[240px]">
                        Return &amp; Cancellation Protection for Merchant Card Refunds
                      </strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">Validity Period</span>
                      <strong className="text-slate-800">30 Days</strong>
                    </div>
                  </div>

                  <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 font-semibold text-center">
                    DEMO ONLY — This is a simulated mandate authorisation. No real UPI PIN or bank credentials are required.
                  </div>

                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="outline"
                      className="flex-1 text-slate-700"
                      disabled={busy}
                      onClick={() => handleMandateAction('CANCEL')}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="paytm"
                      className="flex-1"
                      disabled={busy}
                      onClick={() => handleMandateAction('APPROVE')}
                    >
                      {busy ? 'Authorising...' : 'Approve Mandate'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 5: Payment & Mandate Successful + Settlement Hold & Merchant Order */}
            {step === 'SUCCESS' && (
              <div className="space-y-4">
                <Card className="border-2 border-emerald-300 overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-600 to-[#00B86B] text-white p-6 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <CheckCircle2 className="h-10 w-10 shrink-0" />
                      <div>
                        <h2 className="text-2xl font-extrabold">Payment &amp; Protection Mandate Complete</h2>
                        <p className="text-xs text-emerald-50">
                          Simulated gateway callback verified &amp; Provider Refund Protection Mandate successfully authorised.
                        </p>
                      </div>
                    </div>
                    <Badge variant="default" className="bg-white text-emerald-800 border-0">
                      Mandate Authorised ✓
                    </Badge>
                  </div>

                  <CardContent className="grid md:grid-cols-2 gap-4 text-xs pt-4">
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                      <p className="font-bold text-[#002970] text-sm">
                        Simulated Payment Receipt
                      </p>
                      <p>
                        <span className="text-slate-500">Gateway Tx ID:</span>{' '}
                        <strong className="font-mono">
                          {detail.transaction.paymentSimulation?.paymentGatewayTxId}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-500">Amount Charged:</span>{' '}
                        <strong className="tabular-nums">
                          {formatInr(detail.transaction.cardChargeAmount)}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-500">Your Agreed Reward:</span>{' '}
                        <strong className="text-[#00B86B] tabular-nums">
                          +{formatInr(detail.transaction.providerReward)}
                        </strong>
                      </p>
                    </div>

                    {/* Refund Protection Mandate Card */}
                    <div className="rounded-xl bg-sky-50 border border-sky-200 p-4 space-y-1.5">
                      <p className="font-bold text-[#002970] text-sm flex items-center justify-between">
                        <span>Refund Protection Mandate</span>
                        <Badge variant="green" className="text-[10px]">
                          {detail.providerMandate?.status ?? 'AUTHORISED'}
                        </Badge>
                      </p>
                      <p>
                        <span className="text-slate-500">Mandate Reference:</span>{' '}
                        <strong className="font-mono text-[#002970]">
                          {detail.providerMandate?.mandateRef ?? `PLK-PROV-MAND-${detail.transaction.id}`}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-500">Maximum Recovery Cap:</span>{' '}
                        <strong className="tabular-nums">
                          {formatInr(detail.providerMandate?.maxAmount ?? detail.transaction.cardChargeAmount)}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-500">Associated Purchase Request:</span>{' '}
                        <strong className="font-mono">
                          {detail.purchaseRequest?.id ?? detail.providerMandate?.purchaseRequestId}
                        </strong>
                      </p>
                      <p>
                        <span className="text-slate-500">Validity Period:</span>{' '}
                        <strong>30 Days (Return Protection Window)</strong>
                      </p>
                    </div>

                    {/* Mandatory Settlement Status Card */}
                    <div className="md:col-span-2 rounded-xl bg-blue-50/80 border border-blue-200 p-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold text-[#002970] text-sm flex items-center gap-1.5">
                          <Lock className="h-4 w-4 text-[#002970]" />
                          Settlement Status: {detail.transaction.settlementStatus ?? 'MANDATE_AUTHORISED_SETTLEMENT_HELD'}
                        </p>
                        <Badge variant="navy">Escrow Held</Badge>
                      </div>
                      <p className="text-slate-600 text-xs">
                        • Mandate authorised successfully. Payout of <strong>{formatInr(detail.transaction.cardChargeAmount + detail.transaction.providerReward)}</strong> (₹{detail.transaction.cardChargeAmount.toLocaleString('en-IN')} card charge reimbursement + ₹{detail.transaction.providerReward.toLocaleString('en-IN')} reward) remains held in Paytm PerkLink escrow until delivery confirmation and return window expiration.
                      </p>
                      <p className="text-slate-600 text-xs">
                        • In the event of a merchant return or cancellation, any refund credited to your card will be recovered via this mandate and returned to the shopper.
                      </p>
                    </div>

                    {/* Return & Recovery Details (if return requested) */}
                    {detail.transaction.merchantRefundStatus && detail.transaction.merchantRefundStatus !== 'NONE' && (
                      <div className="md:col-span-2 rounded-xl bg-amber-50 border border-amber-300 p-4 space-y-2 text-xs">
                        <p className="font-bold text-amber-900 text-sm flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-700" />
                          Shopper Return / Refund Protection Journey
                        </p>
                        <div className="grid sm:grid-cols-4 gap-2 text-center pt-1">
                          <div className="rounded-lg bg-white border border-amber-200 p-2">
                            <span className="text-[10px] text-slate-500 block">Return Status</span>
                            <strong className="text-[#002970]">{detail.transaction.merchantRefundStatus}</strong>
                          </div>
                          <div className="rounded-lg bg-white border border-amber-200 p-2">
                            <span className="text-[10px] text-slate-500 block">Merchant Refund</span>
                            <strong className="text-slate-900">
                              {detail.refundRecovery ? formatInr(detail.refundRecovery.confirmedMerchantRefundAmount) : 'Pending Confirmation'}
                            </strong>
                          </div>
                          <div className="rounded-lg bg-white border border-amber-200 p-2">
                            <span className="text-[10px] text-slate-500 block">Recovery Status</span>
                            <strong className="text-[#00B86B]">
                              {detail.transaction.recoveryStatus ?? 'NONE'}
                            </strong>
                          </div>
                          <div className="rounded-lg bg-white border border-amber-200 p-2">
                            <span className="text-[10px] text-slate-500 block">Shopper Refund</span>
                            <strong className="text-[#002970]">
                              {detail.transaction.shopperRefundStatus ?? 'NONE'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    )}

                    {detail.merchantOrder && (
                      <div className="md:col-span-2 rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5">
                        <p className="font-bold text-[#002970] text-sm">
                          Simulated Merchant Checkout Confirmation
                        </p>
                        <p>
                          <span className="text-slate-500">Merchant Order ID:</span>{' '}
                          <strong className="font-mono text-[#002970]">
                            {detail.merchantOrder.merchantOrderId}
                          </strong>
                        </p>
                        <p>
                          <span className="text-slate-500">Payment Authoriser:</span>{' '}
                          <strong>Class A ({detail.merchantOrder.payerDisplayLabel})</strong>
                        </p>
                        <p>
                          <span className="text-slate-500">Delivery Recipient:</span>{' '}
                          <strong>Class B ({detail.merchantOrder.maskedDestination})</strong>
                        </p>
                        <p>
                          <span className="text-slate-500">Expected Delivery Date:</span>{' '}
                          <strong>{detail.merchantOrder.expectedDeliveryDate}</strong>
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white border border-slate-200 p-4 text-xs text-slate-600">
                  <span>
                    <strong>Flow Complete for Class A!</strong> Mandatory Refund Protection Mandate is active. Payout remains held pending delivery and return-period completion. Next: Switch to <strong>Paytm Ops Admin</strong> to manage order delivery &amp; settlement.
                  </span>
                  <Link href={`/provider/upload-invoice?txId=${detail.transaction.id}`}>
                    <Button variant="outline" size="sm">
                      Optional Fallback Invoice Upload
                    </Button>
                  </Link>
                </div>
              </div>
            )}

            {/* Failure State with Retry */}
            {step === 'FAILED' && (
              <Card className="border-2 border-rose-300">
                <CardContent className="p-6 space-y-4">
                  <div className="flex items-center gap-3 text-rose-700">
                    <XCircle className="h-8 w-8" />
                    <div>
                      <h2 className="text-lg font-extrabold">Simulated Payment Failed</h2>
                      <p className="text-xs text-slate-600">
                        {detail.transaction.paymentSimulation?.failureReason}
                      </p>
                    </div>
                  </div>
                  <Button variant="primary" onClick={initiateSecureCheckout}>
                    Retry Simulated Card Checkout
                  </Button>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function ProviderPaymentPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading payment simulation...</div>}>
      <ProviderPaymentContent />
    </Suspense>
  );
}

