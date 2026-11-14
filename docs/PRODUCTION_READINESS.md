# PerkLink — Production Readiness & Compliance Architecture

This hackathon MVP intentionally simulates all financial and merchant rails. Moving PerkLink to production requires the following external approvals and architectural integrations:

1. **Paytm & Issuer Commercial Approvals**
   - Formal product, risk, and commercial approval from Paytm and participating issuing banks/card networks to surface card-linked offers and match cardholders within permitted program terms.
2. **RBI Payment Aggregator / Escrow & NPCI UPI One-Time Mandate Rails**
   - Replace `upi-mandate` and `settlement` simulations with RBI-authorised PA/escrow accounts and NPCI-certified UPI One-Time Mandate / Autopay rails.
   - Retain strict separation between mandate authorisation and escrow execution.
3. **Merchant Payer/Recipient Identity Separation**
   - Participating e-commerce merchants must support an API checkout contract where **Payment Authoriser (Class A)** and **Delivery Recipient (Class B)** are separate verified identities, preventing Class B's shipping address and mobile number from ever reaching Class A.
4. **Credential & Token Isolation**
   - Never share Paytm saved-card tokens, PANs, CVVs, PINs, or 3DS OTPs across users. All card payments must execute exclusively on the cardholder's own authenticated issuer session.
5. **DPDP Act & Explicit Consent Ledger**
   - Persist cryptographic consent records (`ConsentRecords`) for opt-in card matching, mandate terms, and audit logging (`AuditLogs`), with instant opt-out revocation.
6. **AI Safety Boundaries**
   - LLMs remain strictly advisory (product understanding, NLP offer parsing, natural-language explanation). Deterministic backend services own all eligibility rules, Rupee calculations, state machine transitions, callback verification, and settlement gating.

