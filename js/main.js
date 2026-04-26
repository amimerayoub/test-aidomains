// main.js — App init + navigation + event wiring
import { $, $$, cap, sanitizeInput, extractKeywords, debounce } from './utils.js';
import { loadData } from './dataLoader.js';
import { genState, generateGeo, generateKeyword, generatePattern, generateBrandable, generateNumeric, generateSuggestor, generateWordlist } from './generators.js';
import { clearResults, showLoading, renderResults, renderBulkResults, renderExtractedResults, renderAnalyzerResults, showFilterControls, toast, copyText, setButtonState, uiState, applyFilterSort } from './ui.js';
import { initCustomSelects, getSelectValue } from '../components/dropdown.js';
import { closeAllActionMenus } from '../components/action-menu.js';
import { initFavorites, openFavoritesPanel, setFavoritesChangeListener, getFavoritesCount, isFavorite, toggleFavorite } from './favorites.js';
import { analyzeDomains, filterDomains, detectMode } from './domainAnalyzer.js';
import { emailState, parseCSVText, parsePastedEmails, cleanContacts, replaceVariables, startCampaign, pauseCampaign, resumeCampaign, stopCampaign, resetCampaign, generatePreview, getDelay } from './emailTool.js';
import { generateDomainNews, clearCache } from '../services/newsGenOrchestrator.js';
import { initCampaignManager } from './campaignManager.js';
import { loadAllApiKeys, saveAllApiKeys, loadAiProvider, saveAiProvider } from '../services/apiSettings.js';
import { bulkCheckDomains, updateResultsGridUI, updateAnalyzerUI, updateBulkResultsUI, applyResultsToData } from './bulkChecker.js';

// State
const state = {
  activeTool: 'home',
  domains: [],
  limit: 50,
  smartMode: true
};

// Gen Domain News state
const genNewsState = {
  mode: 'GEO',       // GEO | BRANDABLE | PATTERN | HYBRID
  aiProvider: 'auto' // gemini | grok | auto
};

const GEN_MODE_HINTS = {
  GEO:       '<strong>GEO:</strong> City + Keyword combinations — targeted local service domains',
  BRANDABLE: '<strong>BRANDABLE:</strong> Short startup-style names with creative prefixes/suffixes',
  PATTERN:   '<strong>PATTERN:</strong> Pronounceable CVC/CVVC letter patterns — unique invented names',
  HYBRID:    '<strong>HYBRID:</strong> Mix of brandable + pattern — e.g. ZentroHub, NexviaLabs'
};

const AI_PROVIDER_HINTS = {
  auto:   'Auto: tries Gemini first, switches to Grok automatically if unavailable',
  gemini: 'Gemini only: uses Google Gemini API exclusively for generation',
  grok:   'Grok only: uses xAI Grok API exclusively for generation'
};

const titles = {
  home: 'AI Domain Generator',
  geo: 'Geo Domain Generator', keyword: 'Keyword Domain Generator',
  pattern: 'Pattern Domain Generator', brandable: 'Brandable Name Generator',
  numeric: 'Numeric Domain Generator', suggestor: 'Domain Suggestor',
  wordlist: 'WordList Combiner', analyzer: 'Smart Domain Analyzer',
  emailtool: 'Smart Email Tool',
  bulkcheck: 'Bulk Domain Checker',
  extractor: 'Domain Extractor', texttools: 'Text Tools', emailextractor: 'Email Extractor',
  newsdomain: 'Gen Domain News'
};

// Tools that show filter controls
const toolsWithFilters = ['geo', 'keyword', 'pattern', 'brandable', 'numeric', 'suggestor', 'wordlist', 'newsdomain'];

// ==================== LETTER GRIDS ====================
function buildLetterGrid(container, letters, selected, type) {
  container.innerHTML = '';
  letters.forEach(l => {
    const btn = document.createElement('button');
    btn.className = 'letter-btn' + (selected.includes(l) ? ' selected' : '');
    btn.textContent = l.toUpperCase();
    btn.addEventListener('click', () => {
      btn.classList.toggle('selected');
      if (type === 'C') {
        if (btn.classList.contains('selected') && !genState.selectedConsonants.includes(l)) genState.selectedConsonants.push(l);
        else genState.selectedConsonants = genState.selectedConsonants.filter(x => x !== l);
      } else {
        if (btn.classList.contains('selected') && !genState.selectedVowels.includes(l)) genState.selectedVowels.push(l);
        else genState.selectedVowels = genState.selectedVowels.filter(x => x !== l);
      }
    });
    container.appendChild(btn);
  });
}

// ==================== NAVIGATION ====================
function switchTool(tool, updateHistory = true) {
  if (state.activeTool !== tool) clearResults();
  state.activeTool = tool;
  localStorage.setItem('activeTool', tool);
  
  if (updateHistory) {
    const url = new URL(window.location);
    url.searchParams.set('tool', tool);
    window.history.pushState({ tool }, "", url);
  }
  
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tool === tool));
  $$('.tool-panel').forEach(p => {
    const isActive = p.id === tool + '-panel';
    p.classList.toggle('active', isActive);
  });
  const nt = $('#navbarTitle');
  if (nt) nt.textContent = titles[tool] || 'AI Domain Generator';
  
  // Show/hide results section based on tool
  const resultsSection = $('#resultsSection');
  const resultsTitle = $('#resultsTitle');
  if (resultsSection) {
    if (tool === 'home' || tool === 'emailtool' || tool === 'texttools') {
      resultsSection.classList.remove('visible');
    } else {
      resultsSection.classList.add('visible');
      // Set appropriate title based on tool type
      if (resultsTitle) {
        if (tool === 'analyzer') {
          resultsTitle.textContent = 'Analysis Results';
        } else if (tool === 'bulkcheck') {
          resultsTitle.textContent = 'Bulk Check Results';
        } else if (tool === 'extractor' || tool === 'emailextractor') {
          resultsTitle.textContent = tool === 'extractor' ? 'Extracted Domains' : 'Extracted Emails';
        } else {
          resultsTitle.textContent = 'Generated Domains';
        }
      }
    }
  }
  
  // Update navbar title visibility for home
  const navbarTitle = $('#navbarTitle');
  if (navbarTitle) {
    if (tool === 'home') {
      navbarTitle.style.display = 'none';
    } else {
      navbarTitle.style.display = '';
    }
  }
  
  showFilterControls(toolsWithFilters.includes(tool));
  
  if (window.updateExportButton) {
    window.updateExportButton();
  }
  
  // Restore generated domains when switching to newsdomain tool
  if (tool === 'newsdomain') {
    const savedGeneratedDomains = localStorage.getItem('generatedDomains');
    if (savedGeneratedDomains) {
      try {
        const parsed = JSON.parse(savedGeneratedDomains);
        if (parsed && parsed.length) {
          console.log("Restored domains on switch:", parsed);
          state.domains = parsed;
          renderResults(parsed, 'Restored Generated Domains', copyText);
        }
      } catch (e) {
        console.error('Error restoring generatedDomains:', e);
      }
    }
  }
}

