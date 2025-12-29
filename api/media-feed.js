export const config = { runtime: 'nodejs' };
// api/media-feed.js
import Parser from 'rss-parser';

const UA = 'OrionNews/1.0 (+https://orion.private-credit.ai)';
const parser = new Parser();

// Dave & Buster’s Entertainment, Inc. CIK
const PLAY_CIK = '0001525769';

function gn(q) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}

const UNIVERSES = {
  play: {
    sources: [
      gn(`("Dave & Buster's" OR "Dave and Buster's" OR PLAY) (earnings OR revenue OR comps OR "same-store sales" OR guidance OR outlook OR leverage OR debt OR refinancing OR covenant OR liquidity)`),
      gn(`("Dave & Buster's" OR PLAY) (new store OR openings OR closures OR remodel OR "unit growth")`),
      gn(`(eatertainment OR "family entertainment center" OR FEC OR "arcade bar" OR "arcade dining" OR "experiential dining") (traffic OR comps OR pricing OR inflation OR consumers)`),
      gn(`(Topgolf OR Bowlero OR Round1 OR "Round One" OR "Main Event" OR "CEC Entertainment" OR "Chuck E. Cheese") (earnings OR results OR comps OR guidance OR openings OR expansion)`),

      gn(`site:reuters.com ("Dave & Buster's" OR PLAY OR eatertainment OR "family entertainment center")`),
      gn(`site:bloomberg.com ("Dave & Buster's" OR PLAY OR eatertainment OR "family entertainment center")`),
      gn(`site:wsj.com ("Dave & Buster's" OR PLAY OR restaurants OR consumer discretionary)`),
      gn(`site:ft.com ("Dave & Buster's" OR PLAY OR restaurants OR leisure)`),
      gn(`site:barrons.com (PLAY OR "Dave & Buster's")`),

      gn(`("Dave & Buster's" OR PLAY) ("rating action" OR downgrade OR upgrade OR "outlook revised" OR "issuer credit rating" OR "corporate family rating")`),
      gn(`site:ratings.spglobal.com ("Dave & Buster's" OR "Dave & Buster's Entertainment") (downgrade OR upgrade OR "outlook revised" OR "rating action")`),
      gn(`site:moodys.com ("Dave & Buster's") (downgrade OR upgrade OR "rating action" OR outlook)`),

      // Company-specific SEC Atom feeds (cleaner than “getcurrent”)
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=8-K&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-Q&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=10-K&count=30&output=atom`,
      `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${PLAY_CIK}&type=DEF%2014A&count=20&output=atom`,
    ]
  }
};

const TAGS = [
  { tag: 'PLAY',              kws: [" dave & buster", " dave and buster", " d&b", " play "] },
  { tag: 'Competitors',       kws: [" topgolf", " bowlero", " round1", " round one", " main event", " cec entertainment", " chuck e", " fec ", " family entertainment center"] },
  { tag: 'Industry',          kws: [" eatertainment", " arcade", " amusement", " experiential dining", " location-based entertainment", " casual dining", " restaurants"] },
  { tag: 'Earnings',          kws: [" earnings", " eps", " revenue", " results", " comps", " comparable sales", " same-store", " quarter", " q1", " q2", " q3", " q4"] },
  { tag: 'Guidance',          kws: [" guidance", " outlook", " forecast", " expects", " raised guidance", " cut guidance", " reiterated"] },
  { tag: 'Ratings',           kws: [" rating action", " downgrade", " upgrade", " outlook revised", " moody", " s&p", " spglobal", " issuer credit rating", " corporate family rating"] },
  { tag: 'SEC',               kws: [" sec.gov", " 8-k", " 10-q", " 10-k", " proxy", " def 14a", " 424b", " s-3"] },
  { tag: 'M&A',               kws: [" acquisition", " acquire", " merger", " m&a", " divest", " strategic alternatives"] },
  { tag: 'Macro/Consumer',    kws: [" consumer", " discretionary", " traffic", " inflation", " wage", " labor", " recession", " spending"] },
  { tag: 'Openings/Closures', kws: [" new store", " opening", " openings", " closure", " closures", " close ", " closed ", " unit growth", " expansion"] },
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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  // IMPORTANT: budget the function so it can’t time out and crash
  const START = Date.now();
  const TOTAL_BUDGET_MS = 18000;  // keep under typical serverless limits comfortably
  const PER_FEED_TIMEOUT_MS = 3500;
  const MAX_SOURCES = 12;         // cap fetches per invocation (stability > breadth)

  try {
    const universeKey = String(req?.query?.universe || 'play').toLowerCase();
    const universe = UNIVERSES[universeKey] || UNIVERSES.play;

    const sources = (universe.sources || []).slice(0, MAX_SOURCES);

    const failures = [];
    const all = [];

    // Fetch sequentially with a budget check (avoids “death by slow feeds”)
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
            const summary = it.contentSnippet || it.content || '';
            const link = cleanUrl(resolveLink(it));
            let host = '';
            try { host = new URL(link).hostname.replace(/^www\./,''); } catch {}

            const published_at = it.isoDate || it.pubDate || new Date().toISOString();
            const isSEC = isSecSource(sourceUrl, host);

            all.push({
              title: isSEC ? formatSecTitle(it.title) : (it.title || 'Untitled'),
              url: link || it.link || '',
              source: isSEC ? 'sec.gov' : (host || 'unknown'),
              published_at,
              summary,
              tags: tagger(`${it.title || ''} ${summary || ''} ${isSEC ? ' sec 8-k 10-q 10-k def 14a ' : ''}`)
            });
          } catch {
            // skip bad item
          }
        }
      } catch (e) {
        failures.push({ url: sourceUrl, err: `fetch failed: ${e?.message || e}` });
      }
    }

    // If literally nothing, still return JSON (don’t 500)
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

    // De-dupe
    const seen = new Set();
    const deduped = all.filter(i => {
      const k = i.url || i.title;
      if (!k) return false;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    // Keep SEC from flooding
    const out = [];
    let secCount = 0;
    for (const it of deduped) {
      if (it.source === 'sec.gov') {
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
    // Still return JSON so the UI can show the error instead of Vercel crash page
    return res.status(200).json({
      status: 'error',
      error: String(e?.message || e)
    });
  }
}
