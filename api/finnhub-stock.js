// /api/finnhub-stock.js
export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase().trim();
  const token = process.env.FINNHUB_API_KEY;

  if (!token) return res.status(500).json({ error: "Missing FINNHUB_API_KEY" });

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
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
    return j;
  };

  try {
    const now = new Date();
    const from7d = new Date(now.getTime() - 7 * 864e5);

    const [
      quote,
      profile,
      metricAll,
      news,
      earningsSeries,
      recommendation,
      priceTarget
    ] = await Promise.all([
      get(build("/quote")),
      get(build("/stock/profile2")),
      get(build("/stock/metric", { metric: "all" })),
      get(build("/company-news", {
        from: from7d.toISOString().slice(0, 10),
        to: now.toISOString().slice(0, 10)
      })),
      // company earnings history (used for "last")
      get(build("/stock/earnings", { limit: 8 })).catch(() => []),
      // analyst recommendation trend (used for buy/hold/sell)
      get(build("/stock/recommendation")).catch(() => []),
      // analyst price target
      get(build("/stock/price-target")).catch(() => ({}))
    ]);

    const m = metricAll?.metric || {};

    // -------- Earnings (next + last) --------
    // Finnhub doesn’t always provide a reliable "next earnings date" on this endpoint,
    // so we compute "last" from earningsSeries and leave next as null unless you later
    // wire another source.
    const lastEarn = Array.isArray(earningsSeries) && earningsSeries.length
      ? earningsSeries[0]
      : null;

    const earnings = {
      next: null, // optional: wire later if you add a "next earnings" source
      last: lastEarn
        ? {
            period: lastEarn.period || lastEarn.quarter || "—",
            actual: lastEarn.actual ?? null,
            estimate: lastEarn.estimate ?? null,
            surprisePercent: lastEarn.surprisePercent ?? null
          }
        : null
    };

    // -------- Analyst (recommendation + target) --------
    const rec0 = Array.isArray(recommendation) && recommendation.length ? recommendation[0] : null;

    const analyst = {
      recommendation: rec0
        ? {
            period: rec0.period || "",
            buy: rec0.buy ?? 0,
            hold: rec0.hold ?? 0,
            sell: rec0.sell ?? 0
          }
        : null,
      priceTarget: {
        targetMean: priceTarget?.targetMean ?? null
      }
    };

    // -------- Fundamentals + Market (TTM + context) --------
    const fundamentalsTTM = {
      revenueTTM: m.revenueTTM ?? null,
      ebitdaTTM: m.ebitdaTTM ?? null,
      evEbitdaTTM: m.evEbitdaTTM ?? null,
      peTTM: m.peTTM ?? null,
      epsTTM: m.epsTTM ?? null,
      netDebtTTM: m.netDebtTTM ?? null,
      freeCashFlowTTM: m.freeCashFlowTTM ?? null
    };

    const market = {
      week52High: m["52WeekHigh"] ?? m.week52High ?? null,
      week52Low: m["52WeekLow"] ?? m.week52Low ?? null,
      avgVolume30d: m["10DayAverageTradingVolume"] ?? m.avgVolume30d ?? null,
      sharesOutstanding: profile?.shareOutstanding ?? null, // usually millions
      marketCap: profile?.marketCapitalization ?? null      // usually millions
    };

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

      earnings,
      analyst,
      fundamentalsTTM,
      market,

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
    res.status(500).json({ error: String(e?.message || e) });
  }
}
