// ui.js — Rendering results, cards, animations, filters
import { $, $$ } from './utils.js';
import { createActionMenu, closeAllActionMenus } from '../components/action-menu.js';
import { createContinueButton, createCopyButton, closeActiveDropdown } from '../components/domain-dropdown.js';
import { toggleFavorite, isFavorite } from './favorites.js';

function navigateToDomain(domainName) {
  localStorage.setItem('selected_domain', domainName);
  window.location.href = 'domain.html?domain=' + encodeURIComponent(domainName);
}

export const uiState = {
  filter: 'all',
  sort: 'relevance'
};

export function getUiState() { return uiState; }

const STAR_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

function createDomainCard(domain, index = 0) {
  const card = document.createElement('div');
  card.className = 'domain-card';
  card.style.animationDelay = (index * 0.035) + 's';

  // Support both d.name and d.domain field names
  const domainName = domain.name || domain.domain;
  
  let sc = 'status-checking';
  let st = 'Checking...';
  if (domain.available === true) { sc = 'status-available'; st = 'Available'; }
  else if (domain.available === false) { sc = 'status-taken'; st = 'Taken'; }
  else if (domain.available === 'error') { sc = 'status-taken'; st = 'Check Failed'; }
  const favActive = isFavorite(domainName);
  const isAvail = domain.available === true;

  card.innerHTML = `
    <button class="btn-fav${favActive ? ' active' : ''}" data-domain="${domainName}" title="Add to Favorites">
      ${STAR_SVG}
      <span class="fav-pop"></span>
    </button>
    <div class="domain-name" style="cursor:pointer" data-nav-domain="${domainName}">${domainName}</div>
    <div class="domain-tlds" id="tlds-${domainName.replace(/\./g,'-')}"></div>
    <div class="domain-status ${sc}"><span class="status-dot"></span><span>${st}</span></div>
    <div class="card-actions"></div>`;

  // Card actions — Continue for available, Copy for others
  const actionsEl = card.querySelector('.card-actions');
  if (isAvail) {
    actionsEl.appendChild(createContinueButton(domainName));
  } else {
    const copyBtn = createCopyButton(domainName);
    actionsEl.appendChild(copyBtn);
  }

  // Domain name click → navigate to details page
  const nameEl = card.querySelector('.domain-name');
  if (nameEl) {
    nameEl.addEventListener('click', e => {
      e.stopPropagation();
      navigateToDomain(domainName);
    });
  }

  // Favorite button handler
  const favBtn = card.querySelector('.btn-fav');
  if (favBtn) {
    favBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const added = toggleFavorite(domain);
      favBtn.classList.toggle('active', added);
      // Pop animation
      favBtn.classList.remove('pop');
      void favBtn.offsetWidth; // force reflow
      favBtn.classList.add('pop');
      setTimeout(() => favBtn.classList.remove('pop'), 400);
    });
  }

  return card;
}

export function clearResults() {
  const grid = $('#resultsGrid');
  if (grid) {
    grid.style.transition = 'opacity 0.2s';
    grid.style.opacity = '0';
    setTimeout(() => {
      grid.innerHTML = '';
      grid.style.opacity = '1';
    }, 200);
  }
  closeAllActionMenus();
  // Title will be set dynamically based on active tool
  const count = $('#resultsCount'); if (count) count.textContent = '0 domains';
  const empty = $('#resultsEmpty'); if (empty) empty.style.display = 'block';
  const loading = $('#resultsLoading'); if (loading) loading.classList.remove('active');
  uiState.sort = 'default';
}

export function showLoading(show) {
  const loading = $('#resultsLoading');
  const empty = $('#resultsEmpty');
  const grid = $('#resultsGrid');
  if (loading) loading.classList.toggle('active', show);
  if (empty && show) empty.style.display = 'none';
  if (grid && show) { grid.innerHTML = ''; grid.style.opacity = '0'; }
}

