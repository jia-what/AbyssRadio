/* artist 模式回归: 解析 + 抽曲 + 否决 */
import { parseArtistQuery, trackMatchesArtist, pickArtistTrack } from '../albumPlay.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== parseArtistQuery ===');
check('"drake" → drake', parseArtistQuery('drake').artist === 'drake');
check('"drake 的歌" → drake', parseArtistQuery('drake 的歌').artist === 'drake');
check('"artist:drake" → drake', parseArtistQuery('artist:drake').artist === 'drake');
check('"放 bieber 的歌" → bieber', parseArtistQuery('放 bieber 的歌').artist === 'bieber');
check('"来点 The Weeknd" → the weeknd', parseArtistQuery('来点 The Weeknd').artist === 'The Weeknd');
check('"播放 HABIBTI" 不误拆为艺人', parseArtistQuery('播放 HABIBTI').artist === 'HABIBTI');

console.log('\n=== trackMatchesArtist 否决制 ===');
const drakeTracks = [
  { title: 'Nonstop', artist: 'Drake' },
  { title: "God's Plan", artist: 'Drake' },
  { title: 'Scorpion', artist: 'Chris Schweizer' },
  { title: 'Habibti', artist: 'Ard Adz' },
  { title: 'Fortworth', artist: 'Drake, PARTYNEXTDOOR' },
  { title: 'Way 2 Sexy (Cover)', artist: 'Random Cover Band' },
];
check('Drake 命中 100', trackMatchesArtist(drakeTracks[0], 'drake').score === 100);
check('Chris Schweizer 被否决(0)', trackMatchesArtist(drakeTracks[2], 'drake').score === 0);
check('Ard Adz 被否决(0)', trackMatchesArtist(drakeTracks[3], 'drake').score === 0);
check('合作曲 Drake, PARTYNEXTDOOR 命中', trackMatchesArtist(drakeTracks[4], 'drake').score === 100);
check('翻唱降权 (<100)', trackMatchesArtist(drakeTracks[5], 'drake').score < 100);
check('空艺人 0 分', trackMatchesArtist({ title: 'X', artist: '' }, 'drake').score === 0);

console.log('\n=== pickArtistTrack 随机抽 Drake 的 ===');
const picked = pickArtistTrack(drakeTracks, 'drake');
check('抽到的是 Drake 的歌', picked && String(picked.artist).includes('Drake'));
check('不会抽到 Chris/Ard Adz', picked && picked.artist !== 'Chris Schweizer' && picked.artist !== 'Ard Adz');
check('空列表 → null', pickArtistTrack([], 'drake') === null);
check('无候选 → null', pickArtistTrack([{ title: 'X', artist: 'Other' }], 'drake') === null);

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
