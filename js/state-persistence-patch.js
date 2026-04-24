/**
 * state-persistence-patch.js
 * 
 * This file documents the exact changes needed in main.js and ui.js
 * to fix domain state loss on navigation.
 * 
 * Apply these changes to the respective files.
 */

// ============================================================
// PATCH 1: main.js — Import saveGeneratedDomains from scoring.js
// ============================================================
// ADD to imports at top of main.js:
//
// import { saveGeneratedDomains, loadGeneratedDomains, saveSelectedDomain, saveAnalysisResults } from './scoring.js';

// ============================================================
// PATCH 2: main.js — handleGenerate() — Save after generation
// ============================================================
// FIND in handleGenerate():
//
//   state.domains = domains;
//   localStorage.setItem('domains_geo', JSON.stringify(domains));
//   renderResults(domains, titles[type] + ' Results', copyText);
//
// REPLACE WITH:
//
//   state.domains = domains;
//   saveGeneratedDomains(domains);                              // <-- PERSIST
//   localStorage.setItem('domains_geo', JSON.stringify(domains));
//   renderResults(domains, titles[type] + ' Results', copyText);

// ============================================================
// PATCH 3: main.js — handleGenDomains() — Save after news gen
// ============================================================
// FIND in handleGenDomains():
//
//   state.domains = domains;
//   state.domains.forEach(d => { if (d.available === undefined) d.available = 'checking'; });
//   localStorage.setItem('generatedDomains', JSON.stringify(domains));
//
// REPLACE WITH:
//
//   state.domains = domains;
//   state.domains.forEach(d => { if (d.available === undefined) d.available = 'checking'; });
//   saveGeneratedDomains(domains);   // <-- use unified persist fn
//   localStorage.setItem('generatedDomains', JSON.stringify(domains));

// ============================================================
// PATCH 4: main.js — applyAnalyzerFilters() — Save analysis results
// ============================================================
// FIND at end of applyAnalyzerFilters():
//
//   window.analysisResults = filtered;
//   localStorage.setItem('analysisResults', JSON.stringify(filtered));
//
// REPLACE WITH:
//
//   window.analysisResults = filtered;
//   saveAnalysisResults(filtered);  // <-- use unified persist fn
//   localStorage.setItem('analysisResults', JSON.stringify(filtered));

// ============================================================
// PATCH 5: main.js — initApp() restore state section
// ============================================================
// FIND the restore state block (bottom of initApp):
//
//   try {
//     const savedGen = localStorage.getItem('domains_geo');
//     ...
//   } catch (e) { ... }
//
// REPLACE WITH:
//
//   try {
//     // Try new unified key first, fall back to legacy keys
//     let restoredDomains = loadGeneratedDomains();
//     if (!restoredDomains.length) {
//       const legacyGeo = localStorage.getItem('domains_geo');
//       if (legacyGeo) restoredDomains = JSON.parse(legacyGeo);
//     }
//     if (!restoredDomains.length) {
//       const legacyNews = localStorage.getItem('generatedDomains');
//       if (legacyNews) restoredDomains = JSON.parse(legacyNews);
//     }
//
//     if (restoredDomains.length) {
//       state.domains = restoredDomains;
//       if (savedTool !== 'home' && savedTool !== 'analyzer' && savedTool !== 'emailtool') {
//         renderResults(restoredDomains, 'Restored Generated Domains', copyText);
//       }
//     }
//
//     const savedAna = localStorage.getItem('analysisResults');
//     if (savedAna) {
//       window.analysisResults = JSON.parse(savedAna);
//       if (savedTool === 'analyzer' && window.analysisResults && window.analysisResults.length) {
//         renderAnalyzerResults(window.analysisResults);
//       }
//     }
//   } catch (e) {
//     console.error('Error restoring state:', e);
//   }