// ==================== GENERATION HANDLERS ====================
function handleGenerate(type) {
  const btn = event.currentTarget;
  setButtonState(btn, true);
  showLoading(true);

  setTimeout(() => {
    try {
      let domains = [];
      switch (type) {
        case 'geo': {
          const kw = sanitizeInput($('#geoKeyword').value.trim());
          const custom = sanitizeInput($('#geoCustom').value.trim());
          domains = generateGeo({
            keyword: kw, custom,
            locationType: getSelectValue('geoLocationType') || 'us-cities',
            sortBy: getSelectValue('geoSortBy') || 'population',
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
        case 'keyword': {
          const input = sanitizeInput($('#kwInput').value.trim());
          if (!input) { toast('Enter at least one keyword'); setButtonState(btn, false); showLoading(false); return; }
          domains = generateKeyword({
            keywords: input.split(',').map(k => k.trim()).filter(k => k),
            category: getSelectValue('kwCategory') || 'all',
            usePrefix: $('#kwPrefix').checked,
            useSuffix: $('#kwSuffix').checked,
            useCategoryKws: $('#kwCategoryKws').checked,
            useCombine: $('#kwCombine').checked,
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
        case 'pattern': {
          const pattern = $('#patternInput').value.trim().toUpperCase();
          if (!pattern || !/^[CV]+$/.test(pattern)) { toast('Enter a valid pattern (C and V only)'); setButtonState(btn, false); showLoading(false); return; }
          domains = generatePattern({
            pattern,
            tld: getSelectValue('patternTld') || '.com',
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
        case 'brandable': {
          domains = generateBrandable({
            base: sanitizeInput($('#brandInput').value.trim()),
            maxLen: parseInt($('#brandLength').value) || 10,
            usePrefix: $('#brPrefix').checked,
            useSuffix: $('#brSuffix').checked,
            useBoth: $('#brBoth').checked,
            useRandom: $('#brRandom').checked,
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
        case 'numeric': {
          const lenBtn = $('.len-btn.active');
          domains = generateNumeric({
            keyword: sanitizeInput($('#numKeyword').value.trim()),
            numPattern: getSelectValue('numPattern') || 'random',
            numLen: lenBtn ? parseInt(lenBtn.dataset.len) : 4,
            pure: $('#numPure').checked,
            hybrid: $('#numHybrid').checked,
            reverse: $('#numReverse').checked,
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
        case 'suggestor': {
          const input = sanitizeInput($('#suggestInput').value.trim());
          if (!input) { toast('Describe your business'); setButtonState(btn, false); showLoading(false); return; }
          domains = generateSuggestor({
            input,
            limit: parseInt(getSelectValue('suggestMax') || state.limit),
            smartMode: state.smartMode
          });
          break;
        }
        case 'wordlist': {
          const listA = $('#wordListA').value.trim().split('\n').map(w => w.trim()).filter(w => w);
          const listB = $('#wordListB').value.trim().split('\n').map(w => w.trim()).filter(w => w);
          if (!listA.length || !listB.length) { toast('Enter words in both lists'); setButtonState(btn, false); showLoading(false); return; }
          domains = generateWordlist({
            listA, listB,
            separator: getSelectValue('wordlistSep') || '',
            limit: state.limit, smartMode: state.smartMode
          });
          break;
        }
      }

      state.domains = domains;
      localStorage.setItem('domains_geo', JSON.stringify(domains));
      renderResults(domains, titles[type] + ' Results', copyText);

      // Run real availability check
      runAvailabilityCheck(state.domains, updateResultsGridUI);
    } catch (e) {
      console.error('Generation error:', e);
      if (e.message && e.message.includes('SMART mode requires')) {
         toast('Error: ' + e.message);
         // Fallback rendering
         renderResults([], titles[type] + ' Results', copyText);
      } else {
         toast('Generation failed: ' + (e.message || 'Unknown error'));
         renderResults([], titles[type] + ' Results', copyText);
      }
    } finally {
      setButtonState(btn, false);
      showLoading(false);
    }
  }, 300);
}

// ==================== REAL AVAILABILITY CHECK (after generation) ====================
async function runAvailabilityCheck(domainsArray, updateFn) {
  if (!domainsArray || !domainsArray.length) return;
  try {
    const resultsMap = await bulkCheckDomains(domainsArray, {
      useCache: true,
      onProgress: (checked, total) => {
        console.log(`Availability: ${checked}/${total}`);
      }
    });
    // Update data
    applyResultsToData(domainsArray, resultsMap);
    // Update UI
    if (updateFn) updateFn(resultsMap);
  } catch (err) {
    console.error('Availability check error:', err);
  }
}

// ==================== GEN DOMAIN NEWS HANDLER ====================
async function handleGenDomains() {
  const btn = $('#btnGenDomains');
  setButtonState(btn, true);
  showLoading(true);

  try {
    // Always read from localStorage (centralized — set via Settings panel)
    const apiKeys = loadAllApiKeys();

    if (!apiKeys.gemini && !apiKeys.grok) {
      toast('Please add API keys in settings');
      setButtonState(btn, false); showLoading(false); return;
    }

    clearCache();

    const result = await generateDomainNews({
      apiKeys,
      timeRange:  getSelectValue('genNewsTimeRange') || 'week',
      tld:        getSelectValue('genNewsTld') || '.com',
      maxWords:   parseInt(getSelectValue('genNewsMaxWords') || '2'),
      count:      parseInt(getSelectValue('genNewsCount') || '10'),
      query:      $('#genNewsQuery')?.value.trim() || '',
      mode:       genNewsState.mode,
      aiProvider: genNewsState.aiProvider,
      forceRefresh: true
    });

    const { domains, sources, errors, meta } = result;

    if (sources.length) toast('News from: ' + sources.join(', ') + ' — ' + domains.length + ' domains');
    else if (meta.articlesCount === 0) toast('No news APIs active — using keyword fallback');

    if (!domains.length) {
      const reason = errors[0]?.reason || 'No domains generated';
      toast(reason.length > 80 ? reason.slice(0, 80) + '...' : reason);
      showLoading(false); setButtonState(btn, false); return;
    }

    state.domains = domains;
    // Set domains to 'checking' status initially if not set
    state.domains.forEach(d => { if (d.available === undefined) d.available = 'checking'; });
    
    localStorage.setItem('generatedDomains', JSON.stringify(domains));
    renderResults(domains, 'Gen Domain News (' + genNewsState.mode + ' / ' + genNewsState.aiProvider.toUpperCase() + ') Results', copyText);

    // Automatically check availability with real API
    runAvailabilityCheck(state.domains, updateResultsGridUI);

  } catch (err) {
    console.error('Gen Domain News error:', err);
    const msg = err.message || '';
    let userMsg;
    if (msg.includes('daily') || msg.includes('tomorrow') || msg.includes('billing')) {
      userMsg = 'Daily quota exhausted — resets at midnight or add billing at ai.google.dev';
    } else if (msg.includes('rate limit') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
      userMsg = 'Rate limit reached — please wait a minute and try again';
    } else if (msg.includes('Invalid') || msg.includes('API key')) {
      userMsg = msg;
    } else {
      userMsg = 'Generation failed: ' + (msg || 'unknown error');
    }
    toast(userMsg);
    renderResults([], 'Gen Domain News Results', copyText);
  } finally {
    setButtonState(btn, false);
    showLoading(false);
  }
}

// ==================== BULK CHECKER ====================
async function handleBulkCheck() {
  const btn = $('#btnBulkCheck');
  setButtonState(btn, true);
  const input = $('#bulkInput').value.trim();
  if (!input) { toast('Enter domains to check'); setButtonState(btn, false); return; }

  const lines = input.split('\n').map(l => l.trim()).filter(l => l);
  if (!lines.length) { toast('No valid domains'); setButtonState(btn, false); return; }

  showLoading(true);

  try {
    // Build domain objects with 'checking' status
    const domains = lines.map(d => ({
      name: d.includes('.') ? d : d + '.com',
      available: 'checking'
    }));
    state.domains = domains;
    renderBulkResults(domains);

    // Run real availability check
    const resultsMap = await bulkCheckDomains(domains, {
      useCache: true,
      onProgress: (checked, total) => {
        const countEl = $('#resultsCount');
        if (countEl) countEl.textContent = `Checking... ${checked}/${total}`;
      }
    });

    // Update data + UI
    applyResultsToData(state.domains, resultsMap);
    renderBulkResults(state.domains);
    toast(`Checked ${domains.length} domains`);
  } catch (e) {
    console.error('Bulk check error:', e);
    toast('Check failed — some results may be unavailable');
  } finally {
    setButtonState(btn, false);
    showLoading(false);
  }
}

// ==================== DOMAIN EXTRACTOR ====================
function handleExtract() {
  const btn = $('#btnExtract');
  setButtonState(btn, true);
  const input = $('#extractInput').value.trim();
  if (!input) { toast('Paste text to extract from'); setButtonState(btn, false); return; }

  showLoading(true);
  setTimeout(() => {
    try {
      const regex = /(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,})/g;
      const found = new Set(); let m;
      while ((m = regex.exec(input)) !== null) found.add(m[1].toLowerCase());
      const domains = [...found];
      state.domains = domains;
      renderExtractedResults(domains, 'domain', function (btn) { copyText(domains.join('\n'), btn); });
    } catch (e) {
      console.error('Extract error:', e);
      toast('Extraction failed');
    } finally {
      setButtonState(btn, false);
      showLoading(false);
    }
  }, 400);
}

// ==================== SMART DOMAIN ANALYZER ====================
let analyzerData = { mode: 'basic', domains: [], rawInput: '', csvData: '' };

// Example CSV data for "Paste Example" button
const EXAMPLE_PASTE = `google.com
apple.com
microsoft.com
myawesomestartup.com
cloudplatform.io
airevolution.tech
smartdata.dev`;

const EXAMPLE_CSV = `Domain,LE,BL,DP,CPC,TF,CF,WBY,ABY,SG,dropped,acr
google.com,6,950000000,950000000,45,95,95,1997,1996,9900000,0,50000
apple.com,5,820000000,800000000,40,92,93,1987,1987,8500000,0,45000
microsoft.com,9,780000000,750000000,38,90,92,1991,1991,7200000,0,40000
cloudplatform.io,13,12000,8500,15,25,22,2018,2018,5400,1,150
airevolution.tech,12,5200,3800,22,18,15,2020,2020,2100,0,80
myawesomestartup.com,17,250,180,5,8,6,2023,2023,320,2,25`;

// Tab switching (only for domain analyzer, not email tool)
function initAnalyzerTabs() {
  $$('.analyzer-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.analyzer-tab[data-tab]').forEach(t => t.classList.remove('active'));
      $$('.analyzer-tab-content').forEach(c => {
        if (c.closest('#analyzer-panel')) c.classList.remove('active');
      });
      tab.classList.add('active');
      const target = $(`#tab-${tab.dataset.tab}`);
      if (target) target.classList.add('active');
    });
  });
}

// CSV Upload handling
function initCSVUpload() {
  const dropZone = $('#csvDropZone');
  const fileInput = $('#csvFileInput');
  const fileInfo = $('#csvFileInfo');
  const fileNameEl = $('#csvFileName');
  const rowCountEl = $('#csvRowCount');

  if (!dropZone || !fileInput) return;

  // Click to browse
  dropZone.addEventListener('click', () => fileInput.click());

  // File selected
  fileInput.addEventListener('change', e => {
    if (e.target.files.length) handleCSVFile(e.target.files[0]);
  });

  // Drag & drop
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length) handleCSVFile(e.dataTransfer.files[0]);
  });

  function handleCSVFile(file) {
    const reader = new FileReader();
    reader.onload = e => {
      const text = e.target.result;
      analyzerData.csvData = text;
      analyzerData.rawInput = text;

      // Show file info
      const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
      dropZone.style.display = 'none';
      fileInfo.style.display = 'flex';
      if (fileNameEl) fileNameEl.textContent = file.name;
      if (rowCountEl) rowCountEl.textContent = (lines.length - 1) + ' rows';

      // Auto-analyze
      handleAnalyze();
    };
    reader.readAsText(file);
  }
}

function handleAnalyze() {
  const btn = $('#btnAnalyze');
  let input = '';

  // Determine input source
  if (analyzerData.csvData) {
    input = analyzerData.csvData;
  } else {
    input = ($('#analyzerInput')?.value || '').trim();
  }

  if (!input) { toast('Paste domains or upload a CSV file to analyze'); return; }

  setButtonState(btn, true);
  analyzerData.rawInput = input;

  setTimeout(() => {
    try {
      const result = analyzeDomains(input, state.smartMode);
      analyzerData.mode = result.mode;
      analyzerData.domains = result.domains;

      // Show cleaning stats if available
      const stats = result.parseStats;
      if (stats && stats.totalRows > 0) {
        if (stats.skippedRows > 0 && stats.totalRows > 1) {
          toast(`CSV cleaned: ${stats.validRows} domains from ${stats.totalRows} rows (${stats.skippedRows} skipped)`);
        } else if (stats.validRows === 0) {
          toast('No valid domains detected in the CSV');
        }
      }

      // Show mode indicator
      updateModeIndicator();

      // Show/hide advanced filters
      const filtersEl = $('#analyzerFilters');
      if (filtersEl) filtersEl.style.display = result.mode === 'advanced' ? 'flex' : 'none';

      applyAnalyzerFilters();

      // Run real availability check for domains without pre-existing status
      const domainsToCheck = analyzerData.domains.filter(d => d.available === 'checking' || d.available === null);
      if (domainsToCheck.length > 0) {
        runAvailabilityCheck(domainsToCheck, (resultsMap) => {
          // Apply to full data set too
          applyResultsToData(analyzerData.domains, resultsMap);
          if (window.analysisResults) applyResultsToData(window.analysisResults, resultsMap);
          updateAnalyzerUI(resultsMap);
        });
      }
    } catch (e) {
      console.error('Analyze error:', e);
      toast('Analysis failed');
    } finally {
      setButtonState(btn, false);
    }
  }, 300);
}

function updateModeIndicator() {
  const indicator = $('#analyzerModeIndicator');
  const badge = $('#analyzerModeBadge');
  const count = $('#analyzerDomainCount');
  if (!indicator || !badge) return;

  indicator.style.display = 'flex';
  const isAdvanced = analyzerData.mode === 'advanced';
  badge.className = `mode-badge ${isAdvanced ? 'mode-badge-advanced' : 'mode-badge-basic'}`;
  badge.textContent = isAdvanced ? '🔴 Advanced Analysis' : '🟢 Basic Mode';
  if (count) count.textContent = analyzerData.domains.length + ' domains detected';
}

function applyAnalyzerFilters() {
  const filters = {
    availableOnly: $('#filterAvailable')?.checked || false,
    minCpc: parseFloat($('#filterMinCpc')?.value || 0),
    minAge: parseFloat($('#filterMinAge')?.value || 0),
    minScore: parseFloat($('#filterMinScore')?.value || 0),
    classification: getSelectValue('analyzerClassFilter') || 'all'
  };

  let filtered = filterDomains(analyzerData.domains, analyzerData.mode, filters);

  // Store total for filtered count display
  window._analyzerTotal = analyzerData.domains.length;

  // Apply sort
  const sort = getSelectValue('analyzerSort') || 'score';
  if (sort === 'name') filtered.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === 'cpc') filtered.sort((a, b) => (b.metrics?.cpc || 0) - (a.metrics?.cpc || 0));
  else if (sort === 'age') filtered.sort((a, b) => (b.metrics?.age || 0) - (a.metrics?.age || 0));
  else if (analyzerData.mode === 'advanced') filtered.sort((a, b) => (b.scores?.final || 0) - (a.scores?.final || 0));

  state.domains = filtered;
  window.analysisResults = filtered;
  localStorage.setItem('analysisResults', JSON.stringify(filtered));

  renderAnalyzerResults(filtered);
  
  if (window.updateExportButton) window.updateExportButton();
}


// ==================== TEXT TOOLS ====================
function initTextTools() {
  $$('.tool-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = $('#textInput').value;
      if (!input) return;
      const action = btn.dataset.action;
      let output = '';
      switch (action) {
        case 'lowercase': output = input.toLowerCase(); break;
        case 'uppercase': output = input.toUpperCase(); break;
        case 'titlecase': output = input.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.substring(1).toLowerCase()); break;
        case 'nospace': output = input.replace(/\s+/g, ''); break;
        case 'slug': output = input.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); break;
        case 'reverse': output = input.split('').reverse().join(''); break;
        case 'camelCase': output = input.toLowerCase().replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase()); break;
        case 'kebab-case': output = input.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, ''); break;
      }
      $('#textOutput').value = output;
      const copyBtn = $('#btnCopyText');
      if (copyBtn) copyBtn.style.display = 'flex';
      toast('Transformed: ' + action);
    });
  });

  const copyBtn = $('#btnCopyText');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const out = $('#textOutput').value;
      if (out) copyText(out, copyBtn);
    });
  }
}

