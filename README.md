# Paytm PerkLink — Hackathon Simulation MVP

> **"PerkLink uses AI to understand bank offers, discover the best savings opportunity, and match shoppers with eligible card providers."**

> **SIMULATION MODE — NO REAL MONEY MOVES:** All UPI mandates, card payments, gateway callbacks, merchant orders, invoice verifications, and settlements in this repository are simulated for live hackathon demonstration. Zero real card credentials, CVVs, OTPs, or UPI PINs are requested or stored.

## Two Core AI Capabilities
1. **AI Product & Offer Intelligence** (`src/lib/ai/offer-intelligence.ts`):
   - Extracts structured product metadata (`productName`, `brand`, `model`, `category`, `merchant`, `listedPrice`, `imageUrl`, `productUrl`) using `@google/genai` (`gemini-3.7-flash`) with an honest, clearly labelled curated demo fallback when a live merchant URL cannot be fetched.
   - Parses plain-English bank offer rules into validated structured JSON (`bank`, `card_type`, `discount_percentage`, `maximum_discount`, `minimum_transaction`, `emi_eligible`, `offer_type`, `exclusions`) and generates a shopper-friendly explanation surfacing any missing/unverified conditions.
2. **AI Savings Advisor & Provider Matching** (`src/lib/ai/recommendation-intelligence.ts` + `src/lib/finance/savings-engine.ts` + `src/lib/matching/provider-matcher.ts`):
   - Deterministic backend engine evaluates every bank offer (`ELIGIBLE` / `POTENTIALLY_ELIGIBLE` / `NOT_ELIGIBLE`) and calculates exact Rupee figures (e.g., `₹48,999` Laptop → `₹2,000` SBI discount → `₹46,999` card charge + `₹250` reward + `₹49` fee = `₹47,298` mandate → `₹1,701` shopper savings).
   - Transparent 100-point backend scoring ranks registered Class A providers across compatibility, availability, capacity, historical fulfilment, response time, and rating, while AI explains the recommendation strictly from backend facts.

## Quick Start
```bash
npm install
cp .env.example .env.local   # optional: add GEMINI_API_KEY
npm run dev
```
Open `http://localhost:3000` and select any demo persona:
- **Class B Shopper**: `shopper@perklink.demo`
- **Class A Card Provider**: `provider@perklink.demo`
- **Paytm Operations Admin**: `admin@perklink.demo`

## Verification Commands
```bash
npx tsc --noEmit
npm test
npm run build
```

## All 14 Routes
- `/` — Paytm-inspired Home, Demo Login & Reference Economics
- `/shopper` — Class B Shopper Dashboard
- `/shopper/new-purchase` — AI Product & Offer Intelligence Workbench
- `/shopper/offers` — AI Savings Advisor, Provider Matching & Private Delivery Form
- `/shopper/mandate` — Simulated One-Time UPI Mandate (Handoff → 4-Digit Demo PIN → Confirmation)
- `/shopper/orders` — Shared Order & Delivery Tracking
- `/provider` — Class A Provider Dashboard (Card Metadata & Consent)
- `/provider/requests` — Masked Purchase Requests (Zero Shopper PII)
- `/provider/payment` — Simulated Secure Card Checkout + Gateway Callback + Merchant Order Creation
- `/provider/upload-invoice` — Optional Fallback Invoice Verification (Verified / Mismatch / Manual Review)
- `/admin` — Paytm Operations Dashboard & Configurable Economics
- `/admin/verification` — Mismatch & Fallback Invoice Review Console
- `/admin/transactions` — Lifecycle Inspector, Delivery Stepper & Gated Settlement Simulation
- `/admin/analytics` — Pilot KPI Scorecard & Recharts Analytics
