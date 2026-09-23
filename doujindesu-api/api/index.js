/**
 * @author Henkarmazov
 * Doujindesu JSON API for Vercel
 * Source: https://doujin.desu.xxx
 */
const axios = require('axios');

const BASE_URL = 'https://doujin.desu.xxx';
const API_BASE = `${BASE_URL}/api`;
const APP_SECRET = 'dfdf72051dbfdc7d76889ebd31324e74';
const Wi = 'doujindesu-scrapers-cannot-read-this-super-secret-salt-2026-v2';
const Vi = 36e5;
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map();

function Es(a) {
  const s = Wi + '_' + a;
  let l = 0;
  for (let n = 0; n < s.length; n++) { l = (l << 5) - l + s.charCodeAt(n); l |= 0; }
  let i = '';
  let c = Math.abs(l) || 123456789;
  for (let n = 0; n < 32; n++) { c = (c * 1664525 + 1013904223) % 4294967296; i += String.fromCharCode(33 + (c % 93)); }
  return i;
}
function $n() { const s = Math.floor(Date.now() / Vi); return [Es(s), Es(s - 1), Es(s + 1)]; }
function qi(a, s) {
  const l = []; for (let x = 0; x < a.length; x += 2) { const b = a.substring(x, x + 2); if (!b) break; l.push(parseInt(b, 16)); }
  const i = []; const c = s.length; let n = 42;
  for (let x = 0; x < l.length; x++) { const b = l[x]; const p = s.charCodeAt(x % c); const S = b ^ p ^ x * 13 ^ n; i.push(String.fromCharCode(S & 255)); n = (n + b) % 256; }
  return i.join('');
}
function En(a, s) { return JSON.parse(decodeURIComponent(qi(a, s))); }
function decryptResponse(data) {
  if (data && typeof data === 'object' && data._enc_resp_) {
    for (const key of $n()) { try { return En(data._enc_resp_, key); } catch (_) {} }
    throw new Error('Failed to decrypt API response');
  }
  return data;
}

const deviceId = 'dev_' + Math.random().toString(36).slice(2, 15) + '_' + Date.now().toString(36);
const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
  headers: {
    Accept: 'application/json', Referer: BASE_URL, Origin: BASE_URL,
    'X-App-Secret': APP_SECRET, 'x-app-secret': APP_SECRET,
    'x-device-id': deviceId, 'x-device-name': 'Windows',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36'
  }
});
api.interceptors.response.use(r => { r.data = decryptResponse(r.data); return r; }, e => {
  if (e.response && e.response.data) { try { e.response.data = decryptResponse(e.response.data); } catch (_) {} }
  return Promise.reject(e);
});

async function request(method, path, params) {
  const key = method + ':' + path + ':' + JSON.stringify(params || {});
  const old = cache.get(key);
  if (old && Date.now() - old.time < CACHE_TTL) return old.data;
  try {
    const { data } = await api.request({ method, url: path, params });
    cache.set(key, { data, time: Date.now() });
    return data;
  } catch (error) {
    if (old) return old.data;
    throw error;
  }
}

const handlers = {
  home: () => Promise.allSettled([
    request('GET', '/banners'), request('GET', '/manga', { page: 1, limit: 12, sort: 'latest' }),
    request('GET', '/manga', { page: 1, limit: 12, sort: 'trending' }), request('GET', '/manga', { page: 1, limit: 12, sort: 'popular' }),
    request('GET', '/taxonomy/series/doujinshi', { page: 1, sort: 'latest', limit: 10 }),
    request('GET', '/taxonomy/series/doujinshi', { page: 1, sort: 'popular', limit: 10 }),
    request('GET', '/announcements')
  ]).then(r => ({ banners: r[0], latest: r[1], trending: r[2], popular: r[3], doujinshiLatest: r[4], doujinshiPopular: r[5], announcements: r[6] })),
  schedule: () => request('GET', '/manga', { page: 1, limit: 24, sort: 'latest' }),
  ongoing: ({ page }) => request('GET', '/manga', { page, limit: 24, sort: 'latest', status: 'ongoing' }),
  completed: ({ page }) => request('GET', '/manga', { page, limit: 24, sort: 'latest', status: 'completed' }),
  genres: () => request('GET', '/terms', { taxonomy: 'genre' }),
  genre: ({ id, page }) => request('GET', `/taxonomy/genre/${id}`, { page, sort: 'latest', limit: 24 }),
  search: ({ query }) => request('GET', '/manga', { page: 1, limit: 24, sort: 'latest', search: query }),
  anime: ({ id }) => request('GET', `/manga/${id}`),
  episode: ({ id }) => request('GET', `/chapters/${id}`),
  chapters: ({ id, page }) => request('GET', `/manga/${id}/chapters`, { page, limit: 100 })
};

function json(res, status, body) { res.statusCode = status; res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(body)); }
function route(path) {
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  if (!parts.length) return { name: 'root', params: {} };
  if (parts[0] === 'home') return { name: 'home', params: {} };
  if (parts[0] === 'schedule') return { name: 'schedule', params: {} };
  if (parts[0] === 'ongoing' && parts[1] === 'page') return { name: 'ongoing', params: { page: Number(parts[2]) || 1 } };
  if (parts[0] === 'completed' && parts[1] === 'page') return { name: 'completed', params: { page: Number(parts[2]) || 1 } };
  if (parts[0] === 'genres' && !parts[1]) return { name: 'genres', params: {} };
  if (parts[0] === 'genres' && parts[2] === 'page') return { name: 'genre', params: { id: parts[1], page: Number(parts[3]) || 1 } };
  if (parts[0] === 'search') return { name: 'search', params: { query: parts.slice(1).join('/') } };
  if (parts[0] === 'anime' && parts[2] === 'chapters' && parts[3] === 'page') return { name: 'chapters', params: { id: parts[1], page: Number(parts[4]) || 1 } };
  if (parts[0] === 'anime') return { name: 'anime', params: { id: parts[1] } };
  if (parts[0] === 'episode') return { name: 'episode', params: { id: parts[1] } };
  return null;
}

module.exports = async (req, res) => {
  if (req.method !== 'GET') return json(res, 405, { success: false, message: 'Method Not Allowed' });
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/') return json(res, 200, { author: 'Henkarmazov', name: 'Doujindesu API', routes: {
    home: '/home', schedule: '/schedule', ongoing: '/ongoing/page/:page', completed: '/completed/page/:page', genreList: '/genres', genre: '/genres/:id/page/:page', search: '/search/:query', detailAnime: '/anime/:id', detailEpisode: '/episode/:id', chapters: '/anime/:id/chapters/page/:page'
  }});
  const match = route(pathname);
  if (!match || !handlers[match.name]) return json(res, 404, { success: false, message: 'Route not found' });
  if (Object.values(match.params).some(v => v === undefined || v === '')) return json(res, 400, { success: false, message: 'Parameter tidak lengkap' });
  try { return json(res, 200, await handlers[match.name](match.params)); }
  catch (error) { return json(res, error.response?.status || 500, { success: false, message: error.message || 'Internal Server Error', details: error.response?.data || null }); }
};
