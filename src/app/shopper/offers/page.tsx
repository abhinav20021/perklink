'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Award,
  Bot,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
  UserPlus,
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
  Input,
} from '@/components/ui/primitives';

function OffersContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const txIdParam = searchParams.get('txId');

  const [allTxs, setAllTxs] = useState<RoleProjectedTransaction[]>([]);
  const [selectedTxId, setSelectedTxId] = useState<string>(txIdParam || '');
  const [detail, setDetail] = useState<RoleProjectedTransaction | null>(null);
  const [aiHeadline, setAiHeadline] = useState<string>('');
  const [aiAlternativeText, setAiAlternativeText] = useState<string>('');
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [selectedProviderKey, setSelectedProviderKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Private Shopper Delivery Form (never shared with Perk Provider)
  const [recipientName, setRecipientName] = useState('Rahul Sharma');
  const [mobileNumber, setMobileNumber] = useState('+91 98100 44321');
  const [shippingAddress, setShippingAddress] = useState(
    'Flat 402, Lake View Residency, Madhapur, Hyderabad'
  );
  const [pinCode, setPinCode] = useState('500081');
  const [city, setCity] = useState('Hyderabad');
  const [deliveryInstructions, setDeliveryInstructions] = useState(
    'Call on arrival; security gate passcode 4420'
  );

  async function selectOffer(txId: string, offerId: string) {
    setError(null);
    setSelectedOfferId(offerId);
    const res = await fetch(`/api/transactions/${txId}/select-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Could not select offer');
      return;
    }
    setDetail(data.data);
    if (data.aiRecommendation) {
      setAiHeadline(data.aiRecommendation.headline);
      setAiAlternativeText(data.aiRecommendation.alternativeComparison);
    }
    const top = data.data.providerMatches?.[0];
    if (top) {
      setSelectedProviderKey(`${top.providerId}::${top.cardMetadataId}`);
    } else {
      setSelectedProviderKey('');
    }
  }

  useEffect(() => {
    fetch('/api/transactions')
      .then((r) => r.json())
      .then((d) => {
        const list: RoleProjectedTransaction[] = d.transactions || [];
        setAllTxs(list);
        const pick =
          txIdParam ||
          list.find((t) =>
            ['PRODUCT_ANALYSED', 'OFFER_SELECTED'].includes(t.transaction.status)
          )?.transaction.id ||
          list[0]?.transaction.id ||
          '';
        setSelectedTxId(pick);
        if (!pick) setLoading(false);
      });
  }, [txIdParam]);

  useEffect(() => {
    if (!selectedTxId) {
      return;
    }
    let active = true;
    Promise.resolve()
      .then(() => {
        if (active) setLoading(true);
        return fetch(`/api/transactions/${selectedTxId}`);
      })
      .then((r) => r.json())
      .then(async (d) => {
        if (!active || !d.data) return;
        const proj: RoleProjectedTransaction = d.data;
        setDetail(proj);

        const recOffer =
          proj.savingsComparisons.find((s) => s.offerId === proj.transaction.offerId) ??
          proj.savingsComparisons.find((s) => s.isRecommended) ??
          proj.savingsComparisons.find((s) => s.eligibilityStatus === 'ELIGIBLE');

        if (recOffer) {
          setSelectedOfferId(recOffer.offerId);
          // Automatically lock offer & populate AI provider ranking if not yet ranked
          if (proj.providerMatches.length === 0 || proj.transaction.offerId !== recOffer.offerId) {
            await selectOffer(proj.transaction.id, recOffer.offerId);
          } else {
            const topProv = proj.providerMatches[0];
            if (topProv) setSelectedProviderKey(`${topProv.providerId}::${topProv.cardMetadataId}`);
          }
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedTxId]);

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !selectedProviderKey) return;
    setError(null);
    setSubmitting(true);

    try {
      // 1. Save Shopper delivery info privately
      const delRes = await fetch(
        `/api/transactions/${detail.transaction.id}/delivery`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipientName,
            mobileNumber,
            shippingAddress,
            pinCode,
            city,
            deliveryInstructions,
          }),
        }
      );
      const delData = await delRes.json();
      if (!delRes.ok) throw new Error(delData.error || 'Invalid delivery details');

      // 2. Dispatch masked request to selected Perk Provider
      const [providerId, cardMetadataId] = selectedProviderKey.split('::');
      const reqRes = await fetch(
        `/api/transactions/${detail.transaction.id}/request-provider`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ providerId, cardMetadataId }),
        }
      );
      const reqData = await reqRes.json();
      if (!reqRes.ok) throw new Error(reqData.error || 'Failed to request provider');

      router.push(`/shopper/orders?txId=${detail.transaction.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  const activeComparison = detail?.savingsComparisons.find(
    (c) => c.offerId === selectedOfferId
  );
  const topProvider =
    detail?.providerMatches.find(
      (p) => `${p.providerId}::${p.cardMetadataId}` === selectedProviderKey
    ) ?? detail?.providerMatches[0];

  const recommendedProviders = (detail?.providerMatches || []).filter((p) => !p.isNewProvider);
  const newlyAddedProviders = (detail?.providerMatches || []).filter((p) => p.isNewProvider);

  return (
    <AppShell requiredRole="SHOPPER_B">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="green" className="mb-1.5">
              <Sparkles className="h-3 w-3" />
              AI Capability 2: Savings Advisor &amp; Provider Matching
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              {aiHeadline ||
                (detail
                  ? `AI found the best available savings opportunity for your ${detail.product.brand} ${detail.product.category.replace(/s$/, '').toLowerCase()}.`
                  : 'AI Savings & Provider Recommendation')}
            </h1>
          </div>

          {allTxs.length > 0 && (
            <select
              value={selectedTxId}
              onChange={(e) => setSelectedTxId(e.target.value)}
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-[#002970]"
            >
              {allTxs.map((t) => (
                <option key={t.transaction.id} value={t.transaction.id}>
                  {t.transaction.id} — {t.product.title.slice(0, 32)}
                </option>
              ))}
            </select>
          )}
        </div>

        {loading || !detail ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              Loading AI savings comparisons and provider rankings...
            </CardContent>
          </Card>
        ) : (
          <>
            {error && (
              <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {/* Top Recommendation Highlight Split */}
            {activeComparison && (
              <div className="grid lg:grid-cols-12 gap-5">
                {/* Recommended Offer Card */}
                <Card className="lg:col-span-5 border-2 border-[#002970]">
                  <CardHeader className="bg-[#002970] text-white flex items-center justify-between rounded-t-2xl">
                    <span className="font-bold text-sm flex items-center gap-1.5">
                      <Award className="h-4 w-4 text-[#00BAF2]" />
                      Selected Bank Offer
                    </span>
                    <Badge variant="green">
                      Save {formatInr(activeComparison.shopperNetSavings)}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm tabular-nums">
                    <div className="flex items-center gap-3 pb-2 border-b border-slate-100">
                      <img
                        src={detail.product.imageUrl}
                        alt={detail.product.title}
                        className="w-14 h-12 rounded-lg border border-slate-200 object-contain bg-white"
                      />
                      <div>
                        <p className="font-bold text-slate-900">{detail.product.title}</p>
                        <p className="text-xs text-slate-500">{detail.product.merchant}</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex justify-between">
                        <span className="text-slate-600">Bank</span>
                        <span className="font-bold text-[#002970]">{activeComparison.bankName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Original Product Price</span>
                        <span className="font-semibold">{formatInr(activeComparison.originalPrice)}</span>
                      </div>
                      <div className="flex justify-between text-[#00B86B] font-semibold">
                        <span>Instant Discount</span>
                        <span>-{formatInr(activeComparison.actualDiscount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Provider Card Charge</span>
                        <span className="font-semibold">{formatInr(activeComparison.cardChargeAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">Provider Reward</span>
                        <span className="font-semibold">+{formatInr(activeComparison.providerReward)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">PerkLink Fee</span>
                        <span className="font-semibold">+{formatInr(activeComparison.perkLinkFee)}</span>
                      </div>
                      <div className="border-t border-slate-200 pt-2 flex justify-between text-base font-extrabold text-[#002970]">
                        <span>Shopper Final Amount</span>
                        <span>{formatInr(activeComparison.shopperFinalAmount)}</span>
                      </div>
                      <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-2.5 flex justify-between font-bold text-emerald-900">
                        <span>Estimated Shopper Savings</span>
                        <span>{formatInr(activeComparison.shopperNetSavings)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Recommended Card Provider + AI Rationale */}
                <Card className="lg:col-span-7 border-2 border-[#00BAF2]">
                  <CardHeader className="bg-sky-50 flex items-center justify-between rounded-t-2xl">
                    <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[#00BAF2]" />
                      {topProvider ? `${topProvider.providerAlias} Spotlight` : 'Card Provider Spotlight'}
                    </span>
                    {topProvider && (
                      topProvider.isNewProvider ? (
                        <Badge variant="blue" className="bg-[#002970] text-white font-bold text-xs border-0">
                          NEW PROVIDER
                        </Badge>
                      ) : (
                        <Badge variant="green" className="font-extrabold text-xs text-emerald-800 bg-emerald-100 border border-emerald-300">
                          {topProvider.matchScore}% Match
                        </Badge>
                      )
                    )}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {topProvider ? (
                      <>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-extrabold text-slate-900">
                                {topProvider.providerAlias}
                              </h3>
                              <Badge variant="green">{topProvider.availabilityStatus}</Badge>
                              {topProvider.isNewProvider && (
                                <Badge variant="blue" className="text-[10px] bg-sky-100 text-[#002970] border-sky-300 font-bold">
                                  NEW PROVIDER
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600 mt-0.5">
                              {topProvider.cardProduct} (•••• {topProvider.maskedLast4}) •{' '}
                              <span className="font-semibold text-[#002970]">
                                Reward {formatInr(topProvider.offeredReward)}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-center">
                              <span className="text-slate-400 block">Rating</span>
                              {topProvider.isNewProvider || !topProvider.rating ? (
                                <span className="text-slate-500 font-medium text-[11px]">No ratings yet</span>
                              ) : (
                                <strong className="text-slate-900 flex items-center gap-0.5">
                                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                  {topProvider.rating.toFixed(1)}
                                </strong>
                              )}
                            </div>
                            <div className="text-center">
                              <span className="text-slate-400 block">Fulfilled</span>
                              {topProvider.isNewProvider || !topProvider.completedOrders ? (
                                <span className="text-slate-500 font-medium text-[11px]">No history yet</span>
                              ) : (
                                <strong className="text-slate-900">
                                  {topProvider.completedOrders} orders
                                </strong>
                              )}
                            </div>
                            <div className="text-center">
                              <span className="text-slate-400 block">Capacity</span>
                              <strong className="text-[#002970]">
                                {formatInr(topProvider.maxTransactionAmount)}
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-sky-50/80 border border-sky-200 p-3.5 text-sm text-[#002970]">
                          <p className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-1">
                            {topProvider.isNewProvider ? 'New Provider Profile & Match Status' : 'Why This Provider Was Selected (AI Explanation)'}
                          </p>
                          <p>
                            {topProvider.aiRationale ||
                              detail.transaction.aiRecommendationExplanation}
                          </p>
                          {topProvider.isNewProvider && (
                            <p className="text-xs text-slate-500 mt-2 font-medium">
                              New Provider — Match score not yet available. Fully eligible with verified card compatibility and transaction capacity.
                            </p>
                          )}
                          {aiAlternativeText && (
                            <p className="text-xs text-slate-600 mt-2">
                              {aiAlternativeText}
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-amber-800">
                        No online registered Perk Provider matches {activeComparison.bankName} for this amount.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Matched Card Providers (Two Groups: Recommended & Newly Added) */}
            {detail.providerMatches.length > 0 && activeComparison && (
              <div className="space-y-6">
                {/* Group 1 — Recommended Providers */}
                {recommendedProviders.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-extrabold text-[#002970] flex items-center gap-2">
                          <span>Recommended Providers for {activeComparison.bankName}</span>
                          <Badge variant="navy">{recommendedProviders.length} Established</Badge>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Established Perk Providers with verified transaction history and AI match rankings.
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {recommendedProviders.map((pm) => {
                        const key = `${pm.providerId}::${pm.cardMetadataId}`;
                        const isSelected = key === selectedProviderKey || (!selectedProviderKey && pm.isRecommended);

                        return (
                          <Card
                            key={pm.id}
                            onClick={() => setSelectedProviderKey(key)}
                            className={`cursor-pointer transition-all duration-200 border-2 rounded-2xl ${
                              isSelected
                                ? 'border-[#002970] bg-sky-50/40 shadow-md ring-2 ring-[#002970]/15'
                                : 'border-slate-200 bg-white hover:border-[#00BAF2] hover:shadow-sm'
                            }`}
                          >
                            <CardContent className="p-4 space-y-3.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-base text-[#002970]">
                                    {pm.providerAlias}
                                  </span>
                                  <Badge variant="green" className="text-[10px] px-2 py-0.5">
                                    {pm.availabilityStatus}
                                  </Badge>
                                </div>
                                <Badge variant="green" className="text-[11px] px-2.5 py-0.5 font-bold shadow-sm">
                                  {pm.isRecommended && <Sparkles className="h-3 w-3 mr-1 inline" />}
                                  {pm.matchScore}% Match
                                </Badge>
                              </div>

                              {/* Bank & Card Details */}
                              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 space-y-0.5">
                                <p className="text-xs font-bold text-slate-900 flex items-center justify-between">
                                  <span>{pm.cardProduct}</span>
                                  <span className="text-[11px] font-mono text-slate-500">•••• {pm.maskedLast4}</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {pm.bankName} • {pm.cardCategory} Tier
                                </p>
                              </div>

                              {/* Consolidated Key Metrics (No scoring breakdown criteria) */}
                              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Rating</span>
                                  <strong className="text-slate-900 font-bold flex items-center justify-center gap-0.5">
                                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                                    {pm.rating ? pm.rating.toFixed(1) : '5.0'}
                                  </strong>
                                </div>
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Fulfilled</span>
                                  <strong className="text-slate-900 font-bold">{pm.completedOrders ?? 0} orders</strong>
                                </div>
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Max Limit</span>
                                  <strong className="text-slate-900 font-bold">{formatInr(pm.maxTransactionAmount)}</strong>
                                </div>
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Reward</span>
                                  <strong className="text-[#00B86B] font-bold">{formatInr(pm.offeredReward)}</strong>
                                </div>
                              </div>

                              {/* Select Provider Action Button */}
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'primary' : 'outline'}
                                className={`w-full font-semibold transition ${
                                  isSelected
                                    ? 'bg-[#002970] text-white hover:bg-[#001f54]'
                                    : 'text-[#002970] border-slate-300 hover:border-[#002970] hover:bg-sky-50'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProviderKey(key);
                                }}
                              >
                                {isSelected ? (
                                  <span className="flex items-center justify-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4 text-[#00BAF2]" />
                                    Selected Provider ✓
                                  </span>
                                ) : (
                                  'Select Provider'
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Group 2 — Newly Added Providers */}
                {newlyAddedProviders.length > 0 && (
                  <div className="space-y-4 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h2 className="text-lg font-extrabold text-[#002970] flex items-center gap-2">
                          <span>Newly Added Providers for {activeComparison.bankName}</span>
                          <Badge variant="blue" className="bg-[#00BAF2]/20 text-[#002970] border border-[#00BAF2]/40 font-bold">
                            <UserPlus className="h-3.5 w-3.5 mr-1 text-[#00BAF2]" />
                            {newlyAddedProviders.length} Recently Enrolled
                          </Badge>
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Newly enrolled cardholders with verified card compatibility and full transaction capacity. Not yet rated.
                        </p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {newlyAddedProviders.map((pm) => {
                        const key = `${pm.providerId}::${pm.cardMetadataId}`;
                        const isSelected = key === selectedProviderKey || (!selectedProviderKey && pm.isRecommended);

                        return (
                          <Card
                            key={pm.id}
                            onClick={() => setSelectedProviderKey(key)}
                            className={`cursor-pointer transition-all duration-200 border-2 rounded-2xl ${
                              isSelected
                                ? 'border-[#002970] bg-sky-50/40 shadow-md ring-2 ring-[#002970]/15'
                                : 'border-slate-200 bg-white hover:border-[#00BAF2] hover:shadow-sm'
                            }`}
                          >
                            <CardContent className="p-4 space-y-3.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-extrabold text-base text-[#002970]">
                                    {pm.providerAlias}
                                  </span>
                                  <Badge variant="green" className="text-[10px] px-2 py-0.5">
                                    {pm.availabilityStatus}
                                  </Badge>
                                </div>
                                <Badge variant="blue" className="text-[10px] px-2.5 py-0.5 font-black uppercase tracking-wider bg-[#00BAF2]/15 text-[#002970] border border-[#00BAF2]/40">
                                  <UserPlus className="h-3 w-3 mr-1 text-[#00BAF2]" />
                                  NEW PROVIDER
                                </Badge>
                              </div>

                              {/* Bank & Card Details */}
                              <div className="rounded-xl bg-slate-50 border border-slate-200/80 p-2.5 space-y-0.5">
                                <p className="text-xs font-bold text-slate-900 flex items-center justify-between">
                                  <span>{pm.cardProduct}</span>
                                  <span className="text-[11px] font-mono text-slate-500">•••• {pm.maskedLast4}</span>
                                </p>
                                <p className="text-[11px] text-slate-500">
                                  {pm.bankName} • {pm.cardCategory} Tier
                                </p>
                              </div>

                              {/* Honest Neutral Metrics — No fabricated scores */}
                              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                <div className="rounded-lg bg-slate-50/80 border border-slate-200 p-2">
                                  <span className="text-[10px] text-slate-400 block font-medium">Ratings</span>
                                  <span className="text-slate-600 font-semibold text-xs">No ratings yet</span>
                                </div>
                                <div className="rounded-lg bg-slate-50/80 border border-slate-200 p-2">
                                  <span className="text-[10px] text-slate-400 block font-medium">History</span>
                                  <span className="text-slate-600 font-semibold text-xs">No transaction history yet</span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Max Limit</span>
                                  <strong className="text-slate-900 font-bold">{formatInr(pm.maxTransactionAmount)}</strong>
                                </div>
                                <div className="rounded-lg bg-white border border-slate-200 p-1.5">
                                  <span className="text-[10px] text-slate-500 block">Reward</span>
                                  <strong className="text-[#00B86B] font-bold">{formatInr(pm.offeredReward)}</strong>
                                </div>
                              </div>

                              <p className="text-[11px] text-slate-500 text-center italic">
                                New Provider — Match score not yet available
                              </p>

                              {/* Select Provider Action Button */}
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'primary' : 'outline'}
                                className={`w-full font-semibold transition ${
                                  isSelected
                                    ? 'bg-[#002970] text-white hover:bg-[#001f54]'
                                    : 'text-[#002970] border-slate-300 hover:border-[#002970] hover:bg-sky-50'
                                }`}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedProviderKey(key);
                                }}
                              >
                                {isSelected ? (
                                  <span className="flex items-center justify-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4 text-[#00BAF2]" />
                                    Selected Provider ✓
                                  </span>
                                ) : (
                                  'Select Provider'
                                )}
                              </Button>
                            </CardContent>
                          </Card>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Stage 4 — Private Delivery Details Form & Submission */}
            {detail.providerMatches.length > 0 && (
              <Card className="border border-slate-200">
                <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <h2 className="font-extrabold text-[#002970] text-base">
                      Stage 4 — Delivery Details (Private to Shopper &amp; Merchant)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Protected by separated identity architecture: Perk Provider never sees your phone or shipping address.
                    </p>
                  </div>
                  <Badge variant="navy">
                    <Lock className="h-3 w-3 mr-1" />
                    PII Masked from Provider
                  </Badge>
                </CardHeader>
                <CardContent className="pt-4">
                  <form onSubmit={handleSubmitRequest} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Recipient Name
                        </label>
                        <Input
                          required
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Mobile Number
                        </label>
                        <Input
                          required
                          value={mobileNumber}
                          onChange={(e) => setMobileNumber(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-600 block mb-1">
                        Full Shipping Address
                      </label>
                      <Input
                        required
                        value={shippingAddress}
                        onChange={(e) => setShippingAddress(e.target.value)}
                      />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">City</label>
                        <Input value={city} onChange={(e) => setCity(e.target.value)} />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">PIN Code</label>
                        <Input
                          required
                          maxLength={6}
                          value={pinCode}
                          onChange={(e) => setPinCode(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          Delivery Instructions
                        </label>
                        <Input
                          value={deliveryInstructions}
                          onChange={(e) => setDeliveryInstructions(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <div className="rounded-xl bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-slate-700">
                        Selected Provider:{' '}
                        <strong className="text-[#002970]">
                          {topProvider?.providerAlias}
                        </strong>{' '}
                        ({topProvider?.cardProduct}) • Reward{' '}
                        <strong className="text-[#00B86B]">
                          {formatInr(topProvider?.offeredReward ?? 250)}
                        </strong>
                      </div>
                      <Button
                        type="submit"
                        size="lg"
                        variant="paytm"
                        disabled={
                          submitting ||
                          !selectedProviderKey ||
                          !['PRODUCT_ANALYSED', 'OFFER_SELECTED'].includes(
                            detail.transaction.status
                          )
                        }
                      >
                        <ShieldCheck className="h-4 w-4 mr-1.5" />
                        {submitting
                          ? 'Sending Masked Request...'
                          : `Confirm & Request ${topProvider?.providerAlias || 'Provider'}`}
                        <ArrowRight className="h-4 w-4 ml-1.5" />
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}

export default function OffersPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-slate-500">Loading offers...</div>}>
      <OffersContent />
    </Suspense>
  );
}

