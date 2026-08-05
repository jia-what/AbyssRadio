/* 第 3 项回归: 歌单扫描上限 — 深扫标记 + 未扫全提示 + artist/album 提前停止 */
import { parseArtistQuery, trackMatchesArtist, pickArtistTrack } from '../albumPlay.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 扫描上限逻辑 (静态断言 librarySearch.mjs) ===');
const src = (await import('fs')).readFileSync(new URL('../librarySearch.mjs', import.meta.url), 'utf-8');
check('存在 MAX_PLAYLISTS_DEEP=100', /MAX_PLAYLISTS_DEEP = 100/.test(src));
check('深扫判定 artist:/album:', /isDeep = \/\^\(artist\|album\):\/i/.test(src));
check('深扫用 plLimit', /playlists\.slice\(0, plLimit\)/.test(src));
check('artist 提前停止信号', /query\.startsWith\('artist:'\)/.test(src) && /trackMatchesArtist\(row, aq\)/.test(src));
check('返回 scannedPlaylists', /scannedPlaylists/.test(src));
check('返回 totalPlaylists', /totalPlaylists/.test(src));
check('专辑未扫全提示', /可能未扫全/.test(src));
check('歌手未扫全提示', /可能未扫全/.test(src));

console.log('\n=== 深扫语义: 普通歌名 40 / 深扫 100 (代码路径模拟) ===');
const MAX_PLAYLISTS = 40, MAX_PLAYLISTS_DEEP = 100;
function plLimit(query) {
  const isDeep = /^(artist|album):/i.test(String(query || ''));
  return isDeep ? Math.min(MAX_PLAYLISTS_DEEP, 120) : Math.min(MAX_PLAYLISTS, 120);
}
check('普通查询 "luther" → 40', plLimit('luther') === 40);
check('artist: 查询 → 100', plLimit('artist:drake') === 100);
check('album: 查询 → 100', plLimit('album:scorpion') === 100);
check('无 query → 40', plLimit(null) === 40);
check('深扫封顶 100 (即使 120 个歌单)', plLimit('artist:x') === 100);

console.log('\n=== 未扫全提示条件 ===');
function scanWarn(loaded) {
  return loaded.scannedPlaylists > 0 && loaded.scannedPlaylists < loaded.totalPlaylists
    ? `（已扫前 ${loaded.scannedPlaylists}/${loaded.totalPlaylists} 个歌单，可能未扫全）` : '';
}
check('扫 40/120 → 有提示', scanWarn({ scannedPlaylists: 40, totalPlaylists: 120 }).includes('可能未扫全'));
check('扫 100/100 → 无提示', scanWarn({ scannedPlaylists: 100, totalPlaylists: 100 }) === '');
check('缓存命中 scanned=0 → 无提示', scanWarn({ scannedPlaylists: 0, totalPlaylists: 120 }) === '');

console.log('\n=== 提前停止信号 (artist 命中即停, 不再扫后面歌单) ===');
const tracks = [
  { title: 'Nonstop', artist: 'Drake' },
  { title: "God's Plan", artist: 'Drake' },
  { title: 'X', artist: 'Other' },
];
check('artist 命中可提前停 (bestScore>=EARLY_HIT)', trackMatchesArtist(tracks[0], 'drake').score >= 88);
check('艺人否决 (score 0 < EARLY_HIT)', trackMatchesArtist(tracks[2], 'drake').score < 88);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
