const http = require('http');

async function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(`http://localhost:3000${path}`, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });
    req.on('error', reject);
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function run() {
  console.log('--- 1. Resetting database ---');
  const resetRes = await request('/api/demo/reset', { method: 'POST' });
  console.log('Reset response:', resetRes.status);

  console.log('\n--- 2. Login as Shopper (Rahul) ---');
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'rahul.shopper@perklink.demo' },
  });
  const cookie = loginRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
  console.log('Login cookie received:', cookie ? 'YES' : 'NO');

  console.log('\n--- 3. Extract product & offers for Asus Laptop ---');
  const extractRes = await request('/api/ai/extract-product', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: { url: 'https://www.flipkart.com/asus-vivobook-16-laptop-16gb-512gb/p/itm99812demo' },
  });
  console.log('Extract status:', extractRes.status);
  const tx = extractRes.body.transaction;
  console.log('Created transaction ID:', tx.id);
  console.log('Eligible offers returned:', extractRes.body.savingsComparisons.length);

  // Check eligible offers
  for (const o of extractRes.body.savingsComparisons) {
    console.log(` - Offer: ${o.bankName} | ${o.offerTitle} | Savings: ₹${o.shopperNetSavings} | Status: ${o.eligibilityStatus}`);
    if (o.eligibilityStatus !== 'ELIGIBLE') {
      throw new Error(`Ineligible offer returned: ${o.offerTitle}`);
    }
  }

  console.log('\n--- 4. Verify Provider Matching for SBI Offer ---');
  const sbiOffer = extractRes.body.savingsComparisons.find(o => o.bankName === 'SBI');
  if (!sbiOffer) throw new Error('SBI offer not found');

  const selectSbiRes = await request(`/api/transactions/${tx.id}/select-offer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: { offerId: sbiOffer.offerId },
  });
  console.log('Select SBI offer status:', selectSbiRes.status);

  const shopperTxRes = await request(`/api/transactions/${tx.id}`, {
    headers: { Cookie: cookie },
  });
  const shopperData = shopperTxRes.body.data;
  const sbiMatches = shopperData.providerMatches;
  console.log(`Matched SBI providers count: ${sbiMatches.length}`);
  if (sbiMatches.length < 6) {
    throw new Error(`Expected at least 6 SBI providers, got ${sbiMatches.length}`);
  }

  sbiMatches.forEach((pm, idx) => {
    console.log(` [Match ${idx + 1}] Alias: "${pm.providerAlias}", Bank: ${pm.bankName}, Card: ${pm.cardProduct}, Score: ${pm.matchScore}, Rating: ${pm.rating}★, Orders: ${pm.completedOrders}, Speed: ~${pm.avgAcceptanceMinutes}m`);
    if (!pm.providerAlias.startsWith('Provider ')) {
      throw new Error(`Provider alias not masked: ${pm.providerAlias}`);
    }
    if (pm.bankName !== 'SBI') {
      throw new Error(`Unrelated bank in SBI match: ${pm.bankName}`);
    }
    if (pm.aiRationale.includes('Arjun') || pm.aiRationale.includes('Neha') || pm.aiRationale.includes('Rohit')) {
      throw new Error(`PII leaked in aiRationale: ${pm.aiRationale}`);
    }
  });

  console.log('\n--- 5. Verify Masked Selection Persistence & Dispatch ---');
  const selectedProvider = sbiMatches[1]; // Provider 02
  console.log(`Selecting ${selectedProvider.providerAlias} (key: ${selectedProvider.providerId}::${selectedProvider.cardMetadataId})`);

  // Submit delivery info
  const delRes = await request(`/api/transactions/${tx.id}/delivery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: {
      recipientName: 'Rahul Sharma',
      mobileNumber: '+91 98100 44321',
      shippingAddress: 'Flat 402, Lake View Residency, Madhapur, Hyderabad',
      pinCode: '500081',
      city: 'Hyderabad',
      deliveryInstructions: 'Call on arrival',
    },
  });
  console.log('Delivery submit status:', delRes.status);

  // Submit request provider with masked key
  const reqProvRes = await request(`/api/transactions/${tx.id}/request-provider`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: {
      providerId: selectedProvider.providerId,
      cardMetadataId: selectedProvider.cardMetadataId,
    },
  });
  console.log('Request provider status:', reqProvRes.status);
  const updatedTx = reqProvRes.body.data;
  console.log('Updated Tx status:', updatedTx.transaction.status);
  console.log('Shopper projected provider profile alias:', updatedTx.providerProfile?.displayAlias);
  if (!updatedTx.providerProfile?.displayAlias?.startsWith('Provider ')) {
    throw new Error(`Provider alias not masked in shopper view: ${updatedTx.providerProfile?.displayAlias}`);
  }

  console.log('\n--- 6. Verify Admin Ops Visibility (Real Provider Identity) ---');
  const adminLoginRes = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: { email: 'admin@perklink.demo' },
  });
  const adminCookie = adminLoginRes.headers['set-cookie']?.[0]?.split(';')[0] || '';
  console.log('Admin login cookie received:', adminCookie ? 'YES' : 'NO');
  const adminTxRes = await request(`/api/transactions/${tx.id}`, {
    headers: { Cookie: adminCookie },
  });
  const adminData = adminTxRes.body.data;
  console.log('Admin Tx status:', adminData.transaction.status);
  console.log('Admin internal provider ID:', adminData.transaction.providerId);
  console.log('Admin provider display alias:', adminData.providerProfile?.displayAlias);
  if (!adminData.transaction.providerId?.startsWith('prov-')) {
    throw new Error(`Admin should see real internal providerId, got: ${adminData.transaction.providerId}`);
  }

  console.log('\n--- 7. Verify HDFC Offer Matching (6 Providers) ---');
  const hdfcOffer = extractRes.body.savingsComparisons.find(o => o.bankName === 'HDFC');
  if (hdfcOffer) {
    const selectHdfcRes = await request(`/api/transactions/${tx.id}/select-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: { offerId: hdfcOffer.offerId },
    });
    const hdfcMatches = selectHdfcRes.body.data.providerMatches;
    console.log(`Matched HDFC providers count: ${hdfcMatches.length}`);
    if (hdfcMatches.length < 6) {
      throw new Error(`Expected at least 6 HDFC providers, got ${hdfcMatches.length}`);
    }
    hdfcMatches.forEach(pm => {
      if (pm.bankName !== 'HDFC') throw new Error(`Non-HDFC bank in HDFC match: ${pm.bankName}`);
      if (!pm.providerAlias.startsWith('Provider ')) throw new Error(`HDFC provider not masked: ${pm.providerAlias}`);
    });
    console.log('All 6 HDFC providers matched & masked correctly!');
  }

  console.log('\n--- 8. Verify Axis Offer Matching (6 Providers) ---');
  const axisOffer = extractRes.body.savingsComparisons.find(o => o.bankName === 'Axis');
  if (axisOffer) {
    const selectAxisRes = await request(`/api/transactions/${tx.id}/select-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: { offerId: axisOffer.offerId },
    });
    const axisMatches = selectAxisRes.body.data.providerMatches;
    console.log(`Matched Axis providers count: ${axisMatches.length}`);
    if (axisMatches.length < 6) {
      throw new Error(`Expected at least 6 Axis providers, got ${axisMatches.length}`);
    }
    axisMatches.forEach(pm => {
      if (pm.bankName !== 'Axis') throw new Error(`Non-Axis bank in Axis match: ${pm.bankName}`);
      if (!pm.providerAlias.startsWith('Provider ')) throw new Error(`Axis provider not masked: ${pm.providerAlias}`);
    });
    console.log('All 6 Axis providers matched & masked correctly!');
  }

  console.log('\n--- 9. Verify UI HTML & Route Output ---');
  const offersPageRes = await request(`/shopper/offers?txId=${tx.id}`, {
    headers: { Cookie: cookie },
  });
  console.log('Offers page HTTP status:', offersPageRes.status);
  const html = typeof offersPageRes.body === 'string' ? offersPageRes.body : JSON.stringify(offersPageRes.body);
  if (html.includes('Deterministic Bank Offer & Savings Comparison') || html.includes('Deterministic Bank Offer &amp; Savings Comparison')) {
    throw new Error('Deterministic Bank Offer & Savings Comparison was found in the page!');
  }
  console.log('Deterministic Bank Offer & Savings Comparison confirmed removed from UI!');

  console.log('\n🎉 ALL 9 VERIFICATION CHECKS PASSED PERFECTLY!');
}

run().catch((err) => {
  console.error('\n❌ Verification failed:', err);
  process.exit(1);
});
