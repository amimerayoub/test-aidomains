// services/quotaManager.js — In-memory API quota tracker with localStorage persistence

const QUOTA_STORE_KEY = 'gen-news-quotas';
const QUOTA_RESET_KEY = 'gen-news-quota-date';

// Free tier daily limits
const DEFAULT_LIMITS = {
  mediastack: 500,
  gnews: 100,
  newsapi: 100,
  currents: 200,
  gemini: 60
};

let quotas = {};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function loadQuotas() {
  try {
    const stored = localStorage.getItem(QUOTA_STORE_KEY);
    const resetDate = localStorage.getItem(QUOTA_RESET_KEY);
    if (stored && resetDate === todayStr()) {
      quotas = JSON.parse(stored);
    } else {
      // Reset for new day
      quotas = {};
      localStorage.setItem(QUOTA_RESET_KEY, todayStr());
      localStorage.setItem(QUOTA_STORE_KEY, JSON.stringify(quotas));
    }
  } catch {
    quotas = {};
  }
}

function saveQuotas() {
  try {
    localStorage.setItem(QUOTA_STORE_KEY, JSON.stringify(quotas));
    localStorage.setItem(QUOTA_RESET_KEY, todayStr());
  } catch { /* ignore */ }
}

export function getQuota(apiName) {
  loadQuotas();
  const limit = DEFAULT_LIMITS[apiName] || 100;
  const used = quotas[apiName] || 0;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

export function canUseAPI(apiName) {
  const q = getQuota(apiName);
  return q.remaining > 0;
}

export function incrementQuota(apiName) {
  loadQuotas();
  if (!quotas[apiName]) quotas[apiName] = 0;
  quotas[apiName]++;
  saveQuotas();
}

export function getQuotaStatus() {
  loadQuotas();
  const status = {};
  for (const [api, limit] of Object.entries(DEFAULT_LIMITS)) {
    const used = quotas[api] || 0;
    status[api] = { used, limit, remaining: Math.max(0, limit - used), exhausted: used >= limit };
  }
  return status;
}

export function resetAllQuotas() {
  quotas = {};
  saveQuotas();
}