// ============================================================
// PATCH 6: ui.js — navigateToDomain() — Save before navigate
// ============================================================
// FIND:
//
//   function navigateToDomain(domainName) {
//     localStorage.setItem('selected_domain', domainName);
//     window.location.href = 'domain.html?domain=' + encodeURIComponent(domainName);
//   }
//
// REPLACE WITH:
//
//   function navigateToDomain(domainName) {
//     // Save selection in session (per-tab) AND localStorage (persistent)
//     try { sessionStorage.setItem('aiDomains_selected', domainName); } catch (e) {}
//     localStorage.setItem('selected_domain', domainName);
//     window.location.href = 'domain.html?domain=' + encodeURIComponent(domainName);
//   }

// ============================================================
// PATCH 7: action-menu.js / domain-dropdown.js — Save before navigate
// ============================================================
// FIND in domain-dropdown.js:
//
//   if (action === 'details') {
//     localStorage.setItem('selected_domain', domain);
//     window.location.href = 'domain.html?domain=' + encodeURIComponent(domain);
//   }
//
// REPLACE WITH:
//
//   if (action === 'details') {
//     try { sessionStorage.setItem('aiDomains_selected', domain); } catch (e) {}
//     localStorage.setItem('selected_domain', domain);
//     window.location.href = 'domain.html?domain=' + encodeURIComponent(domain);
//   }

// ============================================================
// PATCH 8: domainDetails.js — getDomain() — Check session storage too
// ============================================================
// FIND:
//
//   function getDomain() {
//     const p = new URLSearchParams(window.location.search);
//     return (p.get('domain') || p.get('d') || '').trim().toLowerCase();
//   }
//
// REPLACE WITH:
//
//   function getDomain() {
//     const p = new URLSearchParams(window.location.search);
//     let domain = (p.get('domain') || p.get('d') || '').trim().toLowerCase();
//
//     // Fallback: check session/local storage if URL param missing
//     if (!domain) {
//       try { domain = sessionStorage.getItem('aiDomains_selected') || ''; } catch (e) {}
//     }
//     if (!domain) {
//       domain = localStorage.getItem('selected_domain') || '';
//     }
//
//     return domain.trim().toLowerCase();
//   }

// ============================================================
// STANDALONE JS SNIPPET — drop into main.js initApp() ONCE
// This ensures domains are never lost even on hard refresh
// ============================================================
export function installDomainPersistence() {
  // Intercept all navigation to domain details to save state first
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="domain.html"]');
    if (link) {
      const url = new URL(link.href, window.location.href);
      const domain = url.searchParams.get('domain');
      if (domain) {
        try { sessionStorage.setItem('aiDomains_selected', domain); } catch (err) {}
        localStorage.setItem('selected_domain', domain);
      }
    }
  }, true);

  // Save generated domains whenever state.domains changes
  // by monkey-patching renderResults — see PATCH 2 above
}

// ============================================================
// QUICK PATCH — Drop-in functions to add to main.js
// These replace the need to import from scoring.js
// ============================================================

export function persistDomains(domains) {
  if (!domains || !Array.isArray(domains) || !domains.length) return;
  try {
    const data = JSON.stringify(domains);
    localStorage.setItem('aiDomains_generated', data);
    localStorage.setItem('generatedDomains', data);      // legacy compat
    localStorage.setItem('domains_geo', data);           // legacy compat
  } catch (e) {
    console.warn('[State] Failed to persist domains:', e.message);
  }
}

export function restoreDomains() {
  const keys = ['aiDomains_generated', 'generatedDomains', 'domains_geo'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    } catch (e) {
      continue;
    }
  }
  return [];
}

export function persistAnalysis(results) {
  if (!results) return;
  try {
    localStorage.setItem('aiDomains_analysis', JSON.stringify(results));
    localStorage.setItem('analysisResults', JSON.stringify(results));  // legacy
  } catch (e) {}
}

export function restoreAnalysis() {
  const keys = ['aiDomains_analysis', 'analysisResults'];
  for (const key of keys) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (parsed) return parsed;
    } catch (e) { continue; }
  }
  return null;
}
