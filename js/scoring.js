// scoring.js — CPC / Sellability / Brand scoring system
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

export function calcBrand(name) {
  let s = 40;
  const data = getData();
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
