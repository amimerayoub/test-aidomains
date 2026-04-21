// services/grokGenerator.js — Grok (xAI) AI domain name generation

const RESPONSES_ENDPOINT = 'https://api.x.ai/v1/responses';
const CHAT_ENDPOINT      = 'https://api.x.ai/v1/chat/completions';
const PRIMARY_MODEL      = 'grok-4.20-reasoning';
const FALLBACK_MODEL     = 'grok-3';

const FALLBACK_KEYWORDS =
  'AI fintech SaaS legaltech insurtech healthtech proptech edtech cybersecurity cloud data crypto B2B HR logistics';

const MODE_INSTRUCTIONS = {
  GEO:       'Combine trend keywords with major US/Canada cities (pop>500k). Patterns: CityKeyword or KeywordCity.',
  BRANDABLE: 'Startup-style names. Prefixes: Zen Neo Vex Flux Nex Lumi. Suffixes: Hub Labs AI Flow Ly Era. 6-12 chars.',
  PATTERN:   'Pronounceable CVC/CVCVC patterns only. Examples: Nexova Kalino Tarevo Bivona. Easy to say.',
  HYBRID:    'Mix brandable + pattern. Examples: ZentroHub NexviaLabs KovaFlow AxiNova. 8-14 chars.'
};

function buildPrompt(newsText, options = {}) {
  const { tld = '.com', count = 10, mode = 'GEO' } = options;
  const modeText = MODE_INSTRUCTIONS[mode] || MODE_INSTRUCTIONS.GEO;
  const news = (newsText || FALLBACK_KEYWORDS).slice(0, 1200);

  return `Generate ${count} premium domain names based on news trends below.
Mode: ${mode} — ${modeText}
TLD: ${tld}. No hyphens. No numbers. Commercially valuable.

NEWS:
${news}

Reply ONLY with JSON array:
[{"domain":"example${tld}","reason":"short reason"}]`;
}

function validateDomain(d) {
  if (!d || typeof d.domain !== 'string') return null;
  const dom = d.domain.toLowerCase().trim();
  if (!dom.includes('.')) return null;
  const namePart = dom.split('.')[0];
  if (/[-_\d]/.test(namePart) || namePart.length < 3) return null;
  return { domain: dom, reason: (d.reason || d.reasoning || '').trim() };
}

const HV_KEYWORDS = ['finance','fintech','legal','law','insure','ai','tech','data','cloud','saas','crypto','invest','pay','bank','hub','labs','flow','pro'];

function rankDomains(domains) {
  return domains.sort((a, b) => {
    const an = a.domain.split('.')[0], bn = b.domain.split('.')[0];
    const lenDiff = an.length - bn.length;
    if (lenDiff !== 0) return lenDiff;
    const aHV = HV_KEYWORDS.some(k => an.toLowerCase().includes(k)) ? 0 : 1;
    const bHV = HV_KEYWORDS.some(k => bn.toLowerCase().includes(k)) ? 0 : 1;
    return aHV - bHV;
  });
}

function parseJsonResponse(text) {
  let jsonStr = text;
  const match = text.match(/\[[\s\S]*\]/);
  if (match) jsonStr = match[0];
  jsonStr = jsonStr.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  return JSON.parse(jsonStr);
}

/** Extract text from xAI Responses API format */
function extractTextFromResponsesFormat(data) {
  if (!data.output) return '';
  for (const item of data.output) {
    if (item.content) {
      for (const block of item.content) {
        if (block.type === 'output_text' || block.type === 'text') return block.text || '';
      }
    }
    // Some versions put text directly
    if (typeof item.text === 'string') return item.text;
  }
  return '';
}

/** Try the xAI Responses API endpoint */
async function tryResponsesEndpoint(grokKey, prompt, model) {
  const resp = await fetch(RESPONSES_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${grokKey}`
    },
    body: JSON.stringify({ model, input: prompt })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message || `Grok error ${resp.status}`), { status: resp.status });
  }

  const data = await resp.json();
  // Try Responses API format first
  let text = extractTextFromResponsesFormat(data);
  // Fallback: OpenAI chat format
  if (!text && data.choices) text = data.choices[0]?.message?.content || '';
  return text;
}

/** Try the xAI Chat Completions endpoint (OpenAI-compatible) */
async function tryChatEndpoint(grokKey, prompt, model) {
  const resp = await fetch(CHAT_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${grokKey}`
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 800,
      temperature: 0.85
    })
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw Object.assign(new Error(err?.error?.message || `Grok error ${resp.status}`), { status: resp.status });
  }

  const data = await resp.json();
  return data.choices?.[0]?.message?.content || '';
}

/**
 * Generate domain names using Grok (xAI)
 * Tries Responses API → Chat API → fallback model in order
 */
export async function generateDomainsWithGrok(grokKey, newsText, options = {}) {
  const { tld = '.com', count = 10, mode = 'GEO' } = options;

  if (!grokKey?.trim()) throw new Error('Grok API key is required');
  if (!grokKey.startsWith('xai-')) throw new Error('Invalid Grok key format (must start with xai-)');

  const effectiveNews = (newsText && newsText.length >= 100) ? newsText : FALLBACK_KEYWORDS;
  const prompt = buildPrompt(effectiveNews, { tld, count, mode });

  const strategies = [
    () => tryResponsesEndpoint(grokKey, prompt, PRIMARY_MODEL),
    () => tryChatEndpoint(grokKey, prompt, PRIMARY_MODEL),
    () => tryChatEndpoint(grokKey, prompt, FALLBACK_MODEL)
  ];

  let lastError;
  for (const strategy of strategies) {
    try {
      const text = await strategy();
      if (!text) continue;

      let raw;
      try { raw = parseJsonResponse(text); } catch { continue; }
      if (!Array.isArray(raw)) continue;

      const validated = raw.map(d => validateDomain(d)).filter(Boolean);
      const seen = new Set();
      const unique = validated.filter(d => { if (seen.has(d.domain)) return false; seen.add(d.domain); return true; });
      if (!unique.length) continue;

      return rankDomains(unique).slice(0, count).map(d => ({
        domain: d.domain, name: d.domain, reason: d.reason, available: null
      }));

    } catch (err) {
      lastError = err;
      // Stop immediately on auth errors
      if (err.status === 401 || err.status === 403) {
        throw new Error('Invalid Grok API key — check your xAI key at x.ai');
      }
      if (err.status === 429) {
        throw new Error('Grok rate limit reached — please wait and try again');
      }
    }
  }

  throw lastError || new Error('Grok generation failed after all attempts');
}
