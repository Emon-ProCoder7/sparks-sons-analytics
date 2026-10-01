// Keyword discovery scoring (n8n Code node, run once for all items).
// Input items: one Google Autocomplete response per seed (text in json.data), same order as SEEDS.
// Real demand signals only: what Google suggests as people type (position = popularity),
// plus Search Console impressions when the property is Sparks' own. Nothing is invented.

// SEEDS comes from kw-seeds.js (prepended by build.mjs)
const LOCAL = /\b(geelong|bellarine|torquay|lara|ocean grove|surf coast|leopold|drysdale|corio|norlane|near me)\b/;
const VOCAB = new Set(('vic victoria prices price cost costs best cheap custom near me for sale hire new used and installation installers installer install fitting fitters fitted fit repairs repair servicing service services parts part accessories ' +
  'manufacturers manufacturer manufacturing builders builder build box car boat heavy duty tandem galvanised electric brakes brake controllers controller weight distribution hitch hitches ' +
  'towbars towbar tow bar bars towing trailer trailers caravan caravans camper campers geelong north bellarine torquay lara ocean grove surf coast leopold drysdale corio norlane mobile shop store supplies supplier suppliers spare equipment hayman reese welding fabrication in the rv rvs motorhome motorhomes maintenance spares centre center').split(' '));
const FAMILY_WORDS = { build: /manufactur|builder|custom|box trailer|boat trailer|fabricat/, repair: /trailer (repair|servic)/, parts: /trailer parts|trailer accessor/, towbar: /tow ?bar|hitch|brake controller|towing/, caravan: /caravan|camper/ };

const prev = (() => { try { return JSON.parse($('Read keywords').first().json.data?.[0]?.value_object || '{}'); } catch (e) { return {}; } })();
const pinned = new Set((prev.pinned || []).map(k => k.toLowerCase()));
const ignored = new Set((prev.ignored || []).map(k => k.toLowerCase()));
const wasTracked = new Set((prev.tracked || []).map(k => k.keyword.toLowerCase()));
const settings = (() => { try { return JSON.parse($('Read settings').first().json.data?.[0]?.value_object || '{}'); } catch (e) { return {}; } })();
const trackCount = Math.min(8, Math.max(3, Number(settings.trackCount) || 5));

// Search Console only counts when it is Sparks' own property (not the demo account)
const gscOwn = /sparks/i.test(String(settings.gscProperty || ''));
const gscRows = (() => { if (!gscOwn) return []; try { return JSON.parse($('Read search console').first().json.data?.[0]?.result_object || '{}').rows || []; } catch (e) { return []; } })();
const gscImpr = new Map(gscRows.map(r => [String(r.query).toLowerCase(), r.impressions]));

// same search, different wording: 'tow bars' = 'towbars', a trailing 'vic'/'victoria' adds nothing
const keyOf = (k) => k.replace(/tow bars?/g, 'towbar').replace(/towbars/g, 'towbar').replace(/\btrailers\b/g, 'trailer').replace(/\b(vic|victoria)\b/g, '').replace(/\s+/g, ' ').trim();
const familyOf = (k) => Object.keys(FAMILY_WORDS).find(f => FAMILY_WORDS[f].test(k)) || 'other';

const cand = new Map(); // dedupe key -> candidate
const brand = new Set(), others = new Set();
$input.all().forEach((it, i) => {
  let sugg = [];
  try { sugg = JSON.parse(String(it.json.data || '[]'))[1] || []; } catch (e) { sugg = []; }
  sugg.forEach((raw, pos) => {
    const k = String(raw).toLowerCase().trim();
    if (!k) return;
    if (/\bsparks\b/.test(k)) { brand.add(k); return; }
    if (!LOCAL.test(k)) return; // national/informational ("how much do towbars cost") isn't a map keyword
    if (!k.split(' ').every(w => VOCAB.has(w))) { others.add(k); return; } // competitor or unknown names
    const key = keyOf(k);
    const c = cand.get(key) || { keyword: k, family: familyOf(k), score: 0, reasons: new Set(), seeds: new Set() };
    c.score += Math.max(1, 10 - pos);
    c.seeds.add(SEEDS[i] ? SEEDS[i][0] : '');
    c.reasons.add('Google suggests it as people type');
    if (k.length < c.keyword.length) c.keyword = k; // keep the shorter, more common phrasing
    cand.set(key, c);
  });
});
for (const [q, impr] of gscImpr) {
  if (!LOCAL.test(q)) continue;
  const key = keyOf(q);
  const c = cand.get(key) || { keyword: q, family: familyOf(q), score: 0, reasons: new Set(), seeds: new Set() };
  c.score += Math.round(Math.log10(1 + impr) * 8);
  c.reasons.add('Your customers searched it (' + impr + ' times in Search Console)');
  cand.set(key, c);
}
for (const p of pinned) {
  const key = keyOf(p);
  const c = cand.get(key) || { keyword: p, family: familyOf(p), score: 0, reasons: new Set(), seeds: new Set() };
  c.reasons.add('Pinned by you');
  cand.set(key, c);
}

const list = [...cand.values()]
  .filter(c => !ignored.has(c.keyword))
  .map(c => ({ ...c, score: c.score + (wasTracked.has(c.keyword) ? 6 : 0), reasons: [...c.reasons], seeds: [...c.seeds].filter(Boolean), pinned: pinned.has(c.keyword) }))
  .sort((a, b) => (b.pinned - a.pinned) || (b.score - a.score));

// pinned first, then the best keyword from each service family (so every service is watched),
// then the next-best overall until the slots are full
const tracked = list.filter(c => c.pinned);
for (const f of ['build', 'towbar', 'repair', 'caravan', 'parts']) {
  if (tracked.length >= trackCount) break;
  const best = list.find(c => c.family === f && !tracked.includes(c));
  if (best && !tracked.some(t => t.family === f)) tracked.push(best);
}
for (const c of list) { if (tracked.length >= trackCount) break; if (!tracked.includes(c)) tracked.push(c); }
const candidates = list.filter(c => !tracked.includes(c)).slice(0, 20);

return [{ json: {
  updatedAt: new Date().toISOString(),
  tracked, candidates,
  brand: [...brand], others: [...others].slice(0, 15),
  pinned: [...pinned], ignored: [...ignored], trackCount,
  sources: { autocomplete: SEEDS.length + ' seed phrases checked', searchConsole: gscOwn ? 'Sparks Search Console (90 days)' : 'not used (demo account is not Sparks)' },
} }];
