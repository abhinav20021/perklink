'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Bot,
  Check,
  CheckCircle2,
  Cpu,
  FileCode2,
  Layers,
  Link2,
  ShieldCheck,
  Sparkles,
  Tag,
  Zap,
} from 'lucide-react';
import type { AIAnalysisResult, Product, SavingsComparison } from '@/lib/db/types';
import { formatInr } from '@/lib/utils';
import { AppShell } from '@/components/layout/AppShell';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Textarea,
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
  'Parsing natural-language bank offer terms into structured JSON rules...',
  'Validating eligibility constraints & running deterministic savings math...',
];

export default function NewPurchasePage() {
  const router = useRouter();
  const [mode, setMode] = useState<'URL' | 'MANUAL'>('URL');
  const [url, setUrl] = useState(SAMPLE_PRODUCT_URLS[0].url);
  const [customOfferText, setCustomOfferText] = useState(
    'Get 10% instant discount up to ₹2,000 on selected SBI credit cards. Minimum transaction ₹10,000. Not valid on EMI transactions.'
  );
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

  const [analysisResult, setAnalysisResult] = useState<{
    transactionId: string;
    product: Product;
    aiAnalysis: AIAnalysisResult;
    savingsComparisons: SavingsComparison[];
  } | null>(null);

  const [nlParsedPreview, setNlParsedPreview] = useState<Record<string, unknown> | null>(
    null
  );
  const [parsingNl, setParsingNl] = useState(false);
  const [showRawSchema, setShowRawSchema] = useState(false);
  const [showNlRawSchema, setShowNlRawSchema] = useState(false);

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
          ? { url, customOfferText, isEmiPurchase }
          : {
              url: '',
              customOfferText,
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

      setAnalysisResult({
        transactionId: data.transaction.id,
        product: data.product,
        aiAnalysis: data.aiAnalysis,
        savingsComparisons: data.savingsComparisons,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyse product');
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setAnalysing(false);
    }
  }

  async function handleParseOfferOnly() {
    setParsingNl(true);
    try {
      const res = await fetch('/api/ai/parse-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ offerText: customOfferText }),
      });
      const data = await res.json();
      if (res.ok) setNlParsedPreview(data.parsedOffer);
    } finally {
      setParsingNl(false);
    }
  }

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
              Paste any ecommerce link. AI extracts structured product specs, parses natural-language offer rules, and runs deterministic savings checks.
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
            <Badge variant="default">Server-Side Gemini 3.7 Flash + Curated Fallback</Badge>
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
                        className="text-xs px-2.5 py-1 rounded-lg bg-sky-50 hover:bg-sky-100 text-[#002970] font-semibold border border-sky-200 cursor-pointer"
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-600">Product Name</label>
                    <Input value={manualTitle} onChange={(e) => setManualTitle(e.target.value)} />
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
                    <label className="text-xs font-semibold text-slate-600">Listed Price (₹)</label>
                    <Input
                      type="number"
                      value={manualPrice}
                      onChange={(e) => setManualPrice(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Natural Language Bank Offer Parser Tester */}
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-[#002970] flex items-center gap-1.5">
                    <FileCode2 className="h-4 w-4 text-[#00BAF2]" />
                    Natural-Language Bank Offer Understanding (Optional Text Input)
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={parsingNl}
                    onClick={handleParseOfferOnly}
                  >
                    {parsingNl ? 'Parsing...' : 'Preview Structured Rules'}
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  value={customOfferText}
                  onChange={(e) => setCustomOfferText(e.target.value)}
                />
                {nlParsedPreview && (
                  <div className="space-y-2 pt-1">
                    <div className="rounded-xl border border-sky-200 bg-white p-3.5 shadow-sm space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full bg-[#002970] text-white text-xs font-extrabold">
                            {String(nlParsedPreview.bank || 'Bank Offer')}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {String(nlParsedPreview.card_type || 'Selected Cards')}
                          </span>
                        </div>
                        <span className="text-xs font-extrabold text-[#00B86B] bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
                          {Number(nlParsedPreview.discount_percentage) || 10}% Instant Off (Up to ₹{Number(nlParsedPreview.maximum_discount || 2000).toLocaleString('en-IN')})
                        </span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                        <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Min Spend</span>
                          <strong className="text-slate-800">₹{Number(nlParsedPreview.minimum_transaction || 0).toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Max Cap</span>
                          <strong className="text-slate-800">₹{Number(nlParsedPreview.maximum_discount || 0).toLocaleString('en-IN')}</strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">EMI Allowed</span>
                          <strong className={nlParsedPreview.emi_eligible ? 'text-emerald-700' : 'text-slate-800'}>
                            {nlParsedPreview.emi_eligible ? 'Yes (EMI Eligible)' : 'No (Non-EMI Only)'}
                          </strong>
                        </div>
                        <div className="rounded-lg bg-slate-50 p-2 border border-slate-100">
                          <span className="text-slate-400 block text-[10px] uppercase font-bold">Offer Type</span>
                          <strong className="text-slate-800 capitalize">
                            {String(nlParsedPreview.offer_type || 'instant_discount').replace('_', ' ')}
                          </strong>
                        </div>
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-slate-500 flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-[#00B86B]" />
                          Parsed &amp; validated into strict structured schema
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowNlRawSchema((prev) => !prev)}
                          className="text-[11px] font-semibold text-[#002970] hover:text-[#00BAF2] underline cursor-pointer"
                        >
                          {showNlRawSchema ? 'Hide Schema' : 'Inspect JSON Schema'}
                        </button>
                      </div>
                      {showNlRawSchema && (
                        <pre className="rounded-xl bg-slate-900 text-sky-200 p-3 text-xs overflow-x-auto font-mono mt-2">
                          {JSON.stringify(nlParsedPreview, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4">
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

        {/* Extracted AI Product + Offer Intelligence Output */}
        {analysisResult && (
          <div className="space-y-5">
            {analysisResult.aiAnalysis.usedFallback && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3 text-xs text-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Transparent Catalog Fallback Notice</p>
                  <p>{analysisResult.aiAnalysis.fallbackReason}</p>
                </div>
              </div>
            )}

            <div className="grid lg:grid-cols-12 gap-5">
              {/* Product Understanding Card */}
              <Card className="lg:col-span-5">
                <CardHeader className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#002970]">
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
                  <div className="space-y-1.5 text-sm">
                    <h2 className="font-extrabold text-slate-900 text-lg">
                      {analysisResult.aiAnalysis.productUnderstanding.productName}
                    </h2>
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="text-slate-400 block">Brand</span>
                        <strong className="text-slate-800">
                          {analysisResult.aiAnalysis.productUnderstanding.brand}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="text-slate-400 block">Model</span>
                        <strong className="text-slate-800">
                          {analysisResult.aiAnalysis.productUnderstanding.model}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="text-slate-400 block">Merchant</span>
                        <strong className="text-slate-800">
                          {analysisResult.aiAnalysis.productUnderstanding.merchant}
                        </strong>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2">
                        <span className="text-slate-400 block">Category</span>
                        <strong className="text-slate-800">
                          {analysisResult.aiAnalysis.productUnderstanding.category}
                        </strong>
                      </div>
                    </div>
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                      <span className="text-xs text-slate-500">Extracted Listed Price</span>
                      <span className="text-xl font-extrabold text-[#002970] tabular-nums">
                        {formatInr(analysisResult.aiAnalysis.productUnderstanding.listedPrice)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Structured Offer Understanding + Explanation */}
              <Card className="lg:col-span-7">
                <CardHeader className="flex items-center justify-between">
                  <span className="font-bold text-sm text-[#002970] flex items-center gap-1.5">
                    <Bot className="h-4 w-4 text-[#00BAF2]" />
                    B. AI Offer Understanding &amp; Shopper Explanation
                  </span>
                  <Badge variant="green">
                    {
                      analysisResult.savingsComparisons.filter(
                        (s) => s.eligibilityStatus === 'ELIGIBLE'
                      ).length
                    }{' '}
                    Eligible Offers
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="rounded-2xl bg-sky-50 border border-sky-200 p-4 text-sm text-[#002970] leading-relaxed">
                    <p className="font-bold text-xs uppercase tracking-wider text-sky-700 mb-1">
                      Shopper-Friendly AI Explanation
                    </p>
                    {analysisResult.aiAnalysis.shopperExplanation}
                  </div>

                  {analysisResult.aiAnalysis.uncertainties.length > 0 && (
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs text-slate-700 space-y-1">
                      <p className="font-bold text-slate-800">
                        Explicitly Surfaced Uncertainties (Zero Fabrication):
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5">
                        {analysisResult.aiAnalysis.uncertainties.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* AI Top Offer Recommendation Spotlight */}
                  {(() => {
                    const bestOffer =
                      analysisResult.savingsComparisons.find((s) => s.isRecommended) ||
                      analysisResult.savingsComparisons.find((s) => s.eligibilityStatus === 'ELIGIBLE') ||
                      analysisResult.savingsComparisons[0];

                    if (!bestOffer) return null;

                    return (
                      <div className="rounded-2xl border-2 border-emerald-400 bg-gradient-to-br from-emerald-50/90 via-teal-50/40 to-white p-4 space-y-3 shadow-xs">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                              <Award className="h-3.5 w-3.5" />
                              AI Best Savings Pick
                            </span>
                            <span className="font-extrabold text-[#002970] text-sm">
                              {bestOffer.bankName} • {bestOffer.cardType}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] font-semibold text-emerald-800 uppercase block tracking-wider">
                              Net Shopper Savings
                            </span>
                            <span className="text-xl font-black text-[#00B86B] tabular-nums">
                              {formatInr(bestOffer.shopperNetSavings)}
                            </span>
                          </div>
                        </div>

                        {/* Financial Math Formula Ribbon */}
                        <div className="rounded-xl bg-white border border-emerald-200 p-3 text-xs">
                          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                            AI Unlocked Financial Breakdown
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                            <div className="rounded-lg bg-slate-50 p-2">
                              <span className="text-slate-400 block text-[10px]">Listed Price</span>
                              <strong className="text-slate-800 text-sm tabular-nums">
                                {formatInr(bestOffer.originalPrice)}
                              </strong>
                            </div>
                            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-800">
                              <span className="text-emerald-600 block text-[10px]">Bank Discount</span>
                              <strong className="text-emerald-700 text-sm tabular-nums">
                                −{formatInr(bestOffer.actualDiscount)}
                              </strong>
                            </div>
                            <div className="rounded-lg bg-sky-50 p-2 text-[#002970]">
                              <span className="text-sky-600 block text-[10px]">PerkLink Outlay</span>
                              <strong className="text-[#002970] text-sm tabular-nums">
                                {formatInr(bestOffer.shopperFinalAmount)}
                              </strong>
                            </div>
                            <div className="rounded-lg bg-[#00B86B] text-white p-2">
                              <span className="text-emerald-100 block text-[10px]">You Save</span>
                              <strong className="text-white text-sm tabular-nums">
                                {formatInr(bestOffer.shopperNetSavings)}
                              </strong>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-500 mt-2 text-center">
                            Includes ₹{bestOffer.providerReward} provider reward + ₹{bestOffer.perkLinkFee} facilitation fee in one-time mandate
                          </p>
                        </div>

                        {/* Extracted AI Rule Tags */}
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-slate-700 font-medium">
                            <Zap className="h-3 w-3 text-amber-500" />
                            {bestOffer.discountPercentage}% Instant Discount (up to ₹{bestOffer.maxDiscount.toLocaleString('en-IN')})
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-slate-700 font-medium">
                            <Check className="h-3 w-3 text-emerald-600" />
                            Cart meets ₹10,000 threshold
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-md bg-white border border-slate-200 px-2 py-0.5 text-slate-700 font-medium">
                            <ShieldCheck className="h-3 w-3 text-blue-600" />
                            Full swipe non-EMI
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* All Applicable Bank Offers Discovered by AI */}
                  <div className="space-y-3 pt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-extrabold text-sm text-[#002970] flex items-center gap-1.5">
                          <Tag className="h-4 w-4 text-[#00BAF2]" />
                          All Applicable Bank Offers Identified by AI
                        </h3>
                        <p className="text-xs text-slate-500">
                          PerkLink AI evaluated every card promotion against this product and cart:
                        </p>
                      </div>
                      <span className="text-xs font-bold text-slate-600">
                        {analysisResult.savingsComparisons.length} Evaluated
                      </span>
                    </div>

                    <div className="grid gap-2.5">
                      {analysisResult.savingsComparisons.map((offer) => {
                        const isEligible = offer.eligibilityStatus === 'ELIGIBLE';
                        const isTop = offer.isRecommended;

                        return (
                          <div
                            key={offer.offerId}
                            className={`rounded-2xl border p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              isTop
                                ? 'border-[#00B86B] bg-emerald-50/40 shadow-xs'
                                : isEligible
                                ? 'border-slate-200 bg-white hover:border-sky-300'
                                : 'border-slate-200 bg-slate-50/60 opacity-80'
                            }`}
                          >
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-black text-[#002970] text-sm">
                                  {offer.bankName}
                                </span>
                                <span className="text-xs font-semibold text-slate-600">
                                  • {offer.cardType}
                                </span>
                                {isTop && (
                                  <span className="text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                    Highest Savings
                                  </span>
                                )}
                                <span
                                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    isEligible
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                      : offer.eligibilityStatus === 'POTENTIALLY_ELIGIBLE'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  {offer.eligibilityStatus.replace('_', ' ')}
                                </span>
                              </div>
                              <p className="text-xs text-slate-700 leading-snug">
                                {offer.offerTitle}
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {offer.eligibilityReason}
                              </p>
                            </div>

                            <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                              <div className="text-left sm:text-right">
                                <span className="text-[10px] uppercase font-bold text-slate-400 block">
                                  Discount Value
                                </span>
                                <span className="font-extrabold text-sm text-[#002970] tabular-nums">
                                  {formatInr(offer.actualDiscount)} off
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-xs font-black text-[#00B86B] tabular-nums">
                                  Save {formatInr(offer.shopperNetSavings)} Net
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* AI Rule Deconstruction & Technical Schema Inspector */}
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#002970] flex items-center gap-1.5">
                        <Layers className="h-3.5 w-3.5 text-[#00BAF2]" />
                        AI Natural-Language Rule Deconstruction
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowRawSchema((prev) => !prev)}
                        className="text-xs font-semibold text-[#002970] hover:text-[#00BAF2] underline cursor-pointer"
                      >
                        {showRawSchema ? 'Hide Technical Schema' : 'Inspect JSON Schema'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      The AI model extracted unstructured offer clauses into strict JSON constraints for instant validation against cart values.
                    </p>

                    {showRawSchema && (
                      <pre className="rounded-xl bg-slate-900 text-emerald-300 p-3 text-xs overflow-x-auto font-mono max-h-56 mt-2">
                        {JSON.stringify(analysisResult.aiAnalysis.parsedOffers[0], null, 2)}
                      </pre>
                    )}
                  </div>

                  <div className="pt-2 flex justify-end">
                    <Button
                      size="lg"
                      variant="primary"
                      onClick={() =>
                        router.push(
                          `/shopper/offers?txId=${analysisResult.transactionId}`
                        )
                      }
                    >
                      <Sparkles className="h-4 w-4 text-[#00BAF2]" />
                      View AI Savings Advisor &amp; Provider Match
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
