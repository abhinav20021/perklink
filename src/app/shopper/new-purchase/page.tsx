'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Award,
  Bot,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Cpu,
  CreditCard,
  Link2,
  Percent,
  ShieldCheck,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';
import type {
  AIAnalysisResult,
  Product,
  SavingsComparison,
  StructuredParsedOffer,
} from '@/lib/db/types';
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

const SAMPLE_PRODUCT_URLS = [
  {
    label: 'Laptop — ₹48,999 (Flipkart)',
    url: 'https://www.flipkart.com/asus-vivobook-16-laptop-16gb-512gb/p/itm99812demo',
  },
  {
    label: 'OnePlus 13R 5G — ₹42,999 (Amazon)',
    url: 'https://www.amazon.in/oneplus-13r-5g-256gb/dp/B0DEMO13R',
  },
  {
    label: 'Sony WH-1000XM5 — ₹26,990 (Croma)',
    url: 'https://www.croma.com/sony-wh-1000xm5-wireless-anc/p/demo26990',
  },
];

const ANALYSIS_STEPS = [
  'Inspecting product URL & extracting brand, model, merchant & price...',
  'Discovering applicable bank promotions & cardholder eligibility rules...',
  'Validating eligibility constraints & running deterministic savings math...',
];

function generateShopperExplanation(
  product: Product,
  savings: SavingsComparison,
  parsed?: StructuredParsedOffer
): string {
  const prodName = product.title;
  const bank = savings.bankName;
  const card = savings.cardType;
  const discStr = `${savings.discountPercentage}% instant discount (up to ${formatInr(savings.maxDiscount)})`;
  const netSavingsStr = formatInr(savings.shopperNetSavings);

  const emiText = parsed?.emi_eligible
    ? 'Applicable on both EMI and full-swipe card payments.'
    : 'Requires a standard full-swipe non-EMI transaction.';

  return `This ${product.category.toLowerCase().replace(/s$/, '')} (${prodName} listed at ${formatInr(savings.originalPrice)}) qualifies for the ${bank} ${card} promotion offering ${discStr}. Routing through a matched ${bank} cardholder unlocks ${netSavingsStr} in net savings after provider reward and facilitation fees. ${emiText}`;
}

