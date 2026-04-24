/**
 * INTEGRATION PATCH — apply these changes to your existing files
 * ================================================================
 *
 * This file documents every required change. Each section is labelled
 * with the file it belongs to and the exact code to add/replace.
 */

/* ================================================================
   FILE: geo-generator.html (and index.html)
   ================================================================

   1. FIX MANIFEST 404 — add this to <head>:
   ------------------------------------------
   <link rel="manifest" href="/site.webmanifest" />

   2. FIX CSS — replace existing <link rel="stylesheet"> with:
   ------------------------------------------
   <link rel="stylesheet" href="/dark-theme.css" />

   3. FIX PASSWORD INPUT WARNING — wrap settings inputs in a form:
   ------------------------------------------
   BEFORE (incorrect):
     <input type="password" id="settingsGeminiKey" ... />

   AFTER (correct — wrap ALL inputs in a named form):
     <form id="settingsForm" autocomplete="off" onsubmit="return false;">
       <input type="password" id="settingsGeminiKey" ... />
       <input type="password" id="settingsGrokKey" ... />
       ... all other password inputs ...
     </form>

   The form needs onsubmit="return false;" to prevent page reload.
   No other changes needed — the existing save button click handler still works.
*/

/* ================================================================
   FILE: js/main.js
   ================================================================

   1. FIX STATE LOSS — import state manager at the top:
   ------------------------------------------
   import {
     bootstrapAppState,
     saveDomains,
     loadDomains,
     saveActiveTool,
     openDomainDetails,
   } from './state-manager.js';


   2. FIX STATE LOSS — replace initApp() startup with:
   ------------------------------------------
   export async function initApp() {
     // ... existing loading overlay code ...

     // RESTORE STATE ON LOAD — this is the fix for state loss
     const { domains, activeTool, analysisResults } = bootstrapAppState();

     if (domains.length) {
       state.domains = domains;
     }
     if (analysisResults) {
       window.analysisResults = analysisResults;
     }

     // ... rest of existing init code ...

     // Restore active tool (was at the bottom of initApp already)
     const savedTool = urlParams.get('tool') || activeTool || 'home';
     switchTool(savedTool, false);

     // Render restored domains if we have them and we're on a generator tool
     if (domains.length && savedTool !== 'home' && savedTool !== 'analyzer' && savedTool !== 'emailtool') {
       renderResults(state.domains, 'Restored — ' + (savedTool || 'Generated') + ' Domains', copyText);
     }
   }


   3. FIX STATE LOSS — after every generation, save domains:
   ------------------------------------------
   FIND this pattern in handleGenerate():
     state.domains = domains;
     renderResults(domains, ...);

   ADD after it:
     saveDomains(domains);   // ← persist before anything else


   4. FIX STATE LOSS — save active tool on every switchTool():
   ------------------------------------------
   FIND switchTool() function, after:
     state.activeTool = tool;

   ADD:
     saveActiveTool(tool);   // ← already done via localStorage.setItem — just use saveActiveTool()


   5. FIX DOMAIN NAVIGATION — replace navigateToDomain():
   ------------------------------------------
   FIND in js/ui.js:
     function navigateToDomain(domainName) {
       localStorage.setItem('selected_domain', domainName);
       window.location.href = 'domain.html?domain=' + encodeURIComponent(domainName);
     }

   REPLACE WITH:
     import { openDomainDetails } from './state-manager.js';
     function navigateToDomain(domainName) {
       openDomainDetails(domainName);
     }
*/

/* ================================================================
   FILE: js/domainDetails.js
   ================================================================

   FIX DOMAIN DETAILS — replace getDomain() with state-manager version:
   ------------------------------------------
   FIND:
     function getDomain() {
       const p = new URLSearchParams(window.location.search);
       return (p.get('domain') || p.get('d') || '').trim().toLowerCase();
     }

   REPLACE WITH:
     import { getSelectedDomain } from './state-manager.js';
     function getDomain() {
       return getSelectedDomain() || '';
     }

   FIX NULL DOMAIN — update the null check to show error WITHOUT redirect:
   ------------------------------------------
   FIND:
     if (!domain) {
       document.querySelector('.dd-main').innerHTML = `...`;
       return;
     }

   The existing code is already correct — it shows an error and returns.
   Just make sure there is NO window.location.href = '...' redirect here.
   If there is one, remove it. The error message is sufficient.
*/

