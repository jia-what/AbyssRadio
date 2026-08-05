/**
 * Album-level matching helpers (server). Keep in sync with ai-radio-v1/src/utils/albumPlay.ts
 */
export const ALBUM_HINTS = [
  {
    keys: ['scorpion'],
    artist: 'drake',
    tracks: ["Nonstop", "God's Plan", "In My Feelings", "Nice For What", "Mob Ties", "Emotionless"],
  },
  {
    keys: ['take care'],
    artist: 'drake',
    tracks: ['Headlines', 'The Motto', 'Marvins Room', 'Take Care', 'HYFR'],
  },
  {
    keys: ['views'],
    artist: 'drake',
    tracks: ['One Dance', 'Hotline Bling', 'Controlla', 'Too Good'],
  },
  {
    keys: ['certified lover boy', 'clb'],
    artist: 'drake',
    tracks: ['Way 2 Sexy', 'Fair Trade', 'Girls Want Girls', 'Champagne Poetry'],
  },
  {
    keys: ['for all the dogs'],
    artist: 'drake',
    tracks: ['IDGAF', 'First Person Shooter', 'Rich Baby Daddy', 'You Broke My Heart'],
  },
  {
    keys: ['gnx'],
    artist: 'kendrick lamar',
    tracks: ['luther', 'tv off', 'squabble up', 'peekaboo'],
  },
  {
    keys: ['damn', 'damn.'],
    artist: 'kendrick lamar',
    tracks: ['HUMBLE.', 'DNA.', 'LOYALTY.', 'LOVE.'],
  },
  {
    keys: ['after hours'],
    artist: 'the weeknd',
    tracks: ['Blinding Lights', 'Save Your Tears', 'In Your Eyes', 'Heartless'],
  },
  {
    keys: ['thriller'],
    artist: 'michael jackson',
    tracks: ['Billie Jean', 'Beat It', 'Thriller', 'Wanna Be Startin Somethin'],
  },
];

export function normAlbum(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '')
    .trim();
}

export function parseAlbumQuery(raw) {
  let q = String(raw || '').trim().replace(/^album:\s*/i, '').trim();
  q = q.replace(/^(?:play|放|听|点歌)\s+/i, '').trim();
  let album = q;
  let artist = '';
  const by = q.match(/^(.+?)\s+by\s+(.+)$/i);
  if (by) {
    album = by[1].trim();
    artist = by[2].trim();
  } else {
    const hint = findAlbumHint(q);
    if (hint) {
      album = hint.keys[0];
      artist = hint.artist;
      const nq = normAlbum(q);
      const nk = normAlbum(hint.keys[0]);
      if (nq.length > nk.length) {
        const rest = q.replace(new RegExp(hint.keys[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim();
        if (rest) artist = rest;
      }
    } else {
      const parts = q.split(/\s+/).filter(Boolean);
      if (parts.length >= 3) {
        album = parts.slice(0, -2).join(' ');
        artist = parts.slice(-2).join(' ');
      } else if (parts.length === 2) {
        album = parts[0];
        artist = parts[1];
      }
    }
  }
  return { album: album.trim(), artist: artist.trim(), raw: q };
}

export function findAlbumHint(albumOrQuery) {
  const n = normAlbum(albumOrQuery);
  if (!n) return null;
  return ALBUM_HINTS.find((h) => h.keys.some((k) => {
    const nk = normAlbum(k);
    return n === nk || n.includes(nk) || nk.includes(n);
  })) || null;
}

export function trackMatchesAlbum(track, album, artist) {
  const albumN = normAlbum(album);
  if (!albumN) return { score: 0 };
  const tAlbum = normAlbum(track.album || '');
  const tTitle = normAlbum(track.title || '');
  const tArtist = normAlbum(track.artist || '');
  const artistN = normAlbum(artist);
  const hint = findAlbumHint(album) || (artist ? findAlbumHint(`${album} ${artist}`) : null);

  let score = 0;
  if (tAlbum && (tAlbum.includes(albumN) || albumN.includes(tAlbum))) score += 100;

  if (hint) {
    const hitTrack = hint.tracks.some((tr) => {
      const nt = normAlbum(tr);
      return tTitle === nt || tTitle.includes(nt) || nt.includes(tTitle);
    });
    if (hitTrack) score += 80;
    const hintArtist = normAlbum(hint.artist);
    if (hintArtist && tArtist.includes(hintArtist)) score += 15;
  }

  if (artistN) {
    if (tArtist.includes(artistN) || artistN.includes(tArtist)) score += 20;
    else if (score > 0) score -= 25;
  }

  if (score < 80 && tTitle === albumN) score = 0;
  return { score };
}

export function pickAlbumTrack(tracks, album, artist) {
  const ranked = (tracks || [])
    .map((t) => ({ t, ...trackMatchesAlbum(t, album, artist) }))
    .filter((x) => x.score >= 80)
    .sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const topScore = ranked[0].score;
  const top = ranked.filter((x) => x.score >= topScore - 15);
  return top[Math.floor(Math.random() * top.length)].t;
}

export function albumClarifySuggestions(album, artist) {
  const hint = findAlbumHint(album) || findAlbumHint(`${album} ${artist || ''}`);
  if (hint?.tracks?.length) return hint.tracks.slice(0, 4);
  return [];
}
