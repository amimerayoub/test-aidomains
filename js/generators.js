// generators.js — All domain generation logic
import { cap, pick, rand, extractKeywords } from './utils.js';
import { getData } from './dataLoader.js';
import { makeDomain, scoreAndLimit } from './scoring.js';

// State
export const genState = {
  selectedConsonants: 'bcdfghjklmnpqrstvwxyz'.split(''),
  selectedVowels: 'aeiou'.split('')
};

// Internal generator helpers
function generateFallbackDomains(keyword, limit) {
  const kw = cap(keyword || 'domain');
  const fallbacks = [kw + 'Pro', kw + 'Hub', kw + 'Group', 'Best' + kw, kw + 'HQ', 'Top' + kw, 'My' + kw, kw + 'Labs', kw + 'Tech', kw + 'Now'];
  return fallbacks.slice(0, limit).map(n => makeDomain(n, keyword));
}

// === GEO ===
export function generateGeo({ keyword, custom, locationType, sortBy, limit, smartMode }) {
  try {
    if (!keyword && !custom) return generateFallbackDomains('geo', limit);
    const niche = keyword || 'service';
    const data = getData(smartMode);
    let locations = [];

    if (custom) {
      locations = [{ name: cap(custom.replace(/[\s,]+/g, '')), pop: rand(200000, 3000000) }];
    } else if (data.GEO_DOMAINS_DATA && data.GEO_DOMAINS_DATA[locationType]) {
      locations = Object.entries(data.GEO_DOMAINS_DATA[locationType])
        .map(([n, p]) => ({ name: cap(n.replace(/[\s-]+/g, '')), pop: p }));
    }

    // Sort
    if (sortBy === 'population') locations.sort((a, b) => b.pop - a.pop);
    else if (sortBy === 'shortest') locations.sort((a, b) => a.name.length - b.name.length);
    else locations.sort((a, b) => b.pop - a.pop); // default by population

    locations = locations.slice(0, 20);
    const domains = [];

    locations.forEach(loc => {
      const combos = [
        loc.name + cap(niche), cap(niche) + loc.name,
        'Best' + loc.name + cap(niche), 'Top' + loc.name + cap(niche),
        loc.name + cap(niche) + 'Pro', loc.name + cap(niche) + 'HQ'
      ];
      if (smartMode) {
        combos.push(loc.name + cap(niche) + 'Experts', 'My' + loc.name + cap(niche), 'Go' + loc.name + cap(niche));
      }
      combos.forEach(c => { const d = makeDomain(c, niche); if (d) domains.push(d); });
    });

    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateGeo error:', e);
    return generateFallbackDomains(keyword || 'geo', limit);
  }
}

