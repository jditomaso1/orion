import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICE_MAP = {
  "Starter:monthly": "price_1Sn83ICmHjC5cbxxxIaJwjB5",
  "Starter:annual":  "price_1Sn81TCmHjC5cbxxl744a24o",
  "Pro:monthly":     "price_1Sn81uCmHjC5cbxxu7g09mGc",
  "Pro:annual":      "price_1Sn82RCmHjC5cbxxIIBI5pOy",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

  try {
    const { plan, billing, email, name, company } = req.body || {};
    const key = `${plan}:${billing}`;
    const price_id = PRICE_MAP[key];

    if (!price_id) return res.status(400).json({ error: `Invalid plan/billing: ${key}` });
    if (!email) return res.status(400).json({ error: "Missing email" });

    // Build absolute URLs from the current host
    const origin = req.headers.origin || `https://${req.headers.host}`;

    const success_url = `${origin}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancel_url  = `${origin}/dnb/pricing/pricing.html`;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: price_id, quantity: 1 }],
      customer_email: email,
      success_url,
      cancel_url,
      metadata: {
        plan: plan || "",
        billing: billing || "",
        name: name || "",
        company: company || "",
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return res.status(500).json({ error: "Checkout session failed" });
  }
}
