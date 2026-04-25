// bulkChecker.js — Real domain availability via /api/bulk-check (Verisign)
// Handles batching, caching, and UI updates
import { createContinueButton, createCopyButton } from '../components/domain-dropdown.js';

const BATCH_SIZE = 30;
const CACHE_KEY = 'domain_check_cache';
const CACHE_TTL = 1000 * 60 * 30; // 30 minutes

const VERISIGN_API = 'https://sugapi.verisign-grs.com/ns-api/2.0/bulk-check';
const MAX_NAMES = 100;
const MAX_TLDS = 10;
const DEFAULT_TLDS = ['.com', '.net', '.org'];

const tldCache = {};

export function checkTldsBulk(baseName, tlds = DEFAULT_TLDS) {
  if (tldCache[baseName]) return tldCache[baseName];
  
  const domains = tlds.map(tld => baseName + tld);
  
  const promise = fetch(VERISIGN_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names: domains })
  })
  .then(res => {
    if (!res.ok) throw new Error('API failed');
    return res.json();
  })
  .then(data => data.results || [])
  .catch(err => {
    console.error('TLD check failed:', err);
    delete tldCache[baseName]; // remove failed promise
    return null;
  });
  
  tldCache[baseName] = promise;
  return promise;
}

// ==================== CACHE ====================

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    // Purge expired entries
    const now = Date.now();
    const clean = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v && v.ts && now - v.ts < CACHE_TTL) {
        clean[k] = v;
      }
    }
    return clean;
  } catch { return {}; }
}

function saveCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch { /* quota */ }
}

function getCached(domain) {
  const cache = loadCache();
  const entry = cache[domain.toLowerCase()];
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.available;
  return undefined; // not cached
}

function setCached(domain, available) {
  const cache = loadCache();
  cache[domain.toLowerCase()] = { available, ts: Date.now() };
  saveCache(cache);
}

// ==================== DOMAIN SPLITTING ====================

/**
 * Split a full domain (e.g. "example.com") into { name, tld }.
 * Handles multi-part TLDs like .co.uk
 */
function splitDomain(fullDomain) {
  const d = fullDomain.toLowerCase().trim();
  const dotIdx = d.indexOf('.');
  if (dotIdx <= 0) return { name: d, tld: 'com' };
  return {
    name: d.substring(0, dotIdx),
    tld: d.substring(dotIdx + 1)
  };
}

// ==================== CHUNK HELPER ====================

function chunk(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ==================== CORE API CALL ====================

/**
 * Call /api/bulk-check with names + tlds.
 * Returns a Map<domain, boolean> of availability.
 */
async function callBulkCheckAPI(names, tlds) {
  const res = await fetch('/api/bulk-check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      names,
      tlds,
      'include-registered': true
    })
  });

  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();

  if (!data.success) throw new Error(data.error || 'API failed');

  const map = {};
  if (data.results && Array.isArray(data.results.all)) {
    for (const r of data.results.all) {
      if (r && r.domain) {
        map[r.domain.toLowerCase()] = r.available === true;
      }
    }
  }
  return map;
}

// ==================== MAIN BULK CHECK ====================

/**
 * Check availability for an array of domain objects.
 * Each object should have { name: "example.com", ... }.
 *
 * Options:
 *   onProgress(checked, total) — called after each batch
 *   useCache — default true
 *
 * Returns a Map<domain, boolean> of all results.
 */
