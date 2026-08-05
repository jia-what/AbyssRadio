/* 热修复回归: 「X 的 Y」中间拆词 + 别名展开 (公鸭的 passionfruit → Passionfruit by Drake) */
import { parseSongQuery, expandAliases, scoreTrack, extractSongQuery } from '../../../ai-radio-v1/src/utils/songMatch.ts';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== 前端: 拆词与别名 ===');
const raw = extractSongQuery('放一首 公鸭的 passionfruit');
check('「放一首 公鸭的 passionfruit」抽词', raw === '公鸭的 passionfruit', JSON.stringify(raw));
const cands = expandAliases(raw);
check('别名展开出 drake 候选', cands.includes('drake的 passionfruit'), JSON.stringify(cands));
const p1 = parseSongQuery(cands[1]);
check('展开后拆词: title=passionfruit', p1.titlePart === 'passionfruit');
check('展开后拆词: artist=drake', p1.artistPart === 'drake');
const p0 = parseSongQuery(cands[0]);
check('原始拆词: artist=公鸭 (供后端硬过滤)', p0.artistPart === '公鸭');

console.log('\n=== 前端: 「来首」+火星哥 无空格连写 ===');
const raw2 = extractSongQuery('来首火星哥的talking to the moon');
check('「来首」开头被识别', raw2 === '火星哥的talking to the moon', JSON.stringify(raw2));
const cands2 = expandAliases(raw2);
check('火星哥展开出 bruno mars', cands2.includes('bruno mars的talking to the moon'), JSON.stringify(cands2));
const p2 = parseSongQuery(cands2[1]);
check('无空格连写拆词: title=talking to the moon', p2.titlePart === 'talking to the moon');
check('无空格连写拆词: artist=bruno mars', p2.artistPart === 'bruno mars');
check('打分: Bruno Mars 版命中', scoreTrack({ title: 'Talking to the Moon', artist: 'Bruno Mars' }, raw2) >= 88);
check('打分: 别人版否决', scoreTrack({ title: 'Talking to the Moon', artist: 'Someone Else' }, raw2) === 0);

console.log('\n=== 前端: 打分 (主C 艺人否决) ===');
check('Passionfruit/Drake → 128 命中', scoreTrack({ title: 'Passionfruit', artist: 'Drake' }, '公鸭的 passionfruit') === 128);
check('Passionfruit/别人 → 0 否决', scoreTrack({ title: 'Passionfruit', artist: 'Someone Else' }, '公鸭的 passionfruit') === 0);
check('中文歌名「我们的时光」不误拆', scoreTrack({ title: '我们的时光', artist: '赵雷' }, '我们的时光') === 100);
check('「Drake的 Nonstop」也能拆', parseSongQuery('Drake的 Nonstop').titlePart === 'Nonstop' && parseSongQuery('Drake的 Nonstop').artistPart === 'Drake');

console.log('\n=== 后端: 拆词与前端对齐 (librarySearch.mjs 静态断言) ===');
const ls = (await import('fs')).readFileSync(new URL('../librarySearch.mjs', import.meta.url), 'utf-8');
check('后端有「X 的 Y」拆词', ls.includes("cnMid = raw.match(/^(.+?)的\\s*([A-Za-z0-9]"));
check('后端「X 的」末尾拆保留', ls.includes("cn = raw.match(/^(.+?)\\s+([^\\s]+)的$/)"));
check('后端 rankTracks 走 scoreTrack (展开生效)', ls.includes('s: scoreTrack(t, query)'));
check('后端「来首」动词', ls.includes('来首|来一首|来点'));
check('后端火星哥别名', ls.includes("'火星哥': 'bruno mars'"));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
