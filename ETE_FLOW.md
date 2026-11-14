You can switch roles anytime using the top header switcher (Class B: Shopper, Class A: Provider, Paytm Ops Admin) or the persona cards on page.tsx, and reset back to clean seed state anytime with Reset Demo Data in the top compliance bar:

Class B — Shopper (shopper@perklink.demo) → /shopper/new-purchase (AI Analyse)
Pick the flagship Laptop demo URL (or paste any URL + plain-English bank offer terms) and run AI Product & Offer Intelligence to extract product metadata (₹48,999 Laptop) and parse the offer JSON.
Class B — Shopper → /shopper/offers (AI Offers & Match)
Review the AI Savings Advisor eligibility comparison (SBI Card −₹2,000 discount → ₹46,999 card charge, +₹250 provider reward, +₹49 fee = ₹47,298 UPI mandate, ₹1,701 net savings), view the ranked Class A providers, fill in the private delivery form, and send the purchase request.
Class A — Provider (provider@perklink.demo) → /provider/requests (Requests)
Notice Class B's delivery address and phone number are masked. Accept the incoming purchase request (MANDATE_PENDING).
Class B — Shopper → /shopper/mandate (UPI Mandate)
Click Approve UPI Mandate, verify the simulated UPI handoff details (₹47,298, ONE TIME), enter 4 demo PIN digits, and click Confirm & Authorise.
Class A — Provider → /provider/payment (Card Checkout)
Review ₹46,999, click Proceed to Secure Payment, complete the simulated issuer authentication with Confirm Payment (Payment Successful), and observe automatic separated Merchant Order creation (MER-...).
(Optional) Test the fallback verification presets (Verified, Mismatch, Manual review required) under /provider/upload-invoice (Fallback Invoice) and review them under /admin/verification.
Paytm Ops Admin (admin@perklink.demo) → /admin/transactions (Lifecycle & Settle)
Advance the delivery stages (SHIPPED → OUT_FOR_DELIVERY → DELIVERED → RETURN_WINDOW_ACTIVE → RETURN_WINDOW_COMPLETED), then click Simulate Settlement to complete settlement (Provider payout: ₹47,249, Paytm platform fee: ₹49). You can also inspect the KPI scorecard under /admin/analytics and adjustable defaults under /admin.