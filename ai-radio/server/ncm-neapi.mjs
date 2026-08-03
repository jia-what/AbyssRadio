/**
 * NEAPI wrapper — NeteaseCloudMusicApiEnhanced: VIP song URLs + trial detection.
 *
 * P1 netease-promote (2026-08-03):
 *  - song_url_v1 with level chain (lossless → exhigh → standard)
 *  - freeTrialInfo parsing → { playable, trial, trialLen }
 *  - fallback: song_url (br=320000) → Meting
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const NEAPI = require('@neteasecloudmusicapienhanced/api');
const songUrlV1 = require('@neteasecloudmusicapienhanced/api/module/song_url_v1.js');
const songUrl = require('@neteasecloudmusicapienhanced/api/module/song_url.js');
const createRequest = require('@neteasecloudmusicapienhanced/api/util/request.js');

const envCookie = process.env.NETEASE_COOKIE || '';

/** level chain: highest first; server falls back when a level is unavailable */
const LEVEL_CHAIN = ['lossless', 'exhigh', 'standard'];

/**
 * Result of a Netease URL lookup:
 *  - url: playable stream URL (proxy-ready) or null
 *  - playable: full-length playback allowed (not a trial clip)
 *  - trial: true when the URL is a 30s/60s trial fragment
 *  - trialLen: trial length in seconds (0 when unknown)
 */
function emptyResult() {
  return { url: null, playable: false, trial: false, trialLen: 0 };
}

/** Parse NEAPI freeTrialInfo → { trial, trialLen }. */
function parseTrial(freeTrialInfo) {
  if (!freeTrialInfo || typeof freeTrialInfo !== 'object') return { trial: false, trialLen: 0 };
  const fti = freeTrialInfo;
  const end = Number(fti.freeTrialEndTime ?? 0);
  const play = Number(fti.realPlayTime ?? 0);
  if (end > 0 || play > 0) {
    // end/play are ms since track start — clip length in seconds
    return { trial: true, trialLen: Math.max(0, Math.round(Math.max(end, play) / 1000)) };
  }
  return { trial: false, trialLen: 0 };
}

/**
 * Get a playable Netease URL via song_url_v1 (level chain), with trial
 * detection. Returns { url, playable, trial, trialLen }.
 */
export async function getUrlNeteaseSmart(
  songId,
  cookieOverride,
) {
  const cookie = cookieOverride || envCookie;
  if (!songId) return emptyResult();

  // 1) song_url_v1 — level chain, works with and without cookie
  for (const level of LEVEL_CHAIN) {
    try {
      const query = { id: String(songId), level, cookie: cookie || undefined };
      const result = await songUrlV1(query, createRequest);
      const body = result?.body;
      if (result?.status !== 200 || !body?.data || !Array.isArray(body.data)) continue;
      const entry = body.data[0];
      if (!entry) continue;
      const url = entry.url || null;
      if (!url) continue;
      const { trial, trialLen } = parseTrial(entry.freeTrialInfo);
      return { url, playable: !trial && !!url, trial, trialLen };
    } catch (e) {
      // try next level
    }
  }

  // 2) legacy song_url (br) — authenticated fallback
  if (cookie) {
    try {
      const result = await songUrl({ id: String(songId), br: '320000', cookie }, createRequest);
      const body = result?.body;
      if (result?.status === 200 && body?.data && Array.isArray(body.data) && body.data[0]?.url) {
        const entry = body.data[0];
        const { trial, trialLen } = parseTrial(entry.freeTrialInfo);
        return { url: entry.url, playable: !trial, trial, trialLen };
      }
    } catch (e) {
      // fall through to Meting
    }
  }

  // 3) Meting fallback — anonymous URL (free songs playable; VIP songs give a
  //    30s trial clip, which the frontend flags via trial info).
  try {
    const { getUrl } = await import('./ncm.mjs');
    const url = await getUrl(String(songId), 'netease');
    if (url) return { url, playable: true, trial: false, trialLen: 0 };
  } catch (e) {
    // nothing left
  }

  return emptyResult();
}
