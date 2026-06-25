/**
 * NEAPI wrapper — uses NeteaseCloudMusicApiEnhanced to get VIP song URLs.
 * Invokes the song_url module directly with cookie authentication.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const NEAPI = require('@neteasecloudmusicapienhanced/api');
const songUrlModule = require('@neteasecloudmusicapienhanced/api/module/song_url.js');
const createOption = require('@neteasecloudmusicapienhanced/api/util/option.js');
const createRequest = require('@neteasecloudmusicapienhanced/api/util/request.js');

const envCookie = process.env.NETEASE_COOKIE || '';

/**
 * Get a playable song URL using Netease official API with cookie auth.
 * This can get full-length audio for VIP songs when a valid MUSIC_U cookie is provided.
 *
 * @param {string} songId - Netease song ID
 * @param {string} [cookieOverride] - session cookie to use instead of env cookie
 * @returns {Promise<string|null>} - MP3 URL or null
 */
export async function getVipUrl(songId, cookieOverride) {
  const cookie = cookieOverride || envCookie;
  if (!cookie) return null;
  if (!songId) return null;

  try {
    const query = {
      id: songId,
      br: '320000',
      cookie: cookie,
    };

    const result = await songUrlModule(query, createRequest);

    if (result?.status === 200 && result?.body?.data) {
      const data = result.body.data;
      if (Array.isArray(data) && data.length > 0) {
        return data[0].url || null;
      }
    }
    return null;
  } catch (e) {
    console.error('NEAPI getVipUrl error:', e.message);
    return null;
  }
}

/**
 * Smart URL: tries Meting first, then NEAPI for VIP.
 * @param {string} songId - Netease song ID
 * @returns {Promise<string|null>}
 */
export async function getUrlNetease(songId, cookieOverride) {
  // First try NEAPI (authenticated)
  const vipUrl = await getVipUrl(songId, cookieOverride);
  if (vipUrl) return vipUrl;

  // Fallback to Meting (may return 30s trial)
  return null;
}
