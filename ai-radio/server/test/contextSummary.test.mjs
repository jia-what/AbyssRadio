/* 第 9 项回归: 上下文加长 + 摘要注入 */
import { readFileSync } from 'fs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

const src = readFileSync(new URL('../deepseek.mjs', import.meta.url), 'utf-8');

console.log('=== 静态断言 ===');
check('前端发 20 条 (App.tsx)', readFileSync(new URL('../../../ai-radio-v1/src/App.tsx', import.meta.url), 'utf-8').includes('messages.slice(-20)'));
check('后端截 16 条', src.includes('messageHistory.slice(-16)'));
check('摘要函数存在', src.includes('buildContextSummary'));
check('摘要注入 system', src.includes('{ role: \'system\', content: summary }') || src.includes('"system", content: summary') || src.includes("role: 'system', content: summary"));
check('摘要含艺人', src.includes('用户最近聊到的艺人'));
check('摘要含专辑', src.includes('用户最近聊到的专辑'));
check('摘要提醒不误播', src.includes('只介绍不播放'));
check('无历史时摘要为空', src.includes("if (!parts.length) return ''"));

console.log('\n=== 摘要逻辑 (复制自 deepseek.mjs 的构建逻辑, 手动验证) ===');
function buildContextSummary(messageHistory) {
  const recent = (messageHistory || []).slice(-16);
  const artists = [];
  const albums = [];
  for (const m of recent) {
    if (m?.role !== 'user') continue;
    const text = String(m.text || '');
    let am = text.match(/album:\s*([^,，。]+?)(?:\s+[A-Za-z][\w .'-]*)?$/i);
    if (am) albums.push(am[1].trim());
    let ar = text.match(/artist:\s*([^,，。]+)/i);
    if (ar) artists.push(ar[1].trim());
    ar = text.match(/(?:放|听|点歌|来点)\s*([\w .'-]{2,30})(?:的(?:歌|专辑))?/i);
    if (ar && !/^(?:什么|哪些|哪个|谁|一首|一下|album|artist)\b/i.test(ar[1].trim())) artists.push(ar[1].trim());
  }
  const parts = [];
  if (artists.length) parts.push(`用户最近聊到的艺人：${[...new Set(artists)].slice(-4).join(' / ')}`);
  if (albums.length) parts.push(`用户最近聊到的专辑：${[...new Set(albums)].slice(-2).join(' / ')}`);
  if (!parts.length) return '';
  return `【会话摘要】${parts.join('；')}。聊到这些艺人/专辑时，如果用户没有明确说「放」，只介绍不播放。`;
}

const hist = [
  { role: 'user', text: '放 Drake 的歌' },
  { role: 'ai', text: '好，给你来一首。' },
  { role: 'user', text: '放 album:Scorpion Drake' },
  { role: 'ai', text: '专辑抽曲。' },
  { role: 'user', text: '来点 The Weeknd' },
  { role: 'ai', text: '收到。' },
  { role: 'user', text: 'Drake 有哪些代表作' },
];
const s = buildContextSummary(hist);
console.log('  summary:', s);
check('提取到 Drake', s.includes('Drake'));
check('提取到 The Weeknd', s.includes('The Weeknd'));
check('提取到专辑 Scorpion', s.includes('Scorpion'));
check('去重 (Drake 只出现一次作为艺人)', s.includes('Drake / The Weeknd') || s.includes('The Weeknd / Drake'));
check('含引导语', s.includes('只介绍不播放'));
check('空历史 → 空串', buildContextSummary([]) === '');
check('非用户消息不提取', !buildContextSummary([{ role: 'ai', text: '放 God\'s Plan' }]));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
