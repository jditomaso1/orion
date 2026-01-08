const Stripe = require("stripe");

const PRICE_MAP = {
  starter: {
    monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    yearly: process.env.STRIPE_PRICE_STARTER_YEARLY,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
    yearly: process.env.STRIPE_PRICE_PRO_YEARLY,
  },
};

module.exports = async function handler(req, res) {
  // CORS / preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(204).end();
  }

  // Allow GET + POST only
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).send("Method Not Allowed");
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const successUrl =
    process.env.STRIPE_SUCCESS_URL || "https://orion.private-credit.ai/dnb/tear-sheet/tear-sheet.html/?success=1";
  const cancelUrl =
    process.env.STRIPE_CANCEL_URL || "https://orion.private-credit.ai/dnb/pricing/pricing.html/?canceled=1";

  if (!secretKey) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  const stripe = new Stripe(secretKey, { apiVersion: "2024-06-20" });

  try {
    // Read tier/interval from query (GET) or body (POST)
    let tier = "starter";
    let interval = "monthly";
    let quantity = 1;

    if (req.method === "GET") {
      tier = (req.query?.tier || tier).toString();
      interval = (req.query?.interval || interval).toString();
    } else {
      // POST: parse JSON body manually (matches your current pattern)
      let body = {};
      try {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        body = JSON.parse(raw);
      } catch (_) {}

      tier = (body.tier || tier).toString();
      interval = (body.interval || interval).toString();
      if (Number.isInteger(body.quantity) && body.quantity > 0) quantity = body.quantity;
    }

    const priceId = PRICE_MAP?.[tier]?.[interval];
    if (!priceId) {
      return res.status(400).json({
        error: `Invalid selection: tier=${tier}, interval=${interval}`,
      });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity }],
      success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl,
      allow_promotion_codes: true,
    });

    // GET → redirect, POST → JSON
    if (req.method === "GET") {
      res.writeHead(303, { Location: session.url });
      return res.end();
    }

    return res.status(200).json({ url: session.url, id: session.id });
  } catch (err) {
    return res.status(500).json({
      error: err?.message || "Stripe session creation failed",
      type: err?.type,
      code: err?.code,
    });
  }
};
