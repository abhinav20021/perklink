'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bot,
  Package,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import type { RoleProjectedTransaction } from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  TransactionStatusBadge,
} from '@/components/ui/primitives';

export default function ShopperDashboardPage() {
  const [transactions, setTransactions] = useState<RoleProjectedTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/transactions')
      .then((r) => r.json())
      .then((d) => {
        if (d.transactions) setTransactions(d.transactions);
      })
      .finally(() => setLoading(false));
  }, []);

  const totalSavings = transactions
    .filter((t) => !['CANCELLED', 'PAYMENT_FAILED'].includes(t.transaction.status))
    .reduce((sum, t) => sum + t.transaction.shopperSavings, 0);

  const activeMandates = transactions.filter(
    (t) => t.transaction.status === 'MANDATE_PENDING'
  );

  function getNextAction(item: RoleProjectedTransaction) {
    const s = item.transaction.status;
    const id = item.transaction.id;
    if (s === 'PRODUCT_ANALYSED' || s === 'OFFER_SELECTED') {
      return { href: `/shopper/offers?txId=${id}`, label: 'View AI Offers & Match' };
    }
    if (s === 'MANDATE_PENDING' || s === 'MANDATE_EXPIRED' || s === 'MANDATE_REJECTED') {
      return { href: `/shopper/mandate?txId=${id}`, label: 'Approve UPI Mandate' };
    }
    return { href: `/shopper/orders?txId=${id}`, label: 'Track Order & Details' };
  }

  return (
    <AppShell requiredRole="SHOPPER_B">
      <div className="space-y-6">
        {/* Hero Action Banner */}
        <div className="rounded-3xl bg-gradient-to-r from-[#002970] via-[#003b99] to-[#0077b6] text-white p-6 sm:p-8 shadow-md">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-sky-100">
                <Bot className="h-3.5 w-3.5 text-[#00BAF2]" />
                Shopper Workspace (Rahul Sharma)
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                Find the best bank discount on any product link
              </h1>
              <p className="text-sm sm:text-base text-sky-100">
                PerkLink uses AI to understand bank offers, discover the best savings opportunity, and match shoppers with eligible card providers.
              </p>
            </div>
            <div className="shrink-0">
              <Link href="/shopper/new-purchase">
                <Button size="lg" variant="paytm" className="w-full sm:w-auto shadow-lg">
                  <Sparkles className="h-5 w-5" />
                  Find the best bank discount
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-[#00B86B] flex items-center justify-center">
                <TrendingUp className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Total Unlocked Savings</p>
                <p className="text-2xl font-extrabold text-[#002970] tabular-nums">
                  {formatInr(totalSavings)}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-sky-50 text-[#00BAF2] flex items-center justify-center">
                <Package className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Active &amp; Past Orders</p>
                <p className="text-2xl font-extrabold text-[#002970] tabular-nums">
                  {transactions.length}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center">
                <Wallet className="h-6 w-6" />
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Pending UPI Mandates</p>
                <p className="text-2xl font-extrabold text-[#002970] tabular-nums">
                  {activeMandates.length}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Mandate Alert */}
        {activeMandates.length > 0 && (
          <Card className="border-amber-300 bg-amber-50/70">
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-6 w-6 text-amber-700" />
                <div>
                  <p className="font-bold text-amber-950 text-sm">
                    Provider Accepted! One-Time UPI Mandate Ready for Approval
                  </p>
                  <p className="text-xs text-amber-800">
                    Transaction {activeMandates[0].transaction.id} ({activeMandates[0].product.title}) awaits your simulated UPI mandate authorisation ({formatInr(activeMandates[0].transaction.mandateAmount)}).
                  </p>
                </div>
              </div>
              <Link href={`/shopper/mandate?txId=${activeMandates[0].transaction.id}`}>
                <Button variant="primary" size="sm">
                  Approve UPI Mandate
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}

        {/* Transactions Table / List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-[#002970]">
              Your Shared PerkLink Purchases
            </h2>
            <Link href="/shopper/new-purchase">
              <Button variant="outline" size="sm">
                <Tag className="h-3.5 w-3.5" />
                New Product Analysis
              </Button>
            </Link>
          </div>

          {loading ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-slate-500">
                Loading your transactions...
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3">
              {transactions.map((item) => {
                const action = getNextAction(item);
                return (
                  <Card key={item.transaction.id} className="hover:border-sky-300 transition">
                    <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <img
                          src={item.product.imageUrl}
                          alt={item.product.title}
                          className="w-16 h-14 rounded-xl border border-slate-200 object-cover bg-white shrink-0"
                        />
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-bold text-[#002970]">
                              {item.transaction.id}
                            </span>
                            <TransactionStatusBadge status={item.transaction.status} />
                            {item.offer && (
                              <Badge variant="navy">{item.offer.bankName} Offer</Badge>
                            )}
                          </div>
                          <h3 className="font-bold text-slate-900 text-sm sm:text-base">
                            {item.product.title}
                          </h3>
                          <p className="text-xs text-slate-500">
                            {item.product.merchant} • Listed {formatInr(item.transaction.listedPrice)}
                            {item.transaction.shopperSavings > 0 && (
                              <span className="text-[#00B86B] font-semibold">
                                {' '}
                                • You save {formatInr(item.transaction.shopperSavings)}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-4">
                        <div className="text-left md:text-right tabular-nums">
                          <p className="text-[11px] text-slate-500">Mandate Payable</p>
                          <p className="font-extrabold text-[#002970]">
                            {formatInr(item.transaction.mandateAmount)}
                          </p>
                        </div>
                        <Link href={action.href}>
                          <Button variant="primary" size="sm">
                            {action.label}
                            <ArrowRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

