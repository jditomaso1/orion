export default async function handler(req, res) {
  // Optional: only allow GET
  if (req.method && req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const ticker = String(req.query.ticker || "PLAY").trim().toUpperCase();
    const formsParam = String(req.query.forms || "10-K,10-Q,8-K").trim().toUpperCase();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 25)));
    const wanted = new Set(formsParam.split(",").map((s) => s.trim()).filter(Boolean));

    // IMPORTANT: put a REAL email you control here.
    const USER_AGENT = "Orion EDGAR Tool (contact: your-real-email@domain.com)";

    const SEC_HEADERS = {
      "User-Agent": USER_AGENT,
      "Accept": "application/json",
      // These help avoid some edge/proxy weirdness:
      "Accept-Language": "en-US,en;q=0.9",
      "Connection": "keep-alive",
    };

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    async function fetchJSON(url) {
      // Basic retry for SEC rate limits / transient failures
      const maxAttempts = 3;
      let lastErr = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await fetch(url, { headers: SEC_HEADERS });

          // SEC commonly rate-limits
          if (r.status === 429) {
            const retryAfter = Number(r.headers.get("retry-after") || 0);
            const backoff = retryAfter ? retryAfter * 1000 : 400 * attempt;
            await sleep(backoff);
            continue;
          }

          // Helpful error text (SEC sometimes returns HTML)
          if (!r.ok) {
            const text = await r.text().catch(() => "");
            throw new Error(`HTTP ${r.status} for ${url}${text ? ` — ${text.slice(0, 180)}` : ""}`);
          }

          return await r.json();
        } catch (e) {
          lastErr = e;
          // small backoff before retrying non-429 transient errors
          if (attempt < maxAttempts) await sleep(250 * attempt);
        }
      }

      throw lastErr || new Error("Fetch failed");
    }

    const padCIK = (cik) => String(cik).replace(/^0+/, "").padStart(10, "0");
    const stripDashes = (acc) => String(acc).replace(/-/g, "");

    if (!ticker) return res.status(400).json({ error: "Missing ticker" });

    // 1) Ticker -> CIK
    const mapUrl = "https://www.sec.gov/files/company_tickers.json";
    const mapping = await fetchJSON(mapUrl);

    let hit = null;
    for (const k of Object.keys(mapping)) {
      if ((mapping[k].ticker || "").toUpperCase() === ticker) {
        hit = mapping[k];
        break;
      }
    }
    if (!hit) {
      return res.status(404).json({ error: `Could not find CIK for ticker: ${ticker}` });
    }

    const cik10 = padCIK(hit.cik_str);

    // 2) Submissions
    const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
    const sub = await fetchJSON(subUrl);

    const recent = sub?.filings?.recent;
    if (!recent) return res.status(502).json({ error: "SEC submissions JSON missing filings.recent" });

    const forms = recent.form || [];
    const dates = recent.filingDate || [];
    const accessions = recent.accessionNumber || [];
    const primaryDocs = recent.primaryDocument || [];

    const rows = [];
    for (let i = 0; i < forms.length; i++) {
      const form = String(forms[i] || "").toUpperCase();
      if (!(wanted.has("ALL") || wanted.has(form))) continue;

      const accession = accessions[i];
      const primaryDoc = primaryDocs[i];
      if (!accession || !primaryDoc) continue;

      const accNoDash = stripDashes(accession);

      rows.push({
        filed: dates[i] || null,
        form,
        accession,
        indexUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik10)}/${accNoDash}/${accession}-index.html`,
        primaryUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik10)}/${accNoDash}/${primaryDoc}`,
      });

      if (rows.length >= limit) break;
    }

    // Cache on the edge a bit; SEC data doesn’t need to be real-time to the second
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

    return res.status(200).json({
      ticker,
      cik10,
      company: sub.name || hit.title || ticker,
      rows,
    });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
