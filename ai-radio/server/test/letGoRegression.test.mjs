/* let go 错配回归: 子串匹配放水修复 */
import { parseSongQuery, scoreTrack, pickBestTrack, MIN_SONG_SCORE } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 老板案例: play let go → 不再错配 ===');
const tracks = [
  { id: 'g1', title: 'Let It Bloom', artist: 'Grabbitz' },
  { id: 'g2', title: 'Violet', artist: 'Connor Price, Killa' },
  { id: 'g3', title: 'Let Go', artist: 'Beau Young Prince' },
  { id: 'g4', title: 'Let Go', artist: 'Ark Patrol' },
];
for (const t of tracks) {
  const s = scoreTrack(t, 'let go');
  console.log(`  "let go" vs "${t.title}" by ${t.artist} → ${s}`);
}
const hit = pickBestTrack(tracks, 'let go', MIN_SONG_SCORE);
check('最优命中 Let Go (Beau Young Prince)', hit && hit.track.id === 'g3');
check('不会命中 Let It Bloom (Grabbitz)', hit && hit.track.id !== 'g1');
check('不会命中 Violet (子串藏 let)', hit && hit.track.id !== 'g2');

console.log('\n=== 单词前缀/后缀变体仍可命中 ===');
check('"let go explicit" 前缀命中 Let Go', scoreTrack({ title: 'Let Go (Explicit)', artist: 'Ark Patrol' }, 'let go') >= 88);
check('"let" 不匹配 violet (词级)', scoreTrack({ title: 'Violet', artist: 'Connor Price' }, 'let') < 50);

console.log('\n=== 原有正案例不回归 ===');
check('God\'s Plan 精确命中', scoreTrack({ title: "God's Plan", artist: 'Drake' }, 'god\'s plan') === 100);
check('"gods plan" 无撇号命中', scoreTrack({ title: "God's Plan", artist: 'Drake' }, 'gods plan') >= 88);
check('HABIBTI by Drake 拆词正确', (() => {
  const p = parseSongQuery('HABIBTI by Drake');
  return p.titlePart === 'HABIBTI' && p.artistPart === 'Drake';
})());
check('HABIBTI by Drake 艺人否决', scoreTrack({ title: 'Habibti', artist: 'Ard Adz' }, 'HABIBTI by drake') === 0);
check('HABIBTI by Drake 命中 Drake 版', scoreTrack({ title: 'HABIBTI', artist: 'Drake' }, 'HABIBTI by drake') >= 100);
check('luther by kendrick 命中', scoreTrack({ title: 'luther', artist: 'Kendrick Lamar' }, 'luther by kendrick lamar') >= 88);
check('同专辑合作曲 Nonstop by Drake 命中', scoreTrack({ title: 'Nonstop', artist: 'Drake' }, 'nonstop by drake') >= 100);

console.log('\n=== 多词查询整词级 ===');
check('"let it bloom" 精确命中', scoreTrack({ title: 'Let It Bloom', artist: 'Grabbitz' }, 'let it bloom') >= 88);
check('"in my feelings" 命中', scoreTrack({ title: 'In My Feelings', artist: 'Drake' }, 'in my feelings') === 100);
check('"hotline bling" 命中', scoreTrack({ title: 'Hotline Bling', artist: 'Drake' }, 'hotline bling') === 100);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