// === KEYWORD ===
export function generateKeyword({ keywords, category, usePrefix, useSuffix, useCategoryKws, useCombine, limit, smartMode }) {
  try {
    if (!keywords || !keywords.length) return generateFallbackDomains('keyword', limit);
    const data = getData(smartMode);
    const domains = [];
    const seen = new Set();

    // Helper: add domain only if unique
    function addUnique(name, seed) {
      const key = name.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      const d = makeDomain(name, seed);
      if (d) domains.push(d);
    }

    // Find matching category — fuzzy match against data.json emoji-prefixed keys
    let catKws = [];
    if (useCategoryKws && data.KEYWORD_CATEGORIES && category && category !== 'all') {
      // Direct match first
      if (data.KEYWORD_CATEGORIES[category]) {
        catKws = data.KEYWORD_CATEGORIES[category];
      } else {
        // Fuzzy: find key that contains the category string (ignoring emojis)
        const catLower = category.toLowerCase().replace(/[^\w\s&]/g, '').trim();
        for (const key of Object.keys(data.KEYWORD_CATEGORIES)) {
          const keyClean = key.toLowerCase().replace(/[^\w\s&]/g, '').trim();
          if (keyClean.includes(catLower) || catLower.includes(keyClean)) {
            catKws = data.KEYWORD_CATEGORIES[key];
            break;
          }
        }
      }
    }

    // Pick random items from an array
    function pickN(arr, n) {
      if (!arr || !arr.length) return [];
      const shuffled = [...arr].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, n);
    }

    // Get smarter prefix/suffix pools — filter by length for better domain names
    const rawPrefixes = data.BRANDABLE_PREFIX || [];
    const rawSuffixes = data.BRANDABLE_SUFFIX || [];
    const shortPrefixes = rawPrefixes.filter(p => p.length >= 2 && p.length <= 6);
    const longPrefixes = rawPrefixes.filter(p => p.length >= 4 && p.length <= 10);
    const shortSuffixes = rawSuffixes.filter(s => s.length >= 2 && s.length <= 6);
    const longSuffixes = rawSuffixes.filter(s => s.length >= 4 && s.length <= 10);

    // How many prefix/suffix to sample
    const prefixCount = smartMode ? 25 : 12;
    const suffixCount = smartMode ? 25 : 12;
    const prefixes = pickN(shortPrefixes.length > 0 ? shortPrefixes : rawPrefixes, prefixCount);
    const suffixes = pickN(shortSuffixes.length > 0 ? shortSuffixes : rawSuffixes, suffixCount);

    // Merge user keywords with category keywords
    const allKw = [...keywords];
    const catSample = pickN(catKws, smartMode ? 12 : 6);
    if (catSample.length) allKw.push(...catSample);

    // Generate combinations
    allKw.forEach(kw => {
      // Prefix + keyword
      if (usePrefix) {
        prefixes.forEach(p => addUnique(cap(p) + cap(kw), kw));
        // Also try category words as prefixes
        pickN(catKws, 5).forEach(c => addUnique(cap(c) + cap(kw), kw));
      }
      // Keyword + suffix
      if (useSuffix) {
        suffixes.forEach(s => addUnique(cap(kw) + cap(s), kw));
        // Also try category words as suffixes
        pickN(catKws, 5).forEach(c => addUnique(cap(kw) + cap(c), kw));
      }
      // Keyword + keyword (cross-combine)
      if (useCombine && keywords.length > 1) {
        keywords.forEach(kw2 => {
          if (kw !== kw2) {
            addUnique(cap(kw) + cap(kw2), kw);
            addUnique(cap(kw2) + cap(kw), kw);
          }
        });
      }
    });

    // Smart mode: bonus combos from long prefixes/suffixes
    if (smartMode) {
      const longP = pickN(longPrefixes, 10);
      const longS = pickN(longSuffixes, 10);
      keywords.forEach(kw => {
        longP.forEach(p => addUnique(cap(p) + cap(kw), kw));
        longS.forEach(s => addUnique(cap(kw) + cap(s), kw));
      });
      // Cross-category combos
      if (catKws.length) {
        const catA = pickN(catKws, 8);
        const catB = pickN(catKws, 8);
        catA.forEach(a => catB.forEach(b => {
          if (a !== b && (a + b).length <= 18) addUnique(cap(a) + cap(b), a);
        }));
      }
    }

    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateKeyword error:', e);
    return generateFallbackDomains('keyword', limit);
  }
}

// === PATTERN ===
export function generatePattern({ pattern, tld, limit, smartMode }) {
  try {
    if (!pattern || !/^[CV]+$/.test(pattern)) return generateFallbackDomains('pattern', limit);
    const C = genState.selectedConsonants;
    const V = genState.selectedVowels;
    if (!C.length || !V.length) return generateFallbackDomains('pattern', limit);

    const domains = [];
    const seen = new Set();
    const maxAttempts = smartMode ? 300 : 100;

    for (let i = 0; i < maxAttempts && domains.length < limit * (smartMode ? 2 : 1); i++) {
      let name = '';
      for (const ch of pattern) name += ch === 'C' ? pick(C) : pick(V);
      if (seen.has(name)) continue;
      seen.add(name);
      const d = makeDomain(name, '');
      if (d) { d.name = name + tld; domains.push(d); }
    }

    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generatePattern error:', e);
    return generateFallbackDomains('pattern', limit);
  }
}

