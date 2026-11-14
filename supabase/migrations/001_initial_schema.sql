-- Paytm PerkLink — Reference PostgreSQL Schema (Supabase-compatible)
-- Note: In the Hackathon Simulation MVP, the app runs against a zero-config
-- atomic local JSON store (.data/perklink-db.json) by default while keeping this
-- relational schema ready for production Supabase/PostgreSQL migration.

CREATE TYPE user_role_enum AS ENUM ('SHOPPER_B', 'PROVIDER_A', 'ADMIN_OPS');

CREATE TYPE transaction_status_enum AS ENUM (
  'CREATED',
  'PRODUCT_ANALYSED',
  'OFFER_SELECTED',
  'PROVIDER_MATCHING',
  'PROVIDER_ACCEPTED',
  'MANDATE_PENDING',
  'MANDATE_AUTHORISED',
  'CARD_PAYMENT_PENDING',
  'CARD_PAYMENT_SUCCESS',
  'ORDER_CREATED',
  'INVOICE_PENDING',
  'INVOICE_UNDER_REVIEW',
  'INVOICE_VERIFIED',
  'SHIPPED',
  'DELIVERED',
  'RETURN_WINDOW_ACTIVE',
  'SETTLEMENT_ELIGIBLE',
  'SETTLEMENT_COMPLETED',
  'CANCELLED',
  'MANDATE_REJECTED',
  'MANDATE_EXPIRED',
  'PAYMENT_FAILED',
  'VERIFICATION_FAILED',
  'REFUND_PENDING',
  'REFUNDED',
  'DISPUTED'
);

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  city TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_roles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role user_role_enum NOT NULL,
  UNIQUE(user_id, role)
);

CREATE TABLE provider_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  display_alias TEXT NOT NULL,
  rating NUMERIC(3,2) NOT NULL DEFAULT 4.80,
  completed_orders INTEGER NOT NULL DEFAULT 0,
  availability_status TEXT NOT NULL DEFAULT 'ONLINE',
  avg_acceptance_minutes INTEGER NOT NULL DEFAULT 3,
  max_transaction_amount INTEGER NOT NULL DEFAULT 100000,
  supported_offer_categories TEXT[] NOT NULL DEFAULT '{}'
);

