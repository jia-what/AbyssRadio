import Meting from '@meting/core';

function makeMeting(source) {
  var m = new Meting(source);
  var cookie = process.env.NETEASE_COOKIE;
  var kugouCookie = process.env.KUGOU_COOKIE;
  if (cookie && source === 'netease') {
    m.cookie(cookie);
  }
  if (kugouCookie && source === 'kugou') {
    m.cookie(kugouCookie);
  }
  return m;
}

function parseResponse(data) {
  if (!data) return [];
  var parsed = typeof data === 'string' ? JSON.parse(data) : data;
  var songs = parsed && parsed.result && parsed.result.songs ? parsed.result.songs
           : parsed && parsed.songs ? parsed.songs
           : parsed && parsed.data && parsed.data.info ? parsed.data.info
           : Array.isArray(parsed) ? parsed
           : [];
  if (!Array.isArray(songs)) return [];
  return songs.map(function(s) {
    // Artist: try multiple field names for different music sources
    var artistName = '';
    if (s.artist) {
      artistName = s.artist;
    } else if (s.artists) {
      artistName = s.artists.map(function(a) { return a.name; }).join(', ');
    } else if (s.singer) {
      artistName = s.singer;
    } else if (s.ar) {
      artistName = s.ar.map(function(a) { return a.name; }).join(', ');
    }
    // Cover: try multiple field names
    var coverUrl = '';
    if (s.pic) {
      coverUrl = s.pic;
    } else if (s.picUrl) {
      coverUrl = s.picUrl;
    } else if (s.album && s.album.picUrl) {
      coverUrl = s.album.picUrl;
    } else if (s.al && s.al.picUrl) {
      coverUrl = s.al.picUrl;
    } else if (s.imgUrl) {
      coverUrl = s.imgUrl;
    }
    return {
      id: String(s.id || s.hash || s.songid || ''),
      title: s.name || s.title || s.songname || s.filename || '',
      artist: artistName || s.singername || '',
      cover: coverUrl || s.cover || s.pic_big || s.pic_small || '',
      duration: s.duration ? Math.round(typeof s.duration === 'string' ? parseInt(s.duration) : s.duration) : s.dt ? s.dt / 1000 : (s.duration || 0),
      source: '',
    };
  });
}

export async function searchNetease(keyword, limit) {
  if (!limit) limit = 10;
  var meting = makeMeting('netease');
  var data = await meting.search(keyword, { limit: limit });
  var items = parseResponse(data);
  items.forEach(function(s) { s.source = 'netease'; });
  return items;
}

export async function searchKuGou(keyword, limit) {
  if (!limit) limit = 10;
  var meting = makeMeting('kugou');
  var data = await meting.search(keyword, { limit: limit });
  var items = parseResponse(data);
  items.forEach(function(s) { s.source = 'kugou'; });
  return items;
}

export async function searchBoth(keyword, limit) {
  if (!limit) limit = 10;
  var n = await searchNetease(keyword, limit);
  var k = await searchKuGou(keyword, limit);
  var combined = [];
  var maxLen = n.length > k.length ? n.length : k.length;
  for (var i = 0; i < maxLen; i++) {
    if (i < n.length) combined.push(n[i]);
    if (i < k.length) combined.push(k[i]);
  }
  return combined.slice(0, limit);
}

export async function getUrl(songId, source) {
  if (!source) source = 'netease';
  var meting = makeMeting(source);
  var raw = await meting.url(songId);
  // KuGou with cookie returns decoded URL directly from Meting's internal flow
  if (source === 'kugou') {
    return extractKugouUrl(meting, raw);
  }
  return extractUrlFromRaw(raw);
}

async function extractKugouUrl(meting, raw) {
  // Try Meting's own decode first (it handles kugou_url_new and kugou_url_legacy)
  try {
    var decoded = await meting.provider.handleDecode('kugou_url_new', raw);
    var p = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    if (p.url) return p.url;
  } catch {}
  try {
    var decoded2 = await meting.provider.handleDecode('kugou_url_legacy', raw);
    var p2 = typeof decoded2 === 'string' ? JSON.parse(decoded2) : decoded2;
    if (p2.url) return p2.url;
  } catch {}
  return null;
}

