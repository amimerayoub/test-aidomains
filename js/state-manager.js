/**
 * state-manager.js
 * FIX 1: Persistent domain state — no more data loss on navigation
 * FIX 2: Proper domain details navigation via sessionStorage
 *
 * Drop-in replacement for any existing state logic.
 * Usage:
 *   import { saveDomains, loadDomains, openDomainDetails } from './state-manager.js';
 */

const KEYS = {
  DOMAINS:          'generatedDomains',
  ANALYSIS_RESULTS: 'analysisResults',
  ACTIVE_TOOL:      'activeTool',
  SELECTED_DOMAIN:  'selectedDomain',   // sessionStorage — per-tab only
  FAVORITES:        'ai-domains-favorites',
  CACHE:            'domain_check_cache',
  GEO_DOMAINS:      'domains_geo',
};

/* ── Domain list persistence ───────────────────────────────── */

/**
 * Save generated domains to localStorage.
 * Silently ignores quota errors — never throws.
 */
export function saveDomains(domains) {
  if (!Array.isArray(domains)) return;
  try {
    localStorage.setItem(KEYS.DOMAINS, JSON.stringify(domains));
  } catch (_) {
    // QuotaExceededError — silently ignore; state just won't persist
  }
}

/**
 * Load generated domains from localStorage.
 * Always returns an array — never throws.
 */
export function loadDomains() {
  try {
    const raw = localStorage.getItem(KEYS.DOMAINS);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

/**
 * Clear all saved domains (e.g. on explicit "Clear" action).
 * Do NOT call during navigation — that's the main bug source.
 */
export function clearDomains() {
  localStorage.removeItem(KEYS.DOMAINS);
}

/* ── Geo / Analysis results ────────────────────────────────── */

export function saveGeoDomains(domains) {
  try {
    localStorage.setItem(KEYS.GEO_DOMAINS, JSON.stringify(domains));
  } catch (_) {}
}

export function loadGeoDomains() {
  try {
    const raw = localStorage.getItem(KEYS.GEO_DOMAINS);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export function saveAnalysisResults(results) {
  try {
    localStorage.setItem(KEYS.ANALYSIS_RESULTS, JSON.stringify(results));
  } catch (_) {}
}

export function loadAnalysisResults() {
  try {
    const raw = localStorage.getItem(KEYS.ANALYSIS_RESULTS);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

/* ── Active tool ───────────────────────────────────────────── */

export function saveActiveTool(tool) {
  localStorage.setItem(KEYS.ACTIVE_TOOL, tool);
}

export function loadActiveTool(fallback = 'home') {
  return localStorage.getItem(KEYS.ACTIVE_TOOL) || fallback;
}

/* ── FIX 2: Domain details navigation ─────────────────────── */

/**
 * Navigate to the domain details page.
 * Uses sessionStorage so the selection is per-tab and cleared on close.
 * Does NOT redirect if no domain — details page handles that.
 */
export function openDomainDetails(domain) {
  if (!domain || typeof domain !== 'string') return;
  const cleanDomain = domain.trim().toLowerCase();
  if (!cleanDomain) return;
  sessionStorage.setItem(KEYS.SELECTED_DOMAIN, cleanDomain);
  window.location.href = 'domain.html?domain=' + encodeURIComponent(cleanDomain);
}

/**
 * Read the selected domain on the details page.
 * Returns null if missing — caller should show an error, NOT redirect.
 */
export function getSelectedDomain() {
  // Prefer URL param (direct links), fall back to sessionStorage
  const urlParam = new URLSearchParams(window.location.search).get('domain');
  if (urlParam) return urlParam.trim().toLowerCase();
  return sessionStorage.getItem(KEYS.SELECTED_DOMAIN) || null;
}

/* ── Availability check cache ──────────────────────────────── */

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

export function getCachedAvailability(domain) {
  try {
    const raw = localStorage.getItem(KEYS.CACHE);
    if (!raw) return undefined;
    const cache = JSON.parse(raw);
    const entry = cache[domain.toLowerCase()];
    if (!entry) return undefined;
    if (Date.now() - entry.ts > CACHE_TTL) return undefined;
    return entry.available;
  } catch (_) {
    return undefined;
  }
}

export function setCachedAvailability(domain, available) {
  try {
    const raw = localStorage.getItem(KEYS.CACHE);
    const cache = raw ? JSON.parse(raw) : {};
    cache[domain.toLowerCase()] = { available, ts: Date.now() };
    localStorage.setItem(KEYS.CACHE, JSON.stringify(cache));
  } catch (_) {}
}

export function purgeStaleCacheEntries() {
  try {
    const raw = localStorage.getItem(KEYS.CACHE);
    if (!raw) return;
    const cache = JSON.parse(raw);
    const now = Date.now();
    const clean = Object.fromEntries(
      Object.entries(cache).filter(([, v]) => now - v.ts < CACHE_TTL)
    );
    localStorage.setItem(KEYS.CACHE, JSON.stringify(clean));
  } catch (_) {}
}

/* ── App bootstrap helpers ─────────────────────────────────── */

/**
 * Call once on DOMContentLoaded to restore state and purge stale cache.
 * Returns an object with whatever was previously saved.
 */
export function bootstrapAppState() {
  purgeStaleCacheEntries();
  return {
    domains:         loadDomains(),
    geoDomains:      loadGeoDomains(),
    analysisResults: loadAnalysisResults(),
    activeTool:      loadActiveTool(),
  };
}

/**
 * Single call to save everything at once.
 * Wrap around your existing save logic to avoid scattered localStorage calls.
 */
export function saveAppState({ domains, activeTool } = {}) {
  if (domains !== undefined) saveDomains(domains);
  if (activeTool !== undefined) saveActiveTool(activeTool);
}
