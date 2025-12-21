// /api/finnhub-candles.js
export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "PLAY").trim().toUpperCase();
  const token = process.env.FINNHUB_API_KEY;

  if (!token) {
    return res.status(500).json({ error: "Missing FINNHUB_API_KEY" });
  }

  // Finnhub: 1, 5, 15, 30, 60, D, W, M
  const resolution = String(req.query.resolution || "D").trim().toUpperCase();
  const allowed = new Set(["1", "5", "15", "30", "60", "D", "W", "M"]);
  if (!allowed.has(resolution)) {
    return res.status(400).json({ error: `Invalid resolution: ${resolution}` });
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const defaultFrom = nowSec - 180 * 86400;

  const fromSec = Number(req.query.from) || defaultFrom;
  const toSec = Number(req.query.to) || nowSec;

  if (!Number.isFinite(fromSec) || !Number.isFinite(toSec) || fromSec >= toSec) {
    return res.status(400).json({ error: "Invalid from/to range" });
  }

  try {
    const u = new URL("https://finnhub.io/api/v1/stock/candle");
    u.searchParams.set("symbol", symbol);
    u.searchParams.set("resolution", resolution);
    u.searchParams.set("from", String(Math.floor(fromSec)));
    u.searchParams.set("to", String(Math.floor(toSec)));
    u.searchParams.set("token", token);

    const r = await fetch(u.toString(), {
      headers: { Accept: "application/json" },
    });

    // Safely parse json OR fall back to text
    const raw = await r.text();
    let j = null;
    try {
      j = raw ? JSON.parse(raw) : null;
    } catch {
      // keep j as null
    }

    console.log("Finnhub candles:", {
      status: r.status,
      symbol,
      resolution,
      from: fromSec,
      to: toSec,
      bodyPreview: raw?.slice?.(0, 200),
    });

    if (!r.ok) {
      // Finnhub often returns { error: "..." }, but sometimes not JSON
      const msg = (j && (j.error || j.message)) || raw || `HTTP ${r.status}`;
      return res.status(r.status).json({ error: String(msg) });
    }

    // Finnhub returns: { s:"ok"|"no_data", t:[], c:[], o:[], h:[], l:[], v:[] }
    // Treat no_data as a valid 200 response so frontend can show a friendly message
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");

    return res.status(200).json({
      symbol,
      resolution,
      from: Math.floor(fromSec),
      to: Math.floor(toSec),
      candles: j,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
