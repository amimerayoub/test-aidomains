// utils.js — Shared helper utilities
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const rand = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
export const shuffle = a => { const arr = [...a]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
export const $ = s => document.querySelector(s);
export const $$ = s => document.querySelectorAll(s);

export function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

export function safeParse(str, fallback_val = '') {
  try { return JSON.parse(str); } catch { return fallback_val; }
}

export function validateDomain(name) {
  if (!name || name.length < 3) return false;
  if (name.length > 63) return false;
  if (name.includes(' ') || name.includes('--')) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/.test(name) || /^[a-zA-Z0-9][a-zA-Z0-9-]*$/.test(name);
}

export function formatPrice(name) {
  const len = name.replace(/[^a-zA-Z0-9]/g, '').length;
  if (len <= 6) return '$' + rand(5000, 25000).toLocaleString();
  if (len <= 10) return '$' + rand(1000, 8000).toLocaleString();
  return '$' + rand(100, 2000).toLocaleString();
}

export function sanitizeInput(input) {
  return input.replace(/[<>"'&]/g, '').trim();
}

export function extractKeywords(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'been', 'are', 'was', 'were', 'but', 'not', 'you', 'all', 'can', 'her', 'his', 'one', 'our', 'out', 'get', 'has', 'him', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did', 'let', 'say', 'she', 'too', 'use', 'what', 'when', 'where', 'which', 'while', 'would', 'there', 'their', 'about', 'after', 'could', 'should', 'other', 'your', 'business', 'company', 'platform', 'help', 'make', 'build', 'create', 'service', 'product']);
  return text.toLowerCase().split(/\s+/).filter(w => w.length > 3 && !stop.has(w));
}
