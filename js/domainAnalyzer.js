// domainAnalyzer.js — Smart Domain Analyzer with auto-detection
import { cap, rand } from './utils.js';
import { getCPCMap } from './dataLoader.js';

// ============================================================
// METRIC COLUMNS for CSV/TSV parsing
// ============================================================
const METRIC_ALIASES = {
  // Length
  'le': 'le', 'length': 'le', 'len': 'le',
  // Backlinks
  'bl': 'bl', 'backlinks': 'bl', 'bls': 'bl', 'backlink': 'bl',
  // Domain Pop
  'dp': 'dp', 'domainpop': 'dp', 'domain_pop': 'dp', 'dpop': 'dp',
  // CPC
  'cpc': 'cpc', 'cost_per_click': 'cpc', 'costperclick': 'cpc',
  // Trust Flow
  'tf': 'tf', 'trustflow': 'tf', 'trust_flow': 'tf',
  // Citation Flow
  'cf': 'cf', 'citationflow': 'cf', 'citation_flow': 'cf',
  // Whois Year
  'wby': 'wby', 'whois_year': 'wby', 'whoisyear': 'wby', 'whois': 'wby',
  // Archive Year
  'aby': 'aby', 'archive_year': 'aby', 'archiveyear': 'aby', 'archive': 'aby',
  // Search Volume / Google Searches
  'sg': 'sg', 'volume': 'sg', 'search_volume': 'sg', 'searchvolume': 'sg', 'sv': 'sg',
  // Dropped count
  'dropped': 'dropped', 'drops': 'dropped', 'drop_count': 'dropped',
  // Archive records
  'acr': 'acr', 'archive_count': 'acr', 'archive_records': 'acr',
  // Domain / Name
  'domain': 'domain', 'name': 'domain', 'url': 'domain', 'hostname': 'domain',
  // Extension
  'extension': 'extension', 'ext': 'extension', 'tld': 'extension',
  // Status
  'status': 'status', 'availability': 'status',
};

const METRIC_KEYS = ['le', 'bl', 'dp', 'cpc', 'tf', 'cf', 'wby', 'aby', 'sg', 'dropped', 'acr'];

// Known registrar/marketplace patterns to strip from domain field
const REGISTRAR_PATTERNS = [
  'namecheap.com', 'godaddy.com', 'gname.com', 'spaceship.com', 'name.com',
  'dynadot.com', 'namesilo.com', 'porkbun.com', 'enom.com', 'networksolutions.com',
  'tucows.com', 'register.com', '1and1.com', 'ionos.com', 'hover.com',
  'googledomains.com', 'domain.com', 'bluehost.com', 'hostgator.com',
  'namebright.com', 'cscglobal.com', 'markmonitor.com', 'uniregistry.com',
  'sedo.com', 'afternic.com', 'flippa.com', 'dan.com',
  'expired', 'namebright', 'clienttransfer', 'servertransfer',
  'domain details', 'google name', 'google info', 'google site',
  'wayback machine', 'visit domain', 'whois domain', 'domaintools.com',
  'seokicks.de', 'majestic.com',
];

// ============================================================
// CSV PARSER (RFC 4180 compliant — handles quoted fields)
// ============================================================

function parseCSVLine(line, sep = ',') {
  const result = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const ch = line[i];

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        current += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === sep) {
        result.push(current);
        current = '';
        i++;
      } else {
        current += ch;
        i++;
      }
    }
  }
  result.push(current);
  return result;
}

