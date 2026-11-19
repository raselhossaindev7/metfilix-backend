import { Router } from 'express';
import { authRequired, requirePerm } from '../middleware/auth.js';
import { ah } from '../middleware/async.js';

// ────────────────────────────────────────────────────────────────────────────
// Auto metadata: admins only paste a title (plus optional video URL/poster)
// and the server looks the rest up on the web. Four providers are tried in
// order of quality; every one is optional, so no API key is required:
//   • TMDB      (best; needs TMDB_API_KEY or TMDB_READ_TOKEN)
//   • TVmaze    (free TV/movie-ish shows, no key)
//   • iTunes    (free movie catalog, no key)
//   • Wikipedia (free summary fallback for descriptions)
// ────────────────────────────────────────────────────────────────────────────

const r = Router();

const LANG = {
  en: 'English', hi: 'Hindi', bn: 'Bangla', es: 'Spanish', ko: 'Korean',
  ja: 'Japanese', fr: 'French', de: 'German', ta: 'Tamil', te: 'Telugu',
  ml: 'Malayalam', ur: 'Urdu', ar: 'Arabic', pt: 'Portuguese', it: 'Italian',
  ru: 'Russian', zh: 'Chinese', th: 'Thai', tr: 'Turkish', id: 'Indonesian',
  nl: 'Dutch', pl: 'Polish', sv: 'Swedish', da: 'Danish', no: 'Norwegian',
  fa: 'Persian', vi: 'Vietnamese', tl: 'Filipino', ms: 'Malay',
};

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function yearOf(date) {
  const y = String(date || '').slice(0, 4);
  return /^\d{4}$/.test(y) ? y : '';
}

