// Google visibility check (n8n Code node, run once for all items). Prepended with lib-leads.js.
// For each tracked keyword: Google Maps position searched from central Geelong, who holds the map top 3
// and the categories Google lists them under, plus Sparks' own listing. Website-link position comes from
// Sparks' own Search Console when connected (never from simulated web results, which proved unreliable).

const kws = $('Keyword items').all().map(i => i.json);
const maps = $input.all();
const settings = (() => { try { return JSON.parse($('Read settings (check)').first().json.data?.[0]?.value_object || '{}'); } catch (e) { return {}; } })();
const name = settings.businessNameOnGoogle || 'F Sparks & Sons';
const gscOwn = /sparks/i.test(String(settings.gscProperty || ''));
const gsc = (() => { if (!gscOwn) return null; try { return JSON.parse($('Read search console (check)').first().json.data?.[0]?.result_object || '{}'); } catch (e) { return null; } })();
const gscRow = (kw) => (gsc && gsc.rows || []).find(r => String(r.query).toLowerCase() === kw.toLowerCase()) || null;

// Google returns categories as a string in some results and as a list in others; the first listed
// is normally the primary category.
const typesOf = (x) => [].concat(x.types || x.type || []).flat().map(String).filter(Boolean);

// Sparks' own Google listing (categories, rating, review count)
const ownRes = $('Find own listing').first().json;
let own = ownRes.place_results || null;
if (!own) own = (ownRes.local_results || []).find(r => namesMatch(r.title, name)) || null;
const ownInfo = own ? {
  title: own.title, types: typesOf(own), primaryType: typesOf(own)[0] || '',
  rating: own.rating ?? null, reviews: own.reviews ?? null, address: own.address || '',
} : null;

// main word of a keyword, e.g. "trailer manufacturers geelong" -> "trailer"
const GENERIC = /^(geelong|north|vic|victoria|near|me|manufacturers?|builders?|repairs?|servicing|service|parts|installation|fitting|custom|box|boat)$/;
const mainWord = (k) => (k.split(' ').find(w => !GENERIC.test(w)) || '').replace(/s$/, '');

let failed = 0;
const rows = kws.map((k, i) => {
  const m = (maps[i] && maps[i].json) || {};
  if (m.error) failed++;
  const sc = gscRow(k.keyword);
  const mapList = (m.local_results || []).slice(0, 20);
  const mapIdx = mapList.findIndex(r => namesMatch(r.title, name));
  const top3 = mapList.slice(0, 3).map(r => ({ title: r.title, type: typesOf(r)[0] || '', rating: r.rating ?? null, reviews: r.reviews ?? null }));
  // compare against the top 3 OTHER businesses (Sparks' own entry shouldn't count as a competitor)
  const rivals = mapList.filter(r => !namesMatch(r.title, name)).slice(0, 3).map(r => ({ title: r.title, type: typesOf(r)[0] || '', reviews: r.reviews ?? null }));
  const typeCount = {};
  rivals.forEach(t => { if (t.type) typeCount[t.type] = (typeCount[t.type] || 0) + 1; });
  const winningCategory = Object.entries(typeCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  const ownTypes = (ownInfo?.types || []).map(t => t.toLowerCase());
  const word = mainWord(k.keyword);
  const top3WithWordInName = word ? rivals.filter(t => String(t.title).toLowerCase().includes(word)).length : 0;
  const reviewed = rivals.filter(t => t.reviews != null);
  const top3AvgReviews = reviewed.length ? Math.round(reviewed.reduce((s, t) => s + Number(t.reviews), 0) / reviewed.length) : null;
  return {
    keyword: k.keyword,
    family: k.family,
    reasons: k.reasons || [],
    websiteRank: sc ? Math.round(sc.position * 10) / 10 : null,
    websiteClicks: sc ? sc.clicks : null,
    websiteSource: gscOwn ? (sc ? 'Search Console, last 28 days' : 'not seen in Search Console in the last 28 days') : "connect Sparks' Search Console",
    mapRank: mapIdx >= 0 ? mapIdx + 1 : null,
    mapTop3: top3,
    winningCategory,
    categoryMatch: winningCategory ? ownTypes.includes(winningCategory.toLowerCase()) : null,
    categoryIsPrimary: winningCategory ? (ownInfo?.primaryType || '').toLowerCase() === winningCategory.toLowerCase() : null,
    mainWord: word,
    top3WithWordInName,
    top3AvgReviews,
    error: m.error ? String(m.error.message || m.error).slice(0, 160) : '',
  };
});

return [{ json: {
  runId: 'V' + Date.now().toString(36),
  checkedAt: new Date().toISOString(),
  location: 'Google Maps searched from central Geelong',
  own: ownInfo,
  rows,
  searchesUsed: kws.length + 1,
  status: failed === rows.length && rows.length ? 'failed' : 'done',
} }];