CREATE TABLE card_product_metadata (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  card_network TEXT NOT NULL,
  card_variant TEXT NOT NULL,
  card_category TEXT NOT NULL,
  masked_last4 TEXT NOT NULL,
  reward_preference_inr INTEGER NOT NULL DEFAULT 250,
  is_verified_demo BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE consent_records (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  granted BOOLEAN NOT NULL,
  scope_summary TEXT NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE bank_offers (
  id TEXT PRIMARY KEY,
  bank_name TEXT NOT NULL,
  card_type TEXT NOT NULL,
  offer_title TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  offer_type TEXT NOT NULL DEFAULT 'instant_discount',
  discount_type TEXT NOT NULL,
  discount_value NUMERIC(10,2) NOT NULL,
  min_purchase_amount INTEGER NOT NULL,
  max_discount INTEGER NOT NULL,
  emi_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  eligible_categories TEXT[] NOT NULL DEFAULT '{}',
  eligible_merchants TEXT[] NOT NULL DEFAULT '{}',
  exclusions TEXT[] NOT NULL DEFAULT '{}',
  valid_from DATE NOT NULL,
  valid_until DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE offer_conditions (
  id TEXT PRIMARY KEY,
  offer_id TEXT NOT NULL REFERENCES bank_offers(id) ON DELETE CASCADE,
  condition_key TEXT NOT NULL,
  condition_label TEXT NOT NULL,
  condition_value TEXT NOT NULL,
  requires_manual_verification BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  merchant TEXT NOT NULL,
  category TEXT NOT NULL,
  listed_price INTEGER NOT NULL,
  image_url TEXT NOT NULL,
  extraction_source TEXT NOT NULL,
  specs_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ai_analysis_results (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  transaction_id TEXT,
  source_url TEXT NOT NULL,
  used_fallback BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason TEXT,
  product_understanding_json JSONB NOT NULL,
  parsed_offers_json JSONB NOT NULL,
  shopper_explanation TEXT NOT NULL,
  uncertainties TEXT[] NOT NULL DEFAULT '{}',
  model_used TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  status transaction_status_enum NOT NULL DEFAULT 'CREATED',
  shopper_id TEXT NOT NULL REFERENCES users(id),
  provider_id TEXT REFERENCES provider_profiles(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  offer_id TEXT REFERENCES bank_offers(id),
  listed_price INTEGER NOT NULL,
  bank_discount INTEGER NOT NULL DEFAULT 0,
  card_charge_amount INTEGER NOT NULL DEFAULT 0,
  provider_reward INTEGER NOT NULL DEFAULT 0,
  platform_fee INTEGER NOT NULL DEFAULT 0,
  mandate_amount INTEGER NOT NULL DEFAULT 0,
  shopper_savings INTEGER NOT NULL DEFAULT 0,
  delivery_info_json JSONB,
  ai_recommendation_explanation TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE savings_comparisons (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  offer_id TEXT NOT NULL REFERENCES bank_offers(id),
  eligibility_status TEXT NOT NULL,
  condition_checks_json JSONB NOT NULL,
  original_price INTEGER NOT NULL,
  actual_discount INTEGER NOT NULL,
  card_charge_amount INTEGER NOT NULL,
  provider_reward INTEGER NOT NULL,
  perklink_fee INTEGER NOT NULL,
  shopper_final_amount INTEGER NOT NULL,
  shopper_net_savings INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE provider_matches (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id),
  card_metadata_id TEXT NOT NULL REFERENCES card_product_metadata(id),
  offer_id TEXT NOT NULL REFERENCES bank_offers(id),
  match_score INTEGER NOT NULL,
  score_breakdown_json JSONB NOT NULL,
  ai_rationale TEXT NOT NULL,
  is_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE purchase_requests (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  provider_id TEXT NOT NULL REFERENCES provider_profiles(id),
  card_metadata_id TEXT NOT NULL REFERENCES card_product_metadata(id),
  offered_reward INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  responded_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE upi_mandates (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  mandate_ref TEXT NOT NULL,
  shopper_vpa_masked TEXT NOT NULL,
  beneficiary_arrangement TEXT NOT NULL,
  amount INTEGER NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'ONE_TIME',
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  authorised_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  terms_accepted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE merchant_orders (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  merchant_order_id TEXT NOT NULL,
  payment_gateway_tx_id TEXT NOT NULL,
  merchant_name TEXT NOT NULL,
  payer_display_label TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  pin_code TEXT NOT NULL,
  delivery_instructions TEXT,
  expected_delivery_date TEXT NOT NULL,
  integration_mode TEXT NOT NULL DEFAULT 'SIMULATED_SEPARATED_IDENTITY',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoice_documents (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  uploaded_by_user_id TEXT NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  payment_evidence_ref TEXT NOT NULL,
  demo_preset_id TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE verification_results (
  id TEXT PRIMARY KEY,
  invoice_id TEXT NOT NULL UNIQUE REFERENCES invoice_documents(id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  ocr_provider TEXT NOT NULL,
  extracted_invoice_number TEXT NOT NULL,
  extracted_merchant TEXT NOT NULL,
  extracted_order_id TEXT NOT NULL,
  extracted_product_name TEXT NOT NULL,
  extracted_amount INTEGER NOT NULL,
  extracted_tax INTEGER NOT NULL,
  extracted_purchase_date TEXT NOT NULL,
  discrepancies_json JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL,
  review_notes TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE delivery_events (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  merchant_order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  description TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  actor TEXT NOT NULL
);

CREATE TABLE settlement_records (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
  partner_ref TEXT NOT NULL,
  buyer_mandate_amount INTEGER NOT NULL,
  provider_card_charge INTEGER NOT NULL,
  provider_reward INTEGER NOT NULL,
  provider_total_payout INTEGER NOT NULL,
  platform_fee INTEGER NOT NULL,
  refund_amount INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_ELIGIBILITY',
  partner_name TEXT NOT NULL DEFAULT 'Paytm PerkLink Escrow Simulation',
  settled_at TIMESTAMPTZ
);

CREATE TABLE refund_records (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL,
  initiated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  transaction_id TEXT REFERENCES transactions(id) ON DELETE SET NULL,
  actor_user_id TEXT NOT NULL,
  actor_role user_role_enum NOT NULL,
  action TEXT NOT NULL,
  from_state transaction_status_enum,
  to_state transaction_status_enum,
  metadata_json JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tx_status ON transactions(status);
CREATE INDEX idx_tx_shopper ON transactions(shopper_id);
CREATE INDEX idx_tx_provider ON transactions(provider_id);
CREATE INDEX idx_audit_tx ON audit_logs(transaction_id);