// ==================== EMAIL EXTRACTOR ====================
function handleExtractEmails() {
  const btn = $('#btnExtractEmail');
  setButtonState(btn, true);
  const input = $('#emailInput').value.trim();
  if (!input) { toast('Paste text containing emails'); setButtonState(btn, false); return; }

  showLoading(true);
  setTimeout(() => {
    try {
      const regex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
      const found = new Set(); let m;
      while ((m = regex.exec(input)) !== null) found.add(m[0].toLowerCase());
      const emails = [...found];
      state.domains = emails;
      renderExtractedResults(emails, 'email', function (b) { copyText(emails.join('\n'), b); });
    } catch (e) {
      console.error('Email extract error:', e);
      toast('Extraction failed');
    } finally {
      setButtonState(btn, false);
      showLoading(false);
    }
  }, 400);
}

// ==================== SMART EMAIL TOOL INIT ====================
let emailSubjectCount = 1;
let emailMsgCount = 1;

function initEmailTool() {
  // Listen for campaign selection
  document.addEventListener('campaign-selected', (e) => {
    const id = e.detail.id;
    if (!id) return;
    const campaign = window.campaignManager.getCampaignById(id);
    if (!campaign) return;

    // ── Step 1: Pre-fill emails from campaign ──
    const emailPasteTA = $('#emailPasteInput');
    if (campaign.emails && campaign.emails.length > 0) {
      emailState.contacts = JSON.parse(JSON.stringify(campaign.emails));
      if (emailPasteTA) emailPasteTA.value = ''; // We rely on the internal array, no need to clutter paste area if it's already structured
    } else {
      emailState.contacts = [];
      if (emailPasteTA) emailPasteTA.value = '';
    }
    updateEmailContactSummary();
    updateEmailTable();
    updateEmailStats();

    // ── Step 2: Load subject lines ──
    const subjContainer = $('#subjectVariations');
    if (subjContainer) {
      subjContainer.innerHTML = '';
      emailSubjectCount = 0;
      (campaign.subjects || []).forEach(subj => {
        emailSubjectCount++;
        const div = document.createElement('div');
        div.className = 'email-var-input';
        div.innerHTML = `<input type="text" class="email-var-field" id="subjectInput${emailSubjectCount}" value="${escapeHtml(subj)}" placeholder="Subject variation ${emailSubjectCount}" />
          ${emailSubjectCount > 1 ? `<button class="btn-action-sm email-remove-var" style="flex-shrink:0;margin-top:4px">
            <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>` : ''}`;
        subjContainer.appendChild(div);
        if (emailSubjectCount > 1) {
          div.querySelector('.email-remove-var').addEventListener('click', () => { div.remove(); updatePreview(); });
        }
        div.querySelector('input').addEventListener('input', debounce(updatePreview, 300));
      });
      if (emailSubjectCount === 0) {
        emailSubjectCount = 1;
        subjContainer.innerHTML = `<div class="email-var-input"><input type="text" class="email-var-field" id="subjectInput1" placeholder="e.g. Quick question about {{domain}}" /></div>`;
        subjContainer.querySelector('input').addEventListener('input', debounce(updatePreview, 300));
      }
    }

    // ── Step 3: Load message bodies ──
    const msgContainer = $('#messageVariations');
    if (msgContainer) {
      msgContainer.innerHTML = '';
      emailMsgCount = 0;
      (campaign.messages || []).forEach(msg => {
        emailMsgCount++;
        const div = document.createElement('div');
        div.className = 'email-var-input';
        div.innerHTML = `<textarea class="email-msg-field" id="messageInput${emailMsgCount}" rows="5" placeholder="Message variation ${emailMsgCount}">${escapeHtml(msg)}</textarea>
          ${emailMsgCount > 1 ? `<button class="btn-action-sm email-remove-var" style="flex-shrink:0;margin-top:4px">
            <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </button>` : ''}`;
        msgContainer.appendChild(div);
        if (emailMsgCount > 1) {
          div.querySelector('.email-remove-var').addEventListener('click', () => { div.remove(); updatePreview(); });
        }
        div.querySelector('textarea').addEventListener('input', debounce(updatePreview, 300));
      });
      if (emailMsgCount === 0) {
        emailMsgCount = 1;
        msgContainer.innerHTML = `<div class="email-var-input"><textarea class="email-msg-field" id="messageInput1" rows="5" placeholder="Hi {{name}},..."></textarea></div>`;
        msgContainer.querySelector('textarea').addEventListener('input', debounce(updatePreview, 300));
      }
    }

    updatePreview();
  });

  // Tabs
  $$('.analyzer-tab[data-etab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const parent = tab.closest('.email-section') || tab.closest('.email-tabs');
      if (!parent) return;
      const section = tab.closest('.email-section');
      $$(section ? '.email-section .analyzer-tab' : '.analyzer-tab[data-etab]').forEach(t => {
        if (t.closest('.email-section') === section || (!section && t.dataset.etab)) t.classList.remove('active');
      });
      tab.classList.add('active');
      const targetId = 'tab-' + tab.dataset.etab;
      $$('.analyzer-tab-content').forEach(c => {
        if (c.id === targetId || (c.closest('.email-section') === section)) c.classList.remove('active');
      });
      const target = $(`#${targetId}`);
      if (target) target.classList.add('active');
    });
  });

  // CSV Upload for email
  const eDropZone = $('#emailDropZone');
  const eFileInput = $('#emailFileInput');
  const eFileInfo = $('#emailFileInfo');
  const eFileName = $('#emailFileName');
  const eRowCount = $('#emailRowCount');
  const eRemoveBtn = $('#emailRemoveBtn');

  if (eDropZone && eFileInput) {
    eDropZone.addEventListener('click', () => eFileInput.click());
    eFileInput.addEventListener('change', e => {
      if (e.target.files.length) handleEmailFile(e.target.files[0]);
    });
    eDropZone.addEventListener('dragover', ev => { ev.preventDefault(); eDropZone.classList.add('drag-over'); });
    eDropZone.addEventListener('dragleave', () => eDropZone.classList.remove('drag-over'));
    eDropZone.addEventListener('drop', ev => {
      ev.preventDefault();
      eDropZone.classList.remove('drag-over');
      if (ev.dataTransfer.files.length) handleEmailFile(ev.dataTransfer.files[0]);
    });
  }

  function handleEmailFile(file) {
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target.result;
      const contacts = parseCSVText(text);
      processEmailContacts(contacts);
      if (eFileInfo) {
        const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
        eDropZone.style.display = 'none';
        eFileInfo.style.display = 'flex';
        if (eFileName) eFileName.textContent = file.name;
        if (eRowCount) eRowCount.textContent = contacts.length + ' contacts';
      }
    };
    reader.readAsText(file);
  }

  if (eRemoveBtn) {
    eRemoveBtn.addEventListener('click', () => {
      emailState.contacts = [];
      emailState.campaign.pending = 0;
      if (eDropZone) eDropZone.style.display = '';
      if (eFileInfo) eFileInfo.style.display = 'none';
      if (eFileInput) eFileInput.value = '';
      updateEmailContactSummary();
      updateEmailTable();
      updateEmailStats();
    });
  }

  // Clear emails button
  const btnClearEmails = $('#btnClearEmails');
  if (btnClearEmails) btnClearEmails.addEventListener('click', () => {
    const ta = $('#emailPasteInput');
    if (ta) ta.value = '';
  });

  // Paste input — parse on change
  const emailPaste = $('#emailPasteInput');
  if (emailPaste) {
    emailPaste.addEventListener('input', debounce(() => {
      const text = emailPaste.value.trim();
      if (!text) {
        emailState.contacts = [];
        updateEmailContactSummary();
        updateEmailTable();
        updateEmailStats();
        return;
      }
      const contacts = parsePastedEmails(text);
      processEmailContacts(contacts);
    }, 500));
  }

  // Clear contacts
  const btnClearContacts = $('#btnClearContacts');
  if (btnClearContacts) btnClearContacts.addEventListener('click', () => {
    emailState.contacts = [];
    const ta = $('#emailPasteInput');
    if (ta) ta.value = '';
    if (eDropZone) eDropZone.style.display = '';
    if (eFileInfo) eFileInfo.style.display = 'none';
    updateEmailContactSummary();
    updateEmailTable();
    updateEmailStats();
  });

  // Add subject variation
  const btnAddSubject = $('#btnAddSubject');
  if (btnAddSubject) btnAddSubject.addEventListener('click', () => {
    emailSubjectCount++;
    const container = $('#subjectVariations');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'email-var-input';
    div.innerHTML = `<input type="text" class="email-var-field" id="subjectInput${emailSubjectCount}" placeholder="Subject variation ${emailSubjectCount}" />
      <button class="btn-action-sm email-remove-var" data-target="subjectInput${emailSubjectCount}" style="flex-shrink:0;margin-top:4px">
        <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>`;
    container.appendChild(div);
    div.querySelector('.email-remove-var').addEventListener('click', () => {
      div.remove();
      updatePreview();
    });
    div.querySelector('input').addEventListener('input', debounce(updatePreview, 300));
    updatePreview();
  });

  // Add message variation
  const btnAddMessage = $('#btnAddMessage');
  if (btnAddMessage) btnAddMessage.addEventListener('click', () => {
    emailMsgCount++;
    const container = $('#messageVariations');
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'email-var-input';
    div.innerHTML = `<textarea class="email-msg-field" id="messageInput${emailMsgCount}" rows="4" placeholder="Message variation ${emailMsgCount}"></textarea>
      <button class="btn-action-sm email-remove-var" data-target="messageInput${emailMsgCount}" style="flex-shrink:0;margin-top:4px">
        <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>`;
    container.appendChild(div);
    div.querySelector('.email-remove-var').addEventListener('click', () => {
      div.remove();
      updatePreview();
    });
    div.querySelector('textarea').addEventListener('input', debounce(updatePreview, 300));
    updatePreview();
  });

  // Variable chips — insert into active textarea
  $$('.var-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      // Find the focused or last active message textarea
      let ta = document.activeElement;
      if (!ta || !ta.classList.contains('email-msg-field')) {
        ta = $('#messageInput1') || $('.email-msg-field');
      }
      if (ta) {
        const start = ta.selectionStart;
        const end = ta.selectionEnd;
        const text = ta.value;
        const variable = chip.dataset.var;
        ta.value = text.substring(0, start) + variable + text.substring(end);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = start + variable.length;
        updatePreview();
      }
    });
  });

  // First subject/message input listeners
  const subj1 = $('#subjectInput1');
  if (subj1) subj1.addEventListener('input', debounce(updatePreview, 300));
  const msg1 = $('#messageInput1');
  if (msg1) msg1.addEventListener('input', debounce(updatePreview, 300));

  // Anti-spam toggle
  const antiSpam = $('#antiSpamToggle');
  if (antiSpam) antiSpam.addEventListener('change', () => {
    emailState.antiSpam = antiSpam.checked;
  });

  // Timing buttons
  $$('.timing-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.timing-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      emailState.timing = btn.dataset.speed;
    });
  });

  // Campaign buttons
  const btnStart = $('#btnStartCampaign');
  const btnPause = $('#btnPauseCampaign');
  const btnResume = $('#btnResumeCampaign');
  const btnStop = $('#btnStopCampaign');
  const extraBtns = $('.campaign-extra-btns');

  if (btnStart) btnStart.addEventListener('click', async () => {
    const campaignId = window.campaignManager.getActiveCampaignId();
    if (!campaignId) {
      toast('Please select a campaign first');
      return;
    }
    const campaign = window.campaignManager.getCampaignById(campaignId);

    // Collect current subjects and messages from UI
    collectEmailInputs();
    if (!emailState.subjects.length) { toast('Add at least one subject line'); return; }
    if (!emailState.messages.length) { toast('Add at least one message'); return; }
    if (!emailState.contacts.length) { toast('Add email contacts first'); return; }

    const useAntiSpam = $('#antiSpamToggle')?.checked ?? emailState.antiSpam;
    const pendingContacts = emailState.contacts.filter(c => c.status !== 'sent');

    if (!pendingContacts.length) {
      toast('No new emails to send');
      return;
    }

    let opened = 0;
    
    // Disable button to prevent multi-clicks
    btnStart.disabled = true;
    const origText = btnStart.innerHTML;
    
    let delayMs = emailState.timing === 'safe' ? 20000 : emailState.timing === 'fast' ? 5000 : 10000;
    
    pendingContacts.forEach((contact, i) => {
      setTimeout(() => {
        btnStart.innerHTML = `Sending... (${i+1}/${pendingContacts.length})`;
        
        let subject, message;

        if (useAntiSpam) {
          subject = emailState.subjects[Math.floor(Math.random() * emailState.subjects.length)];
          message = emailState.messages[Math.floor(Math.random() * emailState.messages.length)];
        } else {
          subject = emailState.subjects[i % emailState.subjects.length];
          message = emailState.messages[i % emailState.messages.length];
        }

        // We pass the campaign object to replaceVariables so campaign variables are handled
        const mergeData = { ...campaign, ...contact };
        const finalSubject = replaceVariables(subject, mergeData);
        const finalMessage = replaceVariables(message, mergeData);

        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1` +
          `&to=${encodeURIComponent(contact.email)}` +
          `&su=${encodeURIComponent(finalSubject)}` +
          `&body=${encodeURIComponent(finalMessage)}`;

        window.open(gmailUrl, '_blank');
        opened++;
        
        contact.status = 'sent';
        contact.lastAction = new Date().toLocaleTimeString();
        
        updateEmailTable();
        updateEmailStats();
        
        // Save campaign emails array
        window.campaignManager.updateCampaign(campaignId, { emails: emailState.contacts });

        // Once finished
        if (i === pendingContacts.length - 1) {
          btnStart.disabled = false;
          btnStart.innerHTML = origText;
          toast(`Opened ${opened} Gmail compose window${opened !== 1 ? 's' : ''} ✓`);
        }
      }, i * delayMs);
    });

    updateEmailTable();
    updateEmailStats();
  });

  if (btnPause) btnPause.addEventListener('click', () => {
    pauseCampaign();
    if (btnPause) btnPause.style.display = 'none';
    if (btnResume) btnResume.style.display = '';
    toast('Campaign paused');
  });

  if (btnResume) btnResume.addEventListener('click', () => {
    resumeCampaign(
      (contact, subject, message) => {
        updateEmailTable();
        updateEmailStats();
        highlightSendingRow(contact.email);
      },
      () => {
        btnStart.style.display = '';
        if (extraBtns) extraBtns.style.display = 'none';
        toast('Campaign complete!');
      }
    );
    if (btnPause) btnPause.style.display = '';
    if (btnResume) btnResume.style.display = 'none';
    toast('Campaign resumed');
  });

  if (btnStop) btnStop.addEventListener('click', () => {
    stopCampaign();
    btnStart.style.display = '';
    if (extraBtns) extraBtns.style.display = 'none';
    updateEmailStats();
    toast('Campaign stopped');
  });

  // Initial preview
  updatePreview();
  updateEmailContactSummary();
}

function collectEmailInputs() {
  emailState.subjects = [];
  emailState.messages = [];

  $$('#subjectVariations .email-var-field').forEach(input => {
    const v = input.value.trim();
    if (v) emailState.subjects.push(v);
  });
  $$('#messageVariations .email-msg-field').forEach(input => {
    const v = input.value.trim();
    if (v) emailState.messages.push(v);
  });
}

function processEmailContacts(contacts) {
  emailState.contacts = cleanContacts(contacts);
  
  // Save to current campaign if available
  const campaignId = window.campaignManager.getActiveCampaignId();
  if (campaignId) {
    window.campaignManager.updateCampaign(campaignId, { emails: emailState.contacts });
  }
  
  updateEmailContactSummary();
  updateEmailTable();
  updateEmailStats();
  updatePreview();
}

function updateEmailContactSummary() {
  const summary = $('#emailContactSummary');
  const count = $('#emailContactCount');
  if (!summary || !count) return;
  const n = emailState.contacts.length;
  if (n > 0) {
    summary.style.display = 'flex';
    count.textContent = n + ' valid contact' + (n !== 1 ? 's' : '') + ' detected';
  } else {
    summary.style.display = 'none';
  }
}

function updateEmailStats() {
  const bar = $('#emailStatsBar');
  if (!bar) return;
  const total = emailState.contacts.length;
  const sent = emailState.contacts.filter(c => c.status === 'sent').length;
  const pending = emailState.contacts.filter(c => c.status === 'pending').length;
  const failed = emailState.contacts.filter(c => c.status === 'failed').length;

  bar.style.display = total > 0 ? 'flex' : 'none';

  const elTotal = $('#emailStatTotal');
  const elSent = $('#emailStatSent');
  const elPending = $('#emailStatPending');
  const elFailed = $('#emailStatFailed');
  const elFill = $('#emailProgressFill');
  const elPct = $('#emailProgressPct');

  if (elTotal) elTotal.textContent = total;
  if (elSent) elSent.textContent = sent;
  if (elPending) elPending.textContent = pending;
  if (elFailed) elFailed.textContent = failed;
  if (elFill) elFill.style.width = (total > 0 ? Math.round(sent / total * 100) : 0) + '%';
  if (elPct) elPct.textContent = (total > 0 ? Math.round(sent / total * 100) : 0) + '%';
}

function updateEmailTable() {
  const wrap = $('#emailTableWrap');
  const body = $('#emailTableBody');
  if (!wrap || !body) return;

  if (!emailState.contacts.length) {
    wrap.style.display = 'none';
    return;
  }
  wrap.style.display = '';

  body.innerHTML = '';
  emailState.contacts.forEach((c, i) => {
    const tr = document.createElement('tr');
    tr.dataset.email = c.email;
    if (c.status === 'sent') tr.classList.add('sending');
    const statusCls = c.status === 'sent' ? 'email-status-sent' : c.status === 'failed' ? 'email-status-failed' : 'email-status-pending';
    const statusTxt = c.status === 'sent' ? '✅ Sent' : c.status === 'failed' ? '❌ Failed' : '⏳ Pending';
    const isSent = c.status === 'sent';
    const btnStyle = isSent 
      ? 'color:#9ca3af; background:#6b728020; min-width:70px; justify-content:center;' 
      : 'color:#4ade80; background:#4ade8020; min-width:70px; justify-content:center;';
    const btnText = isSent ? 'Resend' : 'Send';
    
    tr.innerHTML = `
      <td class="td-email">${c.email}</td>
      <td class="td-domain">${c.domain || '-'}</td>
      <td>${c.name || '-'}</td>
      <td><span class="email-status ${statusCls}">${statusTxt}</span></td>
      <td style="font-size:.7rem;color:var(--text-tertiary)">${c.lastAction || '-'}</td>
      <td class="email-table-actions">
        <button class="btn-action-sm row-send-btn" data-idx="${i}" style="padding:4px 8px; font-size:0.75rem; font-weight:500; ${btnStyle}" ${!window.campaignManager.getActiveCampaignId() ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" style="width:12px;height:12px;margin-right:4px;"><rect x="2" y="4" width="20" height="16" rx="2" stroke="currentColor" stroke-width="2"/><path d="M22 4L12 13 2 4" stroke="currentColor" stroke-width="2"/></svg>
          ${btnText}
        </button>
        ${c.status === 'failed' ? `<button class="email-tbl-btn retry-btn" data-idx="${i}" title="Retry">
          <svg viewBox="0 0 24 24" fill="none"><path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>` : ''}
        <button class="email-tbl-btn remove-btn" data-idx="${i}" title="Remove">
          <svg viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        </button>
      </td>`;
    body.appendChild(tr);
  });

  // Wire up buttons
  body.querySelectorAll('.row-send-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Prevent multiple clicks
      if (btn.disabled) return;
      btn.disabled = true;
      btn.style.opacity = '0.5';
      setTimeout(() => {
        btn.disabled = false;
        btn.style.opacity = '1';
      }, 1000);

      const idx = parseInt(btn.dataset.idx);
      const contact = emailState.contacts[idx];
      const campaignId = window.campaignManager.getActiveCampaignId();
      if (!campaignId) return;
      const campaign = window.campaignManager.getCampaignById(campaignId);
      
      collectEmailInputs();
      if (!emailState.subjects.length || !emailState.messages.length) {
        toast('Subjects and Messages are required.');
        return;
      }
      
      const useAntiSpam = $('#antiSpamToggle')?.checked ?? emailState.antiSpam;
      let subject, message;

      if (useAntiSpam) {
        subject = emailState.subjects[Math.floor(Math.random() * emailState.subjects.length)];
        message = emailState.messages[Math.floor(Math.random() * emailState.messages.length)];
      } else {
        subject = emailState.subjects[idx % emailState.subjects.length];
        message = emailState.messages[idx % emailState.messages.length];
      }

      const mergeData = { ...campaign, ...contact };
      const finalSubject = replaceVariables(subject, mergeData);
      const finalMessage = replaceVariables(message, mergeData);

      const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1` +
        `&to=${encodeURIComponent(contact.email)}` +
        `&su=${encodeURIComponent(finalSubject)}` +
        `&body=${encodeURIComponent(finalMessage)}`;

      window.open(gmailUrl, '_blank');
      
      contact.status = 'sent';
      contact.lastAction = new Date().toLocaleTimeString();
      
      updateEmailTable();
      updateEmailStats();
      window.campaignManager.updateCampaign(campaignId, { emails: emailState.contacts });
    });
  });

  body.querySelectorAll('.retry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      emailState.contacts[idx].status = 'pending';
      const campaignId = window.campaignManager.getActiveCampaignId();
      if (campaignId) window.campaignManager.updateCampaign(campaignId, { emails: emailState.contacts });
      updateEmailTable();
      updateEmailStats();
    });
  });
  body.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      emailState.contacts.splice(idx, 1);
      const campaignId = window.campaignManager.getActiveCampaignId();
      if (campaignId) window.campaignManager.updateCampaign(campaignId, { emails: emailState.contacts });
      updateEmailTable();
      updateEmailStats();
      updateEmailContactSummary();
    });
  });
}

