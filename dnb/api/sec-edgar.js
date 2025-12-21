export default async function handler(req, res) {
  try {
    const ticker = String(req.query.ticker || "PLAY").trim().toUpperCase();
    const formsParam = String(req.query.forms || "10-K,10-Q,8-K").trim().toUpperCase();
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 25)));

    const wanted = new Set(formsParam.split(",").map(s => s.trim()).filter(Boolean));

    const SEC_HEADERS = {
      // MUST be descriptive + include real contact email:
      "User-Agent": "Orion EDGAR Tool (contact: you@yourdomain.com)",
      "Accept": "application/json"
    };

    const fetchJSON = async (url) => {
      const r = await fetch(url, { headers: SEC_HEADERS });
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
      return await r.json();
    };

    const padCIK = (cik) => String(cik).replace(/^0+/, "").padStart(10, "0");
    const stripDashes = (acc) => String(acc).replace(/-/g, "");

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
        primaryUrl: `https://www.sec.gov/Archives/edgar/data/${Number(cik10)}/${accNoDash}/${primaryDoc}`
      });

      if (rows.length >= limit) break;
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json({
      ticker,
      cik10,
      company: sub.name || hit.title || ticker,
      rows
    });
  } catch (e) {
    return res.status(500).json({ error: e.message || String(e) });
  }
}
