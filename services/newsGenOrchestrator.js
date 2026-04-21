// services/newsGenOrchestrator.js — Generation orchestration with Gemini + Grok + Auto fallback
import { fetchAllNews, aggregateNews } from './newsAggregator.js';
import { generateDomainsWithAI } from './aiGenerator.js';
import { generateDomainsWithGrok } from './grokGenerator.js';
import { checkDomain, batchCheckDomains } from './domainChecker.js';
import { getQuotaStatus } from './quotaManager.js';
import { loadAllApiKeys, saveAllApiKeys, loadAiProvider, saveAiProvider } from './apiSettings.js';

// Re-export for backwards-compatible imports in main.js
export { loadAllApiKeys as loadApiKeys, saveAllApiKeys as saveApiKeys };
export { loadAiProvider, saveAiProvider };
export { checkDomain, getQuotaStatus };

// ─── Cache ────────────────────────────────────────────────────────────────────
let _lastResults = null;
let _lastTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000;

export function clearCache() {
  _lastResults = null;
  _lastTimestamp = 0;
}

// ─── Main generation function ─────────────────────────────────────────────────
/**
 * @param {Object} config
 * @param {Object}  config.apiKeys      - { gemini, grok, mediastack, gnews, newsapi, currents }
 * @param {string}  config.timeRange    - '24h' | 'week' | 'month'
 * @param {string}  config.depth        - 'light' | 'deep'
 * @param {string}  config.tld          - '.com' | '.io' | etc.
 * @param {number}  config.count        - number of domains to generate
 * @param {string}  config.query        - optional keyword filter
 * @param {string}  config.mode         - 'GEO' | 'BRANDABLE' | 'PATTERN' | 'HYBRID'
 * @param {string}  config.aiProvider   - 'gemini' | 'grok' | 'auto'
 * @param {boolean} config.forceRefresh - bypass cache
 */
export async function generateDomainNews(config = {}) {
  const {
    apiKeys = {},
    timeRange = 'week',
    depth = 'light',
    tld = '.com',
    count = 10,
    query = '',
    mode = 'GEO',
    aiProvider = 'auto',
    forceRefresh = false
  } = config;

  const daysMap = { '24h': 1, week: 7, month: 30 };
  const daysBack = daysMap[timeRange] || 7;

  if (!forceRefresh && _lastResults && (Date.now() - _lastTimestamp) < CACHE_TTL) {
    return _lastResults;
  }

  const errors = [];

  // ── Step 1: Fetch news ────────────────────────────────────────────────────
  const { articles, sources, errors: fetchErrors } = await fetchAllNews(apiKeys, daysBack, query);
  errors.push(...fetchErrors);

  // ── Step 2: Aggregate text (token-efficient) ──────────────────────────────
  const aggregatedText = aggregateNews(articles, depth === 'deep' ? 1500 : 1000);
  if (!aggregatedText) {
    errors.push({ reason: 'No news fetched — using keyword fallback for generation' });
  }

  const effectiveText = aggregatedText || '';
  const genOptions = { tld, count: parseInt(count) || 10, mode };

  // ── Step 3: AI generation with provider logic ─────────────────────────────
  let domains = [];
  let geminiError = null;
  let grokError = null;

  const tryGemini = async () => {
    if (!apiKeys.gemini) throw new Error('Gemini API key not provided');
    return generateDomainsWithAI(apiKeys.gemini, effectiveText, genOptions);
  };

  const tryGrok = async () => {
    if (!apiKeys.grok) throw new Error('Grok API key not provided');
    return generateDomainsWithGrok(apiKeys.grok, effectiveText, genOptions);
  };

  if (aiProvider === 'gemini') {
    try { domains = await tryGemini(); }
    catch (err) {
      geminiError = err.message;
      errors.push({ api: 'gemini', reason: err.message });
    }

  } else if (aiProvider === 'grok') {
    try { domains = await tryGrok(); }
    catch (err) {
      grokError = err.message;
      errors.push({ api: 'grok', reason: err.message });
    }

  } else {
    // Auto: Gemini first, fallback to Grok
    if (apiKeys.gemini) {
      try { domains = await tryGemini(); }
      catch (err) {
        geminiError = err.message;
        errors.push({ api: 'gemini', reason: err.message });
      }
    }
    if (!domains.length && apiKeys.grok) {
      try { domains = await tryGrok(); }
      catch (err) {
        grokError = err.message;
        errors.push({ api: 'grok', reason: err.message });
      }
    }
    if (!domains.length && !apiKeys.gemini && !apiKeys.grok) {
      errors.push({ reason: 'No AI API key provided — add Gemini or Grok key in API Settings' });
    }
  }

  // ── Step 4: Availability check ────────────────────────────────────────────
  const domainNames = domains.map(d => d.domain);
  const availabilityResults = domainNames.length ? await batchCheckDomains(domainNames) : [];

  const enrichedDomains = domains.map((d, i) => ({
    ...d,
    name: d.domain,
    available: availabilityResults[i]?.available ?? null,
    checkProvider: availabilityResults[i]?.provider ?? null
  }));

  const result = {
    domains: enrichedDomains,
    sources,
    errors,
    meta: {
      mode: enrichedDomains.length ? 'success' : 'failed',
      generationMode: mode,
      aiProvider,
      articlesCount: articles.length,
      geminiError,
      grokError,
      generatedAt: Date.now()
    }
  };

  _lastResults = result;
  _lastTimestamp = Date.now();
  return result;
}
