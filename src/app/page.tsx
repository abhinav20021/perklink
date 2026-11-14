'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  Lock,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  UserCheck,
  Wallet,
} from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@/components/ui/primitives';

const PARTICIPANT_CARDS = [
  {
    email: 'shopper@perklink.demo',
    displayEmail: 'shopper@perklink.in',
    role: 'Class B — Shopper',
    name: 'Rahul Sharma',
    desc: 'Paste product URLs, inspect AI offer analysis & savings comparisons, select a matched provider & approve simulated UPI mandate.',
    target: '/shopper',
    badge: 'Start Here as Buyer',
    accent: 'from-[#002970] to-[#0055b8]',
  },
  {
    email: 'provider@perklink.demo',
    displayEmail: 'provider@perklink.in',
    role: 'Class A — Card Provider',
    name: 'Arjun Mehta (SBI •••• 4387)',
    desc: 'View masked purchase requests (zero shopper PII), complete simulated 3DS card checkout & earn ₹250 transparent reward.',
    target: '/provider',
    badge: 'Cardholder Dashboard',
    accent: 'from-[#0073a8] to-[#00BAF2]',
  },
  {
    email: 'admin@perklink.demo',
    displayEmail: 'admin@perklink.in',
    role: 'Paytm Operations — Admin',
    name: 'PerkLink Ops Console',
    desc: 'Inspect shared transactions, review fallback invoice mismatches, progress delivery states, simulate settlement & view analytics.',
    target: '/admin',
    badge: 'Operations & Analytics',
    accent: 'from-slate-800 to-slate-700',
  },
];

