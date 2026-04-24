// components/domain-dropdown.js — Domain action dropdown for available domains
// Premium glassmorphism dropdown with registrar links + tools

const ARROW_SVG = `<svg viewBox="0 0 24 24" fill="none" style="width:10px;height:10px;margin-left:2px;transition:transform .15s"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const EXTERNAL_SVG = `<svg viewBox="0 0 24 24" fill="none" style="width:11px;height:11px;flex-shrink:0;opacity:.4"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const REGISTRARS = [
  { id: 'namecheap',  label: 'Namecheap',    icon: 'namecheap.png',  url: d => `https://www.namecheap.com/domains/registration/results/?domain=${d}` },
  { id: 'dynadot',    label: 'Dynadot',      icon: 'dynadot.png',    url: d => `https://www.dynadot.com/domain/search?domain=${d}` },
  { id: 'namesilo',   label: 'NameSilo',     icon: 'namesilo.png',   url: d => `https://www.namesilo.com/domain/search?query=${d}` },
  { id: 'spaceship',  label: 'Spaceship',    icon: 'spaceship.png',  url: d => `https://www.spaceship.com/domain-search/?query=${d}` },
  { id: 'porkbun',    label: 'Porkbun',      icon: 'porkbun.png',    url: d => `https://porkbun.com/checkout/search?q=${d}` },
  { id: 'ud',         label: 'Unstoppable Domains', icon: 'ud.ico',  url: d => `https://unstoppabledomains.com/search?searchTerm=${d}` },
];

const TOOLS = [
  { id: 'details', label: 'View Details', icon: 'search',  action: 'details' },
  { id: 'whois',   label: 'Whois Lookup', icon: 'shield',  action: 'whois', url: d => `https://whois.domaintools.com/${d}` },
  { id: 'analyze', label: 'Analyze',      icon: 'bulb',    action: 'analyze' },
];

const TOOL_ICONS = {
  search: `<svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px;flex-shrink:0"><path d="M11 19a8 8 0 100-16 8 8 0 000 16zM21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px;flex-shrink:0"><path d="M12 2l8 4v6c0 5.25-3.5 8.25-8 10-4.5-1.75-8-4.75-8-10V6l8-4z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  bulb: `<svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px;flex-shrink:0"><path d="M9.663 17h4.674M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343 5.657l-.707-.707m2.828 2.828l-.707.707M12 12a4 4 0 100-8 4 4 0 000 8z" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

let activeDropdown = null;

function closeActiveDropdown() {
  if (activeDropdown) {
    activeDropdown.classList.remove('dd-open');
    const ref = activeDropdown;
    setTimeout(() => {
      if (!ref.classList.contains('dd-open') && ref.parentNode) {
        ref.remove();
      }
    }, 180);
    activeDropdown = null;
  }
}

function positionDropdown(panel, trigger) {
  const rect = trigger.getBoundingClientRect();
  const pw = 240;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rect.right - pw;
  let top = rect.bottom + 6;

  if (left < 10) left = 10;
  if (left + pw > vw - 10) left = vw - pw - 10;

  panel.style.position = 'fixed';
  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
  panel.style.width = pw + 'px';

  requestAnimationFrame(() => {
    const menuH = panel.scrollHeight;
    if (top + menuH > vh - 10 && rect.top - menuH - 6 > 10) {
      panel.style.top = (rect.top - menuH - 6) + 'px';
    }
  });
}

/**
 * Create the "Continue" button + dropdown for an available domain.
 * Returns the button element to append into card-actions.
 */
export function createContinueButton(domainName) {
  const wrap = document.createElement('div');
  wrap.className = 'continue-wrap';

  const btn = document.createElement('button');
  btn.className = 'btn-continue';
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:13px;height:13px"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>Continue${ARROW_SVG}`;

  wrap.appendChild(btn);

  btn.addEventListener('click', e => {
    e.preventDefault();
    e.stopPropagation();

    // Close any existing dropdown
    if (activeDropdown) {
      const isSame = activeDropdown.dataset.ddDomain === domainName;
      closeActiveDropdown();
      if (isSame) return;
    }

    // Build dropdown panel
    const panel = document.createElement('div');
    panel.className = 'domain-dropdown dd-open';
    panel.dataset.ddDomain = domainName;

    let html = '';

    // Register section
    html += '<div class="dd-section-label">Register Domain</div>';
    html += '<div class="dd-links">';
    REGISTRARS.forEach(r => {
      html += `<a href="${r.url(domainName)}" target="_blank" rel="noopener" class="dd-link dd-registrar-link">
        <img src="/assets/aidomains/${r.icon}" loading="lazy" class="dd-link-icon" />
        <span class="dd-link-text">${r.label}</span>
        ${EXTERNAL_SVG}
      </a>`;
    });
    html += '</div>';

    // Divider
    html += '<div class="dd-divider"></div>';

    // Tools section
    html += '<div class="dd-section-label">Tools</div>';
    html += '<div class="dd-links">';
    TOOLS.forEach(t => {
      if (t.url) {
        html += `<a href="${t.url(domainName)}" target="_blank" rel="noopener" class="dd-link dd-tool-link">
          ${TOOL_ICONS[t.icon]}
          <span class="dd-link-text">${t.label}</span>
          ${EXTERNAL_SVG}
        </a>`;
      } else {
        html += `<button class="dd-link dd-tool-link" data-dd-action="${t.action}" data-dd-domain="${domainName}">
          ${TOOL_ICONS[t.icon]}
          <span class="dd-link-text">${t.label}</span>
        </button>`;
      }
    });
    html += '</div>';

    panel.innerHTML = html;
    document.body.appendChild(panel);
    activeDropdown = panel;

    // Position
    positionDropdown(panel, btn);

    // Wire tool actions
    panel.querySelectorAll('[data-dd-action]').forEach(el => {
      el.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        const action = el.dataset.ddAction;
        const domain = el.dataset.ddDomain;
        closeActiveDropdown();

        if (action === 'details') {
          localStorage.setItem('selected_domain', domain);
          window.location.href = 'domain.html?domain=' + encodeURIComponent(domain);
        } else if (action === 'analyze') {
          document.dispatchEvent(new CustomEvent('send-to-analyzer', { detail: { domain } }));
        }
      });
    });
  });

  return wrap;
}

/**
 * Create the standard Copy button (for taken/unknown domains).
 */
export function createCopyButton(domainName) {
  const btn = document.createElement('button');
  btn.className = 'btn-copy';
  btn.dataset.domain = domainName;
  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg>Copy`;
  return btn;
}

// Close on outside click
document.addEventListener('click', e => {
  if (activeDropdown && !activeDropdown.contains(e.target) && !e.target.closest('.btn-continue')) {
    closeActiveDropdown();
  }
});

// Close on scroll/resize
window.addEventListener('scroll', () => { if (activeDropdown) closeActiveDropdown(); }, { passive: true });
window.addEventListener('resize', () => { if (activeDropdown) closeActiveDropdown(); });

export { closeActiveDropdown };
