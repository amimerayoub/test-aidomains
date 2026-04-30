// ui.js — Rendering results, cards, animations, filters
// STATE PERSISTENCE FIX: navigateToDomain() now saves domain before navigation
import { $, $$ } from './utils.js';
import { createActionMenu, closeAllActionMenus } from '../components/action-menu.js';
import { createContinueButton, createCopyButton, closeActiveDropdown } from '../components/domain-dropdown.js';
import { toggleFavorite, isFavorite } from './favorites.js';

// ── Navigate to domain details — SAVE STATE FIRST ─────────────
function navigateToDomain(domainName) {
  // Save in both sessionStorage (tab-isolated, preferred) and localStorage (fallback)
  try { sessionStorage.setItem('aiDomains_selected', domainName); } catch (e) {}
  try { localStorage.setItem('selected_domain', domainName); } catch (e) {}
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

  const actionsEl = card.querySelector('.card-actions');
  if (isAvail) {
    actionsEl.appendChild(createContinueButton(domainName));
  } else {
    const copyBtn = createCopyButton(domainName);
    actionsEl.appendChild(copyBtn);
  }

  const nameEl = card.querySelector('.domain-name');
  if (nameEl) {
    nameEl.addEventListener('click', e => {
      e.stopPropagation();
      navigateToDomain(domainName);
    });
  }

  const favBtn = card.querySelector('.btn-fav');
  if (favBtn) {
    favBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const added = toggleFavorite(domain);
      favBtn.classList.toggle('active', added);
    });
  }

  return card;
}

export function clearResults() {
  const grid = $('#resultsGrid');
  if (grid) {
    grid.style.transition = 'opacity 0.15s';
    grid.style.opacity = '0';
    setTimeout(() => {
      grid.innerHTML = '';
      grid.style.opacity = '1';
    }, 150);
  }
  closeAllActionMenus();
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
  if (uiState.sort === 'name') d.sort((a, b) => (a.name || a.domain).localeCompare(b.name || b.domain));

  const countEl = $('#resultsCount');
  if (countEl) countEl.textContent = d.length + ' domain' + (d.length !== 1 ? 's' : '');

  closeAllActionMenus();

  const grid = $('#resultsGrid');
  if (!grid) return;
  grid.innerHTML = '';
  grid.style.opacity = '0';
  grid.style.transition = 'opacity 0.2s';
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

  if (onCopyAll) {
    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'btn-generate';
    copyAllBtn.style.marginBottom = '14px';
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
  btn.style.opacity = disabled ? '0.5' : '1';
  btn.style.pointerEvents = disabled ? 'none' : '';
}

// ============================================================
// SMART DOMAIN ANALYZER RENDERING
// ============================================================

const STAR_SVG_SM = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(n);
}

