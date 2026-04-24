/**
 * /api/domain-full.js
 * ────────────────────────────────────────────────────────────────
 * Unified Domain Intelligence — aggregates ALL data in one call.
 *
 * GET  /api/domain-full?domain=example.com
 * GET  /api/domain-full?domain=example.com&st_key=YOUR_KEY
 * POST { "domain": "example.com", "st_key": "optional" }
 *
 * Data sources (all run in parallel via Promise.allSettled):
 *   1. RDAP/WHOIS    — registration, age, registrar, nameservers
 *   2. DNS records   — A,AAAA,MX,TXT,NS,CNAME,SOA (Cloudflare DoH)
 *   3. TLD variants  — .com .net .org .io .co .ai (Verisign bulk)
 *   4. Brand check   — 28 TLDs + 31 social platforms (namecheckerr)
 *   5. Backlinks     — count, DA, dofollow/nofollow (Rankifyer)
 *   6. DNS history   — NS timeline, drops, parking (5 sources)
 *   7. Reachability  — HTTP HEAD probe, HTTPS, server, latency
 *
 * Each source is isolated — one failure never breaks the response.
 * ────────────────────────────────────────────────────────────────
 */

// ═══════════════════════════════════════════════════════════════
// UPSTREAM CONSTANTS
// ═══════════════════════════════════════════════════════════════

const RDAP_SERVERS = {
  com:'https://rdap.verisign.com/com/v1',     net:'https://rdap.verisign.com/net/v1',
  org:'https://rdap.publicinterestregistry.org/rdap', io:'https://rdap.nic.io',
  co:'https://rdap.nic.co',                   ai:'https://rdap.nic.ai',
  app:'https://rdap.nic.google',              dev:'https://rdap.nic.google',
  info:'https://rdap.afilias.net/rdap/info',  biz:'https://rdap.nic.biz',
  us:'https://rdap.nic.us',                   me:'https://rdap.nic.me',
  xyz:'https://rdap.nic.xyz',                 tech:'https://rdap.nic.tech',
  uk:'https://rdap.nominet.uk',               de:'https://rdap.denic.de',
};
const RDAP_BOOTSTRAP    = 'https://rdap.org/domain';
const DOH_URL           = 'https://cloudflare-dns.com/dns-query';
const VERISIGN_BULK     = 'https://sugapi.verisign-grs.com/ns-api/2.0/bulk-check';
const NC_API            = 'https://namecheckerr.com/api/check-name';
const NC_KEY            = 'arr12';
const RANKIFYER_EMBED   = 'https://rankifyer.com/free-seo-tools/embed';
const RANKIFYER_TOOL_ID = 'high-quality-backlinks';
const RANKIFYER_R       = '423b01';
const HACKERTARGET_API  = 'https://api.hackertarget.com/hostsearch/?q=';

const TLD_VARIANTS  = ['com','net','org','io','co','ai'];
const SOCIAL_KEYS   = ['facebook','twitter','instagram','youtube','github','linkedin','tiktok','reddit','pinterest','snapchat','twitch'];
const DNS_REC_TYPES = ['A','AAAA','MX','TXT','CNAME','NS','SOA'];

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-SecurityTrails-Key');
  res.setHeader('Content-Type', 'application/json');
}

