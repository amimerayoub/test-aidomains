// emailTool.js — Smart Email Outreach Tool
import { $, $$, pick, rand, shuffle } from './utils.js';

// ============================================================
// STATE
// ============================================================
export const emailState = {
  contacts: [],        // { email, domain, name, status }
  subjects: [],        // subject variations
  messages: [],        // message variations
  antiSpam: true,
  timing: 'normal',    // fast | normal | safe
  campaign: {
    running: false,
    paused: false,
    sent: 0,
    failed: 0,
    pending: 0,
    currentIdx: -1,
    timerId: null
  }
};

// ============================================================
// CSV / INPUT PARSING
// ============================================================

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export function parseCSVText(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];

  const sep = lines[0].includes('\t') ? '\t' : lines[0].includes(';') ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());

  // Detect columns
  const emailCol = headers.findIndex(h => /^e?m?a?i?l?$/.test(h) || h.includes('email'));
  const nameCol = headers.findIndex(h => h.includes('name') || h.includes('first'));
  const domainCol = headers.findIndex(h => h.includes('domain') || h.includes('company') || h.includes('website'));

  const hasHeader = emailCol >= 0 || nameCol >= 0 || domainCol >= 0;
  const startIdx = hasHeader ? 1 : 0;

  const contacts = [];
  const seen = new Set();

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(sep).map(c => c.trim().replace(/^["']|["']$/g, ''));

    let email = '';
    let name = '';
    let domain = '';

    if (hasHeader) {
      if (emailCol >= 0) email = cols[emailCol] || '';
      if (nameCol >= 0) name = cols[nameCol] || '';
      if (domainCol >= 0) domain = cols[domainCol] || '';
    } else {
      // Try to find email in any column
      for (const c of cols) {
        const match = c.match(EMAIL_REGEX);
        if (match) { email = match[0]; break; }
      }
      // If no email column detected, treat first col as email if it looks like one
      if (!email && cols[0] && cols[0].includes('@')) email = cols[0];
      if (!email && cols[1] && cols[1].includes('@')) email = cols[1];
      // Domain from other columns
      if (!domain && cols.length > 1) {
        for (const c of cols) {
          if (c !== email && !c.includes('@') && c.includes('.')) { domain = c; break; }
        }
      }
    }

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;
    email = email.toLowerCase().trim();
    if (seen.has(email)) continue;
    seen.add(email);

    // Extract domain from email if missing
    if (!domain) {
      domain = email.split('@')[1];
    }
    domain = domain.toLowerCase().trim();

    name = name.trim();

    contacts.push({ email, domain, name, status: 'pending' });
  }

  return contacts;
}

export function parsePastedEmails(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  const contacts = [];
  const seen = new Set();

  for (const line of lines) {
    // Try to parse "email, domain, name" or "email | domain | name" formats
    const parts = line.split(/[,|;]+/).map(p => p.trim()).filter(p => p);

    let email = '';
    let domain = '';
    let name = '';

    // Find email first
    for (const p of parts) {
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p)) { email = p.toLowerCase(); break; }
    }

    // Also check raw line for email
    if (!email) {
      const match = line.match(EMAIL_REGEX);
      if (match) email = match[0].toLowerCase();
    }

    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);

    domain = email.split('@')[1];

    // Try to find domain in other parts
    for (const p of parts) {
      if (p !== email && !p.includes('@') && (p.includes('.') || /^[a-zA-Z]+$/.test(p))) {
        if (!domain || domain === email.split('@')[1]) {
          // Check if it looks like a domain
          if (p.includes('.') || p.length > 2) domain = p.toLowerCase();
        }
      }
    }

    contacts.push({ email, domain, name, status: 'pending' });
  }

  return contacts;
}

// ============================================================
// VARIABLE REPLACEMENT
// ============================================================

export function replaceVariables(template, contact) {
  return template
    .replace(/\{\{domain\}\}/gi, contact.domain || '')
    .replace(/\{\{email\}\}/gi, contact.email || '')
    .replace(/\{\{name\}\}/gi, contact.name || 'there')
    .replace(/\{\{first_name\}\}/gi, contact.name ? contact.name.split(' ')[0] : 'there')
    .replace(/\{\{price\}\}/gi, contact.price || '')
    .replace(/\{\{cpc\}\}/gi, contact.cpc || '')
    .replace(/\{\{backlinks\}\}/gi, contact.backlinks || '');
}

