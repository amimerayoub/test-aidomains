// components/action-menu.js — Domain analysis action menu
// SVG icon helper
function svgIcon(path, viewBox = '0 0 24 24') {
  return `<svg viewBox="${viewBox}" fill="none"><path d="${path}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

const ICO = {
  globe: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zM2 12h2M12 2v2M22 12h-2',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35',
  chart: 'M3 3v18h18M7 16l4-4 4 4 5-6',
  barChart: 'M3 3v18h18M7 16v-6M11 16v-4M15 16v-8M19 16V10',
  clock: 'M12 2a10 10 0 100 20 10 10 0 000-20zM12 6v6l4 2',
  dollar: 'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  shield: 'M12 2l8 4v6c0 5.25-3.5 8.25-8 10-4.5-1.75-8-4.75-8-10V6l8-4z',
  alert: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01',
  cart: 'M3 3h2l1.68 8.39a2 2 0 002 1.61h8.72a2 2 0 002-1.61L21 6H6',
};

export const ACTION_LINKS = {
  analysis: [
    { id: 'whois', label: 'Whois', icon: 'whois.png', url: d => `https://whois.domaintools.com/${d}` },
    { id: 'google', label: 'Search', icon: 'google.png', url: d => `https://www.google.com/search?q=${d}` },
    { id: 'spyfu', label: 'SpyFu', icon: 'spyfu.png', url: d => `https://www.spyfu.com/overview/domain?query=${d}` },
    { id: 'dotdb', label: 'DotDB', icon: 'dotdb.png', url: d => `https://dotdb.com/search?keyword=${d}` },
    { id: 'archive', label: 'Wayback Machine', icon: 'archive.png', url: d => `https://web.archive.org/web/*/${d}` },
    { id: 'namebio', label: 'Comparable Sales', icon: 'pc.png', url: d => `https://namebio.com/?term=${d.split('.')[0]}` },
  ],
  seo: [
    { id: 'spamcheck', label: 'Spam', icon: 'spam.png', url: d => `https://www.spamhaus.org/query/domain/${d}` },
    { id: 'trademark', label: 'Trademark', icon: 'trademark.png', url: () => 'https://tmsearch.uspto.gov/search/search-information' },
  ],
  appraisal: [
    { id: 'godaddy', label: 'GoDaddy', icon: 'godaddy.png', url: d => `https://www.godaddy.com/domain-value-appraisal/appraisal/?domainToCheck=${d}` },
    { id: 'dynadot-app', label: 'Dynadot', icon: 'dynadot.png', url: d => `https://www.dynadot.com/domain/appraisal?domain=${d}` },
  ],
  registrar: [
    { id: 'namecheap', label: 'Namecheap', icon: 'namecheap.png', url: d => `https://www.namecheap.com/domains/registration/results/?domain=${d}` },
    { id: 'dynadot', label: 'Dynadot', icon: 'dynadot.png', url: d => `https://www.dynadot.com/domain/search.html?domain=${d}` },
    { id: 'namesilo', label: 'NameSilo', icon: 'namesilo.png', url: d => `https://www.namesilo.com/domain/search-domains?query=${d}` },
    { id: 'spaceship', label: 'Spaceship', icon: 'spaceship.png', url: d => `https://spaceship.com/domain/search?query=${d}` },
    { id: 'porkbun', label: 'Porkbun', icon: 'porkbun.png', url: d => `https://porkbun.com/checkout/search?q=${d}` },
    { id: 'ud', label: 'Unstoppable', icon: 'ud.ico', url: d => `https://unstoppabledomains.com/search?searchTerm=${d}` },
  ]
};

let activeMenu = null;

function positionPanel(panel, trigger) {
  const rect = trigger.getBoundingClientRect();
  const menuW = 260;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Position below trigger, keep within viewport
  let left = rect.left;
  let top = rect.bottom + 6;

  // Ensure not going off right edge
  if (left + menuW > vw - 10) left = vw - menuW - 10;
  if (left < 10) left = 10;

  panel.style.position = 'fixed';
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';
  panel.style.width = menuW + 'px';

  // Measure after positioning to constrain max-height
  requestAnimationFrame(() => {
    const menuH = panel.scrollHeight;
    const maxHeight = vh - top - 10;
    if (menuH > maxHeight) {
      panel.style.maxHeight = maxHeight + 'px';
    }
    // If not enough space below, position above
    if (rect.bottom + menuH > vh - 10 && rect.top - menuH - 6 > 10) {
      panel.style.top = (rect.top - menuH - 6) + 'px';
    }
  });
}

