export default async function handler(req, res) {
  const symbol = (req.query.symbol || "PLAY").toUpperCase();
  const API_KEY = process.env.ALPHA_VANTAGE_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "HW1PGZHEQTKQLR7Z" });
  }

  const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${symbol}&apikey=${API_KEY}`;

  try {
    const r = await fetch(url);
    const data = await r.json();

    if (data.Note || data["Error Message"]) {
      return res.status(429).json(data);
    }

    res.setHeader("Cache-Control", "s-maxage=60"); // cache 1 min
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
