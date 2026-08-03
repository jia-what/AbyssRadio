/** Probe why dual lyrics show 暂无翻译 */
const base = 'http://localhost:4000';

async function lyric(id, source, keyword) {
  let url = `${base}/api/music/lyric?id=${encodeURIComponent(id)}&source=${source}`;
  if (keyword) url += `&keyword=${encodeURIComponent(keyword)}`;
  const r = await fetch(url);
  const j = await r.json();
  return {
    status: r.status,
    lrcLen: (j.lyric || '').length,
    tlyricLen: (j.tlyric || '').length,
    tlyricHead: (j.tlyric || '').slice(0, 120).replace(/\n/g, '|'),
  };
}

async function search(q, source) {
  const r = await fetch(`${base}/api/music/search?q=${encodeURIComponent(q)}&source=${source}`);
  const j = await r.json();
  return (j.songs || []).slice(0, 3).map((s) => ({ id: s.id, title: s.title, artist: s.artist, source: s.source }));
}

async function main() {
  // Chinese song that usually has tlyric on Netease
  const ne = await search('周杰伦 晴天', 'netease');
  console.log('search netease', ne);
  if (ne[0]) {
    console.log('ne lyric', await lyric(ne[0].id, 'netease', `${ne[0].title} ${ne[0].artist}`));
  }

  const kg = await search('晴天 周杰伦', 'kugou');
  console.log('search kugou', kg);
  if (kg[0]) {
    // Frontend order: title + artist (current)
    console.log('kg lyric kw=title artist', await lyric(kg[0].id, 'kugou', `${kg[0].title} ${kg[0].artist}`));
    // Backend comment expects: artist title
    console.log('kg lyric kw=artist title', await lyric(kg[0].id, 'kugou', `${kg[0].artist} ${kg[0].title}`));
    console.log('kg lyric no kw', await lyric(kg[0].id, 'kugou', ''));
  }

  // English line from screenshot vibe
  const en = await search('Pressure to break or retreat', 'both');
  console.log('search en', en);
  if (en[0]) {
    console.log('en lyric', await lyric(en[0].id, en[0].source || 'netease', `${en[0].title} ${en[0].artist}`));
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