function validateDomain(raw) {
  const d = raw.trim().toLowerCase()
    .replace(/^https?:\/\//i,'').replace(/^www\./i,'')
    .split('/')[0].split('?')[0];
  if (!d || d.length > 253) return { valid:false };
  const re = /^[a-z0-9]([a-z0-9\-]{0,61}[a-z0-9])?$/;
  const parts = d.split('.');
  if (parts.length < 2) return { valid:false };
  for (const p of parts) if (!re.test(p)) return { valid:false };
  return { valid:true, domain:d };
}

function parseDate(s) { if (!s) return null; const d=new Date(s); return isNaN(d)?null:d; }

function calcAge(from, to=new Date()) {
  if (!from) return null;
  let y=to.getFullYear()-from.getFullYear(), m=to.getMonth()-from.getMonth(), d=to.getDate()-from.getDate();
  if (d<0){m--;d+=new Date(to.getFullYear(),to.getMonth(),0).getDate();}
  if (m<0){y--;m+=12;}
  return { years:y, months:m, days:d, total_days:Math.floor((to-from)/86400000) };
}

function hrDate(d) {
  return d ? d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'}) : null;
}

function vCard(arr,field) {
  if (!arr||!Array.isArray(arr[1])) return null;
  const f=arr[1].find(f=>f[0]===field); return f?f[3]:null;
}

function decodeEntities(s) {
  return s.replace(/&#x3A;/gi,':').replace(/&#x2F;/gi,'/').replace(/&amp;/gi,'&')
          .replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&quot;/gi,'"');
}

function safe(label, promise) {
  return promise
    .then(data  => ({ ok:true,  label, data }))
    .catch(err  => ({ ok:false, label, error: err?.message || String(err) }));
}

// ═══════════════════════════════════════════════════════════════
// MODULE 1 — WHOIS / RDAP
// ═══════════════════════════════════════════════════════════════

async function fetchWhois(domain) {
  const tld = domain.split('.').pop();
  const urls = [];
  if (RDAP_SERVERS[tld]) urls.push(`${RDAP_SERVERS[tld]}/domain/${domain.toUpperCase()}`);
  urls.push(`${RDAP_BOOTSTRAP}/${domain}`);

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        headers:{ Accept:'application/rdap+json,application/json,*/*', 'User-Agent':'DomainKit/2.0' },
        signal: AbortSignal.timeout(8000),
      });
      if (r.status===404) return { registered:false };
      if (!r.ok) continue;
      const j = await r.json();

      const ev={};
      (j.events||[]).forEach(e=>{ ev[e.eventAction]=e.eventDate; });
      const regDate = parseDate(ev['registration']);
      const expDate = parseDate(ev['expiration']);
      const age     = calcAge(regDate);
      const daysLeft= expDate ? Math.floor((expDate-new Date())/86400000) : null;
      const reg     = j.entities?.find(e=>e.roles?.includes('registrar'));

      return {
        registered: true,
        handle:     j.handle||null,
        status:     j.status||[],
        dnssec:     j.secureDNS?.delegationSigned===true,
        registrar:  reg ? (vCard(reg.vcardArray,'fn')||null) : null,
        iana_id:    reg?.publicIds?.find(p=>p.type==='IANA Registrar ID')?.identifier||null,
        nameservers:(j.nameservers||[]).map(n=>n.ldhName?.toLowerCase()).filter(Boolean),
        dates: {
          registered:        regDate?.toISOString()||null,
          expiration:        expDate?.toISOString()||null,
          registered_human:  hrDate(regDate),
          expiration_human:  hrDate(expDate),
        },
        age: age ? {
          years:      age.years,
          months:     age.months,
          days:       age.days,
          total_days: age.total_days,
          formatted:  `${age.years}y ${age.months}m ${age.days}d`,
          category:   age.total_days<365?'New':age.total_days<3650?'Established':'Mature',
        } : null,
        expiry: {
          days_remaining: daysLeft,
          status: daysLeft===null?'unknown':daysLeft<0?'expired':daysLeft<30?'expiring_soon':daysLeft<90?'expiring_soon':'active',
        },
      };
    } catch(_) { /* try next */ }
  }
  throw new Error('RDAP unavailable');
}

// ═══════════════════════════════════════════════════════════════
// MODULE 2 — DNS RECORDS (Cloudflare DoH)
// ═══════════════════════════════════════════════════════════════

