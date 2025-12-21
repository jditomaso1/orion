export default async function handler(req, res) {
  const symbol = (req.query.symbol || "AAPL").toUpperCase().trim();

  // Yahoo quote endpoint (unofficial, but commonly used)
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`;

  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json",
        "Referer": "https://finance.yahoo.com/",
        "Origin": "https://finance.yahoo.com"
      }
    });

    if (!r.ok) {
      return res.status(r.status).json({ error: `Yahoo HTTP ${r.status}` });
    }

    const j = await r.json();
    const q = j?.quoteResponse?.result?.[0];

    if (!q) {
      return res.status(404).json({ error: `No quote found for ${symbol}` });
    }

    const combined = {
      symbol: q.symbol || symbol,
      name: q.longName || q.shortName || null,

      asOf: q.regularMarketTime
        ? new Date(q.regularMarketTime * 1000).toISOString()
        : null,

      price: q.regularMarketPrice ?? null,
      change: q.regularMarketChange ?? null,
      changePercent:
        q.regularMarketChangePercent != null
          ? `${q.regularMarketChangePercent.toFixed(2)}%`
          : null,

      previousClose: q.regularMarketPreviousClose ?? null,
      open: q.regularMarketOpen ?? null,
      high: q.regularMarketDayHigh ?? null,
      low: q.regularMarketDayLow ?? null,
      volume: q.regularMarketVolume ?? null,

      marketCap: q.marketCap ?? null,
      peRatioTTM: q.trailingPE ?? null,
      epsTTM: q.epsTrailingTwelveMonths ?? null,
      week52High: q.fiftyTwoWeekHigh ?? null,
      week52Low: q.fiftyTwoWeekLow ?? null,
      avgVolume: q.averageDailyVolume3Month ?? null,

      unsupported: {
        bidAsk: null,
        afterHours: q.postMarketPrice ?? null,
        earningsDate: null,
        oneYearTarget: q.targetMeanPrice ?? null,
      },
    };

    // Cache at the edge for 60s
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(combined);
  } catch (e) {
    return res.status(500).json({ error: e?.message || "Unknown error" });
  }
}