/* ================================================================
   COMPLETE MINIMAL EXAMPLE — drop-in fix for geo-generator.html
   ================================================================

   Add this <script> block just before </body> to patch state without
   touching your existing JS files:
*/

const GEO_GENERATOR_PATCH = `
<script>
// STATE PATCH — fixes domain loss on navigation
// Place this AFTER all other scripts

(function() {
  'use strict';

  // ── Storage helpers ──────────────────────────────────────
  function saveDomains(domains) {
    try { localStorage.setItem('generatedDomains', JSON.stringify(domains)); } catch (_) {}
  }

  function loadDomains() {
    try {
      const raw = localStorage.getItem('generatedDomains');
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) { return []; }
  }

  function openDomainDetails(domain) {
    if (!domain) return;
    sessionStorage.setItem('selectedDomain', domain.trim().toLowerCase());
    window.location.href = 'domain.html?domain=' + encodeURIComponent(domain.trim().toLowerCase());
  }

  // ── Expose globally so existing code can call them ───────
  window.saveDomains = saveDomains;
  window.loadDomains = loadDomains;
  window.openDomainDetails = openDomainDetails;

  // ── Auto-save whenever state.domains changes ─────────────
  // Patch the renderResults function to auto-save
  document.addEventListener('DOMContentLoaded', function() {
    // Intercept results rendering to auto-save
    const originalRender = window.renderResults;
    if (typeof originalRender === 'function') {
      window.renderResults = function(domains, ...args) {
        if (Array.isArray(domains) && domains.length) {
          saveDomains(domains);
        }
        return originalRender.apply(this, [domains, ...args]);
      };
    }

    // Restore domains on page load
    const savedDomains = loadDomains();
    if (savedDomains.length) {
      console.log('[StatePatch] Restored', savedDomains.length, 'domains from localStorage');
      // The main initApp will handle rendering from state
    }
  });
})();
</script>
`;

/* ================================================================
   DOMAIN DETAILS PAGE PATCH
   ================================================================

   Add this to domain.html just before </body>:
*/

const DOMAIN_DETAILS_PATCH = `
<script>
(function() {
  'use strict';

  // Override getDomain to use sessionStorage as fallback
  // This prevents errors when navigating directly
  const originalGetDomain = window.getDomain;

  function getSelectedDomain() {
    const urlParam = new URLSearchParams(window.location.search).get('domain');
    if (urlParam) return urlParam.trim().toLowerCase();
    return sessionStorage.getItem('selectedDomain') || null;
  }

  // If page loaded with no domain, show a friendly error — do NOT redirect
  document.addEventListener('DOMContentLoaded', function() {
    const domain = getSelectedDomain();
    if (!domain) {
      const main = document.querySelector('.dd-main');
      if (main) {
        main.innerHTML = \`
          <div style="text-align:center;padding:60px 20px">
            <h2 style="font-size:1rem;margin-bottom:8px;color:var(--text-main)">No domain specified</h2>
            <p style="font-size:.82rem;color:var(--text-muted);margin-bottom:16px">
              Navigate here from a domain card, or add ?domain=example.com to the URL.
            </p>
            <a href="index.html"
               style="display:inline-block;padding:10px 18px;background:var(--primary-light);
                      border:1px solid var(--primary-border);border-radius:8px;
                      font-size:.82rem;color:var(--primary);font-weight:600;text-decoration:none">
              Back to Generator
            </a>
          </div>\`;
      }
      // IMPORTANT: No redirect here — just show the error message
    }
  });
})();
</script>
`;

export { GEO_GENERATOR_PATCH, DOMAIN_DETAILS_PATCH };
