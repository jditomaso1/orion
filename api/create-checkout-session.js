const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  // Allow preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  // Allow GET (browser) and POST (proper API usage)
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID; // put your Price ID here as env var
  const successUrl = process.env.STRIPE_SUCCESS_URL || 'https://orion.private-credit.ai/?success=1';
  const cancelUrl  = process.env.STRIPE_CANCEL_URL  || 'https://orion.private-credit.ai/?canceled=1';

  if (!secretKey) return res.status(500).json({ error: 'Missing STRIPE_SECRET_KEY' });
  if (!priceId)   return res.status(500).json({ error: 'Missing STRIPE_PRICE_ID' });

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' });

  try {
    // If POST, accept optional JSON body (quantity, etc.)
    let quantity = 1;
    if (req.method === 'POST') {
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString('utf8') || '{}';
        const body = JSON.parse(raw);
        if (Number.isInteger(body.quantity) && body.quantity > 0) quantity = body.quantity;
      } catch (_) {}
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    // Browser-friendly: redirect on GET, return JSON on POST
    if (req.method === 'GET') {
      res.writeHead(302, { Location: session.url });
      return res.end();
    }

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || 'Stripe session creation failed',
      type: err?.type,
      code: err?.code,
    });
  }
};
