/* 第 11 项回归: 首次扫库慢 — 即时反馈 + 登录后台预热 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const app = readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
const plc = readFileSync(new URL('../../../ai-radio-v1/src/components/columns/PlaylistColumn.tsx', import.meta.url), 'utf-8');

console.log('=== 即时反馈 (App.tsx 本地点歌路径) ===');
check('点歌先发「正在翻你的歌单」', app.includes('正在翻你的歌单，找「'));
check('反馈在 playSongForAi 之前', app.indexOf('正在翻你的歌单') < app.indexOf('void playSongForAi(localQ'));
check('切歌路径无多余提示 (仍直接播)', app.includes('换一首，让思绪随节奏沉入深海。'));
check('反馈引用 localQ 歌名', app.includes('`正在翻你的歌单，找「${localQ}」...`'));

console.log('\n=== 登录后台预热 (PlaylistColumn.tsx) ===');
check('登录成功后触发预热', plc.includes('library warm-up'));
check('预热用空查询 (全量扫)', plc.includes("searchLibrary(result.key, '')") || plc.includes('searchLibrary(result.key, "")'));
check('预热失败不影响使用 (catch 静默)', plc.includes('预热失败不影响使用'));
check('预热在 loadPlaylists 之后', plc.indexOf('loadPlaylists(result.key)') < plc.indexOf('warm-up'));
check('import 了 searchLibrary', plc.includes("searchLibrary } from '../../services/aiSettingsApi'"));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
