/**
 * /api/backlinks.js
 * Backlink Checker — Rankifyer embed scraper
 * GET  ?site=example.com
 * POST { "site": "example.com" }
 *
 * Returns: total backlinks, unique backlinks, nofollow count,
 *          homepage links count, and full backlink list with
 *          PA, DA, anchor text, source URL, destination, nofollow flag, found date.
 */

const RANKIFYER_EMBED = 'https://rankifyer.com/free-seo-tools/embed';
const TOOL_ID         = 'high-quality-backlinks';
const TOOL_R          = '423b01';

// ─── CORS ─────────────────────────────────────────────────────────────────────
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json');
}

// ─── Validate / normalise site input ─────────────────────────────────────────
function normaliseSite(raw) {
  if (!raw) return { valid: false, error: 'Missing `site` parameter.' };
  let s = raw.trim();
  // strip protocol if given
  s = s.replace(/^https?:\/\//i, '');
  // strip trailing slash + path
  s = s.split('/')[0].toLowerCase();
  if (!s || s.length < 4) return { valid: false, error: 'Invalid site value.' };
  // ensure it has a dot (basic domain check)
  if (!s.includes('.')) return { valid: false, error: 'Provide a full domain, e.g. example.com' };
  return { valid: true, site: s, siteWithProtocol: `http://${s}` };
}

// ─── Fetch HTML from Rankifyer embed ─────────────────────────────────────────
async function fetchEmbed(siteWithProtocol) {
  // Step 1 — POST the form to get the result page (same as clicking Submit)
  const formParams = new URLSearchParams({
    id:       TOOL_ID,
    ref:      'https://rankifyer.com/backlink-checker/',
    ref_hash: 'ffd9bb20bb21736b47a1de5a39d1cdd3d382adcb50991497866ca45107878088',
    h:        '0',
    r:        TOOL_R,
    site:     siteWithProtocol,
    exp:      String(Math.floor(Date.now() / 1000) + 3600),
  });

  const headers = {
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language':           'en-GB,en;q=0.6',
    'Content-Type':              'application/x-www-form-urlencoded',
    'Referer':                   'https://rankifyer.com/backlink-checker/',
    'Origin':                    'https://rankifyer.com',
    'User-Agent':                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    'Sec-Fetch-Dest':            'iframe',
    'Sec-Fetch-Mode':            'navigate',
    'Sec-Fetch-Site':            'same-origin',
    'Sec-GPC':                   '1',
    'Upgrade-Insecure-Requests': '1',
  };

  // Try GET embed first (same approach as the curl in the docs — faster)
  const getUrl = `${RANKIFYER_EMBED}?id=${TOOL_ID}&h=0&r=${TOOL_R}&cookies=0`;
  const getRes = await fetch(getUrl, {
    headers: { ...headers, 'Content-Type': undefined },
    signal: AbortSignal.timeout(15000),
  });
  if (!getRes.ok) throw new Error(`Rankifyer GET ${getRes.status}`);

  // Now POST with site to get actual results
  const postRes = await fetch(`${RANKIFYER_EMBED}?id=${TOOL_ID}&h=0&r=${TOOL_R}&cookies=0`, {
    method:  'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    formParams.toString(),
    signal:  AbortSignal.timeout(20000),
  });
  if (!postRes.ok) throw new Error(`Rankifyer POST ${postRes.status}`);
  return postRes.text();
}

// ─── Parse HTML response ──────────────────────────────────────────────────────

/** Extract a number from .statistic blocks:  <h3>24</h3><span>backlinks</span> */
function parseStatistics(html) {
  const stats = {};
  const statRe = /<h3>(\d+)<\/h3>\s*<span>([^<]+)<\/span>/g;
  let m;
  while ((m = statRe.exec(html)) !== null) {
    const key   = m[2].trim().toLowerCase().replace(/\s+/g, '_');
    stats[key]  = parseInt(m[1], 10);
  }
  return stats;
}

/** Parse the DA/PA coloured-value blocks */
function parseColoredValue(cell) {
  const m = cell.match(/<div class="value">(\d+)<\/div>/);
  return m ? parseInt(m[1], 10) : null;
}

/** Extract all <tr> rows from <tbody> */
function parseBacklinks(html) {
  const backlinks = [];

  // Extract tbody content
  const tbodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return backlinks;

  // Split into rows
  const rowRe = /<tr>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRe.exec(tbodyMatch[1])) !== null) {
    const row = rowMatch[1];

    // Row number
    const numMatch = row.match(/<td class="center">(\d+)<\/td>/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;

    // All <td> cells
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c => c[1]);
    if (cells.length < 6) continue;

    // Cell 1 — Source (page title + URL)
    const srcTitleM = cells[1].match(/data-key="title"[^>]*>\s*([\s\S]*?)\s*<\/strong>/);
    const srcUrlM   = cells[1].match(/href="([^"]+)"[^>]*data-key="url"/);
    const sourceTitle = srcTitleM ? srcTitleM[1].replace(/\s+/g, ' ').trim() : null;
    const sourceUrl   = srcUrlM   ? decodeHtmlEntities(srcUrlM[1])           : null;

    // Cell 2 — Destination (anchor + dest URL + nofollow)
    const dstAnchorM  = cells[2].match(/data-key="title"[^>]*>\s*([\s\S]*?)\s*<\/strong>/);
    const dstUrlM     = cells[2].match(/href="([^"]+)"[^>]*data-key="url"/);
    const isNofollow  = /data-key="nofollow"/.test(cells[2]);
    const anchorText  = dstAnchorM ? dstAnchorM[1].replace(/\s+/g, ' ').trim() : null;
    const destUrl     = dstUrlM    ? decodeHtmlEntities(dstUrlM[1])            : null;

    // Cell 3 — PA
    const pa = parseColoredValue(cells[3]);

    // Cell 4 — DA
    const da = parseColoredValue(cells[4]);

    // Cell 5 — Date found
    const dateM = cells[5].match(/(\d{4}-\d{2}-\d{2})/);
    const foundDate = dateM ? dateM[1] : null;

    // DA quality label
    const daQuality =
      da === null         ? 'unknown'    :
      da >= 70            ? 'excellent'  :
      da >= 50            ? 'good'       :
      da >= 30            ? 'moderate'   :
      da >= 10            ? 'low'        : 'very_low';

    backlinks.push({
      rank:         num,
      source: {
        title:      sourceTitle,
        url:        sourceUrl,
        pa,
        da,
        da_quality: daQuality,
      },
      destination: {
        anchor_text: anchorText,
        url:         destUrl,
      },
      link_type:    isNofollow ? 'nofollow' : 'dofollow',
      nofollow:     isNofollow,
      dofollow:     !isNofollow,
      found_date:   foundDate,
    });
  }

  return backlinks;
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&#x3A;/gi, ':')
    .replace(/&#x2F;/gi, '/')
    .replace(/&amp;/gi,  '&')
    .replace(/&lt;/gi,   '<')
    .replace(/&gt;/gi,   '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#x27;/gi, "'");
}

// ─── Enrich & analyse ─────────────────────────────────────────────────────────
function analyse(backlinks, stats) {
  const dofollow = backlinks.filter(b => !b.nofollow);
  const nofollow = backlinks.filter(b =>  b.nofollow);

  // DA distribution
  const daScores = backlinks.map(b => b.source.da).filter(d => d !== null);
  const avgDa    = daScores.length
    ? Math.round(daScores.reduce((s, v) => s + v, 0) / daScores.length)
    : null;
  const maxDa    = daScores.length ? Math.max(...daScores) : null;

  // Unique referring domains
  const domains = new Set(
    backlinks
      .map(b => { try { return new URL(b.source.url).hostname; } catch { return null; } })
      .filter(Boolean)
  );

  // Top sources by DA
  const topByDa = [...backlinks]
    .sort((a, b) => (b.source.da ?? 0) - (a.source.da ?? 0))
    .slice(0, 5)
    .map(b => ({ domain: (() => { try { return new URL(b.source.url).hostname; } catch { return b.source.url; } })(), da: b.source.da, url: b.source.url, link_type: b.link_type }));

  // Date range
  const dates = backlinks.map(b => b.found_date).filter(Boolean).sort();
  const firstSeen = dates[0]  || null;
  const lastSeen  = dates[dates.length - 1] || null;

  // Quality score (0-100) — weighted blend
  const dofollowRatio  = backlinks.length ? dofollow.length / backlinks.length : 0;
  const avgDaNorm      = avgDa !== null ? avgDa / 100 : 0;
  const uniqueDomNorm  = Math.min(domains.size / 50, 1);
  const qualityScore   = Math.round((dofollowRatio * 30 + avgDaNorm * 50 + uniqueDomNorm * 20) * 100) / 100 * 100 | 0;

  return {
    total_backlinks:       stats.backlinks        ?? backlinks.length,
    unique_backlinks:      stats.unique_backlinks ?? null,
    links_to_homepage:     stats.links_to_homepage?? null,
    nofollow_count:        stats.nofollow_backlinks?? nofollow.length,
    dofollow_count:        dofollow.length,
    unique_referring_domains: domains.size,
    da_avg:                avgDa,
    da_max:                maxDa,
    dofollow_ratio:        `${Math.round(dofollowRatio * 100)}%`,
    first_backlink_found:  firstSeen,
    last_backlink_found:   lastSeen,
    quality_score:         qualityScore,
    quality_label:         qualityScore >= 70 ? 'Strong' : qualityScore >= 40 ? 'Moderate' : 'Weak',
    top_sources_by_da:     topByDa,
  };
}

// ─── Main handler ──────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  let rawSite;
  if (req.method === 'GET')       rawSite = req.query.site || req.query.domain || req.query.url || '';
  else if (req.method === 'POST') rawSite = req.body?.site || req.body?.domain || req.body?.url || '';
  else return res.status(405).json({ success: false, error: 'Method not allowed.' });

  if (!rawSite) {
    return res.status(400).json({
      success: false,
      error:   'Missing `site` parameter.',
      usage:   'GET /api/backlinks?site=example.com',
      example: 'GET /api/backlinks?site=constructionlawyerhouston.com',
    });
  }

  const { valid, site, siteWithProtocol, error: ve } = normaliseSite(String(rawSite));
  if (!valid) return res.status(400).json({ success: false, error: ve });

  const t0 = Date.now();

  let html;
  try {
    html = await fetchEmbed(siteWithProtocol);
  } catch (e) {
    return res.status(502).json({
      success: false,
      site,
      error:   'Failed to fetch backlink data from upstream.',
      detail:  e.message,
    });
  }

  // Check if we got a result page (has the stats div)
  if (!html.includes('class="stats"') && !html.includes('id="backlinks"')) {
    return res.status(200).json({
      success:  true,
      site,
      message:  'No backlink data found for this site, or the site has not been indexed yet.',
      backlinks: [],
      summary:  { total_backlinks: 0 },
      checked_at: new Date().toISOString(),
      elapsed_ms: Date.now() - t0,
    });
  }

  const stats    = parseStatistics(html);
  const backlinks = parseBacklinks(html);
  const summary  = analyse(backlinks, stats);

  return res.status(200).json({
    success:    true,
    site,
    checked_at: new Date().toISOString(),
    elapsed_ms: Date.now() - t0,
    summary,
    backlinks,
    source:     'rankifyer.com / high-quality-backlinks',
  });
}
