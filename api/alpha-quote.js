export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase();
  const API_KEY = process.env.ALPHA_VANTAGE_KEY;

  if (!API_KEY) return res.status(500).json({ error: "Missing Alpha Vantage API key" });

  const base = "https://www.alphavantage.co/query";

  const qUrl = `${base}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  const oUrl = `${base}?function=OVERVIEW&symbol=${encodeURIComponent(symbol)}&apikey=${API_KEY}`;
  const iUrl = `${base}?function=TIME_SERIES_INTRADAY&symbol=${encodeURIComponent(symbol)}&interval=1min&outputsize=compact&apikey=${API_KEY}`;


  try {
    const [qr, or, ir] = await Promise.all([fetch(qUrl), fetch(oUrl), fetch(iUrl)]);
    const [qData, oData, iData] = await Promise.all([qr.json(), or.json(), ir.json()]);

    // Alpha Vantage throttling / errors
    const err = qData.Note || qData.Information || qData["Error Message"] || oData.Note || oData.Information || oData["Error Message"] || iData.Note || iData.Information || iData["Error Message"];
    if (err) return res.status(429).json({ error: String(err) });

    const quote = qData["Global Quote"] || {};
    const overview = oData || {};

    // Pull latest intraday bar (first key is most recent)
    const series = iData["Time Series (1min)"] || {};
    const latestTs = Object.keys(series)[0];
    const latestBar = latestTs ? series[latestTs] : null;

    const combined = {
      symbol,
      asOf: latestTs || null,
      price: quote["05. price"] || null,
      change: quote["09. change"] || null,
      changePercent: quote["10. change percent"] || null,
      latestTradingDay: quote["07. latest trading day"] || null,

      previousClose: quote["08. previous close"] || null,
      open: quote["02. open"] || null,
      high: quote["03. high"] || null,
      low: quote["04. low"] || null,
      volume: quote["06. volume"] || null,

      // Fundamentals (OVERVIEW)
      name: overview.Name || null,
      marketCap: overview.MarketCapitalization || null,
      beta: overview.Beta || null,
      peRatioTTM: overview.PERatio || null,
      epsTTM: overview.EPS || null,
      week52High: overview["52WeekHigh"] || null,
      week52Low: overview["52WeekLow"] || null,
      avgVolume: overview["AverageVolume"] || null,

      // “closest minute snapshot” (optional nice-to-have)
      intraday: latestBar
        ? {
            open: latestBar["1. open"],
            high: latestBar["2. high"],
            low: latestBar["3. low"],
            close: latestBar["4. close"],
            volume: latestBar["5. volume"],
          }
        : null,

      // Explicitly mark unsupported Yahoo-style fields
      unsupported: {
        bidAsk: null,
        afterHours: null,
        earningsDate: null,
        oneYearTarget: null,
      },
    };

    // Cache at the edge for 60s
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return res.status(200).json(combined);
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