// Parse entire CSV text into rows (handles multi-line quoted fields)
function parseCSVRows(text, sep = ',') {
  const lines = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"') {
        if (next === '"') {
          current += '""';
          i++; // skip next quote
          continue;
        } else {
          inQuotes = false;
          current += ch;
          continue;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        current += ch;
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (current.trim()) lines.push(current);
        current = '';
        if (ch === '\r') i++; // skip \n after \r
      } else {
        current += ch;
      }
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

// ============================================================
// DOMAIN CLEANING
// ============================================================

/**
 * Extract the primary domain from a messy field.
 * Handles: "AuditProvence.comNamecheap.comGoDaddy.com" → "auditprovence.com"
 */
export function cleanDomainField(raw) {
  if (!raw) return '';

  // Remove quotes, trim
  let field = raw.replace(/^["']+|["']+$/g, '').trim();
  if (!field) return '';

  // Remove URLs
  field = field.replace(/^https?:\/\//, '').replace(/^www\./, '');

  // Remove page_url style content (http/https full URLs at end)
  field = field.replace(/\s*https?:\/\/\S+$/, '');

  // Remove trailing noise patterns
  for (const pattern of REGISTRAR_PATTERNS) {
    const idx = field.toLowerCase().indexOf(pattern);
    if (idx > 0) {
      // There's text before the registrar name — keep only the part before
      field = field.substring(0, idx);
    }
  }

  // Extract the first valid domain pattern from the field
  // Match: word.tld (possibly with hyphens, numbers)
  const domainMatch = field.match(/^([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,})/);
  if (domainMatch) {
    return domainMatch[1].toLowerCase();
  }

  // Try to find any domain-like pattern in the field
  const anyMatch = field.match(/([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,})/);
  if (anyMatch) {
    return anyMatch[1].toLowerCase();
  }

  return '';
}

// ============================================================
// NUMERIC VALUE CLEANING
// ============================================================

/**
 * Extract numeric value from messy field.
 * "15Majestic.com SEOkicks.de" → 15
 * "-" → 0
 * "" → 0
 * "1,234" → 1234
 */
export function cleanNumericValue(raw) {
  if (!raw) return 0;
  let val = raw.replace(/^["']+|["']+$/g, '').trim();

  // Handle empty/missing
  if (!val || val === '-' || val === 'N/A' || val === 'null' || val === 'undefined' || val === 'available' || val === 'registered') return 0;

  // Remove commas from numbers
  val = val.replace(/,/g, '');

  // Extract leading number
  const match = val.match(/^(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return isNaN(num) ? 0 : num;
  }

  // Try to find any number in the string
  const anyMatch = val.match(/(\d+(?:\.\d+)?)/);
  if (anyMatch) {
    const num = parseFloat(anyMatch[1]);
    return isNaN(num) ? 0 : num;
  }

  return 0;
}

// ============================================================
// AUTO DETECTION
// ============================================================

/**
 * Detect if input has metric columns (CSV/TSV) or is just domains
 */
export function detectMode(rawInput) {
  const lines = parseCSVRows(rawInput.trim());
  if (!lines.length) return { mode: 'basic', reason: 'Empty input' };

  const firstLine = lines[0].trim();
  const sep = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

  // Use proper CSV parsing for header
  const rawHeaders = parseCSVLine(firstLine, sep);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/["' ]/g, ''));

  // Check if first line looks like headers
  const matchedMetrics = headers.filter(h => METRIC_ALIASES[h] && METRIC_KEYS.includes(METRIC_ALIASES[h]));
  const hasDomainCol = headers.some(h => METRIC_ALIASES[h] === 'domain');

  if (matchedMetrics.length >= 2 || (hasDomainCol && matchedMetrics.length >= 1)) {
    return { mode: 'advanced', separator: sep, headers, matchedMetrics: matchedMetrics.length };
  }

  // Check if any data line has commas with numbers
  const sampleLines = lines.slice(1, Math.min(6, lines.length));
  for (const line of sampleLines) {
    const cols = parseCSVLine(line, sep);
    if (cols.length >= 3) {
      const numericCount = cols.slice(1).filter(c => {
        const cleaned = c.replace(/,/g, '').trim();
        return /^-?\d+(?:\.\d+)?$/.test(cleaned);
      }).length;
      if (numericCount >= 2) {
        return { mode: 'advanced', separator: sep, hasNumericCols: true };
      }
    }
  }

  return { mode: 'basic', reason: 'Domain-only input detected' };
}

// ============================================================
// PARSING
// ============================================================

export function parseInput(rawInput, detection) {
  const lines = parseCSVRows(rawInput.trim());
  if (!lines.length) return [];

  if (detection.mode === 'basic') {
    // Extract domains from each line
    const domains = [];
    const seen = new Set();
    lines.forEach(line => {
      // Try to clean as domain field first
      let d = cleanDomainField(line);
      if (d) {
        if (!seen.has(d)) { seen.add(d); domains.push(d); }
        return;
      }
      // Fallback: extract any domain-like patterns
      const matches = line.match(/[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}/g);
      if (matches) {
        matches.forEach(m => {
          let domain = m.toLowerCase().replace(/[^a-zA-Z0-9.\-]/g, '');
          if (domain && !seen.has(domain)) { seen.add(domain); domains.push(domain); }
        });
      }
    });
    return domains;
  }

  // Advanced mode: parse CSV/TSV with cleaning
  const sep = detection.separator || ',';
  let headerLineIdx = 0;
  let colMap = {}; // header index -> metric key
  let totalRows = 0;
  let skippedRows = 0;

  // Parse headers properly
  const rawHeaders = parseCSVLine(lines[0], sep);
  const headers = rawHeaders.map(h => h.trim().toLowerCase().replace(/["' ]/g, ''));
  const hasHeader = headers.some(h => METRIC_ALIASES[h]);

  if (hasHeader) {
    headers.forEach((h, i) => {
      if (METRIC_ALIASES[h]) colMap[i] = METRIC_ALIASES[h];
    });
    headerLineIdx = 1;
  } else {
    // Guess column order: domain, LE, BL, DP, CPC, TF, CF, WBY, ABY, SG...
    const standardOrder = ['domain', 'le', 'bl', 'dp', 'cpc', 'tf', 'cf', 'wby', 'aby', 'sg', 'dropped', 'acr'];
    standardOrder.forEach((key, i) => { if (i < headers.length) colMap[i] = key; });
  }

  // Find domain and extension columns
  let domainColIdx = -1;
  let extColIdx = -1;
  let statusColIdx = -1;
  for (const [idx, key] of Object.entries(colMap)) {
    if (key === 'domain') domainColIdx = parseInt(idx);
    if (key === 'extension') extColIdx = parseInt(idx);
    if (key === 'status') statusColIdx = parseInt(idx);
  }

  const results = [];
  const seen = new Set();

  for (let i = headerLineIdx; i < lines.length; i++) {
    totalRows++;
    const rawCols = parseCSVLine(lines[i], sep);
    if (!rawCols.length) { skippedRows++; continue; }

    // Clean columns: trim, remove quotes
    const cols = rawCols.map(c => c.trim().replace(/^["']+|["']+$/g, ''));

    // Extract domain
    let domain = '';
    if (domainColIdx >= 0 && cols[domainColIdx]) {
      domain = cleanDomainField(cols[domainColIdx]);
    }

    // If extension column exists, append it
    if (!domain && extColIdx >= 0 && cols[extColIdx]) {
      // Try to combine with extension
      const ext = cols[extColIdx].replace(/^["'.]+|["'.]+$/g, '').toLowerCase();
      // Try to find domain name in other columns
      for (let j = 0; j < cols.length; j++) {
        if (j === extColIdx) continue;
        const partial = cleanDomainField(cols[j]);
        if (partial && !partial.includes('.')) {
          domain = partial + '.' + ext;
          break;
        }
      }
    }

    // Fallback: try first column as domain
    if (!domain && cols[0]) {
      domain = cleanDomainField(cols[0]);
    }

    // Last fallback: extract any domain from the line
    if (!domain) {
      const anyMatch = lines[i].match(/([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,})/);
      if (anyMatch) domain = anyMatch[1].toLowerCase();
    }

    if (!domain || seen.has(domain)) { skippedRows++; continue; }
    seen.add(domain);

    // Check availability from status column
    let available = null; // unknown
    if (statusColIdx >= 0 && cols[statusColIdx]) {
      const status = cols[statusColIdx].toLowerCase();
      if (status === 'available') available = true;
      else if (status === 'registered' || status === 'taken') available = false;
    }

    // Extract metrics with cleaning
    const metrics = { le: 0, bl: 0, dp: 0, cpc: 0, tf: 0, cf: 0, wby: 0, aby: 0, sg: 0, dropped: 0, acr: 0 };
    for (const [idx, key] of Object.entries(colMap)) {
      if (key === 'domain' || key === 'extension' || key === 'status') continue;
      if (METRIC_KEYS.includes(key) && cols[parseInt(idx)]) {
        metrics[key] = cleanNumericValue(cols[parseInt(idx)]);
      }
    }

    // Auto-calculate length if LE is 0
    if (metrics.le === 0) {
      metrics.le = domain.replace(/[^a-zA-Z0-9]/g, '').length;
    }

    results.push({ domain, metrics, available });
  }

  // Store cleaning stats for UI
  parseInput._stats = { totalRows, validRows: results.length, skippedRows };

  return results;
}

// Reset stats
parseInput._stats = null;

export function getParseStats() {
  return parseInput._stats || null;
}

// ============================================================
// SCORING (Advanced Mode) — Balanced & Normalized
// ============================================================

/**
 * 1. STRUCTURE SCORE (20%) — based on domain length
 * Short, memorable domains score higher.
 */
function scoreStructure(le) {
  if (le <= 0) return 50;
  if (le >= 5 && le <= 8) return 100;
  if (le <= 12) return 90;
  if (le <= 18) return 70;
  if (le <= 25) return 45;
  return 20;
}

/**
 * 2. SEO POWER (30%) — backlinks, domain pop, TF/CF
 * Normalized with logarithmic scaling for realistic ranges.
 * High BL + low DP reduces score (potential spam).
 */
function scoreSEO(metrics) {
  // Log-based scoring prevents domination by extreme values
  const bl = metrics.bl || 0;
  const dp = metrics.dp || 0;
  const tf = metrics.tf || 0;
  const cf = metrics.cf || 0;

  // BL score (log scale, max at ~100k)
  let blScore = 0;
  if (bl > 0) blScore = Math.min(100, Math.log10(bl + 1) * 20);

  // DP score (log scale, max at ~1000)
  let dpScore = 0;
  if (dp > 0) dpScore = Math.min(100, Math.log10(dp + 1) * 33);

  // TF/CF combined score
  let tfcfScore = 0;
  if (tf > 0 || cf > 0) {
    tfcfScore = Math.min(100, ((tf + cf) / 2) * 2);
  }

  // Combine with internal weights
  let raw = blScore * 0.30 + dpScore * 0.35 + tfcfScore * 0.35;

  // Spam check: high BL but very low DP → penalize
  if (bl > 1000 && dp < 5) raw *= 0.7;
  else if (bl > 100 && dp === 0) raw *= 0.8;

  // TF/CF balance bonus
  if (tf > 0 && cf > 0) {
    const ratio = Math.min(tf, cf) / Math.max(tf, cf);
    if (ratio >= 0.7) raw = Math.min(100, raw + 8);
    else if (ratio >= 0.4) raw = Math.min(100, raw + 3);
  }

  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * 3. COMMERCIAL VALUE (20%) — CPC + search volume
 * If CPC is missing/zero, uses neutral baseline (not penalized).
 */
function scoreCommercial(metrics) {
  const cpc = metrics.cpc || 0;
  const sg = metrics.sg || 0;

  // If CPC is missing/zero, give neutral score (50) so it doesn't tank the total
  let cpcScore;
  if (cpc > 0) {
    cpcScore = Math.min(100, cpc * 8);
  } else {
    cpcScore = 50; // neutral — don't penalize missing data
  }

  // SG score
  let sgScore = 0;
  if (sg > 0) sgScore = Math.min(100, Math.log10(sg + 1) * 20);
  else sgScore = 50; // neutral baseline

  // Equal weight CPC + SG
  return Math.min(100, Math.max(0, Math.round(cpcScore * 0.55 + sgScore * 0.45)));
}

/**
 * 4. TRUST & HISTORY (20%) — age, archive, drops
 * Older = more trusted. Zero drops = clean history.
 */
function scoreTrust(metrics) {
  const currentYear = new Date().getFullYear();

  // Age
  let age = 0;
  if (metrics.wby > 1990 && metrics.wby <= currentYear) age = currentYear - metrics.wby;
  if (metrics.aby > 1990 && metrics.aby <= currentYear) age = Math.max(age, currentYear - metrics.aby);

  let ageScore;
  if (age >= 20) ageScore = 100;
  else if (age >= 15) ageScore = 90;
  else if (age >= 10) ageScore = 75;
  else if (age >= 5) ageScore = 55;
  else if (age >= 2) ageScore = 35;
  else ageScore = 20;

  // Archive records (bonus)
  let acrBonus = 0;
  if (metrics.acr > 500) acrBonus = 10;
  else if (metrics.acr > 100) acrBonus = 6;
  else if (metrics.acr > 10) acrBonus = 3;

  // Dropped penalty
  let dropPenalty = 0;
  if (metrics.dropped > 10) dropPenalty = 20;
  else if (metrics.dropped > 5) dropPenalty = 12;
  else if (metrics.dropped > 2) dropPenalty = 6;
  else if (metrics.dropped > 0) dropPenalty = 2;

  return Math.min(100, Math.max(0, ageScore + acrBonus - dropPenalty));
}

/**
 * 5. EXTENSION POWER (10%) — TLD value
 */
function scoreExtension(domain) {
  const tld = (domain.split('.').pop() || '').toLowerCase();
  if (tld === 'com') return 100;
  if (['net', 'org'].includes(tld)) return 70;
  if (['io', 'co', 'ai', 'app', 'dev'].includes(tld)) return 60;
  if (['info', 'biz', 'me', 'tv'].includes(tld)) return 45;
  return 30;
}

/**
 * Smart labels based on dominant metric
 */
export function getSmartLabels(scores, metrics) {
  const labels = [];
  const currentYear = new Date().getFullYear();
  const age = metrics.wby > 1990 ? currentYear - metrics.wby : 0;

  if (scores.seo >= 60) labels.push('Strong SEO');
  if (age >= 10) labels.push('Aged Domain');
  if (scores.commercial >= 60) labels.push('High Commercial Intent');
  if (scores.structure >= 80) labels.push('Short & Memorable');
  if (scores.trust >= 70) labels.push('Trusted History');
  if ((metrics.bl || 0) >= 1000) labels.push('High Backlinks');

  return labels;
}

/**
 * Combined scoring with weights
 * Each sub-score is already 0-100, so weighted average is balanced.
 */
export function calculateScores(metrics, domain) {
  const structure = scoreStructure(metrics.le);
  const seo = scoreSEO(metrics);
  const commercial = scoreCommercial(metrics);
  const trust = scoreTrust(metrics);
  const extension = scoreExtension(domain || '');

  // Weighted combination
  const finalScore = Math.round(
    structure * 0.20 +
    seo * 0.30 +
    commercial * 0.20 +
    trust * 0.20 +
    extension * 0.10
  );

  return {
    structure,
    seo,
    commercial,
    trust,
    extension,
    final: Math.min(100, Math.max(0, finalScore))
  };
}

export function classifyDomain(score) {
  if (score >= 90) return { label: 'Elite Domain', emoji: '🔥', cls: 'class-elite' };
  if (score >= 75) return { label: 'High Value', emoji: '💰', cls: 'class-highvalue' };
  if (score >= 60) return { label: 'Good Flip', emoji: '⚡', cls: 'class-goodflip' };
  return { label: 'Low Quality', emoji: '❌', cls: 'class-lowquality' };
}

// Basic mode availability is now handled by bulkChecker.js — no fake data

// ============================================================
// MAIN PROCESS FUNCTION
// ============================================================

export function analyzeDomains(rawInput) {
  const detection = detectMode(rawInput);
  const parsed = parseInput(rawInput, detection);
  const parseStats = getParseStats();

  // Fallback: if advanced mode found 0 valid domains, switch to basic
  if (detection.mode === 'advanced' && (!parsed || !parsed.length)) {
    // Try basic mode as fallback
    const basicDomains = parseInput(rawInput, { mode: 'basic' });
    if (basicDomains && basicDomains.length) {
      return {
        mode: 'basic',
        domains: basicDomains.map(d => ({
          name: d.includes('.') ? d : d + '.com',
          available: 'checking'
        })),
        parseStats
      };
    }
    return { mode: 'advanced', domains: [], parseStats };
  }

  if (detection.mode === 'basic') {
    // Basic mode: just domains with availability
    return {
      mode: 'basic',
      domains: parsed.map(d => ({
        name: d.includes('.') ? d : d + '.com',
        available: 'checking'
      })),
      parseStats
    };
  }

  // Advanced mode: scored domains with metrics
  const cpcMap = getCPCMap();

  return {
    mode: 'advanced',
    domains: parsed.map(item => {
      const scores = calculateScores(item.metrics, item.domain);
      const classification = classifyDomain(scores.final);

      // Enhance CPC with keyword-based estimation if not provided
      let cpc = item.metrics.cpc;
      if (cpc === 0) {
        const name = item.domain.split('.')[0].toLowerCase();
        for (const [nk, sc] of Object.entries(cpcMap)) {
          if (name.includes(nk)) { cpc = sc; break; }
        }
      }

      // Estimate age
      let age = 0;
      const currentYear = new Date().getFullYear();
      if (item.metrics.wby > 1990) age = currentYear - item.metrics.wby;
      else if (item.metrics.aby > 1990) age = currentYear - item.metrics.aby;

      return {
        name: item.domain.includes('.') ? item.domain : item.domain + '.com',
        available: item.available !== null ? item.available : 'checking',
        metrics: {
          le: item.metrics.le || item.domain.replace(/[^a-zA-Z0-9]/g, '').length,
          bl: item.metrics.bl,
          dp: item.metrics.dp,
          cpc: cpc,
          tf: item.metrics.tf,
          cf: item.metrics.cf,
          wby: item.metrics.wby,
          aby: item.metrics.aby,
          sg: item.metrics.sg,
          dropped: item.metrics.dropped,
          acr: item.metrics.acr,
          age
        },
        scores,
        classification,
        smartLabels: getSmartLabels(scores, item.metrics)
      };
    }),
    parseStats
  };
}

// ============================================================
// FILTER FUNCTIONS
// ============================================================

export function filterDomains(domains, mode, filters) {
  let result = [...domains];

  if (!filters) return result;

  // Only Available
  if (filters.availableOnly) {
    result = result.filter(d => d.available);
  }

  // High CPC
  if (filters.minCpc > 0) {
    result = result.filter(d => (d.metrics?.cpc || 0) >= filters.minCpc);
  }

  // Age > X years
  if (filters.minAge > 0) {
    result = result.filter(d => (d.metrics?.age || 0) >= filters.minAge);
  }

  // Score > X
  if (filters.minScore > 0) {
    result = result.filter(d => (d.scores?.final || 0) >= filters.minScore);
  }

  // Classification filter
  if (filters.classification && filters.classification !== 'all') {
    result = result.filter(d => d.classification?.label === filters.classification);
  }

  // Sort by score
  if (mode === 'advanced') {
    result.sort((a, b) => (b.scores?.final || 0) - (a.scores?.final || 0));
  }

  return result;
}
