/* 第 8 项回归: 无 Key 模板闲聊 */
import { chatWithDeepSeek } from '../deepseek.mjs';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

console.log('=== nokey 模板闲聊 (无 Key 环境) ===');
// 注意: 这些用例依赖当前环境无 Key (hasDeepseekApiKey()===false)
// 若已配 Key 则跳过, 单独验证 templateReply 逻辑
const noKey = process.env.DEEPSEEK_API_KEY ? false : true;
if (!noKey) {
  console.log('  (检测到已配置 Key, 跳过 nokey 实测, 改为静态断言)');
} else {
  for (const msg of ['你好', '这首歌真好听', '太难听了', '为什么这么卡', '推荐点歌', '随便聊聊']) {
    const r = await chatWithDeepSeek(msg, [], null);
    check(`nokey「${msg}」→ type=nokey`, r.type === 'nokey');
    check(`nokey「${msg}」→ 有回应非空`, typeof r.text === 'string' && r.text.length > 0);
  }
}

console.log('\n=== templateReply 话术覆盖 (静态断言) ===');
const src = (await import('fs')).readFileSync(new URL('../deepseek.mjs', import.meta.url), 'utf-8');
check('打招呼话术', /你好\|hi\|hello\|嗨\|哈喽/.test(src));
check('夸歌话术', /好听\|喜欢\|爱了\|上瘾\|单曲循环/.test(src));
check('吐槽话术', /不好听\|难听\|什么鬼\|拉黑/.test(src));
check('疑问话术', /为什么\|怎么\|啥\|吗\|呢/.test(src));
check('推荐话术', /推荐\|有什么歌\|歌单/.test(src));
check('默认兜底', /信号收到了/.test(src));
check('都引导导 Key', /导入 DeepSeek Key 后/.test(src));
check('带 template 标记', /template: true/.test(src));

console.log(`\n结果: ${pass} 过, ${fail} 挂`);
process.exit(fail ? 1 : 0);
