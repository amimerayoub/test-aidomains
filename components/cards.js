// components/cards.js — Standalone result card rendering (used by external consumers)
import { createActionMenu } from './action-menu.js';
import { isFavorite } from '../js/favorites.js';

const BADGE_MAP = {
  premium: { cls: 'badge-premium', txt: '✨ Premium' },
  highvalue: { cls: 'badge-highvalue', txt: '💎 High Value' },
  easysell: { cls: 'badge-easysell', txt: '🏷️ Easy Sell' }
};

const STAR_SVG = `<svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.09 6.26L20 9.27l-5 4.87L16.18 21L12 17.77 7.82 21 9 14.14 4 9.27l5.91-1.01L12 2z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;

export function createDomainCard(domain, index = 0) {
  const card = document.createElement('div');
  card.className = 'domain-card';
  card.style.animationDelay = (index * 0.035) + 's';

  const sc = domain.available ? 'status-available' : 'status-taken';
  const st = domain.available ? 'Available' : 'Taken';
  const favActive = isFavorite(domain.name);

  const badges = (domain.badges || []).map(b => {
    const info = BADGE_MAP[b] || { cls: '', txt: b };
    return `<span class="badge ${info.cls}">${info.txt}</span>`;
  }).join('');

  card.innerHTML = `
    <button class="btn-fav${favActive ? ' active' : ''}" data-domain="${domain.name}" title="Add to Favorites">
      ${STAR_SVG}
      <span class="fav-pop"></span>
    </button>
    <div class="domain-name">${domain.name}</div>
    <div class="domain-status ${sc}"><span class="status-dot"></span><span>${st}</span></div>
    <div class="domain-scores">
      <span class="score-badge score-cpc">💰 ${domain.cpc}</span>
      <span class="score-badge score-sell">🔥 ${domain.sell}</span>
      <span class="score-badge score-brand">⚡ ${domain.brand}</span>
    </div>
    <div class="domain-price">${domain.price}</div>
    <div class="domain-badges">${badges}</div>
    <button class="btn-copy" data-domain="${domain.name}">
      <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
      Copy
    </button>`;

  return card;
}

export function createBulkResultItem(domain) {
  const item = document.createElement('div');
  item.className = 'bulk-result-item';
  const avail = domain.available;
  item.innerHTML = `
    <span class="bulk-domain">${domain.name}</span>
    <span class="bulk-status ${avail ? 'bulk-available' : 'bulk-taken'}">${avail ? '✅ Available' : '❌ Taken'}</span>`;
  return item;
}

export function createExtractedItem(text) {
  const item = document.createElement('div');
  item.className = 'extracted-item';
  item.innerHTML = `
    <span>${text}</span>
    <button class="btn-copy btn-copy-sm">
      <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
    </button>`;
  return item;
}

export function renderBatchResults(container, domains, onCopy) {
  container.innerHTML = '';
  container.style.opacity = '0';
  const fragment = document.createDocumentFragment();
  domains.forEach((d, i) => {
    const card = createDomainCard(d, i);
    const copyBtn = card.querySelector('.btn-copy');
    if (copyBtn && onCopy) {
      copyBtn.addEventListener('click', function () { onCopy(d.name, this); });
    }
    // Favorite button handler — dispatch custom event for main.js to handle
    const favBtn = card.querySelector('.btn-fav');
    if (favBtn) {
      favBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        favBtn.classList.remove('pop');
        void favBtn.offsetWidth;
        favBtn.classList.add('pop');
        setTimeout(() => favBtn.classList.remove('pop'), 400);
        document.dispatchEvent(new CustomEvent('fav-toggle', { detail: { domain: d, btn: favBtn } }));
      });
    }
    createActionMenu(card, d);
    fragment.appendChild(card);
  });
  container.appendChild(fragment);
  requestAnimationFrame(() => { container.style.opacity = '1'; });
}

export function renderCopyAllButton() {
  const btn = document.createElement('button');
  btn.className = 'btn-generate';
  btn.style.marginBottom = '16px';
  btn.style.maxWidth = '200px';
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>Copy All';
  return btn;
}