export function renderResults(domains, title, onCopy) {
  const titleEl = $('#resultsTitle');
  const countEl = $('#resultsCount');
  const emptyEl = $('#resultsEmpty');
  const loadingEl = $('#resultsLoading');

  if (titleEl) titleEl.textContent = title || 'Generated Domains';
  if (loadingEl) loadingEl.classList.remove('active');

  closeAllActionMenus();

  if (!domains || !domains.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    const grid = $('#resultsGrid');
    if (grid) { grid.innerHTML = ''; grid.style.opacity = '1'; }
    if (countEl) countEl.textContent = '0 domains';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (countEl) countEl.textContent = domains.length + ' domain' + (domains.length !== 1 ? 's' : '');

  applyFilterSort(domains, onCopy);
}

export function applyFilterSort(domains, onCopy) {
  let d = [...domains];
  // Support both d.name and d.domain for sorting
  if (uiState.sort === 'name') d.sort((a, b) => (a.name || a.domain).localeCompare(b.name || b.domain));

  const countEl = $('#resultsCount');
  if (countEl) countEl.textContent = d.length + ' domain' + (d.length !== 1 ? 's' : '');

  closeAllActionMenus();

  const grid = $('#resultsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  grid.style.opacity = '0';
  grid.style.transition = 'opacity 0.3s';
  const fragment = document.createDocumentFragment();

  d.forEach((dom, i) => {
    const card = createDomainCard(dom, i);
    const copyBtn = card.querySelector('.btn-copy');
    const domName = dom.name || dom.domain;
    if (copyBtn && onCopy) {
      copyBtn.addEventListener('click', function () { onCopy(domName, this); });
    }
    createActionMenu(card, dom);
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  requestAnimationFrame(() => { grid.style.opacity = '1'; });

  const rs = $('#resultsSection');
  if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function renderBulkResults(domains) {
  const grid = $('#resultsGrid');
  const emptyEl = $('#resultsEmpty');
  const loadingEl = $('#resultsLoading');
  const titleEl = $('#resultsTitle');
  const countEl = $('#resultsCount');

  if (loadingEl) loadingEl.classList.remove('active');
  if (titleEl) titleEl.textContent = 'Bulk Check Results';
  if (countEl) countEl.textContent = domains.length + ' domains checked';
  if (emptyEl) emptyEl.style.display = domains.length ? 'none' : 'block';

  if (!grid) return;
  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();
  domains.forEach((d, i) => {
    const item = document.createElement('div');
    item.className = 'bulk-result-item';
    item.style.animationDelay = (i * 0.03) + 's';
    const a = d.available;
    let statusClass, statusText;
    if (a === 'checking') { statusClass = 'bulk-checking'; statusText = 'Checking...'; }
    else if (a === true) { statusClass = 'bulk-available'; statusText = 'Available'; }
    else if (a === false) { statusClass = 'bulk-taken'; statusText = 'Taken'; }
    else { statusClass = 'bulk-taken'; statusText = 'Unknown'; }
    const domName = d.name || d.domain;
    item.innerHTML = `<span class="bulk-domain" style="cursor:pointer">${domName}</span><span class="bulk-status ${statusClass}">${statusText}</span>`;
    item.querySelector('.bulk-domain').addEventListener('click', () => navigateToDomain(domName));
    fragment.appendChild(item);
  });
  grid.appendChild(fragment);
  grid.style.opacity = '1';
}

export function renderExtractedResults(items, type, onCopyAll) {
  const grid = $('#resultsGrid');
  const emptyEl = $('#resultsEmpty');
  const loadingEl = $('#resultsLoading');
  const titleEl = $('#resultsTitle');
  const countEl = $('#resultsCount');

  if (loadingEl) loadingEl.classList.remove('active');
  if (titleEl) titleEl.textContent = type === 'domain' ? 'Extracted Domains' : 'Extracted Emails';
  if (countEl) countEl.textContent = items.length + ' ' + (type === 'domain' ? 'domains' : 'emails') + ' found';
  if (emptyEl) emptyEl.style.display = items.length ? 'none' : 'block';

  if (!grid || !items.length) return;
  grid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  // Copy all button
  if (onCopyAll) {
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'btn-generate';
    copyAllBtn.style.marginBottom = '16px';
    copyAllBtn.style.maxWidth = '200px';
    copyAllBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>Copy All';
    copyAllBtn.addEventListener('click', function () { onCopyAll(this); });
    fragment.appendChild(copyAllBtn);
  }

  items.forEach((item, i) => {
    const el = document.createElement('div');
    el.className = 'extracted-item';
    el.style.animationDelay = (i * 0.03) + 's';
    el.innerHTML = `<span>${item}</span><button class="btn-copy btn-copy-sm"><svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg></button>`;
    el.querySelector('.btn-copy').addEventListener('click', function () {
      navigator.clipboard.writeText(item).then(() => {
        this.classList.add('copied');
        this.innerHTML = '✓';
        setTimeout(() => { this.classList.remove('copied'); }, 1500);
      });
    });
    fragment.appendChild(el);
  });

  grid.appendChild(fragment);
  grid.style.opacity = '1';
}

export function showFilterControls(show) {
  const sort = $('#resultsSort');
  const limit = $('#resultLimit');
  if (sort) sort.style.display = show ? '' : 'none';
  if (limit) limit.style.display = show ? '' : 'none';
}

export function toast(msg) {
  const t = $('#toast');
  const m = $('#toastMsg');
  if (!t || !m) return;
  m.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

export function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) {
      btn.classList.add('copied');
      btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Copied!';
      toast('Copied: ' + text);
      setTimeout(() => {
        btn.classList.remove('copied');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy';
      }, 2000);
    } else {
      toast('Copied: ' + text);
    }
  }).catch(() => toast('Copied: ' + text));
}

export function setButtonState(btn, disabled) {
  if (!btn) return;
  btn.disabled = disabled;
  if (disabled) {
    btn.style.opacity = '0.5';
    btn.style.pointerEvents = 'none';
  } else {
    btn.style.opacity = '1';
    btn.style.pointerEvents = '';
  }
}

// ============================================================
// SMART DOMAIN ANALYZER RENDERING
// ============================================================

const STAR_SVG_SM = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
const COPY_SVG_SM = `<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>`;
const BULB_SVG_SM = `<svg viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343 5.657l-.707-.707m2.828 2.828l-.707.707M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export function renderAnalyzerResults(domains) {
  const container = $('#analyzerResults');
  if (!container) return;
  container.style.display = '';

  if (!domains || !domains.length) {
    container.innerHTML = `<div class="results-empty" style="display:block"><svg viewBox="0 0 120 120" fill="none"><circle cx="60" cy="60" r="50" stroke="currentColor" stroke-width="1.5" stroke-dasharray="6 4"/><path d="M45 60l10 10 20-20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><p>No matching domains</p><span>Try adjusting your filters</span></div>`;
    const countEl = $('#analyzerDomainCount');
    if (countEl) countEl.textContent = '0 matching';
    return;
  }

  // Update filtered count
  const countEl = $('#analyzerDomainCount');
  if (countEl) countEl.textContent = domains.length + ' of ' + (window._analyzerTotal || domains.length) + ' domains';

  // Detect if we have advanced data (first domain with scores)
  const hasAdvanced = domains[0]?.scores;

  if (hasAdvanced) {
    renderAnalyzerTable(container, domains);
  } else {
    renderAnalyzerCards(container, domains);
  }
}

