// services/apiSettings.js — Centralized API key and provider preference management

const LS_PREFIX = 'aiDomains_';

// Unified storage key map
const STORAGE_KEYS = {
  gemini:     LS_PREFIX + 'gemini',
  grok:       LS_PREFIX + 'grok',
  mediastack: LS_PREFIX + 'mediastack',
  gnews:      LS_PREFIX + 'gnews',
  newsapi:    LS_PREFIX + 'newsapi',
  currents:   LS_PREFIX + 'currents',
  aiProvider: LS_PREFIX + 'aiProvider'
};

// Legacy key map from old newsGenOrchestrator — migrated automatically on first load
const LEGACY_KEYS = {
  gemini:     'genNewsKey_gemini',
  mediastack: 'genNewsKey_mediastack',
  gnews:      'genNewsKey_gnews',
  newsapi:    'genNewsKey_newsapi',
  currents:   'genNewsKey_currents'
};

/**
 * Save a single API key securely in localStorage
 */
export function saveApiKey(name, value) {
  const key = STORAGE_KEYS[name];
  if (!key || !value) return;
  const trimmed = value.trim();
  if (trimmed) localStorage.setItem(key, trimmed);
}

/**
 * Load a single API key — auto-migrates from legacy keys on first access
 */
export function loadApiKey(name) {
  const key = STORAGE_KEYS[name];
  if (!key) return '';

  const val = localStorage.getItem(key);
  if (val) return val;

  // Migrate from legacy format if present
  const legacyKey = LEGACY_KEYS[name];
  if (legacyKey) {
    const legacyVal = localStorage.getItem(legacyKey);
    if (legacyVal) {
      localStorage.setItem(key, legacyVal); // migrate
      return legacyVal;
    }
  }

  return '';
}

/**
 * Save all API keys from a key:value map
 */
export function saveAllApiKeys(keys = {}) {
  Object.entries(keys).forEach(([name, value]) => {
    if (value !== undefined && value !== null) saveApiKey(name, value);
  });
}

/**
 * Load all API keys at once
 */
export function loadAllApiKeys() {
  return {
    gemini:     loadApiKey('gemini'),
    grok:       loadApiKey('grok'),
    mediastack: loadApiKey('mediastack'),
    gnews:      loadApiKey('gnews'),
    newsapi:    loadApiKey('newsapi'),
    currents:   loadApiKey('currents')
  };
}

/**
 * Save AI provider preference: 'gemini' | 'grok' | 'auto'
 */
export function saveAiProvider(provider) {
  localStorage.setItem(STORAGE_KEYS.aiProvider, provider);
}

/**
 * Load AI provider preference (defaults to 'auto')
 */
export function loadAiProvider() {
  return localStorage.getItem(STORAGE_KEYS.aiProvider) || 'auto';
}
