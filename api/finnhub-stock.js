// /api/finnhub-stock.js
export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase().trim();
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    return res.status(500).json({ error: "Missing FINNHUB_API_KEY in environment variables." });
  }

  const base = "https://finnhub.io/api/v1";
  const u = (path, params = {}) => {
    const url = new URL(base + path);
    url.searchParams.set("symbol", symbol);
    url.searchParams.set("token", token);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
    return url.toString();
  };

  async function getJson(url) {
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    let data = null;
    try { data = await r.json(); } catch {}
    if (!r.ok) {
      const msg = (data && (data.error || data.message)) || `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // YYYY-MM-DD
  function iso(d) {
    return d.toISOString().slice(0, 10);
  }

  // date range for company-news (last 7 days)
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    // Run in parallel
    const [
      quote,
      profile,
      metricAll,
      recs,
      priceTarget,
      earningsCal,
      earnings,
      news
    ] = await Promise.all([
      getJson(u("/quote")),
      getJson(u("/stock/profile2")),
      getJson(u("/stock/metric", { metric: "all" })),
      getJson(u("/stock/recommendation")),
      getJson(u("/stock/price-target")),
      getJson(u("/calendar/earnings", { from: iso(now), to: iso(new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000)) })),
      getJson(u("/stock/earnings")),
      getJson(u("/company-news", { from: iso(from), to: iso(now) }))
    ]);

    const metric = metricAll && metricAll.metric ? metricAll.metric : {};

    // next earnings for this symbol (calendar endpoint returns array in `earningsCalendar`)
    let nextEarnings = null;
    const cal = earningsCal && earningsCal.earningsCalendar ? earningsCal.earningsCalendar : [];
    const match = cal.find(x => (x.symbol || "").toUpperCase() === symbol);
    if (match) {
      nextEarnings = {
        date: match.date || null,
        epsEstimate: match.epsEstimate ?? null,
        revenueEstimate: match.revenueEstimate ?? null
      };
    }

    // last earnings (stock/earnings is historical). pick most recent with actual + estimate if present
    let lastEarnings = null;
    if (Array.isArray(earnings) && earnings.length) {
      const sorted = [...earnings].sort((a, b) => String(b.period).localeCompare(String(a.period)));
      const e0 = sorted[0];
      lastEarnings = {
        period: e0.period || null,
        actual: e0.actual ?? null,
        estimate: e0.estimate ?? null,
        surprise: e0.surprise ?? null,
        surprisePercent: e0.surprisePercent ?? null
      };
    }

    // recommendation: take latest by period
    let analyst = null;
    if (Array.isArray(recs) && recs.length) {
      const latest = [...recs].sort((a, b) => String(b.period).localeCompare(String(a.period)))[0];
      analyst = {
        period: latest.period || null,
        buy: latest.buy ?? 0,
        hold: latest.hold ?? 0,
        sell: latest.sell ?? 0,
        strongBuy: latest.strongBuy ?? 0,
        strongSell: latest.strongSell ?? 0
      };
    }

    // news: keep top 5 clean fields
    const cleanNews = Array.isArray(news)
      ? news
          .filter(n => n && n.headline && n.url)
          .sort((a, b) => (b.datetime || 0) - (a.datetime || 0))
          .slice(0, 5)
          .map(n => ({
            headline: n.headline,
            source: n.source || "",
            datetime: n.datetime || null,
            url: n.url
          }))
      : [];

    // Build response
    const out = {
      symbol,
      name: profile?.name || profile?.ticker || "",
      exchange: profile?.exchange || "",
      industry: profile?.finnhubIndustry || "",
      ipo: profile?.ipo || null,
      logo: profile?.logo || null,

      quote: {
        price: quote?.c ?? null,
        change: quote?.d ?? null,
        changePercent: quote?.dp ?? null,
        high: quote?.h ?? null,
        low: quote?.l ?? null,
        open: quote?.o ?? null,
        previousClose: quote?.pc ?? null,
        asOfUnix: quote?.t ?? null
      },

      market: {
        week52High: metric["52WeekHigh"] ?? null,
        week52Low: metric["52WeekLow"] ?? null,
        week52HighDate: metric["52WeekHighDate"] ?? null,
        week52LowDate: metric["52WeekLowDate"] ?? null,
        avgVolume30d: metric["10DayAverageTradingVolume"] ?? metric["3MonthAverageTradingVolume"] ?? null,
        sharesOutstanding: profile?.shareOutstanding ?? null,
        marketCap: profile?.marketCapitalization ?? null
      },

      fundamentalsTTM: {
        peTTM: metric["peTTM"] ?? null,
        epsTTM: metric["epsTTM"] ?? null,
        evEbitdaTTM: metric["evEbitdaTTM"] ?? null,
        ebitdaTTM: metric["ebitdaTTM"] ?? null,
        revenueTTM: metric["revenueTTM"] ?? null,
        grossMarginTTM: metric["grossMarginTTM"] ?? null,
        operatingMarginTTM: metric["operatingMarginTTM"] ?? null,
        netMarginTTM: metric["netMarginTTM"] ?? null,
        freeCashFlowTTM: metric["freeCashFlowTTM"] ?? null,
        totalDebtTTM: metric["totalDebtTTM"] ?? null,
        netDebtTTM: metric["netDebtTTM"] ?? null
      },

      earnings: {
        next: nextEarnings,
        last: lastEarnings
      },

      analyst: {
        recommendation: analyst,
        priceTarget: {
          targetMean: priceTarget?.targetMean ?? null,
          targetHigh: priceTarget?.targetHigh ?? null,
          targetLow: priceTarget?.targetLow ?? null,
          targetMedian: priceTarget?.targetMedian ?? null
        }
      },

      news: cleanNews
    };

    return res.status(200).json(out);
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
