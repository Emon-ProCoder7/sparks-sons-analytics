// Shared helpers for the Lead Finder / Rank Grid Code nodes. build.mjs prepends this file to
// the Code nodes that need it; tests/lib-leads.test.mjs runs it locally. Plain functions only
// (no imports) so it works unchanged inside an n8n Code node.

const FREEMAIL = ['gmail.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'yahoo.com.au', 'icloud.com', 'bigpond.com', 'bigpond.net.au', 'optusnet.com.au', 'iinet.net.au', 'tpg.com.au'];
const PLACEHOLDER = ['example', 'domain.com', 'yourdomain', 'your@', 'user@', 'name@', 'email@', 'sentry', 'wixpress', 'godaddy', '@2x', '.png', '.jpg', '.webp', '.svg', 'test@', 'noreply', 'no-reply'];

function digits(s) { return String(s || '').replace(/\D/g, ''); }

function toText(html) {
  return String(html || '')
    .replace(/<(script|style|noscript|svg)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|td|tr|section)>/gi, ' | ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&#39;|&rsquo;|&#8217;/g, "'").replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ').trim();
}

function rootDomain(url) {
  // regex rather than URL(): not every sandbox (n8n Code node included) exposes the URL global
  const m = String(url || '').match(/^[a-z]+:\/\/([^/?#:]+)/i);
  if (!m) return '';
  const host = m[1].toLowerCase().replace(/^www\./, '');
  const parts = host.split('.');
  return /\.(com|net|org|edu|gov)\.au$|\.co\.nz$/.test(host) ? parts.slice(-3).join('.') : parts.slice(-2).join('.');
}

function goodEmails(html, website) {
  const root = rootDomain(website);
  const found = new Set((String(html || '').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).map(e => e.toLowerCase().replace(/\.$/, '')));
  const ok = [...found].filter(e => !PLACEHOLDER.some(p => e.includes(p))).filter(e => {
    const d = e.split('@')[1];
    return (root && (d === root || d.endsWith('.' + root))) || FREEMAIL.includes(d);
  });
  return ok.sort((a, b) => FREEMAIL.includes(a.split('@')[1]) - FREEMAIL.includes(b.split('@')[1]));
}

// ---- decision-maker extraction (port of worker/dm.py; tested in tests/lib-leads.test.mjs)
const ROLES = ['managing director', 'managing partner', 'founding director', 'founding partner', 'senior partner', 'principal', 'director', 'founder', 'co-founder', 'owner', 'co-owner', 'proprietor', 'licensee', 'general manager', 'ceo', 'chief executive', 'partner', 'operations manager', 'sales manager'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ROLE_FIND = new RegExp('\\b(' + [...ROLES].sort((a, b) => b.length - a.length).map(esc).join('|') + ')\\b', 'gi');
const TOKEN = "(?:(?:Mc|Mac|O['’]|D['’])?[A-Z][a-z]+(?:-[A-Z][a-z]+)?|[A-Z]{2,}(?:['’\\-][A-Z]+)?)(?![A-Za-z'’])";
const NAME_SRC = '(?<![A-Za-z])(' + TOKEN + '(?:\\s+' + TOKEN + '){1,2})';
const GAP_BEFORE = /^[\s,\-–—|:(]*(?:is\s+|was\s+)?(?:the\s+|our\s+|a\s+)?(?:[a-z&]+\s+){0,2}$/i;
const GAP_AFTER = /^\s*[:\-–—,|]?\s*(?:is\s+)?$/;
const PHONE_RX = /(?:\+?61[\s-]?|0)[2-478](?:[\s-]?\d){8}/;
const BLACKLIST = new Set(('team our the contact about us home services service careers news blog gallery menu read more learn call email phone mobile view click here book now today get quote free enquire enquiry submit send message welcome meet privacy policy terms conditions copyright rights reserved sitemap login shop cart search back next previous open hours ' +
  'premier trusted experienced quality leading best expert experts professional local family owned operated since years why choose reliable affordable friendly award winning proudly servicing specialist specialists solutions custom new used range products support ' +
  'pty ltd group company business customer customers client clients sales hire parts trailer trailers caravan caravans towbar towbars equipment plant landscaping building builders construction rural supplies boats marine motors auto automotive accessories centre center real estate agency office head branch store workshop yard ' +
  'australia australian victoria vic melbourne geelong north south east west street st road rd drive dr avenue ave highway hwy bellarine surf coast peninsula lara corio ' +
  'monday tuesday wednesday thursday friday saturday sunday january february march april may june july august september october november december ' +
  'google facebook instagram linkedin youtube reviews review ca cpa anz registered tax agent licensed accredited member certified ' +
  'managing director directors partner partners principal founder founders owner owners proprietor licensee general manager managers senior founding chief executive ceo operations').split(' '));

function cleanName(raw, biz) {
  const toks = raw.split(/\s+/);
  const bad = t => BLACKLIST.has(t.toLowerCase().replace(/^['’-]+|['’-]+$/g, '')) || biz.has(t.toLowerCase());
  while (toks.length && bad(toks[0])) toks.shift();
  while (toks.length && bad(toks[toks.length - 1])) toks.pop();
  if (toks.length < 2 || toks.length > 3 || toks.some(t => bad(t) || t.length < 2)) return null;
  return toks.map(t => (t === t.toUpperCase() ? t[0] + t.slice(1).toLowerCase() : t)).join(' ');
}

function extractDecisionMaker(text, businessName) {
  const biz = new Set((String(businessName).toLowerCase().match(/[a-z]{3,}/g) || []));
  let best = null; // [priority, name, role, mobile]
  ROLE_FIND.lastIndex = 0;
  let rm;
  while ((rm = ROLE_FIND.exec(text))) {
    const role = rm[1].toLowerCase();
    const pri = ROLES.includes(role) ? ROLES.indexOf(role) : ROLES.length;
    if (best && pri >= best[0]) continue;
    let name = null;
    // name BEFORE the role: "Jane Doe, Director" / "JANE DOE (CA ANZ ... FOUNDER"
    const start = Math.max(0, rm.index - 130);
    const before = text.slice(start, rm.index);
    const nb = new RegExp(NAME_SRC, 'g');
    let m;
    while ((m = nb.exec(before))) {
      const gap = before.slice(m.index + m[0].length);
      const inParen = gap.includes('(') && !gap.includes(')') && gap.length <= 100;
      if ((gap.length <= 30 && GAP_BEFORE.test(gap)) || inParen) name = cleanName(m[1], biz) || name;
    }
    // name AFTER the role: "OWNER: Sarah O'Brien"
    if (!name) {
      const endIdx = rm.index + rm[0].length;
      const after = text.slice(endIdx, endIdx + 50);
      const ma = new RegExp(NAME_SRC).exec(after);
      if (ma && GAP_AFTER.test(after.slice(0, ma.index))) name = cleanName(ma[1], biz);
    }
    if (!name) continue;
    const ph = text.slice(rm.index + rm[0].length, rm.index + rm[0].length + 150).match(PHONE_RX);
    best = [pri, name, role.replace(/\b\w/g, c => c.toUpperCase()).replace('Ceo', 'CEO'), ph ? ph[0].trim() : ''];
  }
  return best ? { name: best[1], role: best[2], mobile: best[3] } : { name: '', role: '', mobile: '' };
}

// ---- matching, size, state
function norm(s) { return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
function namesMatch(found, wanted) { const a = norm(found), b = norm(wanted); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); }

function inState(address, state) {
  if (!address) return true; // can't tell: keep rather than silently drop
  return new RegExp('\\b' + esc(state) + '\\b').test(address) || (state === 'VIC' && /Victoria/.test(address));
}

function sizeEstimate(name, reviews, franchise, national) {
  const n = String(name || '').toLowerCase();
  if ((national || []).some(b => b && n.includes(b))) return ['national corporate — general contact only, low personal-outreach value', 'known national brand'];
  const r = Number(reviews) || 0;
  const basis = 'Google review count (' + r + ') as a volume proxy — Maps has no staff or revenue data';
  if ((franchise || []).some(b => b && n.includes(b))) return ['franchise — independently owned office', basis];
  if (r >= 150) return ['larger local operator', basis];
  if (r >= 40) return ['established small business', basis];
  if (r >= 10) return ['small business', basis];
  return ['very small or new', basis];
}
