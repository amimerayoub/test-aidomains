// scoring.js — CPC / Sellability / Brand scoring system + State Persistence
import { rand, pick, cap } from './utils.js';
import { getData, getCPCMap } from './dataLoader.js';

export function calcCPC(name, niche = '') {
  const low = name.toLowerCase();
  let base = 30;
  const map = getCPCMap();
  for (const [nk, sc] of Object.entries(map)) {
    if (low.includes(nk)) { base = Math.max(base, sc); break; }
  }
  if (niche && map[niche.toLowerCase()]) base = Math.max(base, map[niche.toLowerCase()]);
  const len = name.replace(/[^a-zA-Z]/g, '').length;
  if (len <= 8) base += 15;
  else if (len <= 12) base += 8;
  else if (len <= 16) base += 3;
  return Math.min(100, base + rand(-5, 10));
}

export function calcSellability(name) {
  const len = name.replace(/[^a-zA-Z]/g, '').length;
  let s = 50;
  if (len <= 6) s += 35;
  else if (len <= 10) s += 25;
  else if (len <= 14) s += 15;
  else s += 5;
  if (/^[A-Z][a-z]+[A-Z][a-z]+$/.test(name)) s += 10;
  if (!name.includes('-') && !name.includes('_')) s += 5;
  if (/[aeiou]{2,}/.test(name.toLowerCase())) s += 3;
  return Math.min(100, s + rand(-3, 8));
}

export function calcBrand(name, smartMode = true) {
  let s = 40;
  const data = getData(smartMode);
  if (data.BRANDABLE_BOTH) {
    const both = data.BRANDABLE_BOTH;
    const low = name.toLowerCase();
    const pre = low.substring(0, 4);
    const suf = low.substring(low.length - 4);
    if (both.some(b => b.startsWith(pre))) s += 15;
    if (both.some(b => b.endsWith(suf))) s += 15;
  }
  const len = name.replace(/[^a-zA-Z]/g, '').length;
  if (len <= 8) s += 20;
  else if (len <= 12) s += 12;
  if (/^[A-Z][a-z]+$/.test(name)) s += 10;
  return Math.min(100, s + rand(-3, 8));
}

export function makeDomain(name, niche = '') {
  if (!name || name.length < 2) return null;
  const fullName = name.includes('.') ? name : name + '.com';
  return {
    name: fullName,
    available: 'checking'
  };
}

export function scoreAndLimit(domains, limit = 50, smartMode = true) {
  if (!domains || !domains.length) return [];
  return domains.filter(Boolean).slice(0, limit);
}

// ============================================================
// STATE PERSISTENCE — Domain data survives navigation
// ============================================================

const STORAGE_KEYS = {
  generatedDomains:  'aiDomains_generated',
  analysisResults:   'aiDomains_analysis',
  selectedDomain:    'aiDomains_selected',
  activeTool:        'aiDomains_activeTool',
  bulkResults:       'aiDomains_bulk',
};

/**
 * Save generated domains to localStorage
 * Called after any generation (geo, keyword, brandable, etc.)
 */
export function saveGeneratedDomains(domains) {
  if (!domains || !domains.length) return;
  try {
    localStorage.setItem(STORAGE_KEYS.generatedDomains, JSON.stringify(domains));
  } catch (e) {
    console.warn('Could not save domains to localStorage:', e);
  }
}

/**
 * Load generated domains from localStorage
 * Returns [] if nothing stored or data is corrupt
 */
export function loadGeneratedDomains() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.generatedDomains);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('Could not load domains from localStorage:', e);
    return [];
  }
}

/**
 * Save analysis results to localStorage
 */
export function saveAnalysisResults(results) {
  if (!results) return;
  try {
    localStorage.setItem(STORAGE_KEYS.analysisResults, JSON.stringify(results));
  } catch (e) {
    console.warn('Could not save analysis results:', e);
  }
}

/**
 * Load analysis results from localStorage
 */
export function loadAnalysisResults() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.analysisResults);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

/**
 * Save selected domain before navigating to detail page
 * Uses sessionStorage for per-tab isolation
 */
export function saveSelectedDomain(domain) {
  try {
    sessionStorage.setItem(STORAGE_KEYS.selectedDomain, domain);
  } catch (e) {
    localStorage.setItem(STORAGE_KEYS.selectedDomain, domain);
  }
}

/**
 * Load selected domain in detail page
 * Returns null if not found
 */
export function loadSelectedDomain() {
  try {
    return sessionStorage.getItem(STORAGE_KEYS.selectedDomain) ||
           localStorage.getItem(STORAGE_KEYS.selectedDomain) ||
           null;
  } catch (e) {
    return null;
  }
}

/**
 * Clear only the selected domain after use (not all data)
 */
export function clearSelectedDomain() {
  try {
    sessionStorage.removeItem(STORAGE_KEYS.selectedDomain);
    localStorage.removeItem(STORAGE_KEYS.selectedDomain);
  } catch (e) { /* ignore */ }
}

/**
 * Clear all generated domain state (call only on explicit reset)
 */
export function clearAllDomainState() {
  Object.values(STORAGE_KEYS).forEach(key => {
    try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
    try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  });
}