export default function NewPurchasePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'URL' | 'MANUAL'>('URL');
  const [url, setUrl] = useState(SAMPLE_PRODUCT_URLS[0].url);
  const [isEmiPurchase, setIsEmiPurchase] = useState(false);

  // Manual fallback fields
  const [manualTitle, setManualTitle] = useState('ASUS Vivobook 16 Laptop (16GB, 512GB)');
  const [manualBrand, setManualBrand] = useState('ASUS');
  const [manualModel, setManualModel] = useState('Vivobook 16 X1605ZA');
  const [manualMerchant, setManualMerchant] = useState('Flipkart');
  const [manualCategory, setManualCategory] = useState('Laptops');
  const [manualPrice, setManualPrice] = useState('48999');

  const [analysing, setAnalysing] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [navigating, setNavigating] = useState(false);

  const [analysisResult, setAnalysisResult] = useState<{
    transactionId: string;
    product: Product;
    aiAnalysis: AIAnalysisResult;
    savingsComparisons: SavingsComparison[];
  } | null>(null);

  const [selectedOfferId, setSelectedOfferId] = useState<string>('');

  // Filter ONLY confirmed ELIGIBLE offers for the shopper view
  const eligibleOffers = (analysisResult?.savingsComparisons || []).filter(
    (s) => s.eligibilityStatus === 'ELIGIBLE'
  );

  async function handleAnalyse(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setAnalysing(true);
    setLoadingStep(0);

    const timer1 = setTimeout(() => setLoadingStep(1), 450);
    const timer2 = setTimeout(() => setLoadingStep(2), 900);

    try {
      const payload =
        mode === 'URL'
          ? { url: url.trim(), isEmiPurchase }
          : {
              url: '',
              isEmiPurchase,
              manualInput: {
                title: manualTitle,
                brand: manualBrand,
                model: manualModel,
                merchant: manualMerchant,
                category: manualCategory,
                listedPrice: Number(manualPrice),
              },
            };

      const res = await fetch('/api/ai/extract-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'AI analysis failed');
      }

      const comparisons: SavingsComparison[] = data.savingsComparisons || [];
      const eligibleOnly = comparisons.filter((s) => s.eligibilityStatus === 'ELIGIBLE');
      const topRec =
        eligibleOnly.find((s) => s.isRecommended) ||
        eligibleOnly[0] ||
        null;

      const initialOfferId = topRec ? topRec.offerId : '';
      setSelectedOfferId(initialOfferId);

      setAnalysisResult({
        transactionId: data.transaction.id,
        product: data.product,
        aiAnalysis: data.aiAnalysis,
        savingsComparisons: eligibleOnly,
      });

      // Synchronize initial offer selection with backend transaction state
      if (initialOfferId && data.transaction?.id) {
        fetch(`/api/transactions/${data.transaction.id}/select-offer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: initialOfferId, isEmiPurchase }),
        }).catch((err) => console.warn('Sync initial offer error:', err));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyse product');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnalysing(false);
    }
  }

  function handleSelectOffer(offerId: string) {
    if (!analysisResult) return;
    setSelectedOfferId(offerId);

    // Sync selected offer to transaction record without re-running product extraction
    fetch(`/api/transactions/${analysisResult.transactionId}/select-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId, isEmiPurchase }),
    }).catch((err) => console.warn('Failed to update selected offer:', err));
  }

  async function handleProceed() {
    if (!analysisResult || !selectedOfferId) return;
    setNavigating(true);
    try {
      // Ensure backend transaction record has the selected eligible offer locked
      await fetch(
        `/api/transactions/${analysisResult.transactionId}/select-offer`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ offerId: selectedOfferId, isEmiPurchase }),
        }
      );
    } catch (err) {
      console.warn('Sync offer before navigation error:', err);
    }
    router.push(`/shopper/offers?txId=${analysisResult.transactionId}`);
  }

  // Active selected eligible offer across the page
  const selectedSavings: SavingsComparison | null =
    eligibleOffers.find((s) => s.offerId === selectedOfferId) ||
    eligibleOffers.find((s) => s.isRecommended) ||
    eligibleOffers[0] ||
    null;

  const matchingParsedOffer: StructuredParsedOffer | undefined =
    analysisResult?.aiAnalysis.parsedOffers.find(
      (p) =>
        p.offerId === selectedSavings?.offerId ||
        p.bank.toLowerCase() === selectedSavings?.bankName.toLowerCase()
    ) || analysisResult?.aiAnalysis.parsedOffers[0];

  return (
    <AppShell requiredRole="SHOPPER_B">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Badge variant="blue" className="mb-1.5">
              <Sparkles className="h-3 w-3" />
              AI Capability 1: Product &amp; Offer Intelligence
            </Badge>
            <h1 className="text-2xl font-extrabold text-[#002970]">
              Analyse Product URL &amp; Bank Offers
            </h1>
            <p className="text-sm text-slate-600">
              Paste any ecommerce product link. PerkLink AI inspects the catalog, discovers eligible bank discounts, and calculates your maximum net savings.
            </p>
          </div>
        </div>

        {/* Submission Card */}
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode('URL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                  mode === 'URL'
                    ? 'bg-[#002970] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <Link2 className="inline h-3.5 w-3.5 mr-1" />
                Paste Product URL
              </button>
              <button
                type="button"
                onClick={() => setMode('MANUAL')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition ${
                  mode === 'MANUAL'
                    ? 'bg-[#002970] text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Manual Product Entry
              </button>
            </div>
            <Badge variant="default">AI Model: Gemini 3.7 Flash</Badge>
          </CardHeader>

          <CardContent>
            <form onSubmit={handleAnalyse} className="space-y-5">
              {mode === 'URL' ? (
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Ecommerce Product URL
                  </label>
                  <Input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.flipkart.com/..."
                    required
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-medium text-slate-500">
                      Sample Products:
                    </span>
                    {SAMPLE_PRODUCT_URLS.map((d) => (
                      <button
                        key={d.url}
                        type="button"
                        onClick={() => setUrl(d.url)}
                        className="text-xs px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#002970] font-semibold border border-sky-200 cursor-pointer transition"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Product Name *</label>
                    <Input
                      required
                      value={manualTitle}
                      onChange={(e) => setManualTitle(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Brand</label>
                    <Input value={manualBrand} onChange={(e) => setManualBrand(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Model</label>
                    <Input value={manualModel} onChange={(e) => setManualModel(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Merchant</label>
                    <Input value={manualMerchant} onChange={(e) => setManualMerchant(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Category</label>
                    <Input value={manualCategory} onChange={(e) => setManualCategory(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Listed Price (₹) *</label>
                    <Input
                      required
                      type="number"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEmiPurchase}
                    onChange={(e) => setIsEmiPurchase(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-[#002970]"
                  />
                  <span>Checkout as EMI purchase (tests non-EMI exclusion rules)</span>
                </label>

                <Button type="submit" size="lg" variant="paytm" disabled={analysing}>
                  <Sparkles className="h-4 w-4" />
                  {analysing ? 'Analysing with AI...' : 'Analyse with AI'}
                </Button>
              </div>
            </form>

            {error && (
              <div className="mt-4 rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-800">
                {error}
              </div>
            )}

            {/* AI Loading Progress State */}
            {analysing && (
              <div className="mt-6 rounded-2xl border border-sky-200 bg-sky-50/70 p-5 space-y-3">
                <div className="flex items-center gap-2 text-[#002970] font-bold text-sm">
                  <Cpu className="h-4 w-4 animate-spin text-[#00BAF2]" />
                  Running PerkLink AI Product &amp; Offer Intelligence...
                </div>
                <div className="space-y-2">
                  {ANALYSIS_STEPS.map((stepText, idx) => (
                    <div
                      key={stepText}
                      className={`flex items-center gap-2 text-xs ${
                        idx <= loadingStep ? 'text-[#002970] font-semibold' : 'text-slate-400'
                      }`}
                    >
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          idx < loadingStep
                            ? 'text-[#00B86B]'
                            : idx === loadingStep
                            ? 'text-[#00BAF2] animate-pulse'
                            : 'text-slate-300'
                        }`}
                      />
                      {stepText}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Extracted Output */}
        {analysisResult && (
          <div className="space-y-6">
            {/* Top Row: Section A & Section B side by side on desktop, stacked on mobile */}
            <div className="grid lg:grid-cols-2 gap-6 items-stretch">
              {/* SECTION A: AI Product Understanding */}
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader className="flex items-center justify-between">
                    <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                      <Tag className="h-4 w-4 text-[#00BAF2]" />
                      A. AI Product Understanding
                    </span>
                    <Badge variant="blue">{analysisResult.aiAnalysis.modelUsed}</Badge>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <img
                      src={analysisResult.aiAnalysis.productUnderstanding.imageUrl}
                      alt={analysisResult.aiAnalysis.productUnderstanding.productName}
                      className="w-full h-44 rounded-xl border border-slate-200 object-contain bg-white p-2"
                    />
                    <div className="space-y-2 text-sm">
                      <h2 className="font-extrabold text-slate-900 text-lg leading-snug">
                        {analysisResult.aiAnalysis.productUnderstanding.productName}
                      </h2>
                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Brand</span>
                          <strong className="text-slate-800 text-sm">
                            {analysisResult.aiAnalysis.productUnderstanding.brand}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Model</span>
                          <strong className="text-slate-800 text-sm">
                            {analysisResult.aiAnalysis.productUnderstanding.model}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Merchant</span>
                          <strong className="text-slate-800 text-sm">
                            {analysisResult.aiAnalysis.productUnderstanding.merchant}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2.5 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Category</span>
                          <strong className="text-slate-800 text-sm">
                            {analysisResult.aiAnalysis.productUnderstanding.category}
                          </strong>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </div>

                <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">Extracted Listed Price</span>
                  <span className="text-xl font-black text-[#002970] tabular-nums">
                    {formatInr(analysisResult.aiAnalysis.productUnderstanding.listedPrice)}
                  </span>
                </div>
              </Card>

              {/* SECTION B: AI Offer Understanding & Shopper Explanation */}
              <Card className="flex flex-col justify-between">
                <div>
                  <CardHeader className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                      <Bot className="h-4 w-4 text-[#00BAF2]" />
                      B. AI Offer Understanding &amp; Shopper Explanation
                    </span>
                    <div className="flex items-center gap-1.5">
                      {selectedSavings?.isRecommended && (
                        <Badge variant="blue">
                          <Award className="h-3 w-3" />
                          AI Best Savings Pick
                        </Badge>
                      )}
                      <Badge variant={eligibleOffers.length > 0 ? 'green' : 'amber'}>
                        {eligibleOffers.length} Eligible {eligibleOffers.length === 1 ? 'Offer' : 'Offers'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {selectedSavings ? (
                      <>
                        {/* Concise Shopper-Friendly AI Explanation */}
                        <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sm text-[#002970] leading-relaxed">
                          <p className="font-bold text-xs uppercase tracking-wider text-sky-700 mb-1 flex items-center gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI Explanation for {selectedSavings.bankName} Offer
                          </p>
                          {generateShopperExplanation(
                            analysisResult.product,
                            selectedSavings,
                            matchingParsedOffer
                          )}
                        </div>

                        {/* Selected Offer Financial Spotlight */}
                        <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-4 space-y-3 shadow-xs">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2.5">
                            <div>
                              <span className="text-xs font-extrabold uppercase tracking-wide text-emerald-800 block">
                                Active Selected Bank Offer
                              </span>
                              <span className="font-black text-[#002970] text-base">
                                {selectedSavings.bankName} • {selectedSavings.cardType}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[10px] font-semibold text-emerald-800 uppercase block tracking-wider">
                                Net Shopper Savings
                              </span>
                              <span className="text-xl font-black text-[#00B86B] tabular-nums">
                                {formatInr(selectedSavings.shopperNetSavings)}
                              </span>
                            </div>
                          </div>

                          {/* Financial Math Formula Ribbon for Selected Offer */}
                          <div className="rounded-xl bg-white border border-emerald-200 p-3 text-xs">
                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                              Financial Breakdown ({selectedSavings.bankName})
                            </p>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                              <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                                <span className="text-slate-400 block text-[10px]">Listed Price</span>
                                <strong className="text-slate-800 text-sm tabular-nums">
                                  {formatInr(selectedSavings.originalPrice)}
                                </strong>
                              </div>
                              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800 border border-emerald-100">
                                <span className="text-emerald-600 block text-[10px]">Bank Discount</span>
                                <strong className="text-emerald-700 text-sm tabular-nums">
                                  −{formatInr(selectedSavings.actualDiscount)}
                                </strong>
                              </div>
                              <div className="rounded-lg bg-sky-50 p-2 text-[#002970] border border-sky-100">
                                <span className="text-sky-600 block text-[10px]">PerkLink Outlay</span>
                                <strong className="text-[#002970] text-sm tabular-nums">
                                  {formatInr(selectedSavings.shopperFinalAmount)}
                                </strong>
                              </div>
                              <div className="rounded-lg bg-[#00B86B] text-white p-2">
                                <span className="text-emerald-100 block text-[10px]">You Save</span>
                                <strong className="text-white text-sm tabular-nums">
                                  {formatInr(selectedSavings.shopperNetSavings)}
                                </strong>
                              </div>
                            </div>
                            <p className="text-[10px] text-slate-500 mt-2 text-center">
                              Includes ₹{selectedSavings.providerReward} provider reward + ₹{selectedSavings.perkLinkFee} facilitation fee in one-time mandate
                            </p>
                          </div>

                          {/* Structured Offer Conditions Grid */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <Percent className="h-3 w-3 text-amber-500" />
                                Discount Rate
                              </span>
                              <strong className="text-slate-900 text-xs">
                                {selectedSavings.discountPercentage}% Instant
                              </strong>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <Zap className="h-3 w-3 text-emerald-600" />
                                Max Cap
                              </span>
                              <strong className="text-slate-900 text-xs">
                                {formatInr(selectedSavings.maxDiscount)}
                              </strong>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <CreditCard className="h-3 w-3 text-sky-600" />
                                Min Purchase
                              </span>
                              <strong className="text-slate-900 text-xs">
                                {formatInr(matchingParsedOffer?.minimum_transaction || 10000)}
                              </strong>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3 text-blue-600" />
                                EMI Policy
                              </span>
                              <strong className="text-slate-900 text-xs">
                                {matchingParsedOffer?.emi_eligible
                                  ? 'EMI Eligible'
                                  : 'Non-EMI Full Swipe Only'}
                              </strong>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-purple-600" />
                                Offer Validity
                              </span>
                              <strong className="text-slate-900 text-xs">
                                {matchingParsedOffer?.valid_until || '31 Dec 2026'}
                              </strong>
                            </div>
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5">
                              <span className="text-slate-400 block text-[10px] uppercase font-bold flex items-center gap-1">
                                <Clock className="h-3 w-3 text-indigo-600" />
                                Offer Type
                              </span>
                              <strong className="text-slate-900 text-xs capitalize">
                                {(matchingParsedOffer?.offer_type || 'instant_discount').replace('_', ' ')}
                              </strong>
                            </div>
                          </div>

                          {/* Exclusions & Additional Conditions */}
                          {matchingParsedOffer?.exclusions && matchingParsedOffer.exclusions.length > 0 && (
                            <div className="rounded-xl bg-white border border-slate-200 p-2.5 text-[11px] text-slate-600 space-y-1">
                              <span className="font-bold text-slate-800 block text-[10px] uppercase">
                                Offer Conditions &amp; Exclusions
                              </span>
                              <p>{matchingParsedOffer.exclusions.join(' • ')}</p>
                            </div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="rounded-2xl bg-amber-50/80 border border-amber-200 p-6 text-center space-y-2">
                        <Bot className="h-8 w-8 text-amber-600 mx-auto" />
                        <h3 className="font-bold text-slate-900 text-sm">
                          No eligible bank offers were found for this product.
                        </h3>
                        <p className="text-xs text-slate-600 max-w-sm mx-auto">
                          None of the promotions on this merchant satisfy minimum transaction thresholds or cardholder eligibility for this purchase.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="px-5 py-3.5 bg-slate-50/80 border-t border-slate-100 rounded-b-2xl flex items-center justify-between text-xs text-slate-600">
                  <span>Selected Card Provider Channel:</span>
                  <span className="font-extrabold text-[#002970]">
                    {selectedSavings ? `${selectedSavings.bankName} Network` : 'None Available'}
                  </span>
                </div>
              </Card>
            </div>

            {/* Bottom: ALL APPLICABLE BANK OFFERS IDENTIFIED BY AI (Full-Width Box) */}
            <Card className="w-full">
              <CardHeader className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100">
                <div>
                  <h2 className="font-extrabold text-base text-[#002970] flex items-center gap-2">
                    <Tag className="h-4 w-4 text-[#00BAF2]" />
                    All Applicable Bank Offers Identified by AI
                  </h2>
                  <p className="text-xs text-slate-500">
                    Only confirmed eligible promotions are displayed. Select an offer below to update Section B and your savings plan:
                  </p>
                </div>
                <Badge variant={eligibleOffers.length > 0 ? 'blue' : 'amber'}>
                  {eligibleOffers.length} {eligibleOffers.length === 1 ? 'Eligible Offer' : 'Eligible Offers'}
                </Badge>
              </CardHeader>

              <CardContent className="space-y-4 pt-4">
                {eligibleOffers.length > 0 ? (
                  <div className="grid gap-3">
                    {eligibleOffers.map((offer) => {
                      const isSelected = offer.offerId === selectedSavings?.offerId;
                      const isTop = offer.isRecommended;

                      const matchingOfferDetails = analysisResult.aiAnalysis.parsedOffers.find(
                        (p) =>
                          p.offerId === offer.offerId ||
                          p.bank.toLowerCase() === offer.bankName.toLowerCase()
                      );

                      return (
                        <div
                          key={offer.offerId}
                          onClick={() => handleSelectOffer(offer.offerId)}
                          className={`rounded-2xl border p-4 transition cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                            isSelected
                              ? 'border-2 border-[#002970] bg-sky-50/70 shadow-sm ring-1 ring-[#002970]/15'
                              : 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-xs'
                          }`}
                        >
                          <div className="space-y-1.5 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-[#002970] text-sm">
                                {offer.bankName}
                              </span>
                              <span className="text-xs font-semibold text-slate-600">
                                • {offer.cardType}
                              </span>
                              {isTop && (
                                <Badge variant="blue">
                                  <Award className="h-3 w-3" />
                                  Highest Savings
                                </Badge>
                              )}
                              <Badge variant="green">
                                Eligible
                              </Badge>
                              {isSelected && (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[#002970] px-2.5 py-0.5 text-[11px] font-extrabold text-white">
                                  <Check className="h-3 w-3 text-[#00BAF2]" />
                                  Selected
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-bold text-slate-900 leading-snug">
                              {offer.offerTitle}
                            </p>
                            <p className="text-[11px] text-slate-500">{offer.eligibilityReason}</p>

                            {/* Relevant Offer Conditions */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[11px] text-slate-600">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                <CreditCard className="h-3 w-3 text-slate-500" />
                                Min spend {formatInr(matchingOfferDetails?.minimum_transaction || offer.originalPrice >= 25000 ? 10000 : 10000)}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                <ShieldCheck className="h-3 w-3 text-blue-600" />
                                {matchingOfferDetails?.emi_eligible ? 'EMI Eligible' : 'Non-EMI Full Swipe'}
                              </span>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium">
                                <Clock className="h-3 w-3 text-purple-600" />
                                Valid through {matchingOfferDetails?.valid_until || '31 Dec 2026'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between md:justify-end gap-5 shrink-0 tabular-nums border-t md:border-t-0 pt-2.5 md:pt-0 border-slate-100">
                            <div className="text-left md:text-right space-y-0.5">
                              <p className="text-[10px] uppercase font-bold text-slate-400">
                                Discount Value
                              </p>
                              <p className="font-extrabold text-sm text-[#002970]">
                                −{formatInr(offer.actualDiscount)} off
                              </p>
                              <p className="text-xs font-black text-[#00B86B]">
                                Save {formatInr(offer.shopperNetSavings)} Net
                              </p>
                            </div>

                            <div>
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#002970] text-white text-xs font-bold shadow-xs">
                                  <Check className="h-4 w-4 text-[#00BAF2]" />
                                  Selected
                                </span>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSelectOffer(offer.offerId);
                                  }}
                                >
                                  Select Offer
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-8 text-center space-y-2">
                    <Tag className="h-8 w-8 text-slate-400 mx-auto" />
                    <p className="font-bold text-slate-800 text-sm">
                      No eligible bank offers were found for this product.
                    </p>
                    <p className="text-xs text-slate-500">
                      Try checking back later or test with a product that meets bank transaction requirements.
                    </p>
                  </div>
                )}

                {/* Bottom Action Footer */}
                <div className="pt-4 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100">
                  <div className="text-xs text-slate-600">
                    {selectedSavings ? (
                      <>
                        <span>Chosen Bank Offer: </span>
                        <strong className="text-[#002970] font-bold">
                          {selectedSavings.bankName} ({selectedSavings.cardType})
                        </strong>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span>Total Mandate Outlay: </span>
                        <strong className="text-slate-900 font-bold tabular-nums">
                          {formatInr(selectedSavings.shopperFinalAmount)}
                        </strong>
                        <span className="text-slate-400 mx-1.5">•</span>
                        <span className="text-[#00B86B] font-bold">
                          Save {formatInr(selectedSavings.shopperNetSavings)} Net
                        </span>
                      </>
                    ) : (
                      <span className="text-slate-500 font-medium">
                        No eligible bank offers available for this transaction.
                      </span>
                    )}
                  </div>

                  <Button
                    size="lg"
                    variant="paytm"
                    disabled={eligibleOffers.length === 0 || !selectedOfferId || navigating}
                    onClick={handleProceed}
                  >
                    <Sparkles className="h-4 w-4" />
                    {navigating
                      ? 'Saving Selection...'
                      : 'View AI Savings Advisor & Provider Match'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
