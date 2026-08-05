/* 第 5 项回归: 别名/译名展开 + feat 规范化 + 艺人词级匹配 */
import { expandAliases, parseSongQuery, scoreTrack, pickBestTrack, MIN_SONG_SCORE } from '../../../ai-radio-v1/src/utils/songMatch.ts';
import { parseArtistQuery } from '../../../ai-radio-v1/src/utils/artistPlay.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 别名展开 ===');
check('「公鸭」→ drake', expandAliases('放公鸭的歌')[1] === '放drake的歌');
check('「我心永恒」→ my heart will go on', expandAliases('我心永恒').includes('my heart will go on'));
check('「加州旅馆」→ hotel california', expandAliases('加州旅馆').includes('hotel california'));
check('「gods plan」→ god\'s plan', expandAliases('gods plan').includes("god's plan"));
check('原始查询保留在候选里', expandAliases('我心永恒')[0] === '我心永恒');
check('无别名 → 只有原始', expandAliases('luther').length === 1);
check('去重', expandAliases('公鸭').length === expandAliases('公鸭').filter((v, i, a) => a.indexOf(v) === i).length);

console.log('\n=== 别名打分生效 ===');
check('「我心永恒」命中 My Heart Will Go On', scoreTrack({ title: 'My Heart Will Go On', artist: 'Celine Dion' }, '我心永恒') === 100);
check('「加州旅馆」命中 Hotel California', scoreTrack({ title: 'Hotel California', artist: 'Eagles' }, '加州旅馆') === 100);
check('「gods plan」命中 God\'s Plan', scoreTrack({ title: "God's Plan", artist: 'Drake' }, 'gods plan') >= 88);
check('「我心永恒」无子串加分 (恰 100, 不 >100)', scoreTrack({ title: 'My Heart Will Go On', artist: 'Celine Dion' }, '我心永恒') <= 100);
check('拆词 "go on" 不再因 DiON 子串加分', scoreTrack({ title: 'My Heart Will Go On', artist: 'Celine Dion' }, 'my heart will') <= 88);

console.log('\n=== 歌手链路别名 ===');
const cands = expandAliases('放公鸭的歌');
const expanded = cands.length > 1 ? cands[cands.length - 1] : cands[0];
check('「放公鸭的歌」展开取替换候选', parseArtistQuery(expanded).artist === 'drake');
check('「drake的歌」无空格也能拆出', parseArtistQuery('drake的歌').artist === 'drake');
check('「比伯的歌」展开 → justin bieber', parseArtistQuery(expandAliases('比伯的歌').at(-1)).artist === 'justin bieber');

console.log('\n=== feat 规范化 ===');
check('feat 写法: "Let Go (feat. X)" 命中 "let go"', scoreTrack({ title: 'Let Go (feat. Ark Patrol)', artist: 'X' }, 'let go') >= 88);
check('ft 写法: "Luther ft. SZA" 命中 "luther"', scoreTrack({ title: 'Luther ft. SZA', artist: 'Kendrick Lamar' }, 'luther') >= 88);
check('featuring 写法', scoreTrack({ title: 'Way 2 Sexy featuring Future', artist: 'Drake' }, 'way 2 sexy') >= 88);

console.log('\n=== 不回归 ===');
check('let go 仍不命中 Violet', scoreTrack({ title: 'Violet', artist: 'Connor Price' }, 'let go') === 0);
check('let go 命中 Let Go', scoreTrack({ title: 'Let Go', artist: 'Beau Young Prince' }, 'let go') === 100);
check('HABIBTI by Drake 艺人否决', scoreTrack({ title: 'Habibti', artist: 'Ard Adz' }, 'HABIBTI by drake') === 0);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
