'use client';

import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BarChart3, ShieldCheck, TrendingUp } from 'lucide-react';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import { Badge, Card, CardContent, CardHeader } from '@/components/ui/primitives';

interface AnalyticsPayload {
  kpis: {
    totalTransactions: number;
    settledCount: number;
    totalGmv: number;
    totalShopperSavings: number;
    totalPlatformRevenue: number;
    matchAcceptanceRate: number;
    verificationPassRate: number;
    pilotHypotheses: {
      baselineDropOff: string;
      baselineDeferral: string;
      competitorLeakage: string;
    };
  };
  bankOfferBreakdown: Array<{ bank: string; transactions: number; savings: number }>;
  statusDistribution: Array<{ status: string; count: number }>;
}

const COLORS = ['#002970', '#00BAF2', '#00B86B', '#6366F1', '#F59E0B'];

export default function AdminAnalyticsPage() {
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  useEffect(() => {
    fetch('/api/admin/analytics')
      .then((r) => r.json())
      .then(setData);
  }, []);

  return (
    <AppShell requiredRole="ADMIN_OPS">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="blue" className="mb-1.5">
              <BarChart3 className="h-3 w-3" />
              Pilot KPI Scorecard (Live Simulation Ledger)
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              PerkLink Analytics &amp; Offer Performance
            </h1>
            <p className="text-sm text-slate-600">
              Aggregated directly from shared backend transaction, offer, provider match, and simulated settlement records.
            </p>
          </div>
          <Badge variant="amber">
            <ShieldCheck className="h-3 w-3" />
            Simulated Hackathon Metrics
          </Badge>
        </div>

        {!data ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              Loading analytics...
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
              <Card>
                <CardContent>
                  <p className="text-xs text-slate-500">Simulated GMV Orchestrated</p>
                  <p className="text-2xl font-extrabold text-[#002970] mt-1">
                    {formatInr(data.kpis.totalGmv)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Across {data.kpis.totalTransactions} transactions
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-slate-500">Total Shopper Net Savings</p>
                  <p className="text-2xl font-extrabold text-[#00B86B] mt-1">
                    {formatInr(data.kpis.totalShopperSavings)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Recovered card-offer value
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-slate-500">Provider Match Acceptance</p>
                  <p className="text-2xl font-extrabold text-[#002970] mt-1">
                    {data.kpis.matchAcceptanceRate}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Accepted / dispatched requests
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent>
                  <p className="text-xs text-slate-500">Simulated Platform Revenue</p>
                  <p className="text-2xl font-extrabold text-[#002970] mt-1">
                    {formatInr(data.kpis.totalPlatformRevenue)}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    From {data.kpis.settledCount} settled purchases
                  </p>
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-5">
              <Card>
                <CardHeader>
                  <h2 className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4 text-[#00BAF2]" />
                    Shopper Savings by Bank Offer (₹)
                  </h2>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.bankOfferBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="bank" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="savings" name="Savings (₹)" radius={[8, 8, 0, 0]}>
                        {data.bankOfferBreakdown.map((entry, idx) => (
                          <Cell
                            key={entry.bank}
                            fill={COLORS[idx % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <h2 className="font-bold text-sm text-[#002970]">
                    Transaction State Distribution
                  </h2>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data.statusDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={165}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip />
                      <Bar dataKey="count" name="Transactions" fill="#002970" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <h2 className="font-bold text-sm text-[#002970]">
                  Pilot Problem Hypotheses &amp; Measurement Scorecard
                </h2>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-3 gap-4 text-xs">
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="font-bold text-slate-900">Checkout Drop Hypothesis</p>
                  <p className="text-lg font-extrabold text-[#002970] mt-1">
                    {data.kpis.pilotHypotheses.baselineDropOff}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Shopper abandons purchase when missing the eligible bank card (unvalidated hypothesis to measure in controlled pilot).
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="font-bold text-slate-900">Deferral Rate Hypothesis</p>
                  <p className="text-lg font-extrabold text-[#002970] mt-1">
                    {data.kpis.pilotHypotheses.baselineDeferral}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Shopper postpones purchase searching for another cardholder.
                  </p>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
                  <p className="font-bold text-slate-900">Competitor Leakage Hypothesis</p>
                  <p className="text-lg font-extrabold text-[#002970] mt-1">
                    {data.kpis.pilotHypotheses.competitorLeakage}
                  </p>
                  <p className="text-slate-500 mt-1">
                    Shopper switches merchant due to bank partnership mismatch.
                  </p>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}

