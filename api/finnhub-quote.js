export default async function handler(req, res) {
  const symbol = (req.query.symbol || "AAPL").toUpperCase();
  const API_KEY = process.env.FINNHUB_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "Missing Finnhub API key" });
  }

  try {
    const quoteUrl = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${API_KEY}`;
    const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${API_KEY}`;

    const [qr, pr] = await Promise.all([
      fetch(quoteUrl),
      fetch(profileUrl),
    ]);

    const q = await qr.json();
    const p = await pr.json();

    if (!q || q.c == null) {
      return res.status(404).json({ error: "No quote data" });
    }

    const combined = {
      symbol,
      name: p.name || null,
      asOf: new Date().toISOString(),

      price: q.c,
      change: q.d,
      changePercent: q.dp != null ? `${q.dp.toFixed(2)}%` : null,

      previousClose: q.pc,
      open: q.o,
      high: q.h,
      low: q.l,
      volume: null, // Finnhub quote endpoint doesn’t include volume

      marketCap: p.marketCapitalization || null,
      peRatioTTM: p.peRatio || null,
      epsTTM: p.eps || null,

      unsupported: {
        afterHours: q.pc !== q.c ? q.pc : null,
      },
    };

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(combined);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