export function renderAnalyzerResults(domains) {
  const grid = $('#resultsGrid');
  const emptyEl = $('#resultsEmpty');
  const countEl = $('#resultsCount');
  const titleEl = $('#resultsTitle');

  if (titleEl) titleEl.textContent = 'Analysis Results';
  
  closeAllActionMenus();

  if (!domains || !domains.length) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (grid) { grid.innerHTML = ''; grid.style.opacity = '1'; }
    if (countEl) countEl.textContent = '0 domains';
    const anaCountEl = $('#analyzerDomainCount');
    if (anaCountEl) anaCountEl.textContent = '0 matching';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (countEl) countEl.textContent = domains.length + ' domain' + (domains.length !== 1 ? 's' : '');
  
  const anaCountEl = $('#analyzerDomainCount');
  if (anaCountEl) anaCountEl.textContent = domains.length + ' of ' + (window._analyzerTotal || domains.length) + ' domains';

  if (!grid) return;
  grid.style.opacity = '0';
  grid.style.transition = 'opacity 0.2s';
  grid.innerHTML = '';

  const hasAdvanced = domains[0]?.scores;
  if (hasAdvanced) {
    renderAnalyzerTable(grid, domains);
  } else {
    // Basic cards with analyzer specific event handlers
    const fragment = document.createDocumentFragment();
    domains.forEach((d, i) => {
      const card = createDomainCard(d, i);
      const copyBtn = card.querySelector('.btn-copy');
      if (copyBtn) {
        copyBtn.addEventListener('click', function () { copyText(d.name || d.domain, this); });
      }
      createActionMenu(card, d);
      fragment.appendChild(card);
    });
    grid.appendChild(fragment);
  }
  
  requestAnimationFrame(() => { grid.style.opacity = '1'; });
  
  const rs = $('#resultsSection');
  if (rs) rs.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderAnalyzerTable(container, domains) {
  let html = '<div class="domain-list">';

  domains.forEach((d, i) => {
    const s = d.scores;
    const m = d.metrics;
    const c = d.classification;
    const favActive = isFavorite(d.name);
    const smartLabels = (d.smartLabels || []).slice(0, 3);
    
    // Professional SVG Icons
    const icoClock = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`;
    const icoChart = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>`;
    const icoShield = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const icoDollar = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>`;
    const icoLink = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`;
    const icoText = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="dc-svg-ico"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>`;

    // Quality Icons
    const icoElite = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="dc-class-svg"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L16.18 21 12 17.77 7.82 21 9 14.14l-5-4.87 5.91-1.01L12 2z"/></svg>`;
    const icoBolt = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="dc-class-svg"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    const icoTrending = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="dc-class-svg"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
    const icoAlert = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="dc-class-svg"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;

    const scoreColor = s.final >= 90 ? '#d97706' : s.final >= 75 ? '#16a34a' : s.final >= 60 ? '#3B82F6' : '#94a3b8';
    const dashOffset = 226 - (226 * s.final) / 100;

    html += `<div class="domain-card-row" data-idx="${i}" style="animation-delay:${i * 0.025}s">
      <!-- LEFT PANEL: ID & MAIN INFO -->
      <div class="dc-panel-left">
        <div class="dc-main-top">
          <p class="dc-name" data-domain='${JSON.stringify(d).replace(/'/g, "&#39;")}'>${d.name}</p>
          <span class="dc-badge ${d.available === true ? 'dc-avail' : d.available === 'checking' ? 'dc-checking' : 'dc-taken'}">
            <span class="dc-badge-dot"></span>${d.available === true ? 'Available' : d.available === 'checking' ? 'Checking...' : 'Registered'}
          </span>
        </div>
        
        <div class="dc-score-wrap" style="--score-color: ${scoreColor}; background: conic-gradient(var(--score-color) ${s.final}%, rgba(255,255,255,0.06) 0%);">
          <div class="dc-score-inner">
            <span class="dc-score-val" style="color: ${scoreColor}">${s.final}</span>
            <span class="dc-score-label">SCORE</span>
          </div>
        </div>
      </div>

      <!-- CENTER PANEL: QUALITY & TAGS -->
      <div class="dc-panel-center">
        <div class="dc-class-badge ${c.cls}">
          <span class="dc-class-ico">
            ${c.cls === 'class-elite' ? icoElite : c.cls === 'class-highvalue' ? icoTrending : c.cls === 'class-goodflip' ? icoBolt : icoAlert}
          </span>
          <span class="dc-class-label">${c.label}</span>
        </div>
        <div class="dc-tags-grid">
          ${smartLabels.map(l => `<span class="dc-tag">${l}</span>`).join('')}
        </div>
      </div>

      <!-- RIGHT PANEL: METRICS & ACTIONS -->
      <div class="dc-panel-right">
        <div class="dc-metrics-grid">
          <div class="dc-metric-card" title="Domain Age">
            <div class="dc-m-icon m-age">${icoClock}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.age ? m.age + 'y' : '—'}</span>
              <span class="dc-m-lbl">AGE</span>
            </div>
          </div>
          <div class="dc-metric-card" title="Domain Popularity">
            <div class="dc-m-icon m-dp">${icoChart}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.dp ? formatNum(m.dp) : '—'}</span>
              <span class="dc-m-lbl">DP</span>
            </div>
          </div>
          <div class="dc-metric-card" title="Trust Flow">
            <div class="dc-m-icon m-tf">${icoShield}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.tf || '—'}</span>
              <span class="dc-m-lbl">TF</span>
            </div>
          </div>
          <div class="dc-metric-card" title="Cost Per Click">
            <div class="dc-m-icon m-cpc">${icoDollar}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.cpc ? '$' + m.cpc : '—'}</span>
              <span class="dc-m-lbl">CPC</span>
            </div>
          </div>
          <div class="dc-metric-card" title="Backlinks">
            <div class="dc-m-icon m-bl">${icoLink}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.bl ? formatNum(m.bl) : '—'}</span>
              <span class="dc-m-lbl">BL</span>
            </div>
          </div>
          <div class="dc-metric-card" title="Letters count">
            <div class="dc-m-icon m-le">${icoText}</div>
            <div class="dc-m-info">
              <span class="dc-m-val">${m.le || '—'}</span>
              <span class="dc-m-lbl">LE</span>
            </div>
          </div>
        </div>

        <div class="dc-footer">
          <div class="dc-actions">
            <button class="dc-btn-icon dc-fav${favActive ? ' active' : ''}" data-domain="${d.name}" title="Favorite">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21 12 17.77 7.82 21 9 14.14l-5-4.87 5.91-1.01L12 2z"/></svg>
            </button>
            <button class="dc-btn-icon dc-copy" data-domain="${d.name}" title="Copy Domain">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>
            <button class="dc-btn-icon dc-analyse" data-action="analyse" data-domain='${JSON.stringify(d).replace(/'/g, "&#39;")}' title="Deep Analysis">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </button>
            ${d.available === true ? `<div class="dc-continue-slot" data-continue-domain="${d.name}"></div>` : ''}
          </div>
        </div>
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;

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

  container.querySelectorAll('.dc-name').forEach(cell => {
    cell.addEventListener('click', e => {
      e.stopPropagation();
      let domainData;
      try { domainData = JSON.parse(cell.dataset.domain); } catch { return; }
      navigateToDomain(domainData.name);
    });
  });

  container.querySelectorAll('.dc-continue-slot').forEach(slot => {
    const domain = slot.dataset.continueDomain;
    if (domain) slot.appendChild(createContinueButton(domain));
  });
}

function renderAnalyzerCards(container, domains) {
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
        ${STAR_SVG_SM}<span class="fav-pop"></span>
      </button>
      <div class="domain-name" style="cursor:pointer">${d.name}</div>
      <div class="domain-status ${sc}"><span class="status-dot"></span><span>${st}</span></div>
      <div class="card-actions"></div>`;

    const actionsEl = card.querySelector('.card-actions');
    if (isAvail) {
      actionsEl.appendChild(createContinueButton(d.name));
    } else {
      const copyBtn = createCopyButton(d.name);
      actionsEl.appendChild(copyBtn);
      copyBtn.addEventListener('click', function () { copyText(d.name, this); });
    }

    const favBtn = card.querySelector('.btn-fav');
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        const added = toggleFavorite(d);
        favBtn.classList.toggle('active', added);
      });
    }

    const nameEl = card.querySelector('.domain-name');
    if (nameEl) nameEl.addEventListener('click', () => navigateToDomain(d.name));

    createActionMenu(card, d);
    fragment.appendChild(card);
  });

  grid.appendChild(fragment);
  requestAnimationFrame(() => { grid.style.opacity = '1'; });
}
