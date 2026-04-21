// services/newsAggregator.js — Multi-API news fetching with quota management
import { canUseAPI, incrementQuota } from './quotaManager.js';

// API base URLs and parameter builders
const API_CONFIGS = {
  mediastack: {
    base: 'http://api.mediastack.com/v1/news',
    buildUrl: (key, daysBack, query = '') => {
      const date = new Date();
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().slice(0, 10);
      let url = `${API_CONFIGS.mediastack.base}?access_key=${key}&languages=en&limit=50&sort=published_desc&published_date=${dateStr}`;
      if (query) url += `&keywords=${encodeURIComponent(query)}`;
      return url;
    },
    parse: (data) => {
      if (!data || !data.data) return [];
      return data.data.map(a => ({
        title: a.title || '',
        description: a.description || '',
        content: a.content || '',
        source: a.source || '',
        url: a.url || ''
      }));
    }
  },
  gnews: {
    base: 'https://gnews.io/api/v4/search',
    buildUrl: (key, daysBack, query = '') => {
      let url = `${API_CONFIGS.gnews.base}?token=${key}&lang=en&max=20&sortby=publishedAt`;
      if (query) url += `&q=${encodeURIComponent(query)}`;
      else url += '&q=technology+trends';
      return url;
    },
    parse: (data) => {
      if (!data || !data.articles) return [];
      return data.articles.map(a => ({
        title: a.title || '',
        description: a.description || '',
        content: a.content || '',
        source: a.source?.name || '',
        url: a.url || ''
      }));
    }
  },
  newsapi: {
    base: 'https://newsapi.org/v2/everything',
    buildUrl: (key, daysBack, query = '') => {
      const date = new Date();
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().slice(0, 10);
      let url = `${API_CONFIGS.newsapi.base}?apiKey=${key}&language=en&pageSize=20&sortBy=publishedAt&from=${dateStr}`;
      if (query) url += `&q=${encodeURIComponent(query)}`;
      else url += '&q=technology+innovation+trends';
      return url;
    },
    parse: (data) => {
      if (!data || !data.articles) return [];
      return data.articles.map(a => ({
        title: a.title || '',
        description: a.description || '',
        content: a.content || '',
        source: a.source?.name || '',
        url: a.url || ''
      }));
    }
  },
  currents: {
    base: 'https://api.currentsapi.services/v1/latest-news',
    buildUrl: (key, daysBack, query = '') => {
      let url = `${API_CONFIGS.currents.base}?apiKey=${key}&language=en&count=20`;
      if (query) url += `&keywords=${encodeURIComponent(query)}`;
      return url;
    },
    parse: (data) => {
      if (!data || !data.news) return [];
      return data.news.map(a => ({
        title: a.title || '',
        description: a.description || '',
        content: '',
        source: a.source || '',
        url: a.url || ''
      }));
    }
  }
};

/**
 * Fetch news from all available APIs in parallel
 * @param {Object} apiKeys - { mediastack, gnews, newsapi, currents }
 * @param {number} daysBack - 1, 7, or 30
 * @param {string} query - optional search keyword
 * @returns {Promise<{articles: Array, sources: Array, errors: Array}>}
 */
export async function fetchAllNews(apiKeys, daysBack = 7, query = '') {
  const articles = [];
  const sources = [];
  const errors = [];

  const fetchPromises = Object.entries(API_CONFIGS).map(async ([apiName, config]) => {
    const key = apiKeys[apiName];
    if (!key || key.trim() === '') {
      errors.push({ api: apiName, reason: 'No API key provided' });
      return;
    }
    if (!canUseAPI(apiName)) {
      errors.push({ api: apiName, reason: 'Daily quota reached' });
      return;
    }

    try {
      const url = config.buildUrl(key, daysBack, query);
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      const parsed = config.parse(data);
      if (parsed.length) {
        incrementQuota(apiName);
        articles.push(...parsed);
        sources.push(apiName);
      }
    } catch (err) {
      errors.push({ api: apiName, reason: err.message });
    }
  });

  await Promise.all(fetchPromises);

  return { articles, sources, errors };
}

/**
 * Aggregate fetched articles into a clean text block for AI
 */
export function aggregateNews(articles, maxLength = 8000) {
  if (!articles.length) return '';

  const seen = new Set();
  const parts = [];
  let totalLen = 0;

  for (const a of articles) {
    // Deduplicate by title similarity
    const normalized = a.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    let text = '';
    if (a.title) text += a.title + '. ';
    if (a.description) text += a.description + '. ';
    if (a.content) text += a.content;

    text = text.trim();
    if (!text) continue;

    // Trim individual article if too long
    if (text.length > 500) text = text.slice(0, 500) + '...';

    if (totalLen + text.length <= maxLength) {
      parts.push(text);
      totalLen += text.length;
    } else {
      const remaining = maxLength - totalLen;
      if (remaining > 50) parts.push(text.slice(0, remaining));
      break;
    }
  }

  return parts.join('\n\n');
}