export default function HomePage() {
  const router = useRouter();
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null);

  async function loginAs(email: string, target: string) {
    setLoadingEmail(email);
    try {
      await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      router.push(target);
      router.refresh();
    } finally {
      setLoadingEmail(null);
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F7FB]">
      {/* Top Simulation Banner */}
      <div className="bg-[#002970] text-white text-xs px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-semibold">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#00BAF2] px-2.5 py-0.5 text-[#002970] font-bold">
              <ShieldCheck className="h-3.5 w-3.5" />
              SIMULATION MODE — NO REAL MONEY MOVES
            </span>
            <span className="text-sky-100">
              Paytm Build for India AI Hackathon MVP
            </span>
          </div>
          <span className="text-sky-200 hidden sm:inline">
            No real UPI PINs, OTPs, CVVs, or bank APIs used
          </span>
        </div>
      </div>

      {/* Paytm-inspired Hero Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-[#002970] to-[#00BAF2] flex items-center justify-center text-white font-black">
              P
            </div>
            <div>
              <span className="font-extrabold text-[#002970] text-xl">Paytm</span>{' '}
              <span className="font-bold text-[#00BAF2] text-xl">PerkLink</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="paytm"
              size="sm"
              onClick={() => loginAs('shopper@perklink.demo', '/shopper/new-purchase')}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Find the best bank discount
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Paytm Home Quick Entry + Positioning Hero */}
        <section className="grid lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 rounded-3xl bg-gradient-to-br from-[#002970] via-[#003b99] to-[#0074b7] text-white p-7 sm:p-9 shadow-lg flex flex-col justify-between">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-xs font-semibold text-sky-100">
                <Bot className="h-3.5 w-3.5 text-[#00BAF2]" />
                Two Core AI Capabilities • Shared Simulation Ledger
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight tracking-tight">
                Unlock the best bank card offers without owning every card.
              </h1>
              <p className="text-sky-100 text-base sm:text-lg leading-relaxed max-w-2xl">
                <strong>PerkLink uses AI to understand bank offers, discover the best savings opportunity, and match shoppers with eligible card providers.</strong>
              </p>
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Button
                size="lg"
                variant="paytm"
                onClick={() => loginAs('shopper@perklink.demo', '/shopper/new-purchase')}
              >
                <Sparkles className="h-4 w-4" />
                Find the best bank discount
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="bg-white/10 border-white/30 text-white hover:bg-white/20"
                onClick={() => loginAs('shopper@perklink.demo', '/shopper')}
              >
                Open Shopper Dashboard
              </Button>
            </div>
          </div>

          {/* Illustrative Laptop Deal Card */}
          <Card className="lg:col-span-5 border-sky-200 overflow-hidden flex flex-col justify-between">
            <div className="bg-sky-50 px-5 py-3.5 border-b border-sky-100 flex items-center justify-between">
              <span className="text-xs font-bold text-[#002970] uppercase tracking-wider">
                Live Reference Economics
              </span>
              <Badge variant="green">₹1,701 Net Savings</Badge>
            </div>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <img
                  src="/images/laptop-asus.svg"
                  alt="ASUS Vivobook 16 Laptop"
                  className="w-24 h-18 rounded-xl border border-slate-200 object-cover bg-white"
                />
                <div>
                  <p className="text-xs font-semibold text-[#00BAF2]">Flipkart • Laptops</p>
                  <h2 className="font-bold text-slate-900 text-sm sm:text-base">
                    ASUS Vivobook 16 Laptop (16GB, 512GB)
                  </h2>
                  <p className="text-xs text-slate-500">SBI 10% Instant Discount Matched</p>
                </div>
              </div>

              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-2 text-sm tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-600">Listed Product Price</span>
                  <span className="font-semibold">₹48,999</span>
                </div>
                <div className="flex justify-between text-[#00B86B] font-semibold">
                  <span>SBI Credit Card Instant Discount</span>
                  <span>-₹2,000</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Class A Card Charge</span>
                  <span className="font-semibold">₹46,999</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Provider Reward + PerkLink Fee</span>
                  <span className="font-semibold">+₹250 + ₹49</span>
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-extrabold text-[#002970]">
                  <span>Shopper One-Time UPI Mandate</span>
                  <span>₹47,298</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-500 flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 text-[#002970] shrink-0" />
                Class A never sees Class B’s address/phone; no card numbers or real UPI PINs are ever shared.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* The Two Core AI Innovations */}
        <section className="grid md:grid-cols-2 gap-5">
          <Card className="border-t-4 border-t-[#00BAF2]">
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Badge variant="blue">AI Capability 1</Badge>
                <Sparkles className="h-5 w-5 text-[#00BAF2]" />
              </div>
              <h3 className="text-lg font-bold text-[#002970]">
                AI Product &amp; Offer Intelligence
              </h3>
              <p className="text-sm text-slate-600">
                Extracts structured product attributes from a pasted URL (with honest curated fallback when live pages block scraping) and converts natural-language bank offer terms into validated JSON conditions, clearly flagging uncertainties.
              </p>
            </CardContent>
          </Card>

          <Card className="border-t-4 border-t-[#00B86B]">
            <CardContent className="space-y-2.5">
              <div className="flex items-center justify-between">
                <Badge variant="green">AI Capability 2</Badge>
                <TrendingUp className="h-5 w-5 text-[#00B86B]" />
              </div>
              <h3 className="text-lg font-bold text-[#002970]">
                AI Savings Advisor &amp; Provider Matching
              </h3>
              <p className="text-sm text-slate-600">
                Pairs deterministic backend eligibility &amp; Rupee savings math with a transparent 100-point provider ranking score, then uses AI to explain why the winning offer and card provider are recommended—never fabricating prices or credentials.
              </p>
            </CardContent>
          </Card>
        </section>

        {/* Participant Role Switcher */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-xl font-extrabold text-[#002970]">
                Select Participant Role
              </h2>
              <p className="text-sm text-slate-600">
                Select any preconfigured persona below — all three dashboards share the exact same backend transaction state.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Tag className="h-3.5 w-3.5" />
              <span>6 Bank Offers • 4 Providers • 4 Products • 5 Seeded Flows</span>
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-5">
            {PARTICIPANT_CARDS.map((card) => (
              <Card key={card.email} className="overflow-hidden flex flex-col justify-between">
                <div>
                  <div className={`bg-gradient-to-r ${card.accent} text-white px-5 py-4`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
                        {card.badge}
                      </span>
                      <UserCheck className="h-4 w-4 opacity-80" />
                    </div>
                    <h3 className="font-bold text-lg">{card.role}</h3>
                    <p className="text-xs text-sky-100">{card.name}</p>
                  </div>
                  <CardContent className="space-y-3">
                    <p className="text-xs font-mono bg-slate-100 text-slate-700 px-2.5 py-1.5 rounded-lg">
                      {card.displayEmail}
                    </p>
                    <p className="text-sm text-slate-600 leading-relaxed">{card.desc}</p>
                  </CardContent>
                </div>
                <div className="px-5 pb-5">
                  <Button
                    className="w-full"
                    variant="primary"
                    disabled={loadingEmail !== null}
                    onClick={() => loginAs(card.email, card.target)}
                  >
                    {loadingEmail === card.email ? 'Entering...' : `Enter as ${card.role.split('—')[0].trim()}`}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </section>

        {/* Paytm Mini-App Quick Links */}
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-sky-100 text-[#002970] flex items-center justify-center">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-slate-900 text-sm">
                  Paytm PerkLink End-to-End Route Map
                </p>
                <p className="text-xs text-slate-500">
                  Direct shortcuts for live hackathon judging
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs">
              <Link href="/shopper/new-purchase" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                1. AI Product &amp; Offer Analysis
              </Link>
              <Link href="/shopper/offers" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                2. AI Savings &amp; Provider Match
              </Link>
              <Link href="/provider/requests" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                3. Provider Accept (Masked)
              </Link>
              <Link href="/shopper/mandate" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                4. Simulated UPI Mandate
              </Link>
              <Link href="/provider/payment" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                5. Simulated Card Checkout
              </Link>
              <Link href="/admin/transactions" className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-sky-50 font-semibold text-[#002970]">
                6. Admin Delivery &amp; Settlement
              </Link>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
