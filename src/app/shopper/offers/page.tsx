'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  Award,
  Bot,
  CheckCircle2,
  Lock,
  ShieldCheck,
  Sparkles,
  Star,
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

  // Private Class B Delivery Form (never shared with Class A)
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

  async function handleSubmitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!detail || !selectedProviderKey) return;
    setError(null);
    setSubmitting(true);

    try {
      // 1. Save Class B delivery info privately
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

      // 2. Dispatch masked request to selected Class A provider
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
                      Recommended Offer
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
                      Recommended Card Provider (Transparent Score)
                    </span>
                    {topProvider && (
                      <Badge variant="navy">
                        Match Score: {topProvider.matchScore}/100
                      </Badge>
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
                            </div>
                            <p className="text-sm text-slate-600">
                              {topProvider.cardProduct} (•••• {topProvider.maskedLast4}) •{' '}
                              <span className="font-semibold text-[#002970]">
                                Reward {formatInr(topProvider.offeredReward)}
                              </span>
                            </p>
                          </div>

                          <div className="flex items-center gap-4 text-xs">
                            <div className="text-center">
                              <span className="text-slate-400 block">Rating</span>
                              <strong className="text-slate-900 flex items-center gap-0.5">
                                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                {topProvider.rating.toFixed(1)}
                              </strong>
                            </div>
                            <div className="text-center">
                              <span className="text-slate-400 block">Fulfilled</span>
                              <strong className="text-slate-900">
                                {topProvider.completedOrders} orders
                              </strong>
                            </div>
                            <div className="text-center">
                              <span className="text-slate-400 block">Response</span>
                              <strong className="text-slate-900">
                                ~{topProvider.avgAcceptanceMinutes}m
                              </strong>
                            </div>
                          </div>
                        </div>

                        <div className="rounded-2xl bg-sky-50/80 border border-sky-200 p-3.5 text-sm text-[#002970]">
                          <p className="text-xs font-bold uppercase tracking-wider text-sky-700 mb-1">
                            Why This Provider Was Recommended (AI Explanation)
                          </p>
                          <p>
                            {detail.transaction.aiRecommendationExplanation ||
                              topProvider.aiRationale}
                          </p>
                          {aiAlternativeText && (
                            <p className="text-xs text-slate-600 mt-2">
                              {aiAlternativeText}
                            </p>
                          )}
                        </div>

                        {/* Transparent Score Breakdown */}
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[11px]">
                          {[
                            ['Card Match', topProvider.scoreBreakdown.compatibilityScore, 35],
                            ['Availability', topProvider.scoreBreakdown.availabilityScore, 20],
                            ['Capacity', topProvider.scoreBreakdown.capacityScore, 15],
                            ['History', topProvider.scoreBreakdown.fulfilmentScore, 12],
                            ['Speed', topProvider.scoreBreakdown.responseTimeScore, 10],
                            ['Rating', topProvider.scoreBreakdown.ratingScore, 8],
                          ].map(([lbl, val, max]) => (
                            <div key={String(lbl)} className="rounded-xl bg-slate-50 border border-slate-200 p-2">
                              <span className="text-slate-500 block">{lbl}</span>
                              <strong className="text-[#002970] tabular-nums">
                                {val}/{max}
                              </strong>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-sm text-amber-800">
                        No online registered Class A provider matches {activeComparison.bankName} for this amount. Try selecting another eligible bank offer below.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {/* All Evaluated Offers Comparison (Deterministic Eligibility) */}
            <Card>
              <CardHeader>
                <h2 className="font-bold text-[#002970] text-base">
                  Deterministic Bank Offer &amp; Savings Comparison
                </h2>
                <p className="text-xs text-slate-500">
                  Backend rules verify minimum spend, merchant, category, EMI exclusions &amp; validity dates. Ineligible offers cannot be selected.
                </p>
              </CardHeader>
              <CardContent className="space-y-3">
                {detail.savingsComparisons.map((comp) => {
                  const isSelected = comp.offerId === selectedOfferId;
                  const eligible = comp.eligibilityStatus === 'ELIGIBLE';
                  const potential = comp.eligibilityStatus === 'POTENTIALLY_ELIGIBLE';

                  return (
                    <div
                      key={comp.offerId}
                      className={`rounded-2xl border p-4 transition ${
                        isSelected
                          ? 'border-[#002970] bg-sky-50/40'
                          : eligible || potential
                          ? 'border-slate-200 bg-white hover:border-sky-300'
                          : 'border-slate-200 bg-slate-50/80 opacity-75'
                      }`}
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-extrabold text-[#002970]">
                              {comp.bankName}
                            </span>
                            <span className="text-xs font-medium text-slate-500">
                              {comp.cardType}
                            </span>
                            {eligible && (
                              <Badge variant="green">
                                <CheckCircle2 className="h-3 w-3" />
                                Eligible
                              </Badge>
                            )}
                            {potential && (
                              <Badge variant="amber">
                                <AlertCircle className="h-3 w-3" />
                                Potentially Eligible — Verification Required
                              </Badge>
                            )}
                            {!eligible && !potential && (
                              <Badge variant="red">
                                <XCircle className="h-3 w-3" />
                                Not Eligible
                              </Badge>
                            )}
                            {comp.isRecommended && (
                              <Badge variant="blue">AI Top Pick</Badge>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-900">
                            {comp.offerTitle}
                          </p>
                          <p className="text-xs text-slate-600">{comp.eligibilityReason}</p>
                        </div>

                        <div className="flex items-center gap-4 shrink-0 tabular-nums">
                          <div className="text-right">
                            <p className="text-[11px] text-slate-500">Final Payable</p>
                            <p className="font-extrabold text-[#002970]">
                              {formatInr(comp.shopperFinalAmount)}
                            </p>
                            <p className="text-xs font-semibold text-[#00B86B]">
                              Save {formatInr(comp.shopperNetSavings)}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant={isSelected ? 'primary' : 'outline'}
                            disabled={comp.eligibilityStatus === 'NOT_ELIGIBLE'}
                            onClick={() =>
                              selectOffer(detail.transaction.id, comp.offerId)
                            }
                          >
                            {isSelected ? 'Selected' : 'Compare & Select'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Alternative Providers + Private Delivery Form & Dispatch */}
            {detail.providerMatches.length > 0 && (
              <div className="grid lg:grid-cols-12 gap-5">
                <Card className="lg:col-span-5">
                  <CardHeader>
                    <h2 className="font-bold text-[#002970] text-sm">
                      Matched Class A Providers ({detail.providerMatches.length})
                    </h2>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {detail.providerMatches.map((pm) => {
                      const key = `${pm.providerId}::${pm.cardMetadataId}`;
                      const active = key === selectedProviderKey;
                      return (
                        <div
                          key={pm.id}
                          onClick={() => setSelectedProviderKey(key)}
                          className={`rounded-xl border p-3.5 cursor-pointer transition ${
                            active
                              ? 'border-[#002970] bg-sky-50'
                              : 'border-slate-200 hover:border-sky-300'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <p className="font-bold text-sm text-slate-900">
                                {pm.providerAlias}
                              </p>
                              <p className="text-xs text-slate-600">
                                {pm.cardProduct} •••• {pm.maskedLast4}
                              </p>
                            </div>
                            <Badge variant={pm.isRecommended ? 'green' : 'default'}>
                              Score {pm.matchScore}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
                            <span>
                              {pm.rating.toFixed(1)}★ • {pm.completedOrders} orders • ~
                              {pm.avgAcceptanceMinutes}m
                            </span>
                            <span className="font-bold text-[#002970]">
                              Reward {formatInr(pm.offeredReward)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>

                {/* Private Delivery Form */}
                <Card className="lg:col-span-7">
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h2 className="font-bold text-[#002970] text-sm">
                        Stage 4 — Delivery Details (Private to Class B &amp; Merchant)
                      </h2>
                      <p className="text-xs text-slate-500">
                        Protected by separated identity architecture: Class A never sees your phone or shipping address.
                      </p>
                    </div>
                    <Badge variant="navy">
                      <Lock className="h-3 w-3" />
                      PII Masked from Provider
                    </Badge>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleSubmitRequest} className="space-y-3">
                      <div className="grid sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">
                            Recipient Name
                          </label>
                          <Input
                            required
                            value={recipientName}
                            onChange={(e) => setRecipientName(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">
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
                        <label className="text-xs font-semibold text-slate-600">
                          Full Shipping Address
                        </label>
                        <Input
                          required
                          value={shippingAddress}
                          onChange={(e) => setShippingAddress(e.target.value)}
                        />
                      </div>
                      <div className="grid sm:grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs font-semibold text-slate-600">City</label>
                          <Input value={city} onChange={(e) => setCity(e.target.value)} />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">PIN Code</label>
                          <Input
                            required
                            maxLength={6}
                            value={pinCode}
                            onChange={(e) => setPinCode(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-slate-600">
                            Delivery Instructions
                          </label>
                          <Input
                            value={deliveryInstructions}
                            onChange={(e) => setDeliveryInstructions(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
                        <div className="text-xs text-slate-600">
                          Selected Provider:{' '}
                          <strong className="text-[#002970]">
                            {topProvider?.providerAlias}
                          </strong>{' '}
                          (Reward {formatInr(topProvider?.offeredReward ?? 250)})
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
                          <ShieldCheck className="h-4 w-4" />
                          {submitting
                            ? 'Sending Masked Request...'
                            : 'Select this provider'}
                          <ArrowRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>
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

