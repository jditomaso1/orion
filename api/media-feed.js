export const config = { runtime: 'nodejs' };

// api/media-feed.js
import Parser from 'rss-parser';

const UA = 'OrionNews/1.0 (+https://orion.private-credit.ai)';
const parser = new Parser();

// Dave & Buster’s Entertainment, Inc. CIK
const PLAY_CIK = '0001525769';

// --- Helpers ---
function gn(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

// Core entity + competitor + industry vocab (for strict filtering)
const DNB_TERMS = [
  "dave & buster", "dave and buster", "dave & busters", "dave and busters", "d&b"
];

const COMPETITORS = [
  "topgolf",
  "bowlero",
  "round1", "round one",
  "main event",
  "cec entertainment", "chuck e", "chuck e. cheese",
  "andretti",
  "pinstripes"
];

const INDUSTRY_TERMS = [
  "eatertainment",
  "family entertainment center", "fec",
  "arcade bar", "arcade dining",
  "experiential dining",
  "location-based entertainment",
  "entertainment complex", "food & entertainment", "food and entertainment"
];

// --- Feed sources (queries should prioritize D&B phrases; DO NOT use bare PLAY) ---
const UNIVERSES = {
  play: {
    sources: [
      // Company news (strictly name-based; no bare PLAY)
      gn(`("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters" OR "D&B") (earnings OR "earnings call" OR transcript OR revenue OR comps OR "same-store sales" OR guidance OR outlook OR leverage OR debt OR refinancing OR covenant OR liquidity OR "credit agreement")`),
      gn(`("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters" OR "D&B") ("press release" OR announces OR "business wire" OR "globe newswire" OR prnewswire OR investor)`),
      gn(`("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters" OR "D&B") (openings OR opening OR closure OR closures OR remodel OR "unit growth" OR expansion OR "new store")`),

      // Competitor set (kept separate so your page can show competitor moves)
      gn(`(Topgolf OR Bowlero OR Round1 OR "Round One" OR "Main Event" OR "CEC Entertainment" OR "Chuck E. Cheese" OR Andretti OR Pinstripes) (earnings OR results OR comps OR guidance OR openings OR expansion OR refinancing OR debt)`),

      // Industry / category news (still constrained)
      gn(`("family entertainment center" OR FEC OR eatertainment OR "arcade bar" OR "experiential dining" OR "location-based entertainment" OR "food and entertainment") (traffic OR comps OR pricing OR inflation OR consumer OR discretionary)`),

      // Higher-signal publications but still tied to D&B *name*
      gn(`site:reuters.com ("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters")`),
      gn(`site:bloomberg.com ("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters")`),
      gn(`site:wsj.com ("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters")`),
      gn(`site:ft.com ("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters")`),
      gn(`site:barrons.com ("Dave & Buster's" OR "Dave and Buster's" OR "Dave & Busters")`),

      // Ratings / credit (company name only)
      gn(`("Dave & Buster's" OR "Dave & Busters") ("rating action" OR downgrade OR upgrade OR "outlook revised" OR "issuer credit rating" OR "corporate family rating" OR Moody's OR S&P)`),
      gn(`site:ratings.spglobal.com ("Dave & Buster's" OR "Dave & Busters") (downgrade OR upgrade OR "rating action" OR outlook)`),
      gn(`site:moodys.com ("Dave & Buster's" OR "Dave & Busters") (downgrade OR upgrade OR "rating action" OR outlook)`),

      // SEC Atom feeds
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=8-K&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-Q&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-K&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=DEF%2014A&count=20&output=atom`,
    ]
  }
};

// --- Tagging (NO " play " keyword) ---
const TAGS = [
  { tag: 'PLAY',          kws: [" dave & buster", " dave & busters", " dave and buster", " dave and busters", " d&b "] },
  { tag: 'Press Releases',kws: [" press release", " prnewswire", " business wire", " globenewswire", " investor relations", " announces", " announced"] },
  { tag: 'Competitors',   kws: [" topgolf", " bowlero", " round1", " round one", " main event", " cec entertainment", " chuck e", " andretti", " pinstripes", " fec "] },
  { tag: 'Industry',      kws: [" eatertainment", " family entertainment center", " arcade", " amusement", " experiential dining", " location-based entertainment", " entertainment complex", " food & entertainment", " food and entertainment"] },
  { tag: 'Earnings',      kws: [" earnings", " earnings call", " transcript", " eps", " revenue", " results", " comps", " comparable sales", " same-store", " quarter", " q1", " q2", " q3", " q4"] },
  { tag: 'Guidance',      kws: [" guidance", " outlook", " forecast", " expects", " raised guidance", " cut guidance", " reiterated"] },
  { tag: 'Ratings',       kws: [" rating action", " downgrade", " upgrade", " outlook revised", " moody", " s&p", " spglobal", " issuer credit rating", " corporate family rating"] },
  { tag: 'SEC',           kws: [" sec.gov", " 8-k", " 10-q", " 10-k", " proxy", " def 14a", " 424b", " s-3"] },
  { tag: 'M&A',           kws: [" acquisition", " acquire", " merger", " m&a", " divest", " strategic alternatives"] },
  { tag: 'Macro/Consumer',kws: [" consumer", " discretionary", " traffic", " inflation", " wage", " labor", " recession", " spending"] },
  { tag: 'Openings/Closures', kws: [" new store", " opening", " openings", " closure", " closures", " close ", " closed ", " unit growth", " expansion", " remodel"] },
];

function tagger(str='') {
  const s = ` ${String(str).toLowerCase()} `;
  const out = [];
  for (const r of TAGS) if (r.kws.some(k => s.includes(k))) out.push(r.tag);
  return [...new Set(out)];
}

function cleanUrl(u='') {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid']
      .forEach(p => url.searchParams.delete(p));
    return url.toString();
  } catch { return u; }
}

// Google News RSS often points to news.google.com article wrappers; keep as-is (your UI already handles it)
function extractOriginalLink(link='') {
  try {
    const u = new URL(link);
    if (u.hostname.endsWith('news.google.com')) {
      let orig = u.searchParams.get('url') || u.searchParams.get('q');
      if (orig) {
        try { orig = decodeURIComponent(orig); } catch {}
        return orig;
      }
    }
  } catch {}
  return link;
}

function resolveLink(it) {
  let link = extractOriginalLink(it?.link || '');
  if ((!link || link.includes('news.google.com')) && it && it['feedburner:origLink']) link = it['feedburner:origLink'];
  if ((!link || link.includes('news.google.com')) && typeof it?.guid === 'string' && it.guid.startsWith('http')) link = it.guid;
  return link;
}

async function fetchXmlWithTimeout(url, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/atom+xml, text/xml, */*' },
      signal: ctrl.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function safeTime(x) {
  const t = new Date(x).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function isSecSource(sourceUrl, host) {
  return host === 'sec.gov' || /sec\.gov/.test(sourceUrl);
}

function formatSecTitle(title='') {
  const t = String(title).toUpperCase();
  const m = t.match(/\b(8-K|10-Q|10-K|DEF\s?14A|S-3|S-1|424B\d+)\b/);
  const form = m ? m[1].replace(/^DEF\s*14A$/, 'DEF 14A') : 'SEC';
  return `${form}: Dave & Buster’s (PLAY)`;
}

// --- STRICT post-filter: only keep if D&B OR competitor OR industry term is present ---
function includesAny(text, arr) {
  const s = ` ${String(text || '').toLowerCase()} `;
  return arr.some(t => s.includes(` ${t.toLowerCase()} `) || s.includes(t.toLowerCase()));
}

function isRelevantItem({ title='', summary='', url='' } = {}) {
  const blob = `${title} ${summary} ${url}`.toLowerCase();

  const isDnb = includesAny(blob, DNB_TERMS);
  const isCompetitor = includesAny(blob, COMPETITORS);
  const isIndustry = includesAny(blob, INDUSTRY_TERMS);

  // Also allow SEC filings (those won’t include the name in title sometimes)
  const isSec = blob.includes('sec.gov') || blob.includes('edgar');

  return isDnb || isCompetitor || isIndustry || isSec;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const START = Date.now();
  const TOTAL_BUDGET_MS = 18000;
  const PER_FEED_TIMEOUT_MS = 3500;
  const MAX_SOURCES = 12;

  try {
    const universeKey = String(req?.query?.universe || 'play').toLowerCase();
    const universe = UNIVERSES[universeKey] || UNIVERSES.play;

    const sources = (universe.sources || []).slice(0, MAX_SOURCES);
    const failures = [];
    const all = [];

    for (const sourceUrl of sources) {
      if (Date.now() - START > TOTAL_BUDGET_MS) {
        failures.push({ url: sourceUrl, err: 'skipped: budget exceeded' });
        continue;
      }

      try {
        const xml = await fetchXmlWithTimeout(sourceUrl, PER_FEED_TIMEOUT_MS);

        let feed;
        try {
          feed = await parser.parseString(xml);
        } catch (e) {
          failures.push({ url: sourceUrl, err: `parse failed: ${e?.message || e}` });
          continue;
        }

        const items = Array.isArray(feed?.items) ? feed.items : [];
        for (const it of items) {
          try {
            const summary = it.contentSnippet || it.content || it.summary || '';
            const link = cleanUrl(resolveLink(it));
            let host = '';
            try { host = new URL(link).hostname.replace(/^www\./,''); } catch {}

            const published_at = it.isoDate || it.pubDate || new Date().toISOString();
            const isSEC = isSecSource(sourceUrl, host);

            const obj = {
              title: isSEC ? formatSecTitle(it.title) : (it.title || 'Untitled'),
              url: link || it.link || '',
              source: isSEC ? 'sec.gov' : (host || 'unknown'),
              published_at,
              summary,
              tags: tagger(`${it.title || ''} ${summary || ''} ${isSEC ? ' sec 8-k 10-q 10-k def 14a ' : ''}`)
            };

            // HARD relevance gate (this is what prevents junk)
            if (!isRelevantItem(obj)) continue;

            all.push(obj);
          } catch {
            // skip bad item
          }
        }
      } catch (e) {
        failures.push({ url: sourceUrl, err: `fetch failed: ${e?.message || e}` });
      }
    }

    if (!all.length) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(200).json({
        status: 'empty',
        universe: universeKey,
        failures,
        top10: [],
        items: []
      });
    }

    // Sort newest first
    all.sort((a, b) => safeTime(b.published_at) - safeTime(a.published_at));

    // De-dupe (url first, then title)
    const seen = new Set();
    const deduped = all.filter(i => {
      const k = (i.url || '').trim() || (i.title || '').trim();
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Keep SEC from flooding
    const out = [];
    let secCount = 0;
    for (const it of deduped) {
      if ((it.source || '').replace(/^www\./,'') === 'sec.gov') {
        if (secCount >= 20) continue;
        secCount++;
      }
      out.push(it);
      if (out.length >= 320) break;
    }

    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate=900');
    return res.status(200).json({
      status: failures.length ? 'partial' : 'ok',
      universe: universeKey,
      failures,
      top10: out.slice(0, 10),
      items: out
    });
  } catch (e) {
    return res.status(200).json({
      status: 'error',
      error: String(e?.message || e)
    });
  }
}