function renderAnalyzerTable(container, domains) {
  let html = '<div class="domain-list">';

  domains.forEach((d, i) => {
    const s = d.scores;
    const m = d.metrics;
    const c = d.classification;
    const favActive = isFavorite(d.name);
    const smartLabels = (d.smartLabels || []).slice(0, 3);
    const scoreColor = s.final >= 90 ? '#f59e0b' : s.final >= 75 ? '#10b981' : s.final >= 60 ? '#3b82f6' : '#6b7280';

    html += `<div class="domain-card-row" data-idx="${i}" style="animation-delay:${i * 0.03}s">
      <!-- Identity Block -->
      <div class="dc-identity">
        <div class="dc-name" data-domain='${JSON.stringify(d).replace(/'/g, "&#39;")}'>${d.name}</div>
        <div class="dc-meta">
          <span class="dc-status ${d.available === true ? 'dc-avail' : d.available === 'checking' ? 'dc-checking' : 'dc-taken'}">
            <span class="dc-status-dot"></span>${d.available === true ? 'Available' : d.available === 'checking' ? 'Checking...' : 'Registered'}
          </span>
          ${smartLabels.map(l => `<span class="dc-tag">${l}</span>`).join('')}
        </div>
      </div>

      <!-- Score -->
      <div class="dc-score-block">
        <div class="dc-score-ring" style="--score-color:${scoreColor};--score-pct:${s.final}%">
          <span class="dc-score-val">${s.final}</span>
        </div>
        <span class="dc-score-label">Score</span>
      </div>

      <!-- Classification Badge -->
      <div class="dc-class">
        <div class="dc-class-badge ${c.cls}" style="--glow:${scoreColor}30">
          <span class="dc-class-emoji">${c.emoji}</span>
          <span class="dc-class-label">${c.label}</span>
        </div>
      </div>

      <!-- Metrics Stack -->
      <div class="dc-metrics">
        <div class="dc-metric-card metric-age" data-metric="age"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 6v6l4 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span><span class="dc-metric-val">${m.age ? m.age + 'y' : '—'}</span><span class="dc-metric-label">Age</span></div>
        <div class="dc-metric-card metric-dp" data-metric="dp"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M3 3v18h18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 16l4-4 4 4 5-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span><span class="dc-metric-val">${m.dp ? formatNum(m.dp) : '—'}</span><span class="dc-metric-label">DP</span></div>
        <div class="dc-metric-card metric-tf" data-metric="tf"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M12 2l8 4v6c0 5.25-3.5 8.25-8 10-4.5-1.75-8-4.75-8-10V6l8-4z" stroke="currentColor" stroke-width="2"/></svg>
        </span><span class="dc-metric-val">${m.tf || '—'}</span><span class="dc-metric-label">TF</span></div>
        <div class="dc-metric-card metric-cpc" data-metric="cpc"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" stroke-width="2"/></svg>
        </span><span class="dc-metric-val">${m.cpc ? '$' + m.cpc : '—'}</span><span class="dc-metric-label">CPC</span></div>
        <div class="dc-metric-card" data-metric="bl"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span><span class="dc-metric-val">${m.bl ? formatNum(m.bl) : '—'}</span><span class="dc-metric-label">BL</span></div>
        <div class="dc-metric-card" data-metric="le"><span class="dc-metric-icon">
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M4 7V4h16v3M9 20h6M12 4v16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </span><span class="dc-metric-val">${m.le || '—'}</span><span class="dc-metric-label">LE</span></div>
      </div>

      <!-- Actions -->
      <div class="dc-actions">
        <button class="dc-action-btn dc-fav${favActive ? ' active' : ''}" data-domain="${d.name}" title="Favorite">
          <svg viewBox="0 0 24 24" fill="none" style="width:15px;height:15px"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
        </button>
        <button class="dc-action-btn dc-copy" data-domain="${d.name}" title="Copy">
          <svg viewBox="0 0 24 24" fill="none" style="width:15px;height:15px"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="dc-action-btn dc-analyse" data-action="analyse" data-domain='${JSON.stringify(d).replace(/'/g, "&#39;")}' title="Analyse">
          <svg viewBox="0 0 24 24" fill="none" style="width:15px;height:15px"><path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343 5.657l-.707-.707m2.828 2.828l-.707.707M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
        ${d.available === true ? `<div class="dc-continue-slot" data-continue-domain="${d.name}"></div>` : ''}
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;

  // Wire up action buttons
  container.querySelectorAll('.dc-copy').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const domain = btn.dataset.domain;
      navigator.clipboard.writeText(domain).then(() => {
        btn.classList.add('copied');
        setTimeout(() => btn.classList.remove('copied'), 1200);
      });
    });
  });

  container.querySelectorAll('.dc-fav').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const domain = domains.find(d => d.name === btn.dataset.domain);
      if (domain) {
        const added = toggleFavorite(domain);
        btn.classList.toggle('active', added);
      }
    });
  });

  container.querySelectorAll('.dc-analyse').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      let domainData;
      try { domainData = JSON.parse(btn.dataset.domain); } catch { return; }
      document.dispatchEvent(new CustomEvent('send-to-analyzer', { detail: { domain: domainData.name } }));
    });
  });

  // Domain name click → navigate to domain details page
  container.querySelectorAll('.dc-name').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      let domainData;
      try { domainData = JSON.parse(cell.dataset.domain); } catch { return; }
      navigateToDomain(domainData.name);
    });
  });

  // Wire up Continue buttons for available domains
  container.querySelectorAll('.dc-continue-slot').forEach(slot => {
    const domain = slot.dataset.continueDomain;
    if (domain) {
      slot.appendChild(createContinueButton(domain));
    }
  });
}

function renderAnalyzerCards(container, domains) {
  // Basic mode: render as cards
  container.innerHTML = `<div class="results-grid" id="analyzerGrid"></div>`;
  const grid = $('#analyzerGrid');
  grid.style.opacity = '0';

  const fragment = document.createDocumentFragment();
  domains.forEach((d, i) => {
    const card = document.createElement('div');
    card.className = 'domain-card';
    card.style.animationDelay = (i * 0.035) + 's';

    let sc = 'status-checking';
    let st = 'Checking...';
    if (d.available === true) { sc = 'status-available'; st = 'Available'; }
    else if (d.available === false) { sc = 'status-taken'; st = 'Taken'; }
    const favActive = isFavorite(d.name);

    const isAvail = d.available === true;

    card.innerHTML = `
      <button class="btn-fav${favActive ? ' active' : ''}" data-domain="${d.name}" title="Add to Favorites">
        ${STAR_SVG_SM}
        <span class="fav-pop"></span>
      </button>
      <div class="domain-name" style="cursor:pointer">${d.name}</div>
      <div class="domain-status ${sc}"><span class="status-dot"></span><span>${st}</span></div>
      <div class="card-actions"></div>`;

    // Card actions — Continue for available, Copy for others
    const actionsEl = card.querySelector('.card-actions');
    if (isAvail) {
      actionsEl.appendChild(createContinueButton(d.name));
    } else {
      const copyBtn = createCopyButton(d.name);
      actionsEl.appendChild(copyBtn);
      // Copy handler for static button
      copyBtn.addEventListener('click', function () { copyText(d.name, this); });
    }

    // Favorite handler
    const favBtn = card.querySelector('.btn-fav');
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const added = toggleFavorite(d);
        favBtn.classList.toggle('active', added);
        favBtn.classList.remove('pop');
        void favBtn.offsetWidth;
        favBtn.classList.add('pop');
        setTimeout(() => favBtn.classList.remove('pop'), 400);
      });
    }

    // Domain name click → details
    const nameEl = card.querySelector('.domain-name');
    if (nameEl) nameEl.addEventListener('click', () => navigateToDomain(d.name));

    // Analyse handler
    createActionMenu(card, d);

    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  requestAnimationFrame(() => { grid.style.opacity = '1'; });
}

// ============================================================
// DOMAIN DETAILS PANEL — Premium Design
// ============================================================

const EXTENSIONS = ['.com', '.net', '.org', '.io', '.co', '.ai', '.app', '.dev', '.info', '.biz'];

function openDomainDetails(d) {
  const existing = $('#domainDetailsOverlay');
  if (existing) existing.remove();

  const s = d.scores || {};
  const m = d.metrics || {};
  const c = d.classification || { label: 'Unknown', emoji: '', cls: 'class-lowquality' };
  const smartLabels = (d.smartLabels || []).slice(0, 3);

  const currentYear = new Date().getFullYear();
  const age = m.age || (m.wby > 1990 ? currentYear - m.wby : 0);
  const baseName = d.name.split('.')[0];

  // Extension availability
  let extHtml = '';
  EXTENSIONS.forEach(ext => {
    const isCurrent = ext === '.' + d.name.split('.').pop();
    const avail = isCurrent ? (d.available === true) : null;
    const statusText = avail === true ? 'Available' : avail === false ? 'Registered' : '—';
    const statusClass = avail === true ? 'ext-available' : avail === false ? 'ext-registered' : 'ext-registered';
    extHtml += `<div class="ext-item ${isCurrent ? 'current-ext' : ''}">
      <span class="ext-name">${ext}</span>
      <span class="ext-status ${statusClass}">${statusText}</span>
    </div>`;
  });

  // Smart labels
  const labelsHtml = smartLabels.length ? `<div class="dd-smart-labels">${smartLabels.map(l => `<span class="smart-label-tag">${l}</span>`).join('')}</div>` : '';

  // Metrics with highlight
  const metricsHtml = `
    <div class="detail-metric ${m.dp >= 100 ? 'metric-highlight' : ''}"><span class="detail-metric-label">Domain Pop</span><span class="detail-metric-value">${m.dp ? formatNum(m.dp) : '-'}</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Backlinks</span><span class="detail-metric-value">${m.bl ? formatNum(m.bl) : '-'}</span></div>
    <div class="detail-metric ${m.tf >= 20 ? 'metric-highlight' : ''}"><span class="detail-metric-label">Trust Flow</span><span class="detail-metric-value">${m.tf || '-'}</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Citation Flow</span><span class="detail-metric-value">${m.cf || '-'}</span></div>
    <div class="detail-metric ${m.cpc >= 5 ? 'metric-highlight' : ''}"><span class="detail-metric-label">CPC</span><span class="detail-metric-value">${m.cpc ? '$' + m.cpc : '-'}</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Search Volume</span><span class="detail-metric-value">${m.sg ? formatNum(m.sg) : '-'}</span></div>
    <div class="detail-metric ${age >= 10 ? 'metric-highlight' : ''}"><span class="detail-metric-label">Domain Age</span><span class="detail-metric-value">${age ? age + ' years' : 'Unknown'}</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Length</span><span class="detail-metric-value">${m.le || '-'} chars</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Dropped</span><span class="detail-metric-value">${m.dropped || '0'}</span></div>
    <div class="detail-metric"><span class="detail-metric-label">Archive Records</span><span class="detail-metric-value">${m.acr ? formatNum(m.acr) : '-'}</span></div>`;

  // Score breakdown with percentages
  const scoreBreakdown = `
    <div class="detail-score-row"><span class="detail-score-label">Structure</span><div class="detail-score-bar"><div class="detail-score-fill score-white" style="width:${s.structure || 0}%"></div></div><span class="detail-score-val">${s.structure || 0}%</span></div>
    <div class="detail-score-row"><span class="detail-score-label">SEO Power</span><div class="detail-score-bar"><div class="detail-score-fill score-blue" style="width:${s.seo || 0}%"></div></div><span class="detail-score-val">${s.seo || 0}%</span></div>
    <div class="detail-score-row"><span class="detail-score-label">Commercial</span><div class="detail-score-bar"><div class="detail-score-fill score-green" style="width:${s.commercial || 0}%"></div></div><span class="detail-score-val">${s.commercial || 0}%</span></div>
    <div class="detail-score-row"><span class="detail-score-label">Trust</span><div class="detail-score-bar"><div class="detail-score-fill score-orange" style="width:${s.trust || 0}%"></div></div><span class="detail-score-val">${s.trust || 0}%</span></div>
    <div class="detail-score-row"><span class="detail-score-label">Extension</span><div class="detail-score-bar"><div class="detail-score-fill score-purple" style="width:${s.extension || 0}%"></div></div><span class="detail-score-val">${s.extension || 0}%</span></div>`;

  const scoreVal = s.final || 0;
  let scoreColor = '#6b7280';
  if (scoreVal >= 90) scoreColor = '#f59e0b';
  else if (scoreVal >= 75) scoreColor = '#10b981';
  else if (scoreVal >= 60) scoreColor = '#3b82f6';

  const overlay = document.createElement('div');
  overlay.className = 'domain-details-overlay';
  overlay.id = 'domainDetailsOverlay';
  overlay.innerHTML = `
    <div class="domain-details-panel" style="--score-color:${scoreColor}">
      <div class="dd-header">
        <div class="dd-header-left">
          <h3 class="dd-domain-name">${d.name}</h3>
          ${labelsHtml}
        </div>
        <div class="dd-header-right">
          <span class="dd-avail ${d.available ? 'avail-yes' : 'avail-no'}">${d.available ? 'Available' : 'Registered'}</span>
          <button class="dd-close" id="ddClose">
            <svg viewBox="0 0 24 24" fill="none" style="width:18px;height:18px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>
        </div>
      </div>

      <div class="dd-body">
        <!-- Score Section (biggest element) -->
        <div class="dd-section dd-score-section">
          <div class="dd-score-main">
            <div class="dd-score-circle-wrap">
              <div class="dd-score-circle" style="background:conic-gradient(var(--score-color) ${scoreVal}%, var(--bg-input) 0)">
                <span class="dd-score-num">${scoreVal}</span>
                <span class="dd-score-glow"></span>
              </div>
            </div>
            <div class="dd-score-info">
              <span class="class-badge ${c.cls} dd-class-badge">${c.emoji} ${c.label}</span>
              <div class="dd-score-breakdown">${scoreBreakdown}</div>
            </div>
          </div>
        </div>

        <!-- Metrics Section -->
        <div class="dd-section">
          <h4 class="dd-section-title">Metrics</h4>
          <div class="dd-metrics-grid">${metricsHtml}</div>
        </div>

        <!-- Extensions Section -->
        <div class="dd-section">
          <h4 class="dd-section-title">Extensions</h4>
          <div class="dd-extensions">${extHtml}</div>
        </div>
      </div>

      <div class="dd-actions">
        <button class="dd-action-btn" data-action="dd-copy">
          <svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
          Copy
        </button>
        <button class="dd-action-btn" data-action="dd-fav">
          <svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>
          Favorite
        </button>
        <button class="dd-action-btn" data-action="dd-analyse">
          <svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px"><path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343 5.657l-.707-.707m2.828 2.828l-.707.707M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          Analyse
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Event handlers
  overlay.querySelector('#ddClose').addEventListener('click', e => { e.stopPropagation(); closeDomainDetails(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) closeDomainDetails(); });
  overlay.querySelector('[data-action="dd-copy"]').addEventListener('click', () => {
    navigator.clipboard.writeText(d.name).then(() => toast('Copied: ' + d.name));
  });
  overlay.querySelector('[data-action="dd-fav"]').addEventListener('click', () => {
    const added = toggleFavorite(d);
    overlay.querySelector('[data-action="dd-fav"]').classList.toggle('active', added);
  });
  overlay.querySelector('[data-action="dd-analyse"]').addEventListener('click', () => {
    closeDomainDetails();
    document.dispatchEvent(new CustomEvent('send-to-analyzer', { detail: { domain: d.name } }));
  });

  // Highlight row
  $$('.analyzer-table tbody tr').forEach(tr => tr.classList.remove('selected-row'));
  const row = $(`.analyzer-table tbody tr .td-domain[data-domain*="${baseName}"]`)?.closest('tr');
  if (row) row.classList.add('selected-row');
}

function closeDomainDetails() {
  const overlay = $('#domainDetailsOverlay');
  if (overlay) {
    overlay.classList.add('closing');
    setTimeout(() => overlay.remove(), 200);
  }
}