function highlightSendingRow(email) {
  $$('#emailTableBody tr').forEach(tr => tr.classList.remove('sending'));
  const row = $(`#emailTableBody tr[data-email="${email}"]`);
  if (row) row.classList.add('sending');
}

function updatePreview() {
  collectEmailInputs();
  const preview = generatePreview();
  const subjEl = $('#previewSubject');
  const bodyEl = $('#previewBody');
  if (subjEl) subjEl.textContent = preview.subject || 'Add subjects above to preview';
  if (bodyEl) bodyEl.textContent = preview.message || 'Add a message above to see the preview here...';
  
  // Auto-save to campaign
  const activeId = window.campaignManager?.getActiveCampaignId();
  if (activeId) {
    window.campaignManager.updateCampaign(activeId, {
      subjects: emailState.subjects,
      messages: emailState.messages
    });
  }
}

// ============================================================
// UTILS
// ============================================================
function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ==================== INIT ====================
export async function initApp() {
  const loading = $('#loadingOverlay');
  if (loading) loading.classList.add('active');

  // Load saved mode from localStorage
  const savedMode = localStorage.getItem('domainMode');
  state.smartMode = savedMode !== 'fast'; // Default to smart

  // Sync UI mode buttons
  $$('.mode-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === (state.smartMode ? 'smart' : 'fast'));
  });

  try {
    await loadData(state.smartMode);
  } catch (err) {
    console.error("Init Data Load Error:", err);
    // If SMART mode fails, fallback to FAST mode on load
    state.smartMode = false;
    localStorage.setItem('domainMode', 'fast');
    $$('.mode-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === 'fast');
    });
    await loadData(false);
  }

  // Letter grids
  const cg = $('#consonantGrid');
  const vg = $('#vowelGrid');
  if (cg) buildLetterGrid(cg, 'bcdfghjklmnpqrstvwxyz'.split(''), genState.selectedConsonants, 'C');
  if (vg) buildLetterGrid(vg, 'aeiou'.split(''), genState.selectedVowels, 'V');

  // Custom selects
  initCustomSelects();

  // Favorites system
  initFavorites();

  // Text tools
  initTextTools();

  // Navigation
  $$('.nav-item').forEach(n => {
    if (n.dataset.tool) n.addEventListener('click', e => {
      e.preventDefault();
      switchTool(n.dataset.tool);
      $('#sidebar').classList.remove('open');
      $('#sidebarOverlay').classList.remove('active');
    });
  });

  // Mobile menu
  $('#menuToggle').addEventListener('click', () => {
    $('#sidebar').classList.toggle('open');
    $('#sidebarOverlay').classList.toggle('active');
  });
  $('#sidebarOverlay').addEventListener('click', () => {
    $('#sidebar').classList.remove('open');
    $('#sidebarOverlay').classList.remove('active');
    closeAllActionMenus();
  });

  // Close action menus on global click
  document.addEventListener('click', e => {
    if (!e.target.closest('.domain-action-menu') && !e.target.closest('.action-panel')) {
      closeAllActionMenus();
    }
  });

  // Handle favorite toggles from cards.js rendered results
  document.addEventListener('fav-toggle', e => {
    const { domain, btn } = e.detail;
    const added = toggleFavorite(domain);
    btn.classList.toggle('active', added);
  });

  // Theme toggle
  $('#themeToggle').addEventListener('click', () => {
    const html = document.documentElement;
    const next = html.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    html.setAttribute('data-theme', next);
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(next);
  });

  // Favorites header button
  const favHeaderBtn = $('#btnFavHeader');
  if (favHeaderBtn) {
    favHeaderBtn.addEventListener('click', () => openFavoritesPanel());
  }

  // Listen for favorites changes to update header
  setFavoritesChangeListener(() => {
    const count = getFavoritesCount();
    if (favHeaderBtn) {
      favHeaderBtn.classList.toggle('active', count > 0);
    }
  });

  // Button click ripple effect for generate buttons
  $$('.btn-generate').forEach(btn => {
    btn.addEventListener('mousedown', e => {
      const rect = btn.getBoundingClientRect();
      btn.style.setProperty('--rx', ((e.clientX - rect.left) / rect.width * 100) + '%');
      btn.style.setProperty('--ry', ((e.clientY - rect.top) / rect.height * 100) + '%');
    });
  });

  // Mode toggle
  $$('.mode-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (btn.classList.contains('active')) return; // Already active

      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const newMode = btn.dataset.mode === 'smart';
      
      state.smartMode = newMode;
      localStorage.setItem('domainMode', newMode ? 'smart' : 'fast');

      // 🔁 MODE SWITCHING RULES: clear previous results
      const resDiv = $('#resultsContainer');
      if (resDiv) resDiv.innerHTML = '';
      state.lastResults = [];

      // 🔁 MODE SWITCHING RULES: reload data source completely
      try {
        await loadData(state.smartMode);
      } catch (err) {
        if (resDiv) {
          resDiv.innerHTML = `<div class="dc-error-msg">⚠️ ${err.message}</div>`;
        }
      }
    });
  });

  // Limit selector
  $$('.limit-select').forEach(sel => {
    sel.addEventListener('change', () => {
      state.limit = parseInt(getSelectValue('resultLimit') || '50');
    });
  });

  // Niche pills
  $$('.niche-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const g = $('#geoKeyword');
      if (g) g.value = pill.dataset.niche;
    });
  });

  // Generate buttons
  const genBtns = {
    btnGeoGenerate: 'geo', btnKwGenerate: 'keyword', btnPatternGenerate: 'pattern',
    btnBrandGenerate: 'brandable', btnNumGenerate: 'numeric',
    btnSuggestGenerate: 'suggestor', btnWordlistGenerate: 'wordlist'
  };
  Object.entries(genBtns).forEach(([id, type]) => {
    const btn = $('#' + id);
    if (btn) btn.addEventListener('click', () => handleGenerate(type));
  });

  // Gen Domain News button
  const btnGenDomains = $('#btnGenDomains');
  if (btnGenDomains) btnGenDomains.addEventListener('click', handleGenDomains);

  // API Settings inline buttons in Gen Domain News
  const btnHowToGetKeysInline = $('#btnHowToGetKeysInline');
  const btnOpenApiSettingsInline = $('#btnOpenApiSettingsInline');
  if (btnHowToGetKeysInline) btnHowToGetKeysInline.addEventListener('click', () => $('#getKeysOverlay')?.classList.add('open'));
  if (btnOpenApiSettingsInline) btnOpenApiSettingsInline.addEventListener('click', () => $('#settingsOverlay')?.classList.add('open'));

  // Generation Mode selector
  $$('.gen-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.gen-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      genNewsState.mode = btn.dataset.mode;
      const hintEl = $('#genModeHint');
      if (hintEl) hintEl.innerHTML = GEN_MODE_HINTS[genNewsState.mode] || '';
    });
  });

  // AI Provider selector
  $$('.ai-provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.ai-provider-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      genNewsState.aiProvider = btn.dataset.provider;
      saveAiProvider(genNewsState.aiProvider);
      const hintEl = $('#aiProviderHint');
      if (hintEl) hintEl.textContent = AI_PROVIDER_HINTS[genNewsState.aiProvider] || '';
    });
  });

  // Settings panel open/close
  const settingsOverlay = $('#settingsOverlay');
  const btnSettings = $('#settingsBtn');
  const btnSettingsClose = $('#settingsClose');
  if (btnSettings) btnSettings.addEventListener('click', () => settingsOverlay?.classList.add('open'));
  if (btnSettingsClose) btnSettingsClose.addEventListener('click', () => settingsOverlay?.classList.remove('open'));
  if (settingsOverlay) settingsOverlay.addEventListener('click', e => {
    if (e.target === settingsOverlay) settingsOverlay.classList.remove('open');
  });

  // Save all settings
  const btnSaveSettings = $('#btnSaveSettings');
  if (btnSaveSettings) btnSaveSettings.addEventListener('click', () => {
    const keys = {
      gemini:     $('#settingsGeminiKey')?.value.trim() || '',
      grok:       $('#settingsGrokKey')?.value.trim() || '',
      mediastack: $('#settingsMediastackKey')?.value.trim() || '',
      gnews:      $('#settingsGnewsKey')?.value.trim() || '',
      newsapi:    $('#settingsNewsapiKey')?.value.trim() || '',
      currents:   $('#settingsCurrentsKey')?.value.trim() || ''
    };
    saveAllApiKeys(keys);
    toast('All API keys saved');
    settingsOverlay?.classList.remove('open');
  });

  // Get API Keys dialog
  const getKeysOverlay = $('#getKeysOverlay');
  const btnGetApiKeys = $('#btnGetApiKeys');
  const btnGetKeysClose = $('#getKeysClose');
  if (btnGetApiKeys) btnGetApiKeys.addEventListener('click', () => getKeysOverlay?.classList.add('open'));
  if (btnGetKeysClose) btnGetKeysClose.addEventListener('click', () => getKeysOverlay?.classList.remove('open'));
  if (getKeysOverlay) getKeysOverlay.addEventListener('click', e => {
    if (e.target === getKeysOverlay) getKeysOverlay.classList.remove('open');
  });
  // Close dialog on Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      settingsOverlay?.classList.remove('open');
      getKeysOverlay?.classList.remove('open');
    }
  });

  // Tool buttons
  const bb = $('#btnBulkCheck'); if (bb) bb.addEventListener('click', handleBulkCheck);
  const be = $('#btnExtract'); if (be) be.addEventListener('click', handleExtract);
  const ee = $('#btnExtractEmail'); if (ee) ee.addEventListener('click', handleExtractEmails);

  // ==================== SMART EMAIL TOOL ====================
  initEmailTool();
   
  // ==================== CAMPAIGN MANAGER ====================
  initCampaignManager();

  // Analyzer button
  const ba = $('#btnAnalyze'); if (ba) ba.addEventListener('click', handleAnalyze);

  // Analyzer tabs
  initAnalyzerTabs();

  // CSV Upload
  initCSVUpload();

  // Paste Example button
  const btnExample = $('#btnPasteExample');
  if (btnExample) btnExample.addEventListener('click', () => {
    const ta = $('#analyzerInput');
    if (ta) { ta.value = EXAMPLE_PASTE; ta.focus(); toast('Example domains pasted'); }
  });

  // Clear Input button
  const btnClear = $('#btnClearInput');
  if (btnClear) btnClear.addEventListener('click', () => {
    const ta = $('#analyzerInput');
    if (ta) { ta.value = ''; ta.focus(); }
    // Also clear CSV data
    analyzerData.csvData = '';
    analyzerData.rawInput = '';
    analyzerData.domains = [];
    const dropZone = $('#csvDropZone');
    const fileInfo = $('#csvFileInfo');
    if (dropZone) dropZone.style.display = '';
    if (fileInfo) fileInfo.style.display = 'none';
    const indicator = $('#analyzerModeIndicator');
    if (indicator) indicator.style.display = 'none';
    const filtersEl = $('#analyzerFilters');
    if (filtersEl) filtersEl.style.display = 'none';
  });

  // CSV Remove button
  const btnRemove = $('#csvRemoveBtn');
  if (btnRemove) btnRemove.addEventListener('click', () => {
    analyzerData.csvData = '';
    analyzerData.rawInput = '';
    const dropZone = $('#csvDropZone');
    const fileInfo = $('#csvFileInfo');
    const fileInput = $('#csvFileInput');
    if (dropZone) dropZone.style.display = '';
    if (fileInfo) fileInfo.style.display = 'none';
    if (fileInput) fileInput.value = '';
    const indicator = $('#analyzerModeIndicator');
    if (indicator) indicator.style.display = 'none';
    const filtersEl = $('#analyzerFilters');
    if (filtersEl) filtersEl.style.display = 'none';
  });

  // Handle "Send to Smart Analyzer" from any domain card
  document.addEventListener('send-to-analyzer', e => {
    const { domain } = e.detail;
    if (!domain) return;

    // Switch to analyzer panel
    switchTool('analyzer');

    // Switch to paste tab
    $$('.analyzer-tab[data-tab]').forEach(t => t.classList.remove('active'));
    $$('.analyzer-tab-content').forEach(c => {
      if (c.closest('#analyzer-panel')) c.classList.remove('active');
    });
    const pasteTab = $('.analyzer-tab[data-tab="paste"]');
    const pasteContent = $('#tab-paste');
    if (pasteTab) pasteTab.classList.add('active');
    if (pasteContent) pasteContent.classList.add('active');

    // Clear CSV data so textarea is used
    analyzerData.csvData = '';

    // Fill textarea with domain
    const ta = $('#analyzerInput');
    if (ta) {
      ta.value = domain;
      ta.focus();
      ta.select();
      // Trigger highlight animation
      ta.classList.remove('imported');
      void ta.offsetWidth; // force reflow
      ta.classList.add('imported');
      setTimeout(() => ta.classList.remove('imported'), 1300);
    }

    // Reset previous results
    const indicator = $('#analyzerModeIndicator');
    if (indicator) indicator.style.display = 'none';
    const filtersEl = $('#analyzerFilters');
    if (filtersEl) filtersEl.style.display = 'none';

    // Show import toast
    toast('Domain imported: ' + domain);

    // Auto-run analysis after a short delay
    setTimeout(() => handleAnalyze(), 400);
  });

  // Analyzer filters
  $('#filterAvailable')?.addEventListener('change', applyAnalyzerFilters);
  $('#filterMinCpc')?.addEventListener('input', debounce(() => applyAnalyzerFilters(), 300));
  $('#filterMinAge')?.addEventListener('input', debounce(() => applyAnalyzerFilters(), 300));
  $('#filterMinScore')?.addEventListener('input', debounce(() => applyAnalyzerFilters(), 300));

  // Analyzer sort & class filter
  const aSort = $('#analyzerSort');
  if (aSort) aSort.addEventListener('change', applyAnalyzerFilters);
  const aClass = $('#analyzerClassFilter');
  if (aClass) aClass.addEventListener('change', applyAnalyzerFilters);

  const sortSel = $('#resultsSort');
  if (sortSel) {
    sortSel.addEventListener('change', () => {
      uiState.sort = getSelectValue('resultsSort') || 'default';
      applyFilterSort(state.domains, copyText);
    });
  }

  // Brand range
  const range = $('#brandLength'), rangeVal = $('#brandLengthValue');
  if (range) range.addEventListener('input', () => { if (rangeVal) rangeVal.textContent = range.value + ' letters'; });

  // Length selector
  $$('.len-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.len-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  if (loading) loading.classList.remove('active');
  const urlParams = new URLSearchParams(window.location.search);
  const savedTool = urlParams.get('tool') || localStorage.getItem('activeTool') || 'home';
  switchTool(savedTool, false);

  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.tool) {
      switchTool(e.state.tool, false);
    } else {
      const tool = new URLSearchParams(window.location.search).get('tool') || localStorage.getItem('activeTool') || 'home';
      switchTool(tool, false);
    }
  });

  // Restore state
  try {
    const savedGen = localStorage.getItem('domains_geo');
    if (savedGen) {
      const parsed = JSON.parse(savedGen);
      if (parsed && parsed.length) {
        state.domains = parsed;
        if (savedTool !== 'home' && savedTool !== 'analyzer' && savedTool !== 'emailtool') {
          renderResults(parsed, 'Restored Generated Domains', copyText);
        }
      }
    }
    // Also restore generatedDomains (from Gen Domain News tool)
    const savedGeneratedDomains = localStorage.getItem('generatedDomains');
    if (savedGeneratedDomains) {
      const parsed = JSON.parse(savedGeneratedDomains);
      console.log("Restored domains:", parsed);
      if (parsed && parsed.length) {
        state.domains = parsed;
        if (savedTool === 'newsdomain') {
          renderResults(parsed, 'Restored Generated Domains', copyText);
        }
      }
    }
    const savedAna = localStorage.getItem('analysisResults');
    if (savedAna) {
      window.analysisResults = JSON.parse(savedAna);
      if (savedTool === 'analyzer' && window.analysisResults && window.analysisResults.length) {
        state.domains = window.analysisResults;
        renderAnalyzerResults(window.analysisResults);
      }
    }
  } catch (e) {
    console.error('Error restoring state:', e);
  }

  // Auto-load all saved API keys into all inputs
  const savedKeys = loadAllApiKeys();
  // Gen Domain News panel inputs
  if (savedKeys.gemini     && $('#genNewsGeminiKey'))     $('#genNewsGeminiKey').value     = savedKeys.gemini;
  if (savedKeys.mediastack && $('#genNewsMediastackKey')) $('#genNewsMediastackKey').value = savedKeys.mediastack;
  if (savedKeys.gnews      && $('#genNewsGnewsKey'))      $('#genNewsGnewsKey').value      = savedKeys.gnews;
  if (savedKeys.newsapi    && $('#genNewsNewsapiKey'))    $('#genNewsNewsapiKey').value    = savedKeys.newsapi;
  if (savedKeys.currents   && $('#genNewsCurrentsKey'))   $('#genNewsCurrentsKey').value   = savedKeys.currents;
  // Settings panel inputs
  if (savedKeys.gemini     && $('#settingsGeminiKey'))     $('#settingsGeminiKey').value     = savedKeys.gemini;
  if (savedKeys.grok       && $('#settingsGrokKey'))       $('#settingsGrokKey').value       = savedKeys.grok;
  if (savedKeys.mediastack && $('#settingsMediastackKey')) $('#settingsMediastackKey').value = savedKeys.mediastack;
  if (savedKeys.gnews      && $('#settingsGnewsKey'))      $('#settingsGnewsKey').value      = savedKeys.gnews;
  if (savedKeys.newsapi    && $('#settingsNewsapiKey'))    $('#settingsNewsapiKey').value    = savedKeys.newsapi;
  if (savedKeys.currents   && $('#settingsCurrentsKey'))   $('#settingsCurrentsKey').value   = savedKeys.currents;

  // Restore saved AI provider preference
  const savedProvider = loadAiProvider();
  genNewsState.aiProvider = savedProvider;
  const savedProvBtn = $('[data-provider="' + savedProvider + '"]');
  if (savedProvBtn) {
    $$('.ai-provider-btn').forEach(b => b.classList.remove('active'));
    savedProvBtn.classList.add('active');
  }

  // Tools Overview - "Use Tool" buttons
  $$('.tool-overview-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool) switchTool(tool);
    });
  });

  // Tools Overview - CTA button
  const btnStartUsingTools = $('#btnStartUsingTools');
  if (btnStartUsingTools) {
    btnStartUsingTools.addEventListener('click', () => {
      switchTool('geo');
    });
  }

  // Home page - Start Generating button
  const btnHomeStartGenerating = $('#btnHomeStartGenerating');
  if (btnHomeStartGenerating) {
    btnHomeStartGenerating.addEventListener('click', () => {
      switchTool('geo');
    });
  }

  // Home page - View All Tools button
  const btnHomeViewTools = $('#btnHomeViewTools');
  if (btnHomeViewTools) {
    btnHomeViewTools.addEventListener('click', () => {
      // Navigate to generators section as overview was removed
      switchTool('geo');
    });
  }

  // ==================== EXPORT DOMAINS ====================
  const btnExportToggle = $('#btnExportToggle');
  const exportMenu = $('#exportMenu');
  const btnExportAll = $('#btnExportAll');
  const btnExportAvail = $('#btnExportAvail');

  if (btnExportToggle && exportMenu) {
    // Toggle dropdown
    btnExportToggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = exportMenu.style.display === 'block';
      exportMenu.style.display = isOpen ? 'none' : 'block';
    });

    // Close on outside click
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#exportDropdownWrap')) {
        exportMenu.style.display = 'none';
      }
    });
  }

  function exportDomainsCSV(domains, filename, isAnalyzer = false) {
    if (!domains || !domains.length) {
      toast('No domains to export');
      return;
    }
    
    let headers, rows;
    
    if (isAnalyzer) {
      headers = ['Domain', 'Status', 'Score', 'CPC', 'Age'];
      rows = domains.map(d => {
        const status = d.available === true || d.status === 'available' ? 'available' : d.available === false || d.status === 'taken' ? 'taken' : 'unknown';
        const score = d.scores?.final || d.score || 0;
        const cpc = d.metrics?.cpc || 0;
        const currentYear = new Date().getFullYear();
        const age = d.metrics?.age || (d.metrics?.wby > 1990 ? currentYear - d.metrics.wby : 0);
        return [d.name || d.domain, status, score, cpc, age].join(',');
      });
    } else {
      headers = ['Domain', 'Status'];
      rows = domains.map(d => {
        const status = d.available === true ? 'available' : d.available === false ? 'taken' : 'unknown';
        return [d.name || d.domain, status].join(',');
      });
    }
    
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'domains-export.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Export completed');
  }

  if (btnExportAll) {
    btnExportAll.addEventListener('click', () => {
      exportMenu.style.display = 'none';
      const isAnalyzer = state.activeTool === 'analyzer';
      exportDomainsCSV(state.domains || [], isAnalyzer ? 'analysis-results.csv' : 'domains-all-export.csv', isAnalyzer);
    });
  }

  if (btnExportAvail) {
    btnExportAvail.addEventListener('click', () => {
      exportMenu.style.display = 'none';
      const isAnalyzer = state.activeTool === 'analyzer';
      const available = (state.domains || []).filter(d => d.available === true || d.status === 'available');
      if (!available.length) {
        toast('No available domains found');
        return;
      }
      exportDomainsCSV(available, isAnalyzer ? 'analysis-results.csv' : 'domains-available-export.csv', isAnalyzer);
    });
  }

  window.updateExportButton = function() {
    if (btnExportToggle) {
      const count = (state.domains || []).length;
      
      if (count === 0) {
        btnExportToggle.disabled = true;
        btnExportToggle.style.opacity = '0.5';
        btnExportToggle.style.cursor = 'not-allowed';
      } else {
        btnExportToggle.disabled = false;
        btnExportToggle.style.opacity = '1';
        btnExportToggle.style.cursor = 'pointer';
      }

      btnExportToggle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px;margin-right:4px;"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>Export${count > 0 ? ' (' + count + ')' : ''}`;
    }
  };

  // Update export button state when domains change
  const origRenderResults = window.__origRenderResults;
  const exportObserver = new MutationObserver(() => {
    window.updateExportButton();
  });
  
  const resultsGrid = $('#resultsGrid');
  if (resultsGrid) {
    exportObserver.observe(resultsGrid, { childList: true, subtree: true });
  }
  

}
