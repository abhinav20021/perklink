'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  CheckCircle2,
  Cpu,
  FileSearch,
  Upload,
  XCircle,
} from 'lucide-react';
import type { RoleProjectedTransaction, VerificationResult } from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
} from '@/components/ui/primitives';

const AI_STEPS = [
  'Extracting invoice information (Invoice No, Date, Tax)...',
  'Validating merchant name and separated Order ID...',
  'Comparing net purchase amount against card charge...',
  'Checking product details against transaction record...',
  'Generating deterministic verification outcome...',
];

function UploadInvoiceContent() {
  const searchParams = useSearchParams();
  const txIdParam = searchParams.get('txId');

  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState(txIdParam || '');
  const [preset, setPreset] = useState<'verified_match' | 'amount_mismatch' | 'manual_review'>('verified_match');
  const [paymentEvidenceRef, setPaymentEvidenceRef] = useState('PG-SIM-77120481');
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/provider/requests')
      .then((r) => r.json())
      .then((d) => {
        const list: RoleProjectedTransaction[] = (d.transactions || []).filter(
          (t: RoleProjectedTransaction) =>
            [
              'ORDER_CREATED',
              'INVOICE_PENDING',
              'INVOICE_UNDER_REVIEW',
              'VERIFICATION_FAILED',
              'SHIPPED',
              'DISPUTED',
            ].includes(t.transaction.status)
        );
        setTransactions(list);
        const pick = txIdParam || list[0]?.transaction.id || '';
        setSelectedTxId(pick);
      });
  }, [txIdParam]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTxId) return;
    setError(null);
    setProcessing(true);
    setActiveStep(0);

    const timers = [1, 2, 3, 4].map((idx) =>
      setTimeout(() => setActiveStep(idx), idx * 320)
    );

    try {
      const formData = new FormData();
      formData.append('paymentEvidenceRef', paymentEvidenceRef);
      formData.append('demoPreset', preset);
      if (file) formData.append('file', file);

      const res = await fetch(`/api/transactions/${selectedTxId}/invoice`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Verification failed');
      setResult(data.verification);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      timers.forEach(clearTimeout);
      setProcessing(false);
    }
  }

  return (
    <AppShell requiredRole="PROVIDER_A">
      <div className="space-y-6 max-w-4xl mx-auto">
        <div>
          <Badge variant="blue" className="mb-1.5">
            <FileSearch className="h-3 w-3" />
            Optional Mismatch &amp; Manual Review Fallback
          </Badge>
          <h1 className="text-2xl font-extrabold text-[#002970]">
            Fallback Invoice &amp; Evidence Verification
          </h1>
          <p className="text-sm text-slate-600">
            In the normal PerkLink flow, simulated payment callback &amp; merchant order confirmation proceed automatically. Use this optional screen to test AI invoice verification for mismatches or manual review cases.
          </p>
        </div>

        <Card>
          <CardHeader>
            <h2 className="font-bold text-sm text-[#002970]">
              Upload Invoice (PDF / PNG / JPG) or Select Test Outcome
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Select Order / Transaction
                  </label>
                  <select
                    value={selectedTxId}
                    onChange={(e) => setSelectedTxId(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-900"
                  >
                    {transactions.length === 0 && (
                      <option value="">No eligible orders yet</option>
                    )}
                    {transactions.map((t) => (
                      <option key={t.transaction.id} value={t.transaction.id}>
                        {t.transaction.id} — {t.product.title.slice(0, 28)} ({t.transaction.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 block mb-1">
                    Payment Confirmation Evidence Ref
                  </label>
                  <Input
                    value={paymentEvidenceRef}
                    onChange={(e) => setPaymentEvidenceRef(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500 block">
                  Test Outcome Preset
                </label>
                <div className="grid sm:grid-cols-3 gap-3">
                  {[
                    {
                      id: 'verified_match' as const,
                      title: '1. Invoice Verified',
                      desc: 'Merchant, Order ID & ₹ amount match cleanly',
                    },
                    {
                      id: 'amount_mismatch' as const,
                      title: '2. Invoice Mismatch',
                      desc: 'Wrong Order ID & amount mismatch flagged',
                    },
                    {
                      id: 'manual_review' as const,
                      title: '3. Manual Review Required',
                      desc: 'Minor ₹490 delta routed to Admin Ops console',
                    },
                  ].map((opt) => (
                    <button
                      type="button"
                      key={opt.id}
                      onClick={() => setPreset(opt.id)}
                      className={`text-left rounded-xl border p-3 cursor-pointer transition ${
                        preset === opt.id
                          ? 'border-[#002970] bg-sky-50'
                          : 'border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <p className="font-bold text-xs text-[#002970]">{opt.title}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">
                  Optional Custom Invoice File (PDF, PNG, JPG)
                </label>
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-sky-50 file:px-3 file:py-2 file:font-semibold file:text-[#002970]"
                />
              </div>

              <div className="flex justify-end">
                <Button
                  type="submit"
                  variant="paytm"
                  size="lg"
                  disabled={processing || !selectedTxId}
                >
                  <Upload className="h-4 w-4" />
                  {processing ? 'Running AI Verification...' : 'Run AI Invoice Verification'}
                </Button>
              </div>
            </form>

            {error && (
              <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {processing && (
              <div className="mt-5 rounded-2xl bg-sky-50 border border-sky-200 p-4 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-[#002970]">
                  <Cpu className="h-4 w-4 animate-spin text-[#00BAF2]" />
                  AI Invoice Verification Pipeline
                </div>
                {AI_STEPS.map((s, idx) => (
                  <p
                    key={s}
                    className={`text-xs ${
                      idx <= activeStep ? 'text-[#002970] font-semibold' : 'text-slate-400'
                    }`}
                  >
                    {idx < activeStep ? '✓' : '•'} {s}
                  </p>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {result && (
          <Card
            className={`border-2 ${
              result.status === 'VERIFIED'
                ? 'border-emerald-300'
                : result.status === 'VERIFICATION_FAILED'
                ? 'border-rose-300'
                : 'border-amber-300'
            }`}
          >
            <CardHeader className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {result.status === 'VERIFIED' && (
                  <CheckCircle2 className="h-5 w-5 text-[#00B86B]" />
                )}
                {result.status === 'VERIFICATION_FAILED' && (
                  <XCircle className="h-5 w-5 text-rose-600" />
                )}
                {result.status === 'MANUAL_REVIEW_REQUIRED' && (
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                )}
                <span className="font-bold text-sm text-slate-900">
                  Verification Result: {result.status.replace(/_/g, ' ')}
                </span>
              </div>
              <Badge variant="default">{result.ocrProvider}</Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-xs">
              <div className="grid sm:grid-cols-3 gap-3 tabular-nums">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Invoice No</span>
                  <strong>{result.extractedInvoiceNumber}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Merchant</span>
                  <strong>{result.extractedMerchant}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Order ID</span>
                  <strong>{result.extractedOrderId}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Product</span>
                  <strong>{result.extractedProductName}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Extracted Amount</span>
                  <strong>{formatInr(result.extractedAmount)}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-slate-400 block">Tax / Purchase Date</span>
                  <strong>
                    {formatInr(result.extractedTax)} • {result.extractedPurchaseDate}
                  </strong>
                </div>
              </div>

              <p className="font-semibold text-slate-800">{result.reviewNotes}</p>

              {result.discrepancies.length > 0 && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 space-y-1 text-rose-900">
                  {result.discrepancies.map((d, i) => (
                    <p key={i}>
                      • <strong>{d.field}:</strong> {d.message}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}

export default function UploadInvoicePage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading invoice uploader...</div>}>
      <UploadInvoiceContent />
    </Suspense>
  );
}