// ============================================================
// VALIDATION
// ============================================================

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function cleanContacts(contacts) {
  const seen = new Set();
  return contacts.filter(c => {
    if (!c.email || !isValidEmail(c.email)) return false;
    c.email = c.email.toLowerCase().trim();
    if (seen.has(c.email)) return false;
    seen.add(c.email);
    if (c.domain) c.domain = c.domain.toLowerCase().trim();
    else c.domain = c.email.split('@')[1];
    
    if (c.name) {
      c.name = c.name.trim();
    } else {
      // Extract name from email (e.g. john@company.com -> John)
      const localPart = c.email.split('@')[0];
      // Basic formatting: replace dots/underscores with spaces and title case
      c.name = localPart.replace(/[._-]/g, ' ')
               .split(' ')
               .map(w => w.charAt(0).toUpperCase() + w.slice(1))
               .join(' ');
    }
    
    c.status = 'pending';
    return true;
  });
}

// ============================================================
// TIMING
// ============================================================

const TIMING_MAP = {
  fast: { min: 2000, max: 5000 },
  normal: { min: 10000, max: 20000 },
  safe: { min: 30000, max: 60000 }
};

export function getDelay() {
  const t = TIMING_MAP[emailState.timing] || TIMING_MAP.normal;
  return rand(t.min, t.max);
}

// ============================================================
// CAMPAIGN ENGINE (Simulated)
// ============================================================

export function startCampaign(onProgress, onComplete) {
  if (emailState.campaign.running) return;

  const pending = emailState.contacts.filter(c => c.status === 'pending');
  if (!pending.length) return;

  emailState.campaign.running = true;
  emailState.campaign.paused = false;
  emailState.campaign.pending = pending.length;

  // Shuffle order if anti-spam
  if (emailState.antiSpam) {
    shuffle(pending);
  }

  // Reset sent/failed for this run
  emailState.campaign.sent = 0;
  emailState.campaign.failed = 0;

  // Mark all as pending (re-status)
  emailState.contacts.forEach(c => {
    if (c.status !== 'failed') c.status = 'pending';
  });

  sendNext(onProgress, onComplete);
}

function sendNext(onProgress, onComplete) {
  if (!emailState.campaign.running || emailState.campaign.paused) return;

  const pending = emailState.contacts.filter(c => c.status === 'pending');
  if (!pending.length) {
    emailState.campaign.running = false;
    emailState.campaign.currentIdx = -1;
    if (onComplete) onComplete();
    return;
  }

  const contact = pending[0];
  emailState.campaign.currentIdx = emailState.contacts.indexOf(contact);

  // Select subject and message
  let subject = '';
  let message = '';

  if (emailState.antiSpam && emailState.subjects.length > 1) {
    // Rotate: pick least used subject
    subject = pick(emailState.subjects);
  } else {
    subject = emailState.subjects[0] || '';
  }

  if (emailState.antiSpam && emailState.messages.length > 1) {
    message = pick(emailState.messages);
  } else {
    message = emailState.messages[0] || '';
  }

  // Replace variables
  const finalSubject = replaceVariables(subject, contact);
  const finalMessage = replaceVariables(message, contact);

  // Simulate sending (in real app, this would call mailto: or an API)
  contact.status = 'sent';
  contact.lastAction = new Date().toLocaleTimeString();
  contact.lastSubject = finalSubject;
  contact.lastMessage = finalMessage;
  emailState.campaign.sent++;
  emailState.campaign.pending--;

  if (onProgress) onProgress(contact, finalSubject, finalMessage);

  // Schedule next
  const delay = getDelay();
  emailState.campaign.timerId = setTimeout(() => sendNext(onProgress, onComplete), delay);
}

export function pauseCampaign() {
  emailState.campaign.paused = true;
  if (emailState.campaign.timerId) {
    clearTimeout(emailState.campaign.timerId);
    emailState.campaign.timerId = null;
  }
}

export function resumeCampaign(onProgress, onComplete) {
  if (!emailState.campaign.running) return;
  emailState.campaign.paused = false;
  sendNext(onProgress, onComplete);
}

export function stopCampaign() {
  emailState.campaign.running = false;
  emailState.campaign.paused = false;
  emailState.campaign.currentIdx = -1;
  if (emailState.campaign.timerId) {
    clearTimeout(emailState.campaign.timerId);
    emailState.campaign.timerId = null;
  }
}

export function resetCampaign() {
  stopCampaign();
  emailState.contacts.forEach(c => {
    c.status = 'pending';
    c.lastAction = '';
    c.lastSubject = '';
    c.lastMessage = '';
  });
  emailState.campaign.sent = 0;
  emailState.campaign.failed = 0;
  emailState.campaign.pending = emailState.contacts.length;
}

// ============================================================
// PREVIEW
// ============================================================

export function generatePreview() {
  if (!emailState.contacts.length || !emailState.subjects.length || !emailState.messages.length) {
    return { subject: '', message: '' };
  }

  const contact = emailState.contacts[0];
  const subject = replaceVariables(pick(emailState.subjects), contact);
  const message = replaceVariables(pick(emailState.messages), contact);

  return { subject, message, contact };
}
