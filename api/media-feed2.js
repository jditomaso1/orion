// api/media-feed.js
import Parser from 'rss-parser';

const UA = 'OrionNews/1.0 (+https://private-credit.ai)';
const parser = new Parser({ requestOptions: { headers: { 'User-Agent': UA } } });

// Ensure fetch exists in this runtime (Node polyfill if needed)
const getFetch = async () => globalThis.fetch ?? (await import('node-fetch')).default;

// -------------------- Universe Config --------------------
// Dave & Buster’s Entertainment, Inc. (Filer) CIK: 0001525769  [oai_citation:2‡SEC](https://www.sec.gov/Archives/edgar/data/1525769/000162828024029239/0001628280-24-029239-index.htm?utm_source=chatgpt.com)
const PLAY_CIK = '0001525769';

function gn(q) {
  // Google News RSS query helper
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

const UNIVERSES = {
  play: {
    // Sources focus:
    // - PLAY + Dave & Buster’s
    // - Eatertainment / FEC / arcade dining
    // - Competitors/peers
    // - Ratings actions (S&P, Moody’s + general)
    // - SEC filings (company-specific Atom)
    sources: [
      // Primary company + ticker
      gn(`("Dave & Buster's" OR "Dave and Buster's" OR PLAY) (earnings OR revenue OR comps OR "same-store sales" OR guidance OR outlook OR leverage OR debt OR refinancing OR covenant OR liquidity)`),
      gn(`("Dave & Buster's" OR PLAY) (new store OR openings OR closures OR remodel OR "store refresh" OR "unit growth")`),

      // Sector / category (eatertainment / FEC)
      gn(`(eatertainment OR "family entertainment center" OR FEC OR "arcade bar" OR "arcade dining" OR "experiential dining") (traffic OR comps OR pricing OR inflation OR consumers)`),

      // Competitor/peer set (broad but relevant)
      gn(`(Topgolf OR Bowlero OR Round1 OR "Round One" OR "Main Event" OR "CEC Entertainment" OR "Chuck E. Cheese" OR Pinstripes OR Andretti) (earnings OR results OR comps OR guidance OR openings OR expansion)`),

      // Broader restaurant + entertainment consumer discretionary pulse
      gn(`("casual dining" OR restaurants OR "consumer discretionary") (traffic OR inflation OR wage OR labor OR pricing OR promotions)`),

      // Publisher filters (bigger signal-to-noise)
      gn(`site:reuters.com ("Dave & Buster's" OR PLAY OR eatertainment OR "family entertainment center")`),
      gn(`site:bloomberg.com ("Dave & Buster's" OR PLAY OR eatertainment OR "family entertainment center")`),
      gn(`site:wsj.com ("Dave & Buster's" OR PLAY OR restaurants OR consumer discretionary)`),
      gn(`site:ft.com ("Dave & Buster's" OR PLAY OR restaurants OR leisure)`),
      gn(`site:barrons.com (PLAY OR "Dave & Buster's")`),

      // Ratings: S&P + Moody’s + general “rating action” keyword net
      gn(`("Dave & Buster's" OR PLAY) ("rating action" OR downgrade OR upgrade OR "outlook revised" OR "issuer credit rating" OR "corporate family rating")`),
      gn(`site:ratings.spglobal.com ("Dave & Buster's" OR "Dave & Buster's Inc." OR "Dave & Buster's Entertainment") (downgrade OR upgrade OR "outlook revised" OR "rating action")`),
      gn(`site:moodys.com ("Dave & Buster's" OR "Dave & Buster's, Inc.") (downgrade OR upgrade OR "rating action" OR outlook)`),

      // Wires / PR
      gn(`site:prnewswire.com ("Dave & Buster's" OR eatertainment OR "family entertainment center")`),
      gn(`site:businesswire.com ("Dave & Buster's" OR eatertainment OR "family entertainment center")`),
      gn(`site:globenewswire.com ("Dave & Buster's" OR eatertainment OR "family entertainment center")`),

      // Finance portals (often fastest on “why stock moved”)
      gn(`site:finance.yahoo.com (PLAY OR "Dave & Buster's")`),
      gn(`site:investopedia.com ("Dave & Buster's" OR PLAY)`),
      gn(`site:marketwatch.com (PLAY OR "Dave & Buster's")`),
      gn(`site:nasdaq.com (PLAY OR "Dave & Buster's")`),

      // SEC company-specific Atom feeds (8-K / 10-Q / 10-K / DEF14A / S-3 / 424B5, etc.)
      // These are much cleaner than “getcurrent” and only pull PLAY filings.
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=8-K&count=40&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-Q&count=40&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-K&count=40&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=DEF%2014A&count=40&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=S-3&count=40&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=424B5&count=40&output=atom`,
    ]
  }
};

// -------------------- Tagger --------------------
const TAGS = [
  { tag: 'PLAY',              kws: [" dave & buster", " dave and buster", " d&b", " play "] },
  { tag: 'Competitors',       kws: [" topgolf", " bowlero", " round1", " round one", " main event", " cec entertainment", " chuck e", " pinstripes", " andretti", " fec ", " family entertainment center"] },
  { tag: 'Industry',          kws: [" eatertainment", " arcade", " amusement", " experiential dining", " location-based entertainment", " casual dining", " restaurants"] },
  { tag: 'Earnings',          kws: [" earnings", " eps", " revenue", " results", " quarter", " q1", " q2", " q3", " q4", " comps", " comparable sales", " same-store"] },
  { tag: 'Guidance',          kws: [" guidance", " outlook", " forecast", " expects", " reiterated", " withdrew guidance", " raised guidance", " cut guidance"] },
  { tag: 'Ratings',           kws: [" rating action", " downgrade", " upgrade", " outlook revised", " moody", " s&p", " spglobal", " issuer credit rating", " corporate family rating", " pd rating", " probability of default"] },
  { tag: 'SEC',               kws: [" sec.gov", " 8-k", " 10-q", " 10-k", " proxy", " def 14a", " registration statement", " prospectus", " 424b5", " s-3"] },
  { tag: 'M&A',               kws: [" acquisition", " acquire", " merger", " m&a", " divest", " strategic alternatives"] },
  { tag: 'Macro/Consumer',    kws: [" consumer", " discretionary", " traffic", " inflation", " tariff", " wage", " labor", " recession", " spending"] },
  { tag: 'Openings/Closures', kws: [" new store", " opening", " openings", " store closure", " closures", " close ", " closed ", " unit growth", " expansion"] },
];

function tagger(str='') {
  const s = ` ${String(str).toLowerCase()} `;
  const out = [];
  for (const r of TAGS) if (r.kws.some(k => s.includes(k))) out.push(r.tag);
  return [...new Set(out)];
}

// -------------------- Helpers --------------------
const BOOST = new Map([
  ['prnewswire.com', -300000],
  ['businesswire.com', -300000],
  ['globenewswire.com', -180000],
  ['moodys.com', -240000],
  ['ratings.spglobal.com', -240000],
  ['sec.gov', -120000]
]);

function cleanUrl(u='') {
  try {
    const url = new URL(u);
    url.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content','utm_id','fbclid','gclid']
      .forEach(p => url.searchParams.delete(p));
    return url.toString();
  } catch { return u; }
}

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
  if ((!link || link.includes('news.google.com')) && Array.isArray(it?.links)) {
    const alt = it.links.find(l => {
      try { return l?.url && !new URL(l.url).hostname.endsWith('news.google.com'); }
      catch { return false; }
    });
    if (alt?.url) link = alt.url;
  }
  if ((!link || link.includes('news.google.com')) && typeof it?.guid === 'string' && it.guid.startsWith('http')) link = it.guid;
  return link;
}

async function fetchXmlWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const _fetch = await getFetch();
    const res = await _fetch(url, { headers: { 'User-Agent': UA }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

function safeTime(msLike) {
  const t = new Date(msLike).getTime();
  return Number.isFinite(t) ? t : Date.now();
}

function inBatches(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// --- SEC formatting ---
function extractSecForm(rawTitle='') {
  const t = String(rawTitle).toUpperCase();
  const m = t.match(/\b(8-K|10-Q|10-K|S-3|S-1|424B5|DEF\s?14A|SC\s?13[DG]|SCHEDULE\s?13[DG])\b/);
  if (!m) return null;
  return m[1].replace(/\s+/g,' ').toUpperCase().replace(/^DEF\s*14A$/, 'DEF 14A');
}
function formatSecTitle(it) {
  const form = extractSecForm(it?.title || '');
  // Atom titles often already contain company; keep simple but consistent
  if (form) return `${form}: Dave & Buster’s (PLAY)`;
  return it?.title || 'SEC Filing';
}

// -------------------- Handler --------------------
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  try {
    const universeKey = String(req?.query?.universe || 'play').toLowerCase();
    const universe = UNIVERSES[universeKey] || UNIVERSES.play;
    const SOURCES = universe.sources;

    const allFeeds = [];
    const failures = [];

    for (const batch of inBatches(SOURCES, 6)) {
      const settled = await Promise.allSettled(
        batch.map(async (url) => {
          try {
            const xml = await fetchXmlWithTimeout(url, 9000);
            const feed = await parser.parseString(xml);
            return { url, feed };
          } catch (e) {
            throw { url, message: e?.message || String(e) };
          }
        })
      );

      for (const r of settled) {
        if (r.status === 'fulfilled') allFeeds.push(r.value);
        else {
          const info = r.reason || {};
          failures.push({ url: info.url || 'unknown', err: info.message || String(r.reason) });
        }
      }
    }

    if (!allFeeds.length) {
      res.setHeader('Cache-Control', 's-maxage=120, stale-while-revalidate=300');
      return res.status(502).json({ error: 'all feeds failed', failures });
    }

    const all = [];
    for (const { url: sourceUrl, feed } of allFeeds) {
      const items = Array.isArray(feed?.items) ? feed.items : [];
      for (const it of items) {
        try {
          // skip audio-only enclosures
          if (it?.enclosure?.type && String(it.enclosure.type).startsWith('audio')) continue;

          const summary = it.contentSnippet || it.content || '';
          const link = cleanUrl(resolveLink(it));
          let host = '';
          try { host = new URL(link).hostname.replace(/^www\./,''); } catch {}

          const published_at = it.isoDate || it.pubDate || new Date().toISOString();

          const isSEC = host === 'sec.gov' || /sec\.gov/.test(sourceUrl);

          all.push({
            title: isSEC ? formatSecTitle(it) : (it.title || 'Untitled'),
            url: link || it.link || '',
            source: isSEC ? 'sec.gov' : (host || 'unknown'),
            published_at,
            summary,
            tags: tagger(`${it.title} ${summary} ${isSEC ? ' sec 8-k 10-q 10-k ' : ''}`)
          });
        } catch (e) {
          console.warn('[media-feed] item skipped', { sourceUrl, itemTitle: it?.title, err: String(e?.message || e) });
        }
      }
    }

    // Sort: newest first with small “signal boosts”
    all.sort((a, b) => {
      const ta = safeTime(a.published_at);
      const tb = safeTime(b.published_at);
      const ba = ta + (BOOST.get((a.source || '').replace(/^www\./,'')) || 0);
      const bb = tb + (BOOST.get((b.source || '').replace(/^www\./,'')) || 0);
      return bb - ba;
    });

    // De-dupe
    const seen = new Set();
    const itemsDeduped = all.filter(i => {
      const key = i.url || i.title || '';
      if (!key) return false;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Recent-first + backfill
    const TARGET = 320;
    const cutoff = Date.now() - 24 * 3600 * 1000;
    const recent = itemsDeduped.filter(i => safeTime(i.published_at) >= cutoff);

    let base = recent.slice();
    if (base.length < TARGET) {
      for (const it of itemsDeduped) {
        if (safeTime(it.published_at) < cutoff) {
          base.push(it);
          if (base.length >= TARGET) break;
        }
      }
    }

    // Light domain balance: keep SEC from flooding
    const secCap = 20;
    let secCount = 0;
    const balanced = [];
    for (const it of base) {
      if (it.source === 'sec.gov') {
        if (secCount >= secCap) continue;
        secCount++;
      }
      balanced.push(it);
      if (balanced.length >= TARGET) break;
    }

    const top10 = balanced.slice(0, 10);

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=900');
    return res.status(200).json({
      status: failures.length ? 'partial' : 'ok',
      universe: universeKey,
      failures,
      top10,
      items: balanced
    });
  } catch (e) {
    console.error('media-feed failed', e);
    res.status(500).json({ error: 'media feed failed', detail: String(e?.message || e) });
  }
}
