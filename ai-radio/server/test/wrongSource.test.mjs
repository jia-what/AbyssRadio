/* 第 4 项回归: 全网错源 — 同曲判定 (resolveLibrarySource 的核心判断) */
let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

// 与 useRadioState.resolveLibrarySource 相同的判定逻辑
function isSameTrack(lt, t) {
  const norm = (s) => String(s || '').toLowerCase()
    .replace(/[（(].*?[）)]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, '');
  return norm(lt.title) === norm(t.title)
    && (norm(lt.artist).includes(norm(t.artist || '')) || norm(t.artist || '').includes(norm(lt.artist)));
}

console.log('=== 同曲判定 ===');
check('完全相同 → true', isSameTrack({ title: 'Nonstop', artist: 'Drake' }, { title: 'Nonstop', artist: 'Drake' }));
check('大小写/格式不同 → true', isSameTrack({ title: 'God\'s Plan', artist: 'Drake' }, { title: "gods plan", artist: 'DRAKE' }));
check('歌单艺人含合作者 → true', isSameTrack({ title: 'Nonstop', artist: 'Drake, PARTYNEXTDOOR' }, { title: 'Nonstop', artist: 'Drake' }));
check('歌名同艺人不同 → 拒绝', !isSameTrack({ title: 'Nonstop', artist: 'Ard Adz' }, { title: 'Nonstop', artist: 'Drake' }));
check('歌名不同 → 拒绝', !isSameTrack({ title: 'Scorpion', artist: 'Drake' }, { title: 'Nonstop', artist: 'Drake' }));
check('全网带 Explicit 后缀 vs 歌单无 → 换歌单版', isSameTrack({ title: 'HABIBTI', artist: 'Drake' }, { title: 'HABIBTI (Explicit)', artist: 'Drake' }));

console.log('\n=== 消息文案 (App.tsx 静态断言) ===');
const app = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
check('单曲: 歌单源文案', app.includes('从全网找到同曲并换成你歌单的版本'));
check('单曲: 非歌单源文案', app.includes('非歌单源，下一首回原歌单'));
check('专辑: 非歌单源文案', app.includes('非歌单源，插播'));
check('歌手: 非歌单源文案', app.includes('非歌单源，插播'));

console.log('\n=== useRadioState 静态断言 ===');
const urs = (await import('fs')).readFileSync(new URL('../../../ai-radio-v1/src/hooks/useRadioState.ts', import.meta.url), 'utf-8');
check('resolveLibrarySource 存在', urs.includes('resolveLibrarySource'));
check('三处全网链路都接回查', (urs.match(/resolveLibrarySource\(chosen, sessionKey\)/g) || []).length === 3);
check('Track 透传 fromLibrary', urs.includes('fromLibrary: track.fromLibrary'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
