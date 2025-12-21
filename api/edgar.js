// /api/edgar.js (Vercel Serverless Function - Node)
// Handles: search, exhibits, ingest
// IMPORTANT: set USER_AGENT in Vercel env vars (Project Settings -> Environment Variables)

const TICKER_MAP_URL = "https://www.sec.gov/files/company_tickers.json";
const SUBMISSIONS_URL = (cik10) => `https://data.sec.gov/submissions/CIK${cik10}.json`;
const FOLDER_INDEX_JSON = (cikNoLead, accNoDash) =>
  `https://www.sec.gov/Archives/edgar/data/${cikNoLead}/${accNoDash}/index.json`;
const ARCHIVES_BASE = (cikNoLead, accNoDash, filename) =>
  `https://www.sec.gov/Archives/edgar/data/${cikNoLead}/${accNoDash}/${filename}`;

function secHeaders() {
  const ua = process.env.USER_AGENT || "OrionEdgarIngest/1.0 (contact: youremail@domain.com)";
  return {
    "User-Agent": ua,
    "Accept-Encoding": "gzip, deflate, br",
    "Accept": "application/json,text/html,*/*",
  };
}

async function fetchText(url) {
  const r = await fetch(url, { headers: secHeaders() });
  if (!r.ok) throw new Error(`SEC fetch failed ${r.status}: ${url}`);
  return await r.text();
}

async function fetchJson(url) {
  const r = await fetch(url, { headers: secHeaders() });
  if (!r.ok) throw new Error(`SEC fetch failed ${r.status}: ${url}`);
  return await r.json();
}

function cik10FromStr(cikStr) {
  const s = String(cikStr || "").replace(/\D/g, "");
  return s ? s.padStart(10, "0") : "";
}

function cikNoLeadFromCik10(cik10) {
  // EDGAR archives use no leading zeros
  return String(parseInt(cik10, 10));
}

function cleanHtmlToText(html) {
  // Minimal cleaner: strip scripts/styles, remove tags, normalize whitespace
  let s = html || "";
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  s = s.replace(/<\/(p|div|tr|li|h\d|br)>/gi, "\n");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/g, " ");
  s = s.replace(/&amp;/g, "&");
  s = s.replace(/&lt;/g, "<");
  s = s.replace(/&gt;/g, ">");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/[ \t]{2,}/g, " ");
  return s.trim();
}

function pickExhibitCandidates(items) {
  const out = [];
  const seen = new Set();
  for (const it of items || []) {
    const name = (it?.name || "").toLowerCase();
    if (!name) continue;
    const looksRelevant =
      ["ex10", "exhibit10", "ex-10", "ex_10", "credit", "loan", "revolving", "termloan"].some(k => name.includes(k));
    const goodExt = name.endsWith(".htm") || name.endsWith(".html") || name.endsWith(".txt");
    if (looksRelevant && goodExt && !seen.has(it.name)) {
      seen.add(it.name);
      out.push(it.name);
    }
  }
  return out;
}

function listRecentFilings(submissions, formFilter, limit) {
  const recent = submissions?.filings?.recent || {};
  const forms = recent.form || [];
  const accs = recent.accessionNumber || [];
  const filingDates = recent.filingDate || [];
  const primaryDocs = recent.primaryDocument || [];
  const reportDates = recent.reportDate || [];

  const cik10 = cik10FromStr(submissions?.cik);
  const cikNoLead = cikNoLeadFromCik10(cik10);

  const rows = [];
  for (let i = 0; i < Math.min(forms.length, limit); i++) {
    if (formFilter && forms[i] !== formFilter) continue;
    const acc = accs[i];
    const accNoDash = String(acc || "").replace(/-/g, "");
    const primaryDocument = primaryDocs[i] || "";

    rows.push({
      form: forms[i],
      filingDate: filingDates[i] || "",
      reportDate: reportDates[i] || "",
      accessionNumber: acc,
      acc_nodash: accNoDash,
      primaryDocument,
      cik10,
      cik_nolead: cikNoLead,
      primaryUrl: ARCHIVES_BASE(cikNoLead, accNoDash, primaryDocument),
      metaPrimary: {
        source_type: "EDGAR_HTML_PRIMARY",
        cik: cikNoLead,
        form: forms[i],
        filing_date: filingDates[i] || "",
        accession: acc,
      },
    });
  }
  return rows;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });

  try {
    const body = req.body || {};
    const action = body.action;

    if (action === "search") {
      const ticker = String(body.ticker || "").toUpperCase().trim();
      const form = String(body.form || "").trim();
      const limit = Math.max(10, Math.min(200, parseInt(body.limit || "60", 10)));

      if (!ticker) return res.status(400).json({ error: "ticker required" });

      const map = await fetchJson(TICKER_MAP_URL);
      let cik10 = "";
      for (const key of Object.keys(map || {})) {
        const row = map[key];
        if ((row?.ticker || "").toUpperCase() === ticker) {
          cik10 = cik10FromStr(row?.cik_str);
          break;
        }
      }
      if (!cik10) return res.status(404).json({ error: `CIK not found for ${ticker}` });

      const submissions = await fetchJson(SUBMISSIONS_URL(cik10));
      const filings = listRecentFilings(submissions, form, limit).map(f => ({
        ...f,
        metaPrimary: { ...f.metaPrimary, ticker },
      }));

      return res.status(200).json({ filings });
    }

    if (action === "exhibits") {
      const cik = String(body.cik || "").trim(); // no-leading version expected
      const accNoDash = String(body.acc_nodash || "").trim();
      if (!cik || !accNoDash) return res.status(400).json({ error: "cik and acc_nodash required" });

      const idx = await fetchJson(FOLDER_INDEX_JSON(cik, accNoDash));
      const items = idx?.directory?.item || [];
      const candidates = pickExhibitCandidates(items);

      const exhibits = candidates.map((filename) => ({
        filename,
        url: ARCHIVES_BASE(cik, accNoDash, filename),
      }));

      return res.status(200).json({ exhibits });
    }

    if (action === "ingest") {
      const url = String(body.url || "").trim();
      if (!url) return res.status(400).json({ error: "url required" });

      const html = await fetchText(url);
      const clean = cleanHtmlToText(html);

      return res.status(200).json({
        length: clean.length,
        preview: clean.slice(0, 5000),
      });
    }

    return res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Server error" });
  }
}