export function createActionMenu(card, domain) {
  const existing = card.querySelector('.domain-action-menu');
  if (existing) existing.remove();

  const menu = document.createElement('div');
  menu.className = 'domain-action-menu';

  const domainName = domain.name || domain;
  const isAvailable = domain.available !== false;

  // Analyse button
  const trigger = document.createElement('button');
  trigger.className = 'btn-analyse';
  trigger.title = 'Click for external tools · "Send to Smart Analyzer" in menu';
  trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343 5.657l-.707-.707m2.828 2.828l-.707.707M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Analyse';

  // Dropdown panel — rendered at body level to avoid stacking context issues
  const panel = document.createElement('div');
  panel.className = 'action-panel';
  panel.dataset.domain = domainName;

  let html = '';

  // 1. Analysis Tools
  html += '<div class="action-section-label">ANALYSIS</div><div class="action-links">';
  ACTION_LINKS.analysis.forEach(a => {
    html += `<a href="${a.url(domainName)}" target="_blank" rel="noopener" class="action-link"><img src="/assets/aidomains/${a.icon}" loading="lazy" class="action-icon" />${a.label}</a>`;
  });
  html += '</div>';

  // 2. SEO / Research
  html += '<div class="action-section-label">SEO &amp; RESEARCH</div><div class="action-links">';
  ACTION_LINKS.seo.forEach(a => {
    html += `<a href="${a.url(domainName)}" target="_blank" rel="noopener" class="action-link"><img src="/assets/aidomains/${a.icon}" loading="lazy" class="action-icon" />${a.label}</a>`;
  });
  html += '</div>';

  // 3. Appraisal
  html += '<div class="action-section-label">APPRAISAL</div><div class="action-links">';
  ACTION_LINKS.appraisal.forEach(a => {
    html += `<a href="${a.url(domainName)}" target="_blank" rel="noopener" class="action-link"><img src="/assets/aidomains/${a.icon}" loading="lazy" class="action-icon" />${a.label}</a>`;
  });
  html += '</div>';

  // 4. Register (only if available)
  if (isAvailable) {
    html += '<div class="action-section-label action-register-label">REGISTER</div><div class="action-links">';
    ACTION_LINKS.registrar.forEach(a => {
      html += `<a href="${a.url(domainName)}" target="_blank" rel="noopener" class="action-link action-register"><img src="/assets/aidomains/${a.icon}" loading="lazy" class="action-icon" />${a.label}</a>`;
    });
    html += '</div>';
  }

  // Divider + Send to Analyzer
  html += '<div class="action-divider"></div>';
  html += `<button class="action-btn action-send" data-action="send-to-analyzer"><img src="/assets/aidomains/pc.png" loading="lazy" class="action-icon" />Send to Smart Analyzer</button>`;

  panel.innerHTML = html;

  // Append menu container to card, but panel to body
  menu.appendChild(trigger);
  card.appendChild(menu);

  // Append panel to body for highest stacking priority
  document.body.appendChild(panel);

  // Toggle handler
  trigger.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = panel.classList.contains('open');

    // Close any open menu first
    if (activeMenu && activeMenu !== panel) {
      activeMenu.panelEl.classList.remove('open');
      setTimeout(() => {
        if (!activeMenu.panelEl.classList.contains('open') && activeMenu.panelEl.parentNode) {
          activeMenu.panelEl.remove();
        }
      }, 200);
    }

    if (!isOpen) {
      positionPanel(panel, trigger);
      panel.classList.add('open');
      activeMenu = { panelEl: panel, card };
    } else {
      panel.classList.remove('open');
      activeMenu = null;
      setTimeout(() => {
        if (!panel.classList.contains('open') && panel.parentNode) {
          panel.remove();
        }
      }, 200);
    }
  });

  // "Send to Smart Analyzer" button inside panel
  panel.querySelectorAll('.action-send').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      closeAllActionMenus();
      document.dispatchEvent(new CustomEvent('send-to-analyzer', { detail: { domain: domainName } }));
    });
  });
}

export function closeAllActionMenus() {
  if (activeMenu) {
    activeMenu.panelEl.classList.remove('open');
    setTimeout(() => {
      if (!activeMenu.panelEl.classList.contains('open') && activeMenu.panelEl.parentNode) {
        activeMenu.panelEl.remove();
      }
    }, 200);
    activeMenu = null;
  }
}

// Close menu when clicking outside
document.addEventListener('click', e => {
  if (activeMenu && !activeMenu.panelEl.contains(e.target) && !e.target.closest('.btn-analyse')) {
    closeAllActionMenus();
  }
});

// Close menu on scroll and resize
let scrollTimeout;
window.addEventListener('scroll', () => {
  if (activeMenu) {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => closeAllActionMenus(), 50);
  }
}, { passive: true });

window.addEventListener('resize', () => {
  if (activeMenu) {
    closeAllActionMenus();
  }
});
