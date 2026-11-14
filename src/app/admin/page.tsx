'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  FileSearch,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type { PlatformConfig, RoleProjectedTransaction } from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  TransactionStatusBadge,
} from '@/components/ui/primitives';

export default function AdminDashboardPage() {
  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [rewardInput, setRewardInput] = useState('250');
  const [feeInput, setFeeInput] = useState('49');
  const [savingConfig, setSavingConfig] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  async function loadAll() {
    const [txRes, cfgRes] = await Promise.all([
      fetch('/api/transactions').then((r) => r.json()),
      fetch('/api/config').then((r) => r.json()),
    ]);
    setTransactions(txRes.transactions || []);
    if (cfgRes.config) {
      setConfig(cfgRes.config);
      setRewardInput(String(cfgRes.config.defaultProviderRewardInr));
      setFeeInput(String(cfgRes.config.defaultPlatformFeeInr));
    }
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      fetch('/api/transactions').then((r) => r.json()),
      fetch('/api/config').then((r) => r.json()),
    ]).then(([txRes, cfgRes]) => {
      if (!active) return;
      setTransactions(txRes.transactions || []);
      if (cfgRes.config) {
        setConfig(cfgRes.config);
        setRewardInput(String(cfgRes.config.defaultProviderRewardInr));
        setFeeInput(String(cfgRes.config.defaultPlatformFeeInr));
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSavingConfig(true);
    setSavedNote(null);
    try {
      const res = await fetch('/api/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultProviderRewardInr: Number(rewardInput),
          defaultPlatformFeeInr: Number(feeInput),
        }),
      });
      if (res.ok) {
        setSavedNote('Configurable economics updated for future transactions.');
        loadAll();
      }
    } finally {
      setSavingConfig(false);
    }
  }

  const flaggedCount = transactions.filter((t) => t.transaction.flaggedForMismatch).length;
  const settlementReadyCount = transactions.filter(
    (t) => t.transaction.status === 'SETTLEMENT_ELIGIBLE'
  ).length;
  const settledRevenue = transactions
    .filter((t) => t.settlementRecord?.status === 'SETTLED')
    .reduce((sum, t) => sum + (t.settlementRecord?.platformFee ?? 0), 0);

  return (
    <AppShell requiredRole="ADMIN_OPS">
      <div className="space-y-6">
        <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-[#002970] to-[#0055b8] text-white p-6 sm:p-8 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2">
            <Badge variant="blue" className="bg-white/15 text-white border-white/20">
              <Activity className="h-3.5 w-3.5 text-[#00BAF2]" />
              Paytm Operations &amp; Risk Console (Admin)
            </Badge>
            <h1 className="text-2xl sm:text-3xl font-extrabold">
              PerkLink Orchestration &amp; Settlement Hub
            </h1>
            <p className="text-sm text-sky-100 max-w-2xl">
              Monitor shared transactions, review flagged fallback mismatches, progress simulated merchant deliveries, and execute gated escrow settlements.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/transactions">
              <Button variant="paytm" size="lg">
                Manage Lifecycle &amp; Settlement
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/admin/analytics">
              <Button
                variant="outline"
                size="lg"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
              >
                <BarChart3 className="h-4 w-4" />
                Pilot Analytics
              </Button>
            </Link>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">Total Shared Transactions</p>
              <p className="text-2xl font-extrabold text-[#002970] tabular-nums mt-1">
                {transactions.length}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">Flagged Mismatches / Review</p>
              <p className="text-2xl font-extrabold text-amber-600 tabular-nums mt-1">
                {flaggedCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">Ready for Settlement</p>
              <p className="text-2xl font-extrabold text-[#00B86B] tabular-nums mt-1">
                {settlementReadyCount}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <p className="text-xs font-medium text-slate-500">Simulated Platform Revenue</p>
              <p className="text-2xl font-extrabold text-[#002970] tabular-nums mt-1">
                {formatInr(settledRevenue)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid lg:grid-cols-12 gap-5">
          {/* Configurable Economics */}
          <Card className="lg:col-span-5">
            <CardHeader className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                <Settings className="h-4 w-4 text-[#00BAF2]" />
                Configurable Reward &amp; Fee Parameters
              </span>
              <Badge variant="default">Deterministic</Badge>
            </CardHeader>
            <CardContent>
              <form onSubmit={saveConfig} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">
                      Default Provider Reward (₹)
                    </label>
                    <Input
                      type="number"
                      value={rewardInput}
                      onChange={(e) => setRewardInput(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="font-semibold text-slate-600 block mb-1">
                      PerkLink Platform Fee (₹)
                    </label>
                    <Input
                      type="number"
                      value={feeInput}
                      onChange={(e) => setFeeInput(e.target.value)}
                    />
                  </div>
                </div>
                {savedNote && (
                  <p className="text-emerald-700 font-semibold">{savedNote}</p>
                )}
                <Button type="submit" size="sm" variant="primary" disabled={savingConfig}>
                  {savingConfig ? 'Saving...' : 'Update Platform Parameters'}
                </Button>
                {config && (
                  <p className="text-[11px] text-slate-400">
                    Active defaults: ₹{config.defaultProviderRewardInr} reward + ₹{config.defaultPlatformFeeInr} fee • {config.mandateExpiryMinutes}m mandate TTL
                  </p>
                )}
              </form>
            </CardContent>
          </Card>

          {/* Production Dependencies & Compliance Checklist */}
          <Card className="lg:col-span-7">
            <CardHeader className="flex items-center justify-between">
              <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4 text-[#00B86B]" />
                Production Dependencies &amp; Regulatory Guardrails
              </span>
              <Badge variant="amber">Hackathon Simulation</Badge>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-2 gap-3 text-xs text-slate-600">
              <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                <p className="font-bold text-slate-800">1. Paytm &amp; Issuer Approvals</p>
                <p>Requires commercial &amp; compliance sign-off from Paytm, issuing banks, and card networks before any live pilot.</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                <p className="font-bold text-slate-800">2. Merchant Identity Separation</p>
                <p>Proposed checkout API requires participating merchants to support distinct payer and delivery recipient identities.</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                <p className="font-bold text-slate-800">3. RBI PA/Escrow &amp; UPI AutoPay</p>
                <p>Live money movement must route solely through RBI-authorised PA/escrow accounts and NPCI-compliant UPI mandates.</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 space-y-1">
                <p className="font-bold text-slate-800">4. DPDP Consent &amp; Credential Safety</p>
                <p>Zero cross-user card token sharing, zero PAN/CVV/OTP/UPI PIN storage, and explicit consent ledger enforcement.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Queue */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <span className="font-bold text-base text-[#002970]">
              Shared Platform Transactions Queue
            </span>
            <div className="flex gap-2">
              <Link href="/admin/verification">
                <Button variant="outline" size="sm">
                  <FileSearch className="h-3.5 w-3.5" />
                  Mismatch Console ({flaggedCount})
                </Button>
              </Link>
              <Link href="/admin/transactions">
                <Button variant="primary" size="sm">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Delivery &amp; Settlement
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500">
                  <th className="py-2.5 pr-4">Tx ID</th>
                  <th className="py-2.5 pr-4">Product &amp; Merchant</th>
                  <th className="py-2.5 pr-4">Offer / Provider</th>
                  <th className="py-2.5 pr-4">Mandate / Charge</th>
                  <th className="py-2.5 pr-4">State</th>
                  <th className="py-2.5">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {transactions.map((t) => (
                  <tr key={t.transaction.id} className="hover:bg-slate-50">
                    <td className="py-3 pr-4 font-mono font-bold text-[#002970]">
                      {t.transaction.id}
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold text-slate-900">{t.product.title}</p>
                      <p className="text-slate-500">{t.product.merchant}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-semibold">{t.offer?.bankName ?? '—'}</p>
                      <p className="text-slate-500">{t.providerProfile?.displayAlias ?? 'Unassigned'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <p className="font-bold text-[#002970]">
                        {formatInr(t.transaction.mandateAmount)}
                      </p>
                      <p className="text-slate-500">
                        Card {formatInr(t.transaction.cardChargeAmount)}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <TransactionStatusBadge status={t.transaction.status} />
                    </td>
                    <td className="py-3">
                      {t.transaction.flaggedForMismatch ? (
                        <Badge variant="amber">
                          <AlertTriangle className="h-3 w-3" />
                          Mismatch Review
                        </Badge>
                      ) : (
                        <span className="text-slate-400">Clean</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

