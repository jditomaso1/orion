// /api/finnhub-stock.js
export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase().trim();
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    return res.status(500).json({ error: "Missing FINNHUB_API_KEY" });
  }

  const base = "https://finnhub.io/api/v1";

  const build = (path, params = {}) => {
    const u = new URL(base + path);
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("token", token);
    Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, String(v)));
    return u.toString();
  };

  const get = async (url) => {
    const r = await fetch(url);
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  };

  try {
    const now = new Date();
    const from = new Date(now.getTime() - 7 * 864e5);

    const [quote, profile, metricAll, news] = await Promise.all([
      get(build("/quote")),
      get(build("/stock/profile2")),
      get(build("/stock/metric", { metric: "all" })),
      get(build("/company-news", {
        from: from.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10)
      }))
    ]);

    const m = metricAll?.metric || {};

    res.status(200).json({
      symbol,
      name: profile?.name || symbol,
      exchange: profile?.exchange || "",
      industry: profile?.finnhubIndustry || "",

      quote: {
        price: quote?.c ?? null,
        change: quote?.d ?? null,
        changePercent: quote?.dp ?? null,
        high: quote?.h ?? null,
        low: quote?.l ?? null,
        open: quote?.o ?? null,
        previousClose: quote?.pc ?? null,
        asOfUnix: Math.floor(Date.now() / 1000)
      },

      valuation: {
        peTTM: m.peTTM ?? null,
        evEbitdaTTM: m.evEbitdaTTM ?? null,
        epsTTM: m.epsTTM ?? null,
        marketCap: profile?.marketCapitalization ?? null
      },

      news: Array.isArray(news)
        ? news
            .filter(n => n?.headline && n?.url)
            .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
            .slice(0, 5)
            .map(n => ({
              headline: n.headline,
              source: n.source || "",
              datetime: n.datetime || null,
              url: n.url
            }))
        : []
    });

  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
