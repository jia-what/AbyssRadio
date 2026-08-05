/* 热修复回归: AI 别名规范化兜底 — 本地 miss 后调 DeepSeek 翻译口语再试 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const app = readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8');
const ds = readFileSync(new URL('../deepseek.mjs', import.meta.url), 'utf-8');
const idx = readFileSync(new URL('../index.mjs', import.meta.url), 'utf-8');

console.log('=== 后端 normalizeSongQuery ===');
check('导出 normalizeSongQuery', ds.includes('export async function normalizeSongQuery'));
check('无 Key 返回 null', ds.includes('if (!hasDeepseekApiKey()) return null;'));
check('prompt 含规则', ds.includes('中文歌手绰号/译名转英文标准名'));
check('格式 歌名 by 歌手', ds.includes('歌名 by 歌手'));
check('不编造歌名', ds.includes('不要编造歌名'));
check('max_tokens 60 限制', ds.includes('max_tokens: 60'));
check('超长结果丢弃', ds.includes('out.length > 80'));

console.log('\n=== 后端路由 ===');
check('路由存在', idx.includes("app.post('/api/ai/normalize'"));
check('import 了 normalizeSongQuery', idx.includes('normalizeSongQuery } from'));
check('400 missing q', idx.includes("res.status(400).json({ error: 'missing q' })"));

console.log('\n=== 前端兜底接入 ===');
check('miss 后调 normalize', app.includes("fetch('/api/ai/normalize'"));
check('带 triedNormalize 防重入', app.includes('!opts.triedNormalize'));
check('结果不同才重试', app.includes('normalized !== q'));
check('重试仍走 playSongForAi', app.includes('return playSongForAi(normalized'));
check('递归带 triedNormalize: true', app.includes('triedNormalize: true'));
check('提示话术', app.includes('换个说法再找一次'));
check('失败不影响原话术', app.includes('规范化失败不影响原话术'));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