export async function bulkCheckDomains(domainsArray, options = {}) {
  const { onProgress, useCache = true } = options;

  if (!domainsArray || !domainsArray.length) return {};

  // 1. Normalize & deduplicate
  const domainList = [];
  const seen = new Set();
  for (const d of domainsArray) {
    const fullName = (d.name || d.domain || '').toLowerCase().trim();
    if (!fullName || !fullName.includes('.') || seen.has(fullName)) continue;
    seen.add(fullName);
    domainList.push(fullName);
  }

  if (!domainList.length) return {};

  // 2. Separate cached vs uncached
  const resultsMap = {};
  const unchecked = [];

  for (const domain of domainList) {
    if (useCache) {
      const cached = getCached(domain);
      if (cached !== undefined) {
        resultsMap[domain] = cached;
        continue;
      }
    }
    unchecked.push(domain);
  }

  if (!unchecked.length) {
    if (onProgress) onProgress(domainList.length, domainList.length);
    return resultsMap;
  }

  // 3. Group by TLD for efficient API calls
  const byTld = {};
  for (const domain of unchecked) {
    const { name, tld } = splitDomain(domain);
    if (!byTld[tld]) byTld[tld] = [];
    byTld[tld].push(name);
  }

  // 4. Build batches — each batch shares TLDs for efficiency
  let checked = domainList.length - unchecked.length;
  const total = domainList.length;

  for (const [tld, names] of Object.entries(byTld)) {
    const batches = chunk(names, BATCH_SIZE);

    for (const batch of batches) {
      try {
        const batchResults = await callBulkCheckAPI(batch, [tld]);

        // Store results + cache
        for (const name of batch) {
          const fullDomain = name + '.' + tld;
          const isAvailable = batchResults[fullDomain];
          if (isAvailable !== undefined) {
            resultsMap[fullDomain] = isAvailable;
            setCached(fullDomain, isAvailable);
          } else {
            // API didn't return this domain — mark as unknown (null)
            resultsMap[fullDomain] = null;
          }
        }

        checked += batch.length;
        if (onProgress) onProgress(checked, total);

      } catch (err) {
        console.error('Bulk check batch error:', err);
        // Mark failed domains as null
        for (const name of batch) {
          resultsMap[name + '.' + tld] = null;
        }
        checked += batch.length;
        if (onProgress) onProgress(checked, total);
      }
    }
  }

  return resultsMap;
}

// ==================== UI UPDATERS ====================

/**
 * Update domain cards in #resultsGrid with real availability data.
 */
export function updateResultsGridUI(resultsMap) {
  const grid = document.getElementById('resultsGrid');
  if (!grid) return;
  const cards = grid.querySelectorAll('.domain-card');

  cards.forEach(card => {
    const nameEl = card.querySelector('.domain-name');
    if (!nameEl) return;
    const domain = (nameEl.dataset.navDomain || nameEl.textContent || '').toLowerCase().trim();
    const statusEl = card.querySelector('.domain-status');
    if (!statusEl) return;

    if (resultsMap.hasOwnProperty(domain)) {
      const isAvail = resultsMap[domain];
      if (isAvail === null) {
        statusEl.className = 'domain-status status-taken';
        statusEl.innerHTML = `<span class="status-dot"></span><span>Unknown</span>`;
      } else if (isAvail) {
        statusEl.className = 'domain-status status-available';
        statusEl.innerHTML = `<span class="status-dot"></span><span>Available</span>`;
        // Swap to continue button
        const actionsEl = card.querySelector('.card-actions');
        if (actionsEl) {
          actionsEl.innerHTML = '';
          actionsEl.appendChild(createContinueButton(domain));
        }
      } else {
        statusEl.className = 'domain-status status-taken';
        statusEl.innerHTML = `<span class="status-dot"></span><span>Taken</span>`;
      }
    }
    
    // Fetch and render TLD availability
    const tldsContainer = card.querySelector(`#tlds-${domain.replace(/\\./g,'-')}`);
    if (tldsContainer && tldsContainer.innerHTML === '') {
      tldsContainer.innerHTML = '<span class="tld-badge">Checking...</span>';
      const { name } = splitDomain(domain);
      
      checkTldsBulk(name).then(results => {
        if (!results) {
          tldsContainer.innerHTML = '<span class="tld-badge taken">Check unavailable</span>';
          return;
        }
        
        tldsContainer.innerHTML = '';
        const mapped = results.map(r => ({
          domain: r.name,
          tld: '.' + r.name.split('.').pop(),
          available: r.availability === 'available'
        }));
        
        // Only show max 3
        mapped.slice(0, 3).forEach(r => {
          const badge = document.createElement('a');
          badge.className = `tld-badge ${r.available ? 'avail' : 'taken'}`;
          badge.textContent = r.tld;
          if (r.available) {
            badge.href = `https://www.namecheap.com/domains/registration/results/?domain=${encodeURIComponent(r.domain)}`;
            badge.target = '_blank';
            badge.title = 'Available! Click to register';
          } else {
            badge.title = 'Taken';
          }
          tldsContainer.appendChild(badge);
        });
      });
    }
  });
}

