'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  CreditCard,
  Inbox,
  Lock,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import type {
  CardProductMetadata,
  ConsentRecord,
  ProviderProfile,
  PurchaseRequest,
  RoleProjectedTransaction,
} from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { TransactionDetailCard } from '@/components/shared/TransactionTimeline';
import { Badge, Button, Card, CardContent, CardHeader } from '@/components/ui/primitives';

export default function ProviderDashboardPage() {
  const [provider, setProvider] = useState<ProviderProfile | null>(null);
  const [cards, setCards] = useState<CardProductMetadata[]>([]);
  const [consent, setConsent] = useState<ConsentRecord | null>(null);
  const [totalEarned, setTotalEarned] = useState(0);
  const [requests, setRequests] = useState<PurchaseRequest[]>([]);
  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch('/api/provider/requests');
      const data = await res.json();
      if (data.provider) {
        setProvider(data.provider);
        setCards(data.cards || []);
        setConsent(data.consent || null);
        setTotalEarned(data.totalEarnedRewards || 0);
        setRequests(data.incomingRequests || []);
        setTransactions(data.transactions || []);
      }
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
        if (data.provider) {
          setProvider(data.provider);
          setCards(data.cards || []);
          setConsent(data.consent || null);
          setTotalEarned(data.totalEarnedRewards || 0);
          setRequests(data.incomingRequests || []);
          setTransactions(data.transactions || []);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  async function updateAvailability(status: 'ONLINE' | 'BUSY' | 'OFFLINE') {
    await fetch('/api/provider/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availabilityStatus: status }),
    });
    loadData();
  }

  async function toggleConsent() {
    if (!consent) return;
    await fetch('/api/provider/requests', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentGranted: !consent.granted }),
    });
    loadData();
  }

  const pendingReqCount = requests.filter((r) => r.status === 'PENDING').length;
  const readyForCheckoutCount = transactions.filter(
    (t) =>
      t.transaction.status === 'MANDATE_AUTHORISED' ||
      t.transaction.status === 'CARD_PAYMENT_PENDING'
  ).length;

  return (
    <AppShell requiredRole="PROVIDER_A">
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-[#002970] to-[#0074b7] text-white p-6 sm:p-8 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <Badge variant="blue" className="bg-white/15 text-white border-white/20">
              <CreditCard className="h-3.5 w-3.5 text-[#00BAF2]" />
              Perk Provider Dashboard
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold">
              {provider ? provider.displayAlias : 'Arjun Mehta — Card Provider'}
            </h1>
            <p className="text-sm text-sky-100 max-w-2xl">
              Accept masked purchase requests, pay via simulated secure hosted checkout using your opted-in card offer, and earn transparent rewards—without ever seeing shopper PII or sharing card numbers.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/provider/requests">
              <Button variant="paytm" size="lg">
                <Inbox className="h-4 w-4" />
                Incoming Requests ({pendingReqCount})
              </Button>
            </Link>
            <Link href="/provider/payment">
              <Button
                variant="outline"
                size="lg"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                Card Checkout ({readyForCheckoutCount})
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary Metrics */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-[#00B86B] flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Simulated Rewards Earned</p>
                <p className="text-2xl font-extrabold text-[#002970] tabular-nums">
                  {formatInr(totalEarned)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-sky-50 text-[#00BAF2] flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">Completed Fulfilments</p>
                <p className="text-2xl font-extrabold text-[#002970] tabular-nums">
                  {provider?.completedOrders ?? 0} orders ({provider?.rating ? `${provider.rating.toFixed(1)}★` : 'New'})
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs text-slate-500 font-medium">Availability Status</p>
                <p className="text-lg font-extrabold text-[#002970] mt-0.5">
                  {provider?.availabilityStatus ?? 'ONLINE'}
                </p>
              </div>
              <div className="flex gap-1">
                {(['ONLINE', 'BUSY', 'OFFLINE'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => updateAvailability(st)}
                    className={`px-2 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                      provider?.availabilityStatus === st
                        ? 'bg-[#002970] text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Registered Card Metadata & Consent */}
        <div className="grid md:grid-cols-2 gap-5">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#002970]">
                Registered Card Metadata (Simulated)
              </span>
              <Badge variant="navy">
                <Lock className="h-3 w-3" />
                No PAN / CVV / OTP Stored
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {cards.map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl bg-gradient-to-r from-[#002970] to-[#004494] text-white p-4 flex items-center justify-between"
                >
                  <div>
                    <p className="text-xs text-sky-200 font-semibold">
                      {c.bankName} • {c.cardNetwork} • {c.cardCategory}
                    </p>
                    <p className="font-bold text-base mt-0.5">{c.cardVariant}</p>
                    <p className="font-mono text-xs text-sky-100 mt-1">
                      •••• •••• •••• {c.maskedLast4} (Simulated Virtual Token)
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] text-sky-200 block">Reward Pref</span>
                    <strong className="text-lg tabular-nums">
                      {formatInr(c.rewardPreferenceInr)}
                    </strong>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#002970]">
                Consent &amp; Privacy Governance
              </span>
              <Badge variant={consent?.granted ? 'green' : 'red'}>
                <ShieldCheck className="h-3 w-3" />
                {consent?.granted ? 'Opted In' : 'Opted Out'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-slate-600">{consent?.scopeSummary}</p>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
                • Shopper full name, mobile number, and street address are masked on all Perk Provider API responses.<br />
                • Card checkout uses an isolated simulation screen without requesting real credentials.
              </div>
              <Button variant="outline" size="sm" onClick={toggleConsent}>
                {consent?.granted ? 'Pause Card Matching Consent' : 'Enable Card Matching Consent'}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Shared Transactions assigned to this Provider */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#002970]">
              Your Assigned Transactions (Masked Shopper View)
            </h2>
            <Link href="/provider/requests">
              <Button variant="outline" size="sm">
                Manage Requests
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Loading provider workspace...
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {transactions.map((item) => (
                <TransactionDetailCard key={item.transaction.id} item={item} hideShopperPII />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

