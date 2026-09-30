// n8n Code node, mode "Run once for each item": from a business's homepage HTML, pick up to two
// same-site About / Team / Story pages so the owner/director search has more to read.
// One item in, one item out, so it stays paired with the lead it came from.
const html = String($json.data || '');
const site = String($('Build candidates').item.json.website || '');
const o = site.match(/^[a-z]+:\/\/[^/?#]+/i);
if (!o || !html) return { json: { about1: '', about2: '' } };
const origin = o[0];
const host = origin.replace(/^[a-z]+:\/\//i, '').toLowerCase().replace(/^www\./, '');
const score = (u) => (/team|people|staff|leadership|meet|owner/i.test(u) ? 3 : /about|who|story/i.test(u) ? 2 : 1);
const links = [];
for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
  let u = m[1].trim();
  if (!/about|team|story|who|owner|meet|people|staff|leadership|our-/i.test(u)) continue;
  if (/contact|\.(jpe?g|png|gif|pdf|css|js|svg|webp)(\?|$)/i.test(u)) continue;
  if (u.startsWith('//')) u = 'https:' + u;
  else if (u.startsWith('/')) u = origin + u;
  else if (!/^https?:/i.test(u)) u = origin + '/' + u;
  const h = (u.match(/^[a-z]+:\/\/([^/?#]+)/i) || [])[1];
  if (!h || h.toLowerCase().replace(/^www\./, '') !== host) continue;
  if (!links.includes(u)) links.push(u);
}
links.sort((a, b) => score(b) - score(a));
return { json: { about1: links[0] || '', about2: links[1] || '' } };
