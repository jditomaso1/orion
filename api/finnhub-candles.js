// /api/finnhub-candles.js
// Uses Stooq free daily OHLCV as a fallback, but returns Finnhub-like shape.

function toUnix(dateStr) {
  // dateStr like "2025-12-20"
  const d = new Date(dateStr + "T00:00:00Z");
  return Math.floor(d.getTime() / 1000);
}

function parseCsv(csv) {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  // Stooq header: Date,Open,High,Low,Close,Volume
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    if (row.length < 6) continue;

    const [DateStr, Open, High, Low, Close, Volume] = row;
    const t = toUnix(DateStr);

    const o = Number(Open), h = Number(High), l = Number(Low), c = Number(Close), v = Number(Volume);
    if (![o,h,l,c].every(Number.isFinite)) continue;

    out.push({ t, o, h, l, c, v: Number.isFinite(v) ? v : 0 });
  }
  return out;
}

export default async function handler(req, res) {
  const symbol = String(req.query.symbol || "PLAY").trim().toUpperCase();

  // Stooq expects lower + market suffix for US stocks
  // Example: PLAY -> play.us
  const stooqSymbol = symbol.toLowerCase() + ".us";

  // Optional filtering (your frontend currently doesn’t pass from/to)
  const nowSec = Math.floor(Date.now() / 1000);
  const defaultFrom = nowSec - 180 * 86400; // ~6 months
  const fromSec = Number(req.query.from) || defaultFrom;
  const toSec = Number(req.query.to) || nowSec;

  try {
    const u = new URL("https://stooq.com/q/d/l/");
    u.searchParams.set("s", stooqSymbol);
    u.searchParams.set("i", "d");

    const r = await fetch(u.toString(), { headers: { Accept: "text/csv" } });
    const raw = await r.text();

    if (!r.ok) {
      return res.status(r.status).json({ error: raw || `HTTP ${r.status}` });
    }

    const rows = parseCsv(raw)
      .filter(x => x.t >= Math.floor(fromSec) && x.t <= Math.floor(toSec));

    if (!rows.length) {
      res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
      return res.status(200).json({
        symbol,
        resolution: "D",
        from: Math.floor(fromSec),
        to: Math.floor(toSec),
        candles: { s: "no_data" },
      });
    }

    // Finnhub-like arrays
    const candles = {
      s: "ok",
      t: rows.map(x => x.t),
      o: rows.map(x => x.o),
      h: rows.map(x => x.h),
      l: rows.map(x => x.l),
      c: rows.map(x => x.c),
      v: rows.map(x => x.v),
    };

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      symbol,
      resolution: "D",
      from: Math.floor(fromSec),
      to: Math.floor(toSec),
      candles,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e?.message || e) });
  }
}