async function fetchDns(domain) {
  const results = await Promise.all(DNS_REC_TYPES.map(async type => {
    try {
      const r = await fetch(`${DOH_URL}?name=${encodeURIComponent(domain)}&type=${type}`,{
        headers:{ Accept:'application/dns-json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!r.ok) return { type, records:[] };
      const j = await r.json();
      if (j.Status!==0) return { type, records:[] };
      return {
        type,
        records: (j.Answer||[]).map(a => {
          if (type==='MX') { const [p,...ex]=a.data.trim().split(/\s+/); return {ttl:a.TTL,priority:parseInt(p),exchange:ex.join(' ')}; }
          return { ttl:a.TTL, data:a.data };
        }),
      };
    } catch(_) { return { type, records:[] }; }
  }));

  const map={};
  for (const r of results) map[r.type.toLowerCase()]=r.records;

  const mx    = map.mx?.map(r=>r.exchange?.replace(/\.$/,''))||[];
  const ns    = map.ns?.map(r=>r.data?.replace(/\.$/,''))||[];
  const a     = map.a?.map(r=>r.data)||[];

  return {
    records:    map,
    ip_addresses: a,
    has_ipv6:   (map.aaaa?.length||0)>0,
    has_mail:   mx.length>0,
    total_records: Object.values(map).reduce((s,r)=>s+r.length,0),
    mail_provider:
      mx.some(m=>m.includes('google'))    ? 'Google Workspace' :
      mx.some(m=>m.includes('outlook')||m.includes('microsoft')) ? 'Microsoft 365' :
      mx.some(m=>m.includes('zoho'))      ? 'Zoho Mail' :
      mx.some(m=>m.includes('mailgun'))   ? 'Mailgun' :
      mx.some(m=>m.includes('protonmail'))? 'ProtonMail' :
      mx.length ? 'Custom' : null,
    dns_provider:
      ns.some(n=>n.includes('cloudflare'))? 'Cloudflare' :
      ns.some(n=>n.includes('awsdns'))    ? 'AWS Route 53' :
      ns.some(n=>n.includes('azure'))     ? 'Azure DNS' :
      ns.some(n=>n.includes('google'))    ? 'Google Cloud DNS' :
      ns.some(n=>n.includes('domaincontrol'))? 'GoDaddy' : 'Custom',
  };
}

// ═══════════════════════════════════════════════════════════════
// MODULE 3 — TLD AVAILABILITY (Verisign Bulk)
// ═══════════════════════════════════════════════════════════════

async function fetchTlds(baseName) {
  const params = new URLSearchParams({
    names: baseName,
    tlds:  TLD_VARIANTS.join(','),
    'include-registered': 'true',
  });
  const r = await fetch(`${VERISIGN_BULK}?${params}`, {
    headers:{
      Accept:'application/json', Origin:'https://dnhub.io', Referer:'https://dnhub.io/',
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`Verisign ${r.status}`);
  const j = await r.json();

  const out = {};
  for (const item of (j.results||[])) {
    const tld  = item.name.split('.').pop().toLowerCase();
    const avail= item.availability==='available';
    out[tld] = {
      status:       avail ? 'available' : 'taken',
      available:    avail,
      domain:       item.name.toLowerCase(),
      register_url: avail ? `https://www.namecheap.com/domains/registration/results/?domain=${item.name.toLowerCase()}` : null,
    };
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 4 — BRAND / SOCIAL CHECK (namecheckerr)
// ═══════════════════════════════════════════════════════════════

async function fetchBrandCheck(baseName) {
  const p = new URLSearchParams();
  p.append('q', baseName);
  SOCIAL_KEYS.forEach(k => p.append('s[]', k));
  p.append('key', NC_KEY);

  const r = await fetch(NC_API, {
    method: 'POST',
    headers:{
      'Content-Type':'application/x-www-form-urlencoded; charset=UTF-8',
      Accept:'*/*', Origin:'https://namecheckerr.com', Referer:'https://namecheckerr.com/',
      'X-Requested-With':'XMLHttpRequest',
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36',
    },
    body: p.toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`NameCheckerr ${r.status}`);
  const raw = await r.json();

  const available=[], taken=[];
  for (const [platform, data] of Object.entries(raw)) {
    if (!SOCIAL_KEYS.includes(platform)) continue;
    const isAvail = typeof data==='boolean' ? data : (data?.available??null);
    const entry = {
      platform,
      available: isAvail,
      status:    isAvail===true?'available':isAvail===false?'taken':'unknown',
      url:       buildSocialUrl(platform, baseName),
    };
    if (isAvail===true) available.push(entry);
    else if (isAvail===false) taken.push(entry);
  }
  return { available, taken, checked: SOCIAL_KEYS.length };
}

function buildSocialUrl(p, u) {
  const m={
    facebook:`https://facebook.com/${u}`,twitter:`https://twitter.com/${u}`,
    instagram:`https://instagram.com/${u}`,youtube:`https://youtube.com/@${u}`,
    github:`https://github.com/${u}`,linkedin:`https://linkedin.com/in/${u}`,
    tiktok:`https://tiktok.com/@${u}`,reddit:`https://reddit.com/user/${u}`,
    pinterest:`https://pinterest.com/${u}`,snapchat:`https://snapchat.com/add/${u}`,
    twitch:`https://twitch.tv/${u}`,
  };
  return m[p]||null;
}

// ═══════════════════════════════════════════════════════════════
// MODULE 5 — BACKLINKS (Rankifyer)
// ═══════════════════════════════════════════════════════════════

async function fetchBacklinks(domain) {
  const site = `http://${domain}`;
  const formParams = new URLSearchParams({
    id: RANKIFYER_TOOL_ID, ref:'https://rankifyer.com/backlink-checker/',
    ref_hash:'ffd9bb20bb21736b47a1de5a39d1cdd3d382adcb50991497866ca45107878088',
    h:'0', r:RANKIFYER_R, site, exp:String(Math.floor(Date.now()/1000)+3600),
  });
  const headers = {
    Accept:'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language':'en-GB,en;q=0.6',
    'Content-Type':'application/x-www-form-urlencoded',
    Referer:'https://rankifyer.com/backlink-checker/',
    Origin:'https://rankifyer.com',
    'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/147.0.0.0 Safari/537.36',
    'Sec-Fetch-Dest':'iframe','Sec-Fetch-Mode':'navigate','Sec-Fetch-Site':'same-origin',
  };

  const r = await fetch(`${RANKIFYER_EMBED}?id=${RANKIFYER_TOOL_ID}&h=0&r=${RANKIFYER_R}&cookies=0`, {
    method:'POST', headers, body:formParams.toString(),
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`Rankifyer ${r.status}`);
  const html = await r.text();
  if (!html.includes('class="stats"')) return { total:0, backlinks:[] };

  // Parse stats
  const stats={};
  const statRe=/<h3>(\d+)<\/h3>\s*<span>([^<]+)<\/span>/g;
  let sm;
  while((sm=statRe.exec(html))!==null) stats[sm[2].trim().toLowerCase().replace(/\s+/g,'_')]=parseInt(sm[1]);

  // Parse rows
  const backlinks=[];
  const tbodyM=html.match(/<tbody>([\s\S]*?)<\/tbody>/i);
  if (tbodyM) {
    const rowRe=/<tr>([\s\S]*?)<\/tr>/gi; let rm;
    while((rm=rowRe.exec(tbodyM[1]))!==null){
      const cells=[...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(c=>c[1]);
      if (cells.length<6) continue;
      const srcUrl = (cells[1].match(/href="([^"]+)"[^>]*data-key="url"/))?.[1];
      const anchor = (cells[2].match(/data-key="title"[^>]*>\s*([\s\S]*?)\s*<\/strong>/))?.[1]?.replace(/\s+/g,' ').trim();
      const daM    = cells[4].match(/<div class="value">(\d+)<\/div>/);
      const dateM  = cells[5].match(/(\d{4}-\d{2}-\d{2})/);
      backlinks.push({
        source_url:  srcUrl ? decodeEntities(srcUrl) : null,
        anchor_text: anchor||null,
        da:          daM ? parseInt(daM[1]) : null,
        nofollow:    /data-key="nofollow"/.test(cells[2]),
        found_date:  dateM?.[1]||null,
      });
    }
  }

  const das = backlinks.map(b=>b.da).filter(d=>d!==null);
  return {
    total:       stats.backlinks        ?? backlinks.length,
    unique:      stats.unique_backlinks ?? null,
    nofollow:    stats.nofollow_backlinks ?? backlinks.filter(b=>b.nofollow).length,
    dofollow:    backlinks.filter(b=>!b.nofollow).length,
    da_avg:      das.length ? Math.round(das.reduce((s,v)=>s+v,0)/das.length) : null,
    da_max:      das.length ? Math.max(...das) : null,
    backlinks:   backlinks.slice(0,10),  // top 10 for overview
  };
}

// ═══════════════════════════════════════════════════════════════
// MODULE 6 — DNS HISTORY (HackerTarget free + live DNS)
// ═══════════════════════════════════════════════════════════════

async function fetchDnsHistory(domain) {
  const [htR, liveNsR] = await Promise.allSettled([
    // HackerTarget NS lookup history
    fetch(`${HACKERTARGET_API}${domain}`, {
      headers:{ 'User-Agent':'DomainKit/2.0', Accept:'text/plain' },
      signal: AbortSignal.timeout(8000),
    }).then(r=>r.ok?r.text():null),
    // Live NS via Cloudflare DoH
    fetch(`${DOH_URL}?name=${encodeURIComponent(domain)}&type=NS`, {
      headers:{ Accept:'application/dns-json' },
      signal: AbortSignal.timeout(5000),
    }).then(r=>r.ok?r.json():null),
  ]).then(r=>r.map(x=>x.status==='fulfilled'?x.value:null));

  const liveNs = (liveNsR?.Answer||[]).map(a=>a.data?.replace(/\.$/,'')).filter(Boolean);

  // Parse HackerTarget subdomains as history signal
  const subdomains = [];
  if (htR && typeof htR==='string' && !htR.includes('error')) {
    htR.trim().split('\n').slice(0,20).forEach(line=>{
      const [host,ip]=line.split(',');
      if (host&&ip) subdomains.push({ host:host.trim(), ip:ip.trim() });
    });
  }

  return {
    current_nameservers: liveNs,
    subdomains_found:    subdomains.length,
    subdomains:          subdomains.slice(0,10),
    sources_used:        ['cloudflare-doh', htR ? 'hackertarget' : null].filter(Boolean),
  };
}

// ═══════════════════════════════════════════════════════════════
// MODULE 7 — REACHABILITY (HTTP HEAD probe)
// ═══════════════════════════════════════════════════════════════

async function fetchReachability(domain) {
  const t0 = Date.now();
  for (const proto of ['https','http']) {
    try {
      const r = await fetch(`${proto}://${domain}`, {
        method:'HEAD', redirect:'follow',
        headers:{ 'User-Agent':'DomainKit/2.0' },
        signal: AbortSignal.timeout(6000),
      });
      return {
        reachable:    true,
        https:        proto==='https',
        status_code:  r.status,
        redirected:   r.redirected,
        final_url:    r.url||`${proto}://${domain}`,
        response_ms:  Date.now()-t0,
        server:       r.headers.get('server')||null,
        x_powered_by: r.headers.get('x-powered-by')||null,
        content_type: r.headers.get('content-type')||null,
      };
    } catch(_) { /* try http */ }
  }
  return { reachable:false, https:false, response_ms:Date.now()-t0 };
}

// ═══════════════════════════════════════════════════════════════
// ASSEMBLE FINAL RESPONSE
// ═══════════════════════════════════════════════════════════════

function buildResponse(domain, results, elapsed) {
  const get = label => results.find(r=>r.label===label);

  const whois       = get('whois');
  const dns         = get('dns');
  const tlds        = get('tlds');
  const brand       = get('brand');
  const backlinks   = get('backlinks');
  const dnsHistory  = get('dnsHistory');
  const reach       = get('reachability');

  const parts    = domain.split('.');
  const baseName = parts.slice(0,-1).join('.');
  const tld      = parts[parts.length-1];

  // ── overview ────────────────────────────────────────────────
  const overview = {
    domain,
    base_name:   baseName,
    tld:         `.${tld}`,
    status:      whois?.ok
                   ? (whois.data.registered ? 'registered' : 'available')
                   : 'unknown',
    https:       reach?.ok ? (reach.data.https ?? false) : null,
    reachable:   reach?.ok ? (reach.data.reachable ?? false) : null,
    response_ms: reach?.ok ? reach.data.response_ms : null,
    server:      reach?.ok ? reach.data.server : null,
  };

  // ── tlds ────────────────────────────────────────────────────
  const tldsOut = {};
  if (tlds?.ok) {
    for (const [t,v] of Object.entries(tlds.data)) {
      tldsOut[t] = v.status;
    }
  }
  const tldsAvailable = Object.entries(tldsOut).filter(([,s])=>s==='available').map(([t])=>`.${t}`);
  const tldsTaken     = Object.entries(tldsOut).filter(([,s])=>s==='taken').map(([t])=>`.${t}`);

  // ── seo ─────────────────────────────────────────────────────
  const seo = {
    backlinks:      backlinks?.ok ? backlinks.data.total      : null,
    backlinks_dofollow: backlinks?.ok ? backlinks.data.dofollow  : null,
    backlinks_nofollow: backlinks?.ok ? backlinks.data.nofollow  : null,
    backlinks_da_avg:   backlinks?.ok ? backlinks.data.da_avg    : null,
    backlinks_da_max:   backlinks?.ok ? backlinks.data.da_max    : null,
    dns_records:    dns?.ok ? dns.data.total_records : null,
    mail_provider:  dns?.ok ? dns.data.mail_provider : null,
    dns_provider:   dns?.ok ? dns.data.dns_provider  : null,
    has_ipv6:       dns?.ok ? dns.data.has_ipv6      : null,
    ip_addresses:   dns?.ok ? dns.data.ip_addresses  : [],
  };

  // ── info ────────────────────────────────────────────────────
  const info = whois?.ok && whois.data.registered ? {
    registrar:    whois.data.registrar,
    iana_id:      whois.data.iana_id,
    status:       whois.data.status,
    dnssec:       whois.data.dnssec,
    nameservers:  whois.data.nameservers,
    created:      whois.data.dates?.registered_human,
    expires:      whois.data.dates?.expiration_human,
    created_iso:  whois.data.dates?.registered,
    expires_iso:  whois.data.dates?.expiration,
    expiry_status:whois.data.expiry?.status,
    days_until_expiry: whois.data.expiry?.days_remaining,
  } : null;

  // ── age ─────────────────────────────────────────────────────
  const age = whois?.ok && whois.data.age ? {
    years:     whois.data.age.years,
    months:    whois.data.age.months,
    days:      whois.data.age.days,
    total_days:whois.data.age.total_days,
    formatted: whois.data.age.formatted,
    category:  whois.data.age.category,
  } : null;

  // ── dns records ─────────────────────────────────────────────
  const dnsRecords = dns?.ok ? dns.data.records : null;

  // ── dns history ─────────────────────────────────────────────
  const history = dnsHistory?.ok ? {
    current_nameservers: dnsHistory.data.current_nameservers,
    subdomains_found:    dnsHistory.data.subdomains_found,
    subdomains:          dnsHistory.data.subdomains,
    sources_used:        dnsHistory.data.sources_used,
  } : null;

  // ── social ──────────────────────────────────────────────────
  const social = brand?.ok ? {
    available:   brand.data.available,
    taken:       brand.data.taken,
    checked:     brand.data.checked,
  } : null;

  // ── top backlinks ───────────────────────────────────────────
  const backlinksList = backlinks?.ok ? backlinks.data.backlinks : [];

  // ── errors map ──────────────────────────────────────────────
  const errors = {};
  for (const r of results) {
    if (!r.ok) errors[r.label] = r.error;
  }

  return {
    success:     true,
    domain,
    checked_at:  new Date().toISOString(),
    elapsed_ms:  elapsed,
    export:      true,

    overview,

    tlds: {
      checked:   TLD_VARIANTS,
      results:   tldsOut,
      available: tldsAvailable,
      taken:     tldsTaken,
      details:   tlds?.ok ? tlds.data : null,
    },

    seo,

    info,

    age,

    dns: dnsRecords,

    dns_history: history,

    backlinks: {
      summary: backlinks?.ok ? {
        total:    backlinks.data.total,
        unique:   backlinks.data.unique,
        dofollow: backlinks.data.dofollow,
        nofollow: backlinks.data.nofollow,
        da_avg:   backlinks.data.da_avg,
        da_max:   backlinks.data.da_max,
      } : null,
      top_10: backlinksList,
    },

    social,

    modules: {
      whois:       whois?.ok       ? 'ok' : 'failed',
      dns:         dns?.ok         ? 'ok' : 'failed',
      tlds:        tlds?.ok        ? 'ok' : 'failed',
      brand:       brand?.ok       ? 'ok' : 'failed',
      backlinks:   backlinks?.ok   ? 'ok' : 'failed',
      dns_history: dnsHistory?.ok  ? 'ok' : 'failed',
      reachability:reach?.ok       ? 'ok' : 'failed',
    },

    ...(Object.keys(errors).length ? { errors } : {}),
  };
}

// ═══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════

export default async function handler(req, res) {
  setCors(res);
  if (req.method==='OPTIONS') return res.status(204).end();

  let rawDomain, stKey;
  if (req.method==='GET') {
    rawDomain = req.query.domain || req.query.d || req.query.site || '';
    stKey     = req.query.st_key || req.headers['x-securitytrails-key'] || '';
  } else if (req.method==='POST') {
    const b   = req.body||{};
    rawDomain = b.domain || b.d || b.site || '';
    stKey     = b.st_key || req.headers['x-securitytrails-key'] || '';
  } else {
    return res.status(405).json({ success:false, error:'Method not allowed.' });
  }

  if (!rawDomain) {
    return res.status(400).json({
      success: false,
      error:   'Missing `domain` parameter.',
      usage:   'GET /api/domain-full?domain=example.com',
      modules: ['whois','dns','tlds','brand','backlinks','dns_history','reachability'],
    });
  }

  const { valid, domain } = validateDomain(String(rawDomain));
  if (!valid) return res.status(400).json({ success:false, error:`Invalid domain: "${rawDomain}"` });

  const parts    = domain.split('.');
  const baseName = parts.slice(0,-1).join('.');

  const t0 = Date.now();

  // ── Run ALL modules in parallel — failures are isolated ─────
  const results = await Promise.all([
    safe('whois',       fetchWhois(domain)),
    safe('dns',         fetchDns(domain)),
    safe('tlds',        fetchTlds(baseName)),
    safe('brand',       fetchBrandCheck(baseName)),
    safe('backlinks',   fetchBacklinks(domain)),
    safe('dnsHistory',  fetchDnsHistory(domain)),
    safe('reachability',fetchReachability(domain)),
  ]);

  const elapsed = Date.now() - t0;
  const payload = buildResponse(domain, results, elapsed);

  return res.status(200).json(payload);
}