function fmtRuntime(min) {
  const n = Number(min);
  if (!Number.isFinite(n) || n <= 0) return '';
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  if (h <= 0) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function tidyGenres(value) {
  const seen = new Set();
  const list = String(value || '')
    .split(',')
    .map((s) => s.trim().replace(/\s+(films?|television series|television program|series)$/i, '').trim())
    .filter(Boolean)
    .map((s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase()))
    .filter((s) => {
      const k = s.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return list.slice(0, 4).join(', ');
}

function fmtSeasons(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  return `${v} Season${v > 1 ? 's' : ''}`;
}

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\(\d{4}\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function bestMatch(items, title, nameOf) {
  if (!items?.length) return null;
  const want = norm(title);
  let best = null;
  let bestScore = 0;
  for (const item of items) {
    const name = norm(nameOf(item));
    let score = 0;
    if (name === want) score = 3;
    else if (name.startsWith(want) || want.startsWith(name)) score = 2;
    else if (name.length >= 4 && (name.includes(want) || want.includes(name))) score = 1;
    if (score > bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best;
}

async function getJson(url, opts = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 7000);
    try {
      const res = await fetch(url, {
        ...opts,
        signal: ctrl.signal,
        headers: {
          'User-Agent': 'MetfilixBot/1.0 (metadata lookup)',
          Accept: 'application/json',
          ...(opts.headers || {}),
        },
      });
      if (res.status === 429 && attempt === 0) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 800;
        await new Promise((resolve) => setTimeout(resolve, Math.min(wait, 3000)));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error('rate limited');
}

function set(out, key, value) {
  if (value === undefined || value === null) return;
  const v = typeof value === 'string' ? value.trim() : value;
  if (v === '') return;
  out[key] = v;
}

// ── TMDB (optional, needs a key) ────────────────────────────────────────────
async function tmdbLookup(title, type, year) {
  const key = process.env.TMDB_API_KEY;
  const bearer = process.env.TMDB_READ_TOKEN;
  if (!key && !bearer) return null;

  const headers = bearer ? { Authorization: `Bearer ${bearer}` } : {};
  const search = new URL('https://api.themoviedb.org/3/search/multi');
  search.searchParams.set('query', title);
  search.searchParams.set('include_adult', 'false');
  if (year) search.searchParams.set('year', String(year));
  if (!bearer) search.searchParams.set('api_key', key);

  const found = await getJson(search, { headers });
  const list = (found?.results || []).filter((x) => x.media_type === 'movie' || x.media_type === 'tv');
  const wanted = type === 'series' ? 'tv' : type === 'movie' ? 'movie' : null;
  const hit = (wanted ? list.find((x) => x.media_type === wanted) : null) ||
    bestMatch(list, title, (x) => x.title || x.name);
  if (!hit) return null;

  const kind = hit.media_type;
  const detailUrl = new URL(`https://api.themoviedb.org/3/${kind}/${hit.id}`);
  detailUrl.searchParams.set('append_to_response', 'credits,release_dates,content_ratings');
  if (!bearer) detailUrl.searchParams.set('api_key', key);
  const d = await getJson(detailUrl, { headers });
  if (!d) return null;

  const out = { source: 'tmdb', is_series: kind === 'tv' };
  set(out, 'title', d.title || d.name);
  set(out, 'year', yearOf(d.release_date || d.first_air_date));
  set(out, 'description', d.overview);
  set(out, 'genres', (d.genres || []).map((g) => g.name).join(', '));
  set(out, 'img', d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : '');
  set(out, 'lang', LANG[d.original_language] || '');
  set(out, 'duration', kind === 'movie' ? fmtRuntime(d.runtime) : fmtSeasons(d.number_of_seasons));

  const cast = (d.credits?.cast || []).slice(0, 6).map((c) => c.name).join(', ');
  set(out, 'cast', cast);
  const directors = (d.credits?.crew || []).filter((c) => c.job === 'Director').map((c) => c.name).join(', ');
  set(out, 'director', directors);

  // Age rating (US first, otherwise any).
  const certs = kind === 'movie'
    ? (d.release_dates?.results || []).flatMap((c) => (c.release_dates || []).map((x) => ({ cc: c.iso_3166_1, cert: x.certification })))
    : (d.content_ratings?.results || []).map((x) => ({ cc: x.iso_3166_1, cert: x.rating }));
  const cert = certs.find((x) => x.cc === 'US' && x.cert)?.cert || certs.find((x) => x.cert)?.cert;
  set(out, 'rating', cert);

  return out;
}

// ── TVmaze (free, great for series) ─────────────────────────────────────────
async function tvmazeLookup(title) {
  const results = await getJson(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(title)}`);
  const hit = bestMatch(results, title, (x) => x?.show?.name);
  const show = hit?.show;
  if (!show) return null;

  const out = { source: 'tvmaze', is_series: true };
  set(out, 'title', show.name);
  set(out, 'year', yearOf(show.premiered));
  set(out, 'description', stripHtml(show.summary));
  set(out, 'genres', (show.genres || []).join(', '));
  set(out, 'img', show.image?.original || '');
  set(out, 'lang', LANG[show.language?.toLowerCase()] || show.language || '');
  set(out, 'duration', fmtSeasons(show.seasons?.length));

  // Cast + season count are separate endpoints; failures are non-fatal.
  const [cast, seasons] = await Promise.allSettled([
    getJson(`https://api.tvmaze.com/shows/${show.id}/cast`),
    getJson(`https://api.tvmaze.com/shows/${show.id}/seasons`),
  ]);
  if (cast.status === 'fulfilled') {
    const names = (cast.value || []).slice(0, 6).map((c) => c?.person?.name).filter(Boolean).join(', ');
    set(out, 'cast', names);
  }
  if (seasons.status === 'fulfilled') {
    set(out, 'duration', fmtSeasons((seasons.value || []).length) || out.duration);
  }
  return out;
}

// ── iTunes Search (free, movie catalog) ─────────────────────────────────────
async function itunesLookup(title, year) {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', title);
  url.searchParams.set('entity', 'movie');
  url.searchParams.set('limit', '10');
  url.searchParams.set('country', 'US');
  const found = await getJson(url);
  const hit = bestMatch(found?.results, title, (x) => x.trackName);
  if (!hit) return null;

  const out = { source: 'itunes', is_series: false };
  set(out, 'title', hit.trackName);
  set(out, 'year', yearOf(hit.releaseDate));
  set(out, 'description', hit.longDescription || hit.shortDescription);
  set(out, 'genres', hit.primaryGenreName);
  set(out, 'img', String(hit.artworkUrl100 || '').replace('100x100bb', '600x600bb'));
  set(out, 'duration', fmtRuntime(hit.trackTimeMillis ? hit.trackTimeMillis / 60000 : 0));
  if (year && yearOf(hit.releaseDate) !== String(year)) return null;
  return out;
}

// ── Wikipedia + Wikidata (free, no key) ─────────────────────────────────────
async function wikiSearch(query) {
  // REST search instead of action=query: no key, broader rate limits, and it
  // returns a short description we can classify before fetching the summary.
  const url = `https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(query)}&limit=5`;
  const found = await getJson(url);
  return found?.pages || [];
}

async function wikiLabels(ids) {
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 40);
  if (!unique.length) return {};
  const url = new URL('https://www.wikidata.org/w/api.php');
  url.searchParams.set('action', 'wbgetentities');
  url.searchParams.set('ids', unique.join('|'));
  url.searchParams.set('props', 'labels');
  url.searchParams.set('languages', 'en|mul|en-gb|en-ca');
  url.searchParams.set('format', 'json');
  const data = await getJson(url);
  const out = {};
  for (const [id, ent] of Object.entries(data?.entities || {})) {
    const labels = ent?.labels || {};
    const label = labels.en?.value || labels.mul?.value || labels['en-gb']?.value ||
      labels['en-ca']?.value || Object.values(labels)[0]?.value;
    if (label) out[id] = label;
  }
  return out;
}

async function wikidataFields(qid) {
  const data = await getJson(`https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`);
  const claims = data?.entities?.[qid]?.claims;
  if (!claims) return {};

  const val = (prop) =>
    (claims[prop] || [])
      .map((c) => c?.mainsnak?.datavalue?.value)
      .filter(Boolean);

  const qids = (prop) => val(prop).map((x) => x?.id).filter(Boolean);
  const genres = qids('P136');
  const directors = qids('P57');
  const creators = qids('P170');
  const cast = qids('P161').slice(0, 8);
  const langs = qids('P364');
  const kinds = qids('P31');
  const labels = await wikiLabels([...genres, ...directors, ...creators, ...cast, ...langs, ...kinds]);

  const out = {};
  const time = val('P577')[0]?.time;
  set(out, 'year', time ? String(time).slice(1, 5) : '');

  const minutes = val('P2047')
    .map((x) => Number(String(x?.amount || '').replace('+', '')))
    .find((n) => Number.isFinite(n) && n > 0);
  set(out, 'duration', fmtRuntime(minutes));

  const names = (list) => list.map((id) => labels[id]).filter(Boolean);
  const isSeries = names(kinds).some((k) => /television series|television program/i.test(k));
  set(out, 'genres', tidyGenres(names(genres).join(', ')));
  set(out, 'director', (isSeries ? names(creators) : names(directors)).slice(0, 3).join(', '));
  set(out, 'cast', names(cast).slice(0, 6).join(', '));
  set(out, 'lang', names(langs)[0] || '');

  const file = val('P18')[0];
  set(out, 'img', file ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=600` : '');
  set(out, 'is_series', isSeries);
  return out;
}

function mediaKind(summary) {
  const text = `${summary?.description || ''} ${String(summary?.extract || '').slice(0, 300)}`;
  if (/television series|tv series|miniseries|web series|streaming series/i.test(text)) return 'series';
  if (/\b(film|movie)\b/i.test(text)) return 'movie';
  return '';
}

async function wikiSummary(title) {
  const summary = await getJson(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
  );
  return summary?.extract ? summary : null;
}

async function wikipediaLookup(title, type) {
  // "Dune" is a novel, "Dune (2021 film)" is the movie, "The Last of Us" is
  // a game before it is a series. Search with a hint so we land on the right
  // work; for auto, try the bare title first and follow the classified result.
  const queries = type === 'movie'
    ? [`${title} film`]
    : type === 'series'
      ? [`${title} television series`]
      : [title, `${title} film`, `${title} television series`];
  let summary = null;
  for (const query of queries) {
    let pages = [];
    try { pages = await wikiSearch(query); } catch { continue; }
    const filtered = pages.filter((p) => {
      const d = String(p.description || '');
      if (type === 'movie') return /\b(film|movie)\b/i.test(d);
      if (type === 'series') return /series/i.test(d);
      return true;
    });
    const want = norm(title);
    const score = (p) => {
      const n = norm(p.title);
      if (n === want) return 3;
      if (n.startsWith(want)) return 2;
      return 1;
    };
    const candidates = (filtered.length ? filtered : pages)
      .slice()
      .sort((a, b) => score(b) - score(a))
      .slice(0, 3);
    for (const page of candidates) {
      try {
        const found = await wikiSummary(page.title);
        if (!found) continue;
        summary = found;
        break;
      } catch { /* next candidate */ }
    }
    if (summary && (type !== 'auto' || mediaKind(summary))) break;
    summary = null;
  }
  if (!summary) return null;

  const out = { source: 'wikipedia' };
  set(out, 'title', summary.title);
  set(out, 'description', summary.extract);
  set(out, 'img', summary.thumbnail?.source || '');
  const m = /\((\d{4})/.exec(summary.description || '') || /\((\d{4})/.exec(summary.extract || '');
  set(out, 'year', m ? m[1] : '');

  const qid = summary.wikibase_item;
  if (qid) {
    try {
      const wd = await wikidataFields(qid);
      for (const [k, v] of Object.entries(wd)) {
        if (v === undefined || v === null || v === '') continue;
        if (out[k] === undefined || out[k] === '') out[k] = v;
      }
    } catch { /* keep the summary-only result */ }
  }
  return out;
}

async function lookup(title, type, year) {
  const attempts = [];
  if (process.env.TMDB_API_KEY || process.env.TMDB_READ_TOKEN) {
    attempts.push(() => tmdbLookup(title, type, year));
  }
  if (type === 'movie') {
    attempts.push(() => wikipediaLookup(title, 'movie'));
    attempts.push(() => itunesLookup(title, year));
  } else if (type === 'series') {
    attempts.push(() => tvmazeLookup(title));
    attempts.push(() => wikipediaLookup(title, 'series'));
  } else {
    // Auto: Wikipedia/Wikidata has the best title disambiguation (a movie and
    // a TV series can share a name), so identify the work there first.
    attempts.push(() => wikipediaLookup(title, 'auto'));
    attempts.push(() => tvmazeLookup(title));
  }

  const merged = {};
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      if (!data) continue;
      for (const [k, v] of Object.entries(data)) {
        if (k === 'source') continue;
        if (merged[k] === undefined || merged[k] === '') merged[k] = v;
      }
      if (!merged.source) merged.source = data.source;
      // A good description + genres + year is enough; don't hammer more APIs.
      const solid = merged.description && merged.genres && merged.year &&
        (type !== 'auto' || merged.is_series === true || merged.duration || merged.cast);
      if (solid) break;
    } catch { /* try the next provider */ }
  }

  // Detected TV series: TVmaze has the real season count (Wikidata usually
  // only stores episode runtime, which would label a show as "49m").
  if (merged.is_series && !/season/i.test(String(merged.duration || ''))) {
    try {
      const show = await tvmazeLookup(title);
      if (show) {
        if (show.duration) merged.duration = show.duration;
        if (show.cast) merged.cast = show.cast;
        if (show.genres) merged.genres = show.genres;
        if (!merged.img && show.img) merged.img = show.img;
        if (!merged.year && show.year) merged.year = show.year;
      }
    } catch { /* keep what we have */ }
  }

  if (!merged.title) return null;
  // Defaults that match the admin form / OTT catalog conventions.
  merged.source = merged.source || 'web';
  merged.is_series = merged.is_series === true || type === 'series';
  if (merged.is_series && !merged.duration) merged.duration = '1 Season';
  return merged;
}

// Simple in-memory cache: the same title is often looked up repeatedly.
const cache = new Map();
const CACHE_TTL = 60 * 60 * 1000;

r.get('/lookup', authRequired, requirePerm('movies.create'), ah(async (req, res) => {
  const title = String(req.query.title || '').trim();
  if (title.length < 2) return res.status(400).json({ error: 'title is required' });
  const type = ['movie', 'series'].includes(String(req.query.type)) ? String(req.query.type) : 'auto';
  const year = req.query.year ? Number(req.query.year) : null;

  const key = `${type}|${year || ''}|${title.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return res.json(hit.data);

  const data = await lookup(title, type, year);
  if (!data) {
    return res.status(404).json({ error: 'No match found — fill the details manually.' });
  }
  cache.set(key, { at: Date.now(), data });
  if (cache.size > 300) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  res.json(data);
}));

export default r;

