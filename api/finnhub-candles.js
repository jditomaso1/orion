// /api/finnhub-candles.js
export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase().trim();
  const token = process.env.FINNHUB_API_KEY;

  console.log("Finnhub key present:", token ? token.length : "MISSING");
  
  if (!token) {
    return res.status(500).json({ error: "FINNHUB_API_KEY is undefined" });
  }  

  // Supported: 1, 5, 15, 30, 60, D, W, M (Finnhub uses numeric resolution or string)
  const resolution = (req.query.resolution || "D").toString().trim();

  // Default: last 6 months of daily candles
  const nowSec = Math.floor(Date.now() / 1000);
  const fromSec = Number(req.query.from) || (nowSec - 180 * 86400);
  const toSec = Number(req.query.to) || nowSec;

  if (!token) return res.status(500).json({ error: "Missing FINNHUB_API_KEY" });

  try {
    const u = new URL("https://finnhub.io/api/v1/stock/candle");
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("resolution", resolution);
    u.searchParams.set("from", String(fromSec));
    u.searchParams.set("to", String(toSec));
    u.searchParams.set("token", token);

    const r = await fetch(u.toString());
    const j = await r.json()
        
    console.log("Finnhub candle status:", r.status, "body:", j);

    // Finnhub returns { s: "ok"|"no_data", t:[], c:[], o:[], h:[], l:[], v:[] }
    if (!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);

    res.status(200).json({
      symbol,
      resolution,
      from: fromSec,
      to: toSec,
      candles: j
    });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
}
