// favorites.js — Favorites system with localStorage persistence
import { $, $$ } from './utils.js';

const STORAGE_KEY = 'ai-domains-favorites';

let favorites = [];
let favPanelOpen = false;
let onFavoritesChange = null;

// Load from localStorage
function loadFavorites() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    favorites = raw ? JSON.parse(raw) : [];
  } catch {
    favorites = [];
  }
}

// Save to localStorage
function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
  } catch { /* ignore */ }
}

// Check if domain is favorited
export function isFavorite(domainName) {
  return favorites.some(f => f.name === domainName);
}

// Add domain to favorites
export function addFavorite(domain) {
  if (!domain || !domain.name) return false;
  if (isFavorite(domain.name)) return false;
  favorites.unshift({ name: domain.name, ts: Date.now() });
  saveFavorites();
  notifyChange();
  return true;
}

// Remove domain from favorites
export function removeFavorite(domainName) {
  const idx = favorites.findIndex(f => f.name === domainName);
  if (idx === -1) return false;
  favorites.splice(idx, 1);
  saveFavorites();
  notifyChange();
  return true;
}

// Toggle favorite
export function toggleFavorite(domain) {
  if (!domain || !domain.name) return false;
  if (isFavorite(domain.name)) {
    removeFavorite(domain.name);
    return false; // now removed
  } else {
    addFavorite(domain);
    return true; // now added
  }
}

// Get all favorites
export function getFavorites() {
  return [...favorites];
}

// Get favorites count
export function getFavoritesCount() {
  return favorites.length;
}

// Callback when favorites change
export function setFavoritesChangeListener(cb) {
  onFavoritesChange = cb;
}

function notifyChange() {
  if (onFavoritesChange) onFavoritesChange(favorites);
  updateAllFavButtons();
  updateFavCounter();
}

// Update all favorite star buttons on domain cards
function updateAllFavButtons() {
  $$('.btn-fav').forEach(btn => {
    const name = btn.dataset.domain;
    if (name) {
      const active = isFavorite(name);
      btn.classList.toggle('active', active);
    }
  });
}

// Update navbar favorites counter
function updateFavCounter() {
  const counter = $('.fav-counter');
  if (!counter) return;
  const count = getFavoritesCount();
  counter.textContent = count;
  counter.classList.toggle('visible', count > 0);
}

// Create favorites panel HTML and append to body
export function createFavoritesPanel() {
  // Check if already exists
  if ($('#favOverlay')) return;

  const overlay = document.createElement('div');
  overlay.className = 'fav-overlay';
  overlay.id = 'favOverlay';
  overlay.innerHTML = `
    <div class="fav-panel" id="favPanel">
      <div class="fav-header">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        <h3>Favorites</h3>
        <span class="fav-count" id="favCount">0 domains</span>
        <button class="fav-close" id="favClose" aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>
      <div class="fav-body" id="favBody">
        <div class="fav-empty" id="favEmpty">
          <svg viewBox="0 0 24 24" fill="none"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5"/></svg>
          <p>No favorites yet</p>
          <span>Click the star icon on any domain to save it</span>
        </div>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  // Event listeners
  $('#favClose').addEventListener('click', () => closeFavoritesPanel());
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeFavoritesPanel();
  });
}

// Open favorites panel
export function openFavoritesPanel() {
  const overlay = $('#favOverlay');
  if (!overlay) createFavoritesPanel();
  const el = $('#favOverlay');
  if (el) {
    el.classList.add('open');
    favPanelOpen = true;
    renderFavoritesList();
  }
}

// Close favorites panel
export function closeFavoritesPanel() {
  const el = $('#favOverlay');
  if (el) {
    el.classList.remove('open');
    favPanelOpen = false;
  }
}

// Render favorites list
function renderFavoritesList() {
  const body = $('#favBody');
  const empty = $('#favEmpty');
  const countEl = $('#favCount');
  if (!body) return;

  const favs = getFavorites();
  if (countEl) countEl.textContent = favs.length + ' domain' + (favs.length !== 1 ? 's' : '');

  // Remove old items
  body.querySelectorAll('.fav-item').forEach(el => el.remove());

  if (!favs.length) {
    if (empty) empty.style.display = '';
    return;
  }

  if (empty) empty.style.display = 'none';

  favs.forEach(fav => {
    const item = document.createElement('div');
    item.className = 'fav-item';
    item.innerHTML = `
      <span class="fav-item-name">${fav.name}</span>
      <div class="fav-item-actions">
        <button class="fav-item-btn copy-btn" data-domain="${fav.name}" title="Copy">
          <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>
        </button>
        <button class="fav-item-btn remove-btn" data-domain="${fav.name}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </div>`;

    // Copy button
    item.querySelector('.copy-btn').addEventListener('click', () => {
      navigator.clipboard.writeText(fav.name).then(() => {
        const btn = item.querySelector('.copy-btn');
        btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        setTimeout(() => {
          btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>';
        }, 1200);
      });
    });

    // Remove button
    item.querySelector('.remove-btn').addEventListener('click', () => {
      removeFavorite(fav.name);
      item.style.opacity = '0';
      item.style.transform = 'translateX(20px)';
      item.style.transition = 'all .2s ease';
      setTimeout(() => {
        item.remove();
        // Re-render if last item
        if (!getFavorites().length) renderFavoritesList();
      }, 200);
    });

    body.appendChild(item);
  });
}

// Initialize favorites on page load
export function initFavorites() {
  loadFavorites();
  createFavoritesPanel();
  updateFavCounter();
}