/**
 * Update analyzer domain cards/rows with real availability data.
 */
export function updateAnalyzerUI(resultsMap) {
  const container = document.getElementById('resultsGrid');
  if (!container) return;

  // Update row-style cards (advanced mode)
  container.querySelectorAll('.domain-card-row').forEach(row => {
    const nameEl = row.querySelector('.dc-name');
    if (!nameEl) return;
    const domain = nameEl.textContent.toLowerCase().trim();
    const statusEl = row.querySelector('.dc-badge');
    if (!statusEl || !resultsMap.hasOwnProperty(domain)) return;

    const isAvail = resultsMap[domain];
    if (isAvail === true) {
      statusEl.className = 'dc-badge dc-avail';
      statusEl.innerHTML = `<span class="dc-badge-dot"></span>Available`;
      // Swap to continue button
      const slot = row.querySelector('.dc-continue-slot');
      if (slot && slot.innerHTML === '') {
        slot.appendChild(createContinueButton(domain));
      }
    } else if (isAvail === false) {
      statusEl.className = 'dc-badge dc-taken';
      statusEl.innerHTML = `<span class="dc-badge-dot"></span>Registered`;
    } else {
      statusEl.className = 'dc-badge dc-taken';
      statusEl.innerHTML = `<span class="dc-badge-dot"></span>Unknown`;
    }
  });

  // Update card-style (basic mode)
  container.querySelectorAll('.domain-card').forEach(card => {
    const nameEl = card.querySelector('.domain-name');
    if (!nameEl) return;
    const domain = nameEl.textContent.toLowerCase().trim();
    const statusEl = card.querySelector('.domain-status');
    if (!statusEl || !resultsMap.hasOwnProperty(domain)) return;

    const isAvail = resultsMap[domain];
    if (isAvail === true) {
      statusEl.className = 'domain-status status-available';
      statusEl.innerHTML = `<span class="status-dot"></span><span>Available</span>`;
      // Swap to continue button
      const actionsEl = card.querySelector('.card-actions');
      if (actionsEl) {
        actionsEl.innerHTML = '';
        actionsEl.appendChild(createContinueButton(domain));
      }
    } else if (isAvail === false) {
      statusEl.className = 'domain-status status-taken';
      statusEl.innerHTML = `<span class="status-dot"></span><span>Taken</span>`;
    } else {
      statusEl.className = 'domain-status status-taken';
      statusEl.innerHTML = `<span class="status-dot"></span><span>Unknown</span>`;
    }
  });
}

/**
 * Update bulk check results rows.
 */
export function updateBulkResultsUI(resultsMap) {
  const grid = document.getElementById('resultsGrid');
  if (!grid) return;

  grid.querySelectorAll('.bulk-result-item').forEach(item => {
    const nameEl = item.querySelector('.bulk-domain');
    if (!nameEl) return;
    const domain = nameEl.textContent.toLowerCase().trim();
    const statusEl = item.querySelector('.bulk-status');
    if (!statusEl || !resultsMap.hasOwnProperty(domain)) return;

    const isAvail = resultsMap[domain];
    if (isAvail === true) {
      statusEl.className = 'bulk-status bulk-available';
      statusEl.textContent = 'Available';
    } else if (isAvail === false) {
      statusEl.className = 'bulk-status bulk-taken';
      statusEl.textContent = 'Taken';
    } else {
      statusEl.className = 'bulk-status bulk-taken';
      statusEl.textContent = 'Unknown';
    }
  });
}

/**
 * Apply results map back to a domains data array (mutates in-place).
 */
export function applyResultsToData(domainsArray, resultsMap) {
  if (!domainsArray || !resultsMap) return;
  for (const d of domainsArray) {
    const name = (d.name || d.domain || '').toLowerCase().trim();
    if (resultsMap.hasOwnProperty(name)) {
      d.available = resultsMap[name];
    }
  }
}