async function extractUrlFromRaw(raw) {
  if (!raw) return null;
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var data = parsed.data || parsed;
    if (Array.isArray(data) && data.length > 0) {
      var item = data[0];
      if (item.play_url) return item.play_url;
      if (item.url) return item.url;
      // KuGou VIP: need to make a second request to trackercdn
      if (item.relate_goods && Array.isArray(item.relate_goods) && item.relate_goods.length > 0) {
        return await kugouVipUrl(item.relate_goods);
      }
    }
    if (data.play_url) return data.play_url;
    if (data.url) return data.url;
    return null;
  } catch {
    return typeof raw === 'string' ? raw : null;
  }
}

async function kugouVipUrl(relateGoods) {
  var crypto = await import('crypto');
  // Try each relate_good starting from highest bitrate
  var sorted = relateGoods.slice().sort(function(a, b) {
    return (b.info && b.info.bitrate || 0) - (a.info && a.info.bitrate || 0);
  });
  for (var i = 0; i < sorted.length; i++) {
    var g = sorted[i];
    var hash = g.hash || '';
    if (!hash) continue;
    var key = crypto.createHash('md5').update(hash.toLowerCase() + 'kgcloudv2').digest('hex');
    var trackUrl = 'http://trackercdn.kugou.com/i/v2/?hash=' + hash.toLowerCase() + '&key=' + key + '&pid=3&behavior=play&cmd=25&version=8990';
    try {
      var res = await fetch(trackUrl);
      var text = await res.text();
      var json = JSON.parse(text);
      if (json.url) return Array.isArray(json.url) ? json.url[0] : json.url;
    } catch {}
  }
  return null;
}

function isFeeSong(raw) {
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var data = parsed.data || parsed;
    if (Array.isArray(data) && data.length > 0) {
      // fee=1 = VIP, time<60s = trial
      var item = data[0];
      return item.fee === 1 && item.time && item.time < 60000;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Get a playable URL with smart fallback.
 * If Netease returns a VIP trial (<60s), try KuGou as fallback.
 */
export async function getUrlSmart(songId, sources, searchKeyword) {
  var sourcesList = sources || ['netease', 'kugou', 'kuwo'];
  for (var src of sourcesList) {
    try {
      var songKey = songId;
      // For KuGou/Kuwo, search by keyword first to get the right hash
      if (src !== 'netease' && searchKeyword) {
        var searchFn = src === 'kugou' ? searchKuGou : null;
        if (searchFn) {
          var results = await searchFn(searchKeyword, 5);
          if (results && results.length > 0) {
            songKey = results[0].id;
          }
        }
      }
      var raw = await getUrlRaw(songKey, src);
      var url = await extractUrlFromRaw(raw);
      if (url && !isFeeSong(raw)) return url;
    } catch {}
  }
  // Last resort: return whatever works even if trial
  for (var src2 of sourcesList) {
    try {
      var songKey2 = src2 !== 'netease' ? songId : songId;
      if (src2 !== 'netease' && searchKeyword) {
        var searchFn2 = src2 === 'kugou' ? searchKuGou : null;
        if (searchFn2) {
          var results2 = await searchFn2(searchKeyword, 5);
          if (results2 && results2.length > 0) {
            songKey2 = results2[0].id;
          }
        }
      }
      var raw2 = await getUrlRaw(songKey2, src2);
      var url2 = await extractUrlFromRaw(raw2);
      if (url2) return url2;
    } catch {}
  }
  return null;
}

async function getUrlRaw(songId, source) {
  var meting = makeMeting(source);
  return await meting.url(songId);
}

export async function getLyric(songId, source) {
  if (!source) source = 'netease';
  var meting = makeMeting(source);
  var raw = await meting.lyric(songId);
  // raw is a JSON string from Meting — parse and extract the lyric text
  try {
    var parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    var lrc = parsed.lrc || parsed;
    return lrc.lyric || '';
  } catch {
    return '';
  }
}