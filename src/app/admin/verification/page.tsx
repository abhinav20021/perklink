'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileSearch,
  ShieldAlert,
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

export default function AdminVerificationPage() {
  const [items, setItems] = useState<RoleProjectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);

  async function loadQueue() {
    setLoading(true);
    try {
      const res = await fetch('/api/transactions');
      const data = await res.json();
      const list: RoleProjectedTransaction[] = (data.transactions || []).filter(
        (t: RoleProjectedTransaction) =>
          t.verificationResults.length > 0 || t.transaction.flaggedForMismatch
      );
      setItems(list);
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
        const list: RoleProjectedTransaction[] = (data.transactions || []).filter(
          (t: RoleProjectedTransaction) =>
            t.verificationResults.length > 0 || t.transaction.flaggedForMismatch
        );
        setItems(list);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function decide(
    invoiceId: string,
    decision: 'APPROVE' | 'REJECT' | 'DISPUTE'
  ) {
    setBusyId(invoiceId);
    setBanner(null);
    try {
      const res = await fetch(`/api/admin/verification/${invoiceId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setBanner(
        `Admin decision (${decision}) recorded on ${data.data.transaction.id} -> ${data.data.transaction.status}.`
      );
      await loadQueue();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell requiredRole="ADMIN_OPS">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="amber" className="mb-1.5">
              <FileSearch className="h-3 w-3" />
              Fallback Mismatch &amp; OCR Verification Console
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Invoice &amp; Mismatch Review
            </h1>
            <p className="text-sm text-slate-600">
              Inspect AI/OCR extracted fields side-by-side against expected transaction records for any flagged mismatch or optional fallback invoice.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadQueue}>
            Refresh Queue
          </Button>
        </div>

        {banner && (
          <div className="rounded-xl bg-sky-50 border border-sky-200 p-3 text-sm font-semibold text-[#002970]">
            {banner}
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Loading verification queue...
            </CardContent>
          </Card>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              No flagged mismatches or pending invoices.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const ver = item.verificationResults[0];
              const canReview = ['INVOICE_UNDER_REVIEW', 'VERIFICATION_FAILED'].includes(
                item.transaction.status
              );

              return (
                <Card key={item.transaction.id} className="overflow-hidden">
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-[#002970]">
                        {item.transaction.id}
                      </span>
                      <TransactionStatusBadge status={item.transaction.status} />
                      {ver && (
                        <Badge
                          variant={
                            ver.status === 'VERIFIED'
                              ? 'green'
                              : ver.status === 'VERIFICATION_FAILED'
                              ? 'red'
                              : 'amber'
                          }
                        >
                          OCR: {ver.status.replace(/_/g, ' ')}
                        </Badge>
                      )}
                    </div>
                    <span className="text-xs text-slate-500">
                      {item.product.title} • {item.product.merchant}
                    </span>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {ver && (
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-1.5 tabular-nums">
                          <p className="font-bold text-[#002970]">
                            Expected Backend Transaction Record
                          </p>
                          <p>Merchant: <strong>{item.product.merchant}</strong></p>
                          <p>
                            Merchant Order ID:{' '}
                            <strong className="font-mono">
                              {item.merchantOrder?.merchantOrderId ?? '—'}
                            </strong>
                          </p>
                          <p>Product: <strong>{item.product.title}</strong></p>
                          <p>
                            Expected Card Charge:{' '}
                            <strong>{formatInr(item.transaction.cardChargeAmount)}</strong>
                          </p>
                        </div>

                        <div className="rounded-xl bg-sky-50/70 border border-sky-200 p-4 space-y-1.5 tabular-nums">
                          <p className="font-bold text-[#002970]">
                            AI/OCR Extracted Invoice Fields ({ver.ocrProvider})
                          </p>
                          <p>Invoice No: <strong>{ver.extractedInvoiceNumber}</strong></p>
                          <p>Merchant: <strong>{ver.extractedMerchant}</strong></p>
                          <p>
                            Order ID:{' '}
                            <strong className="font-mono">{ver.extractedOrderId}</strong>
                          </p>
                          <p>Product: <strong>{ver.extractedProductName}</strong></p>
                          <p>
                            Extracted Total: <strong>{formatInr(ver.extractedAmount)}</strong> (Tax{' '}
                            {formatInr(ver.extractedTax)})
                          </p>
                        </div>
                      </div>
                    )}

                    {ver?.discrepancies && ver.discrepancies.length > 0 && (
                      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 space-y-1 text-xs text-amber-950">
                        <p className="font-bold flex items-center gap-1.5">
                          <AlertTriangle className="h-4 w-4 text-amber-600" />
                          Detected Discrepancies
                        </p>
                        {ver.discrepancies.map((d, i) => (
                          <p key={i}>
                            • <strong>{d.field}:</strong> {d.message}
                          </p>
                        ))}
                      </div>
                    )}

                    {canReview && ver && (
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === ver.invoiceId}
                          onClick={() => decide(ver.invoiceId, 'DISPUTE')}
                        >
                          <ShieldAlert className="h-3.5 w-3.5 text-amber-600" />
                          Escalate Dispute
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={busyId === ver.invoiceId}
                          onClick={() => decide(ver.invoiceId, 'REJECT')}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Mark Verification Failed
                        </Button>
                        <Button
                          variant="success"
                          size="sm"
                          disabled={busyId === ver.invoiceId}
                          onClick={() => decide(ver.invoiceId, 'APPROVE')}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Approve Verification
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

