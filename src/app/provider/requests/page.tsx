'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  Inbox,
  Lock,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import type { PurchaseRequest, RoleProjectedTransaction } from '@/lib/db/types';
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

export default function ProviderRequestsPage() {
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function loadRequests() {
    setLoading(true);
    try {
      const res = await fetch('/api/provider/requests');
      const data = await res.json();
      setRequests(data.incomingRequests || []);
      setTransactions(data.transactions || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetch('/api/provider/requests')
      .then((res) => res.json())
      .then((data) => {
        if (!active) return;
        setRequests(data.incomingRequests || []);
        setTransactions(data.transactions || []);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function respond(requestId: string, decision: 'ACCEPT' | 'DECLINE') {
    setBusyId(requestId);
    setMessage(null);
    try {
      const res = await fetch(`/api/provider/requests/${requestId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed');
      setMessage(
        decision === 'ACCEPT'
          ? `Request accepted! Transaction ${data.data.transaction.id} moved to MANDATE_PENDING. Next: Shopper approves the One-Time UPI Mandate.`
          : 'Request declined and returned to offer selection.'
      );
      await loadRequests();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AppShell requiredRole="PROVIDER_A">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="navy" className="mb-1.5">
              <Lock className="h-3 w-3" />
              Shopper PII Strictly Masked
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Incoming Purchase Requests
            </h1>
            <p className="text-sm text-slate-600">
              Review product, offer, estimated card charge, and agreed reward. Shopper address and phone number remain private.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadRequests}>
            Refresh Queue
          </Button>
        </div>

        {message && (
          <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-emerald-900 font-medium flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-[#00B86B] shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {loading ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-slate-500">
              Loading incoming requests...
            </CardContent>
          </Card>
        ) : requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              No incoming requests yet. Submit a purchase as Shopper to see requests appear here.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {requests.map((req) => {
              const txProj = transactions.find(
                (t) => t.transaction.id === req.transactionId
              );
              if (!txProj) return null;

              const isPending = req.status === 'PENDING';

              return (
                <Card
                  key={req.id}
                  className={isPending ? 'border-2 border-[#00BAF2]' : ''}
                >
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Inbox className="h-4 w-4 text-[#002970]" />
                      <span className="font-mono text-xs font-bold text-[#002970]">
                        {txProj.transaction.id}
                      </span>
                      <Badge
                        variant={
                          req.status === 'PENDING'
                            ? 'amber'
                            : req.status === 'ACCEPTED'
                            ? 'green'
                            : 'red'
                        }
                      >
                        Request {req.status}
                      </Badge>
                      <TransactionStatusBadge status={txProj.transaction.status} />
                    </div>
                    <span className="text-xs text-slate-500">
                      Received {formatDateTime(req.createdAt)}
                    </span>
                  </CardHeader>

                  <CardContent className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                    <div className="flex items-start gap-4">
                      <img
                        src={txProj.product.imageUrl}
                        alt={txProj.product.title}
                        className="w-20 h-16 rounded-xl border border-slate-200 object-contain bg-white shrink-0"
                      />
                      <div className="space-y-1">
                        <h3 className="font-bold text-slate-900">
                          {txProj.product.title}
                        </h3>
                        <p className="text-xs text-slate-600">
                          Merchant: <strong>{txProj.product.merchant}</strong> • Offer:{' '}
                          <strong>{txProj.offer?.offerTitle ?? 'Bank Offer'}</strong>
                        </p>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-[#00B86B]" />
                          Delivery Destination: {txProj.transaction.maskedDestination}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-5 tabular-nums">
                      <div>
                        <span className="text-[11px] text-slate-500 block">
                          Est. Card Charge
                        </span>
                        <strong className="text-lg text-[#002970]">
                          {formatInr(txProj.transaction.cardChargeAmount)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-[11px] text-slate-500 block">
                          Your Reward
                        </span>
                        <strong className="text-lg text-[#00B86B]">
                          +{formatInr(req.offeredReward)}
                        </strong>
                      </div>

                      {isPending ? (
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busyId === req.id}
                            onClick={() => respond(req.id, 'DECLINE')}
                          >
                            <XCircle className="h-4 w-4 text-rose-600" />
                            Decline
                          </Button>
                          <Button
                            variant="paytm"
                            size="md"
                            disabled={busyId === req.id}
                            onClick={() => respond(req.id, 'ACCEPT')}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {busyId === req.id ? 'Processing...' : 'Accept Request'}
                          </Button>
                        </div>
                      ) : txProj.transaction.cardPaymentStatus === 'SUCCESS' && txProj.transaction.providerMandateStatus !== 'AUTHORISED' ? (
                        <Link href={`/provider/payment?txId=${txProj.transaction.id}`}>
                          <Button variant="paytm" size="sm">
                            Complete Refund Mandate
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      ) : txProj.transaction.status === 'MANDATE_AUTHORISED' ? (
                        <Link href={`/provider/payment?txId=${txProj.transaction.id}`}>
                          <Button variant="primary" size="sm">
                            Proceed to Card Checkout
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      ) : null}
                    </div>
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

