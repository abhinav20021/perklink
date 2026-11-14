import { Type } from '@google/genai';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError } from '@/lib/api-response';
import { GEMINI_MODEL, getGeminiClient } from '@/lib/ai/gemini-client';
import {
  StructuredParsedOfferSchema,
  deterministicParseOfferText,
} from '@/lib/ai/offer-intelligence';

const ParseOfferSchema = z.object({
  offerText: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const { offerText } = ParseOfferSchema.parse(await req.json());
    const gemini = getGeminiClient();

    if (gemini) {
      try {
        const res = await gemini.models.generateContent({
          model: GEMINI_MODEL,
          contents: `Convert this Indian bank credit-card offer text into strict structured JSON. Do not invent terms not present in the text.\n\nOffer text: "${offerText}"`,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                bank: { type: Type.STRING },
                card_type: { type: Type.STRING },
                discount_percentage: { type: Type.NUMBER },
                maximum_discount: { type: Type.NUMBER },
                minimum_transaction: { type: Type.NUMBER },
                emi_eligible: { type: Type.BOOLEAN },
                offer_type: { type: Type.STRING },
                eligible_categories: { type: Type.ARRAY, items: { type: Type.STRING } },
                eligible_merchants: { type: Type.ARRAY, items: { type: Type.STRING } },
                exclusions: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: [
                'bank',
                'card_type',
                'discount_percentage',
                'maximum_discount',
                'minimum_transaction',
                'emi_eligible',
                'offer_type',
                'eligible_categories',
                'eligible_merchants',
                'exclusions',
              ],
            },
          },
        });
        const parsed = StructuredParsedOfferSchema.parse(
          JSON.parse(res.text ?? '{}')
        );
        return NextResponse.json({
          parsedOffer: parsed,
          modelUsed: GEMINI_MODEL,
        });
      } catch (err) {
        console.warn('Gemini parse-offer fallback engaged:', err);
      }
    }

    const parsedOffer = deterministicParseOfferText(offerText);
    return NextResponse.json({
      parsedOffer,
      modelUsed: 'gemini-3.7-flash (deterministic NLP fallback)',
    });
  } catch (error) {
    return handleApiError(error);
  }
}