// === BRANDABLE ===
export function generateBrandable({ base, maxLen, usePrefix, useSuffix, useBoth, useRandom, limit, smartMode }) {
  try {
    const data = getData(smartMode);
    const prefixes = data.BRANDABLE_PREFIX || [];
    const suffixes = data.BRANDABLE_SUFFIX || [];
    const both = data.BRANDABLE_BOTH || [];
    const kw = base || pick(both.length ? both : ['nova', 'swift', 'pulse', 'zen']);
    const domains = [];

    if (usePrefix && prefixes.length) {
      prefixes.slice(0, 20).forEach(p => { const n = p + cap(kw); if (n.length <= maxLen) { const d = makeDomain(n, kw); if (d) domains.push(d); } });
    }
    if (useSuffix && suffixes.length) {
      suffixes.slice(0, 20).forEach(s => { const n = cap(kw) + cap(s); if (n.length <= maxLen) { const d = makeDomain(n, kw); if (d) domains.push(d); } });
    }
    if (useBoth && prefixes.length && suffixes.length) {
      for (let i = 0; i < (smartMode ? 20 : 12); i++) {
        const p = pick(prefixes), s = pick(suffixes);
        const n = p + cap(kw) + cap(s);
        if (n.length <= maxLen) { const d = makeDomain(n, kw); if (d) domains.push(d); }
      }
    }
    if (useRandom && both.length) {
      for (let i = 0; i < (smartMode ? 25 : 15); i++) {
        const a = pick(both), b = pick(both);
        if (a !== b) { const n = cap(a) + cap(b); if (n.length <= maxLen) { const d = makeDomain(n, ''); if (d) domains.push(d); } }
      }
    }

    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateBrandable error:', e);
    return generateFallbackDomains('brand', limit);
  }
}

// === NUMERIC ===
export function generateNumeric({ keyword, numPattern, numLen, pure, hybrid, reverse, limit, smartMode }) {
  try {
    const kw = (keyword || '').toLowerCase();
    const domains = [];

    function genNum() {
      let n = '';
      if (numPattern === 'palindrome') {
        const h = Math.ceil(numLen / 2);
        for (let i = 0; i < h; i++) n += rand(1, 9);
        if (numLen % 2 === 0) n += n.split('').reverse().join('');
        else n += n.slice(0, -1).split('').reverse().join('');
      } else if (numPattern === 'repeating') {
        const d = rand(1, 9); for (let i = 0; i < numLen; i++) n += d;
      } else if (numPattern === 'sequential') {
        const s = rand(1, Math.max(1, 9 - numLen + 1)); for (let i = 0; i < numLen; i++) n += (s + i);
      } else if (numPattern === 'year') {
        n = pick(['2025', '2026', '2027', '2030']);
      } else {
        for (let i = 0; i < numLen; i++) n += rand(0, 9);
      }
      return n;
    }

    const count = smartMode ? limit * 2 : limit;
    for (let i = 0; i < count; i++) {
      const num = genNum();
      if (pure) { const d = makeDomain(num); if (d) domains.push(d); }
      if (hybrid && kw) { const d = makeDomain(kw + num, kw); if (d) domains.push(d); }
      if (reverse && kw) { const d = makeDomain(num + kw, kw); if (d) domains.push(d); }
    }

    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateNumeric error:', e);
    return generateFallbackDomains('numeric', limit);
  }
}

// === SUGGESTOR ===
export function generateSuggestor({ input, limit, smartMode }) {
  try {
    if (!input || !input.trim()) return generateFallbackDomains('suggest', limit);
    const kws = extractKeywords(input).slice(0, 5);
    if (!kws.length) return generateFallbackDomains(input.split(' ')[0], limit);
    const mods = smartMode
      ? ['Smart', 'Pro', 'HQ', 'Hub', 'AI', 'App', 'Now', 'Flow', 'Labs', 'Tech', 'Go', 'Get', 'My', 'Try', 'Best', 'Top']
      : ['Pro', 'Hub', 'HQ', 'AI', 'App', 'Now'];
    const domains = [];
    kws.forEach(kw => {
      mods.forEach(m => {
        const d1 = makeDomain(cap(kw) + m, kw); if (d1) domains.push(d1);
        const d2 = makeDomain(m + cap(kw), kw); if (d2) domains.push(d2);
      });
    });
    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateSuggestor error:', e);
    return generateFallbackDomains('suggest', limit);
  }
}

// === WORDLIST ===
export function generateWordlist({ listA, listB, separator, limit, smartMode }) {
  try {
    if (!listA.length || !listB.length) return generateFallbackDomains('wordlist', limit);
    const domains = [];
    listA.forEach(a => {
      listB.forEach(b => {
        const d = makeDomain(cap(a) + separator + cap(b));
        if (d) domains.push(d);
      });
    });
    return scoreAndLimit(domains, limit, smartMode);
  } catch (e) {
    console.error('generateWordlist error:', e);
    return generateFallbackDomains('wordlist', limit);
  }
}
